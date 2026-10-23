// Проведение документов производства в iiko (ТЗ 6, 8).
//
// Разделение шагов сознательное. Факт отдела и рассчитанные по нему документы
// пишутся в CRM ВСЕГДА — это первичный учёт, его нельзя терять из-за недоступной
// iiko или неподошедшей схемы документа. Отправка в iiko — отдельный шаг с
// собственным статусом у каждого документа:
//
//   pending — записан, в iiko не отправлен (autoPost выключен / iiko молчала);
//   posted  — проведён, номер документа iiko сохранён;
//   error   — iiko отклонила; сохранены отправленный XML и ответ, можно повторить.
//
// Благодаря этому включение отправки не требует «догонять» историю руками:
// накопленные pending отправляются одной кнопкой.
import { db } from "../db.js";
import { log } from "./../logger.js";
import {
  createProduction,
  createTransfer,
  iikoConfigured,
} from "./iikoServer.js";
import { refreshProductionConfig } from "./productionConfig.js";

const ymdTashkent = (d) =>
  new Date(d || Date.now()).toLocaleDateString("en-CA", {
    timeZone: "Asia/Tashkent",
  });

// Статусы, которые ещё имеет смысл отправлять. "created" — историческое
// значение до появления отправки, читается как pending.
export const POSTABLE = ["pending", "created", "error"];

// Порядок проведения внутри одного факта важен: сначала перемещения (компоненты
// должны оказаться на складе фазы), затем акт приготовления, затем разбор.
const ORDER = { TRANSFER: 0, PRODUCTION_ACT: 1, DISASSEMBLY_ACT: 2 };
export function sortForPosting(docs) {
  return [...(docs || [])].sort(
    (a, b) =>
      (ORDER[a.docType] ?? 9) - (ORDER[b.docType] ?? 9) ||
      new Date(a.createdAt) - new Date(b.createdAt)
  );
}

// Ошибка, при которой повторять отправку бессмысленно (данные/схема, не связь).
// Такие документы не съедают попытки автоповтора — ждут решения человека.
export function isPermanent(message) {
  const m = String(message || "").toLowerCase();
  return (
    m.includes("не принимает перемещения") ||
    m.includes("отправляется вручную") ||
    m.includes("не настроена")
  );
}

// Номер документа в iiko: префикс + короткий хвост id. Один и тот же документ
// CRM всегда даёт один и тот же номер — повторная отправка не плодит дубли с
// разными номерами, а в списке iiko видно, что документ пришёл из CRM.
export function documentNumberFor(doc, prefix = "CRM-") {
  return `${prefix}${String(doc.id).slice(-8).toUpperCase()}`;
}

// Отправка ОДНОГО документа. Ничего не пишет в БД — только зовёт iiko и
// возвращает нормализованный результат (запись делает postDocument).
async function callIiko(doc, cfg) {
  const date = ymdTashkent(doc.createdAt);
  const number = documentNumberFor(doc, cfg.numberPrefix);
  const comment = `CRM: ${doc.productName || doc.productCode}`;

  if (doc.docType === "PRODUCTION_ACT") {
    if (!doc.warehouseTo) throw new Error("У документа не указан склад");
    return createProduction({
      date,
      storeId: doc.warehouseTo,
      items: [{ productId: doc.productCode, amount: Number(doc.qty) }],
      number,
      comment,
    });
  }
  if (doc.docType === "TRANSFER") {
    if (!cfg.postTransfers) {
      const e = new Error(
        "Отправка перемещений выключена в настройках производства"
      );
      e.skip = true;
      throw e;
    }
    if (!doc.warehouseFrom || !doc.warehouseTo)
      throw new Error("У перемещения не указан склад-источник или получатель");
    return createTransfer({
      date,
      fromStoreId: doc.warehouseFrom,
      toStoreId: doc.warehouseTo,
      items: [{ productId: doc.productCode, amount: Number(doc.qty) }],
      number,
      comment,
    });
  }
  // Акт разбора iiko через API импорта не принимает ни в одной известной сборке —
  // честно говорим об этом, вместо того чтобы отправлять заведомо неверный документ.
  throw new Error(
    `Документ «${doc.docType}» отправляется вручную в iiko — автопроведение не поддерживается`
  );
}

// Проводит документ и записывает результат. Возвращает обновлённую строку.
export async function postDocument(docOrId, opts = {}) {
  const cfg = opts.config || (await refreshProductionConfig());
  const doc =
    typeof docOrId === "string"
      ? await db.generatedDocument.findUnique({ where: { id: docOrId } })
      : docOrId;
  if (!doc) {
    const e = new Error("Документ не найден");
    e.statusCode = 404;
    throw e;
  }
  if (doc.status === "posted") return doc;
  if (!iikoConfigured()) {
    return db.generatedDocument.update({
      where: { id: doc.id },
      data: { status: "pending", error: "iiko не настроена" },
    });
  }

  let out = null;
  let err = null;
  try {
    out = await callIiko(doc, cfg);
  } catch (e) {
    err = e;
  }

  // Отправка отключена настройкой — это не ошибка документа: он остаётся
  // в очереди и уйдёт, когда настройку включат. Попытку не засчитываем.
  if (err?.skip) {
    return db.generatedDocument.update({
      where: { id: doc.id },
      data: { status: "pending", error: err.message },
    });
  }

  const attempts = (doc.attempts || 0) + 1;
  if (err || !out?.ok) {
    const message = err ? err.message : out.error || "iiko отклонила документ";
    log.warn(
      { docId: doc.id, type: doc.docType, err: message },
      "production: документ не проведён"
    );
    return db.generatedDocument.update({
      where: { id: doc.id },
      data: {
        status: "error",
        error: message.slice(0, 1000),
        payload: String(err?.sentXml || out?.xml || "").slice(0, 8000),
        iikoResponse: String(err?.iikoResponse || out?.response || "").slice(
          0,
          2000
        ),
        attempts,
      },
    });
  }

  return db.generatedDocument.update({
    where: { id: doc.id },
    data: {
      status: "posted",
      error: "",
      iikoDocId: out.documentNumber || documentNumberFor(doc, cfg.numberPrefix),
      payload: String(out.xml || "").slice(0, 8000),
      iikoResponse: String(out.response || "").slice(0, 2000),
      attempts,
      postedAt: new Date(),
    },
  });
}

// Проводит все документы одного факта по порядку. Перемещение, упавшее с
// ошибкой, ОСТАНАВЛИВАЕТ цепочку: проводить акт приготовления, когда компонент
// не доехал до склада, — значит списать то, чего там нет (ТЗ 8).
export async function postDocumentsForFact(factId, opts = {}) {
  const cfg = opts.config || (await refreshProductionConfig());
  const docs = sortForPosting(
    await db.generatedDocument.findMany({ where: { factId } })
  );
  const results = [];
  let blocked = false;
  for (const d of docs) {
    if (blocked) {
      results.push(
        await db.generatedDocument.update({
          where: { id: d.id },
          data: {
            status: "pending",
            error: "Не отправлен: предыдущий документ цепочки не проведён",
          },
        })
      );
      continue;
    }
    const row = await postDocument(d, { config: cfg });
    results.push(row);
    if (row.status === "error" && d.docType === "TRANSFER") blocked = true;
  }
  return results;
}

// Повторная отправка: одиночная (по id) или пачкой. Пачка ограничена limit,
// чтобы запрос не висел на сотнях документов; счётчик попыток не даёт крутить
// заведомо безнадёжные документы бесконечно.
export async function retryPending({ taskId, factId, limit = 50 } = {}) {
  const cfg = await refreshProductionConfig();
  const where = { status: { in: POSTABLE } };
  if (taskId) where.taskId = taskId;
  if (factId) where.factId = factId;
  const docs = sortForPosting(
    await db.generatedDocument.findMany({
      where,
      orderBy: { createdAt: "asc" },
      take: Math.min(Number(limit) || 50, 200),
    })
  );
  const out = { total: docs.length, posted: 0, failed: 0, skipped: 0 };
  for (const d of docs) {
    if ((d.attempts || 0) >= cfg.maxAttempts && isPermanent(d.error)) {
      out.skipped += 1;
      continue;
    }
    const row = await postDocument(d, { config: cfg });
    if (row.status === "posted") out.posted += 1;
    else if (row.status === "error") out.failed += 1;
    else out.skipped += 1;
  }
  return out;
}

// Сводка для журнала и мониторинга: сколько документов в каком состоянии.
export async function postingSummary(where = {}) {
  const rows = await db.generatedDocument.groupBy({
    by: ["status"],
    where,
    _count: { _all: true },
  });
  const out = { pending: 0, posted: 0, error: 0, reverted: 0 };
  for (const r of rows) {
    const k = r.status === "created" ? "pending" : r.status;
    if (k in out) out[k] += r._count._all;
  }
  return out;
}
