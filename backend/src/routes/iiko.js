// Прокси-маршруты iiko (iikoWeb Public API): фронтенд обращается сюда, а не к
// iiko напрямую — секретный api_key остаётся на сервере. Все маршруты требуют
// входа.
import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { asyncHandler } from "../util/asyncHandler.js";
import {
  iikoConfigured,
  IikoNotConfiguredError,
  stores,
  salesDocuments,
  users,
  products,
} from "../services/iikoClient.js";

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
      // Показываем реальную причину от iiko (эндпоинт под requireAuth) —
      // помогает при настройке (неверный api_key, не тот регион и т.п.).
      return res
        .status(502)
        .json({ error: e.message || "Ошибка запроса к iiko" });
    }
  });
}

// Настроена ли интеграция — фронт может показать demo/live соответственно.
r.get("/status", (req, res) => res.json({ configured: iikoConfigured() }));

// Список ресторанов (точек) iiko — для сопоставления филиалов.
// Совместимость: старый путь /organizations тоже отдаёт точки.
async function sendStores(req, res) {
  res.json(await stores());
}
r.post("/stores", handleIiko(sendStores));
r.post("/organizations", handleIiko(sendStores));

// Список пользователей iiko.
r.post(
  "/users",
  handleIiko(async (req, res) => {
    res.json(await users());
  })
);

// Список продуктов (номенклатура).
r.post(
  "/products",
  handleIiko(async (req, res) => {
    res.json(await products());
  })
);

// Экспорт актов реализации (продаж) за период по департаменту точки.
r.post(
  "/sales",
  handleIiko(async (req, res) => {
    const { departmentId, from, to } = req.body || {};
    if (!departmentId) {
      return res.status(400).json({ error: "Нужен departmentId" });
    }
    if (!from || !to) {
      return res.status(400).json({ error: "Нужны параметры from и to" });
    }
    res.json(await salesDocuments({ departmentId, from, to }));
  })
);

export default r;
