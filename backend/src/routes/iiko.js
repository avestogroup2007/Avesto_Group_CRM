// Прокси-маршруты iiko (iikoServer API): фронтенд обращается сюда, а не к iiko
// напрямую — логин/пароль остаются на сервере. Все маршруты требуют входа.
import { Router } from "express";
import { db } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { asyncHandler } from "../util/asyncHandler.js";
import {
  iikoConfigured,
  IikoNotConfiguredError,
  salesReport,
  listEmployees,
  pnlReport,
  riskyReport,
  productionRefs,
  createProduction,
} from "../services/iikoServer.js";
import {
  syncEmployeesToDb,
  listDbEmployees,
  updateEmployeeAccess,
} from "../services/iikoSync.js";
import { sendTelegram, topicFor, esc } from "../services/telegram.js";

const r = Router();
r.use(requireAuth);

// Превращает «iiko не настроен» в 503, остальное — 502 с реальной причиной.
function handleIiko(fn) {
  return asyncHandler(async (req, res) => {
    try {
      await fn(req, res);
    } catch (e) {
      if (e instanceof IikoNotConfiguredError) {
        return res.status(503).json({ error: e.message, configured: false });
      }
      // Показываем реальную причину от iiko — помогает при настройке
      // (неверный логин/пароль, недоступный сервер и т.п.).
      return res
        .status(502)
        .json({ error: e.message || "Ошибка запроса к iiko" });
    }
  });
}

// Настроена ли интеграция — фронт покажет demo/live соответственно.
r.get("/status", (req, res) => res.json({ configured: iikoConfigured() }));

// OLAP-отчёт продаж за период. Тело:
// { from: "YYYY-MM-DD", to: "YYYY-MM-DD", department?: "Имя филиала" }.
// Возвращает { byDay, byPay, byDish } для вкладок аналитики.
r.post(
  "/olap",
  handleIiko(async (req, res) => {
    const { from, to, department } = req.body || {};
    if (!from || !to) {
      return res.status(400).json({ error: "Нужны параметры from и to" });
    }
    const departments = department ? [department] : undefined;
    res.json(await salesReport({ from, to, departments }));
  })
);

// Отчёт о прибылях и убытках (ОПиУ) за период. Тело: { from, to }.
// Структура берётся из плана счетов iiko (по типам счетов) — динамически.
r.post(
  "/pnl",
  handleIiko(async (req, res) => {
    const { from, to, department } = req.body || {};
    if (!from || !to) {
      return res.status(400).json({ error: "Нужны параметры from и to" });
    }
    res.json(
      await pnlReport({ from, to, department: department || undefined })
    );
  })
);

// Подозрительные операции за период: удаления/сторно заказов и крупные
// скидки в разрезе сотрудников. Тело: { from, to, department?, discountPct? }.
r.post(
  "/risky",
  handleIiko(async (req, res) => {
    const { from, to, department, discountPct } = req.body || {};
    if (!from || !to) {
      return res.status(400).json({ error: "Нужны параметры from и to" });
    }
    res.json(
      await riskyReport({
        from,
        to,
        department: department || undefined,
        discountPct: typeof discountPct === "number" ? discountPct : undefined,
      })
    );
  })
);

// Список сотрудников из iiko (для импорта в справочник CRM). Пока только
// чтение/предпросмотр: { employees: [...], count }. Возвращает ФИО, должность,
// подразделения и признак «уволен» — источник правды по кадрам это iiko.
r.get(
  "/employees",
  handleIiko(async (req, res) => {
    res.json(await listEmployees());
  })
);

// Справочники для «Акта приготовления»: блюда/заготовки (с тех.картой) и
// склады из iiko. Пока только чтение — проверяем данные перед записью актов.
// Доступ — офисные роли и управляющий.
r.get(
  "/production/refs",
  requireRole("director", "finance", "accountant", "sysadmin", "manager"),
  handleIiko(async (req, res) => {
    res.json(await productionRefs());
  })
);

// Создание «Акта приготовления» в iiko. Тело:
// { date, storeId, items:[{productId, amount}], number?, comment?, dryRun? }.
// dryRun:true — только предпросмотр XML (в iiko ничего не пишется). Реальное
// проведение (dryRun:false) меняет остатки в iiko — фиксируем в журнале.
r.post(
  "/production/act",
  requireRole("director", "finance", "accountant", "sysadmin", "manager"),
  handleIiko(async (req, res) => {
    const { date, storeId, items, number, comment, dryRun } = req.body || {};
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) {
      return res.status(400).json({ error: "Нужна дата (ГГГГ-ММ-ДД)" });
    }
    if (!storeId) return res.status(400).json({ error: "Выберите склад" });
    if (!Array.isArray(items) || !items.length) {
      return res.status(400).json({ error: "Добавьте хотя бы одно блюдо" });
    }
    for (const it of items) {
      if (!it || !it.productId || !(Number(it.amount) > 0)) {
        return res
          .status(400)
          .json({ error: "У каждой позиции нужен продукт и количество > 0" });
      }
    }
    const result = await createProduction({
      date,
      storeId,
      items,
      number: number || "",
      comment: comment || "",
      dryRun: !!dryRun,
    });
    // В журнал пишем только реальное проведение (не предпросмотр).
    if (!dryRun) {
      await db.auditLog
        .create({
          data: {
            userId: req.user.uid,
            event: "iiko_production_act",
            detail: `Акт приготовления в iiko: склад ${storeId}, позиций ${items.length}, дата ${date}`,
            ip: req.ip,
          },
        })
        .catch(() => {});
    }
    res.json(result);
  })
);

// Синхронизация кадров из iiko в базу CRM (только директор/сисадмин).
// Заводит/обновляет учётные записи, уволенных в iiko блокирует.
r.post(
  "/employees/sync",
  requireRole("director", "sysadmin"),
  handleIiko(async (req, res) => {
    const result = await syncEmployeesToDb();
    // Персонал: сводка синхронизации в свою тему (best-effort).
    sendTelegram(
      `👥 <b>Синхронизация с iiko</b>\n` +
        `Всего: ${result.total} · новых: ${result.created} · ` +
        `обновлено: ${result.updated} · заблокировано: ${result.blocked}`,
      undefined,
      topicFor("staff")
    );
    res.json(result);
  })
);

// Список уже синхронизированных из iiko сотрудников (учётные записи CRM).
r.get(
  "/employees/db",
  requireRole("director", "sysadmin"),
  asyncHandler(async (req, res) => {
    res.json({ employees: await listDbEmployees() });
  })
);

// Настройка прав сотрудника из iiko: роль и/или активность (доступ ко входу).
r.patch(
  "/employees/:id",
  requireRole("director", "sysadmin"),
  asyncHandler(async (req, res) => {
    const { role, active, telegramId, checklistBranch } = req.body || {};
    try {
      const updated = await updateEmployeeAccess(req.params.id, {
        role,
        active,
        telegramId,
        checklistBranch,
      });
      // Персонал: изменение доступа сотрудника в свою тему (best-effort).
      sendTelegram(
        `👤 <b>Доступ сотрудника изменён</b>\n` +
          `${esc(updated.displayName || updated.login || "—")} — ` +
          `роль: ${esc(updated.role)}, ` +
          `${updated.active ? "активен ✅" : "заблокирован ⛔"}`,
        undefined,
        topicFor("staff")
      );
      res.json(updated);
    } catch (e) {
      res.status(400).json({ error: e.message || "Не удалось обновить" });
    }
  })
);

export default r;
