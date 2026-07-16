// Крон-эндпоинт авто-проверки закупок/склада: внешний планировщик раз в день
// дёргает POST /api/procurement-cron/check с секретом в заголовке X-Cron-Secret.
// Без JWT (у крона его нет) — защита секретом. Пустой PROCUREMENT_CRON_SECRET =
// авто-проверка отключена (503). Проверка тянет из iiko цены и остатки, шлёт
// новые сигналы в топик «Товары» (с дедупом).
import { Router } from "express";
import crypto from "node:crypto";
import { env } from "../env.js";
import { asyncHandler } from "../util/asyncHandler.js";
import { sendProcurementAlerts } from "../services/procurementAlerts.js";

// Сравнение секретов за постоянное время — против timing-атаки.
function secretEquals(got, want) {
  const a = Buffer.from(String(got || ""));
  const b = Buffer.from(String(want || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const r = Router();

r.post(
  "/check",
  asyncHandler(async (req, res) => {
    const secret = env.PROCUREMENT_CRON_SECRET;
    if (!secret) {
      return res.status(503).json({
        error: "Авто-проверка отключена (нет PROCUREMENT_CRON_SECRET)",
      });
    }
    if (!secretEquals(req.get("x-cron-secret"), secret)) {
      return res.status(403).json({ error: "Неверный секрет" });
    }
    const result = await sendProcurementAlerts();
    res.json({ ok: true, ...result });
  })
);

export default r;
