// Прокси-маршруты iiko: фронтенд обращается сюда, а не к iiko напрямую —
// секретный apiLogin остаётся на сервере. Все маршруты требуют входа.
import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { asyncHandler } from "../util/asyncHandler.js";
import {
  iikoConfigured,
  IikoNotConfiguredError,
  organizations,
  salesOlap,
  loyaltyCustomers,
} from "../services/iikoClient.js";

const r = Router();
r.use(requireAuth);

// Маппинг наших отчётов на параметры OLAP iiko.
const REPORT_MAP = {
  sales: { groupBy: ["OpenDate.Typed"] }, // выручка по дням
  dishes: { groupBy: ["DishName", "DishGroup"] }, // продажи блюд
  abc: { groupBy: ["DishName", "DishGroup"] }, // ABC (считаем на сервере)
  checks: { groupBy: ["HourOpen"] }, // по часам
  pay: { groupBy: ["PayTypes"] }, // типы оплат
};

// Превращает «iiko не настроен» в 503, остальное — дальше в errorHandler.
function handleIiko(fn) {
  return asyncHandler(async (req, res) => {
    try {
      await fn(req, res);
    } catch (e) {
      if (e instanceof IikoNotConfiguredError) {
        return res.status(503).json({ error: e.message, configured: false });
      }
      // Показываем реальную причину от iiko (эндпоинт под requireAuth) —
      // помогает при настройке (неверный apiLogin, не тот регион и т.п.).
      return res
        .status(502)
        .json({ error: e.message || "Ошибка запроса к iiko" });
    }
  });
}

// Настроена ли интеграция — фронт может показать demo/live соответственно.
r.get("/status", (req, res) => res.json({ configured: iikoConfigured() }));

// Список организаций (точек) iiko — для настройки сопоставления филиалов.
r.post(
  "/organizations",
  handleIiko(async (req, res) => {
    res.json(await organizations());
  })
);

// OLAP-отчёт продаж по одному из наших ключей отчётов.
r.post(
  "/olap",
  handleIiko(async (req, res) => {
    const { report, from, to, filters, organizationId } = req.body || {};
    const cfg = REPORT_MAP[report];
    if (!cfg) return res.status(400).json({ error: "Неизвестный отчёт" });
    if (!from || !to) {
      return res.status(400).json({ error: "Нужны параметры from и to" });
    }
    res.json(
      await salesOlap({ from, to, groupBy: cfg.groupBy, filters, organizationId })
    );
  })
);

// Клиенты программы лояльности.
r.post(
  "/customers",
  handleIiko(async (req, res) => {
    const { organizationId } = req.body || {};
    if (!organizationId) {
      return res.status(400).json({ error: "Нужен organizationId" });
    }
    res.json(await loyaltyCustomers({ organizationId }));
  })
);

export default r;
