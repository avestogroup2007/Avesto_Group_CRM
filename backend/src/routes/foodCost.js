// Себестоимость (food cost): конфигурация расчёта — общий ФК% по умолчанию,
// ФК% по группам блюд и ручные цены за единицу блюда («гибрид» с iiko).
// Сам отчёт (продажи × себестоимость) — в /api/iiko/food-cost, т.к. использует
// продажи из iiko. Чтение конфигурации — офисным ролям; правка — директору/
// сисадмину (с записью в журнал безопасности).
import { Router } from "express";
import { db } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { asyncHandler } from "../util/asyncHandler.js";
import {
  FoodCostSchema,
  refreshFoodCostConfig,
  saveFoodCostConfig,
} from "../services/foodCostConfig.js";

const r = Router();
r.use(requireAuth);
r.use(requireRole("director", "finance", "accountant", "sysadmin"));

r.get(
  "/config",
  asyncHandler(async (req, res) => {
    res.json(await refreshFoodCostConfig(true));
  })
);

r.put(
  "/config",
  requireRole("director", "sysadmin"),
  asyncHandler(async (req, res) => {
    const parsed = FoodCostSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Неверный формат настроек" });
    }
    const saved = await saveFoodCostConfig(parsed.data, req.user.uid);
    await db.auditLog
      .create({
        data: {
          userId: req.user.uid,
          event: "food_cost_config_update",
          detail: `Себестоимость: по умолчанию ${saved.defaultPct}%, групп ${Object.keys(saved.groupPct).length}, блюд ${Object.keys(saved.dishCost).length}`,
          ip: req.ip,
        },
      })
      .catch(() => {});
    res.json(saved);
  })
);

export default r;
