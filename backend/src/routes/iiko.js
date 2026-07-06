// Прокси-маршруты iiko (iikoServer API): фронтенд обращается сюда, а не к iiko
// напрямую — логин/пароль остаются на сервере. Все маршруты требуют входа.
import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { asyncHandler } from "../util/asyncHandler.js";
import {
  iikoConfigured,
  IikoNotConfiguredError,
  salesReport,
  listEmployees,
} from "../services/iikoServer.js";
import { syncEmployeesToDb, listDbEmployees } from "../services/iikoSync.js";

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

// Список сотрудников из iiko (для импорта в справочник CRM). Пока только
// чтение/предпросмотр: { employees: [...], count }. Возвращает ФИО, должность,
// подразделения и признак «уволен» — источник правды по кадрам это iiko.
r.get(
  "/employees",
  handleIiko(async (req, res) => {
    res.json(await listEmployees());
  })
);

// Синхронизация кадров из iiko в базу CRM (только директор/сисадмин).
// Заводит/обновляет учётные записи, уволенных в iiko блокирует.
r.post(
  "/employees/sync",
  requireRole("director", "sysadmin"),
  handleIiko(async (req, res) => {
    res.json(await syncEmployeesToDb());
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

export default r;
