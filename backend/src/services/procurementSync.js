// Синхронизация и отчёты модуля «Закупки и склад»: тянет из iiko приходные
// накладные и остатки, кладёт историю цен в БД и прогоняет через чистое ядро
// (procurement.js). Универсально: источник данных (iiko) — сменный адаптер.
import { db } from "../db.js";
import {
  incomingInvoices,
  storeBalances,
  supplierBalances,
} from "./iikoServer.js";
import {
  analyzePriceTrends,
  analyzeStock,
  computeMovement,
} from "./procurement.js";
import { refreshProcurementConfig } from "./procurementConfig.js";

// Синхронизация накладных за период (from/to — YYYY-MM-DD): дедуп по документу
// (удаляем позиции документа и пишем заново), затем сохраняем в PurchaseEntry.
export async function syncInvoices({ from, to }) {
  const inv = await incomingInvoices({ from, to });
  const entries = inv.entries || [];
  const docIds = [...new Set(entries.map((e) => e.iikoDocId).filter(Boolean))];
  if (docIds.length) {
    await db.purchaseEntry.deleteMany({
      where: { iikoDocId: { in: docIds } },
    });
  }
  const mapped = entries
    .filter((e) => e.productId)
    .map((e) => ({
      iikoDocId: e.iikoDocId || "",
      docNumber: e.docNumber || "",
      date: new Date(e.date),
      supplier: e.supplier || "",
      productId: e.productId,
      productName: e.productName || "",
      unit: e.unit || "",
      amount: Number(e.amount) || 0,
      price: Number(e.price) || 0,
      sum: Number(e.sum) || 0,
      storeId: e.storeId || "",
      storeName: e.storeName || "",
    }));
  const data = mapped.filter((e) => e.date instanceof Date && !isNaN(e.date));
  if (data.length) await db.purchaseEntry.createMany({ data });
  const out = {
    docCount: inv.docCount || 0,
    itemCount: data.length,
    entriesParsed: entries.length,
    droppedBadDate: mapped.length - data.length,
  };
  // Диагностика: если ничего не сохранили — покажем, что вернул iiko (сырой
  // документ/срез), чтобы понять причину (нет накладных / другой формат полей).
  if (!data.length) {
    out.rawFirst = inv.rawFirst || "";
    out.sample = inv.sample || "";
    out.bytes = inv.bytes || 0;
  }
  return out;
}

// Тренд цен: читаем историю из БД (по умолчанию — последние 2 года), прогоняем
// через ядро с учётом сезонной нормы.
export async function priceTrends({ months = 24, storeId = "" } = {}) {
  const since = new Date();
  since.setMonth(since.getMonth() - months);
  const rows = await db.purchaseEntry.findMany({
    where: {
      date: { gte: since },
      ...(storeId ? { storeId } : {}),
    },
    orderBy: { date: "asc" },
    take: 200000,
  });
  const cfg = await refreshProcurementConfig(true);
  return analyzePriceTrends(
    rows.map((r) => ({
      productId: r.productId,
      productName: r.productName,
      unit: r.unit,
      supplier: r.supplier,
      date: r.date,
      price: r.price,
      amount: r.amount,
    })),
    cfg
  );
}

const ymd = (d) => d.toISOString().slice(0, 10);

// Обзор остатков: текущий остаток + средний дневной расход за `days` дней
// (расход = остаток_нач + приход − остаток_кон), + правила мин/макс из БД.
export async function stockOverview({ days = 30, storeId = "" } = {}) {
  const cfg = await refreshProcurementConfig(true);
  const now = new Date();
  const past = new Date(now.getTime() - days * 86400000);
  const nowTs = `${ymd(now)}T23:59:59`;
  const pastTs = `${ymd(past)}T00:00:00`;

  const [cur, prev, inv, rules] = await Promise.all([
    storeBalances({ timestamp: nowTs, storeId }),
    storeBalances({ timestamp: pastTs, storeId }).catch(() => ({ rows: [] })),
    incomingInvoices({ from: ymd(past), to: ymd(now) }).catch(() => ({
      entries: [],
    })),
    db.productStockRule.findMany(),
  ]);

  const prevById = new Map(prev.rows.map((r) => [r.productId, r.stock]));
  const incomeById = new Map();
  for (const e of inv.entries) {
    // Приход учитываем только по выбранному складу (если фильтр задан).
    if (storeId && e.storeId && e.storeId !== storeId) continue;
    incomeById.set(
      e.productId,
      (incomeById.get(e.productId) || 0) + (Number(e.amount) || 0)
    );
  }
  const ruleById = new Map(rules.map((r) => [r.productId, r]));

  const items = cur.rows.map((r) => {
    const open = prevById.get(r.productId) || 0;
    const income = incomeById.get(r.productId) || 0;
    // Теоретический расход за период = начало + приход − конец (не меньше 0).
    const consumption = Math.max(0, open + income - r.stock);
    const rule = ruleById.get(r.productId);
    return {
      productId: r.productId,
      name: r.name,
      stock: r.stock,
      avgDailyConsumption: days > 0 ? consumption / days : 0,
      minQty: rule ? rule.minQty : null,
      maxQty: rule ? rule.maxQty : null,
      manual: rule ? rule.manual : false,
    };
  });
  return analyzeStock(items, cfg);
}

// Задолженность перед поставщиками на сегодня (баланс взаиморасчётов из iiko).
export async function supplierDebts() {
  const now = new Date();
  const res = await supplierBalances({ timestamp: `${ymd(now)}T23:59:59` });
  const rows = res.rows || [];
  const owed = rows.filter((r) => r.debt > 0);
  return {
    rows,
    totalDebt: Math.round(owed.reduce((s, r) => s + r.debt, 0) * 100) / 100,
    count: owed.length,
    raw: res.raw,
    sample: res.sample,
    bytes: res.bytes,
    rowSample: res.rowSample,
    suppliersRawFirst: res.suppliersRawFirst,
  };
}

// Движение товара за период: сверка начало + приход − конец = расход.
export async function movementReport({ from, to, storeId = "" }) {
  const [openBal, closeBal, inv] = await Promise.all([
    storeBalances({ timestamp: `${from}T00:00:00`, storeId }).catch(() => ({
      rows: [],
    })),
    storeBalances({ timestamp: `${to}T23:59:59`, storeId }),
    incomingInvoices({ from, to }).catch(() => ({ entries: [] })),
  ]);
  const openById = new Map(openBal.rows.map((r) => [r.productId, r.stock]));
  const nameById = new Map();
  const unitById = new Map();
  for (const r of closeBal.rows) {
    nameById.set(r.productId, r.name);
    unitById.set(r.productId, r.unit);
  }
  const incomeById = new Map();
  for (const e of inv.entries) {
    // Приход — только по выбранному складу (если фильтр задан).
    if (storeId && e.storeId && e.storeId !== storeId) continue;
    incomeById.set(
      e.productId,
      (incomeById.get(e.productId) || 0) + (Number(e.amount) || 0)
    );
    if (!nameById.has(e.productId)) nameById.set(e.productId, e.productName);
  }
  const ids = new Set([
    ...openById.keys(),
    ...closeBal.rows.map((r) => r.productId),
    ...incomeById.keys(),
  ]);
  const rows = [...ids].map((productId) => {
    const close =
      closeBal.rows.find((r) => r.productId === productId)?.stock || 0;
    return {
      productId,
      name: nameById.get(productId) || productId,
      unit: unitById.get(productId) || "",
      open: openById.get(productId) || 0,
      income: incomeById.get(productId) || 0,
      close,
    };
  });
  return computeMovement(rows);
}
