// Маршруты ИИ-помощника. Ключ Claude API хранится ТОЛЬКО в окружении;
// фронт получает готовый JSON. Доступ — офисные роли.
import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { asyncHandler } from "../util/asyncHandler.js";
import { aiConfigured, suggestCake } from "../services/ai.js";

const r = Router();
r.use(requireAuth);

// Настроен ли ИИ — фронт может показать/спрятать помощника.
r.get("/status", (req, res) => res.json({ configured: aiConfigured() }));

const StdItem = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(200),
  cost: z.number().optional(),
});
const CakeSuggestSchema = z.object({
  order: z.string().min(3).max(600),
  standards: z.object({
    bases: z.array(StdItem).max(60).default([]),
    coatings: z.array(StdItem).max(60).default([]),
    decors: z.array(StdItem).max(120).default([]),
  }),
});

// Подбор состава торта по описанию заказа.
r.post(
  "/cake-suggest",
  requireRole("director", "finance", "accountant", "manager", "sysadmin"),
  asyncHandler(async (req, res) => {
    const parsed = CakeSuggestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Опишите заказ (3–600 символов)" });
    }
    if (!aiConfigured()) {
      return res.status(503).json({
        error: "ИИ не настроен (нет ANTHROPIC_API_KEY на сервере)",
        configured: false,
      });
    }
    try {
      const out = await suggestCake(parsed.data);
      res.json(out);
    } catch (e) {
      res
        .status(502)
        .json({ error: e.message || "ИИ-помощник временно недоступен" });
    }
  })
);

export default r;
