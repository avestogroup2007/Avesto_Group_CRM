// Обратная связь из клиентской установки владельцу системы: любой вошедший
// сотрудник клиента отправляет «что улучшить», и предложение уходит на
// установку Back Office (адрес и токен канала — в окружении клиента:
// VENDOR_FEEDBACK_URL + VENDOR_INTAKE_SECRET). Данные клиента при этом не
// покидают его систему — уходит только текст предложения и название бренда.
import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/requireAuth.js";
import { asyncHandler } from "../util/asyncHandler.js";
import { refreshOrgConfig } from "../services/orgConfig.js";

const r = Router();
r.use(requireAuth);

const FeedbackSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().max(2000).default(""),
});

r.get("/status", (req, res) => {
  res.json({
    configured: Boolean(
      process.env.VENDOR_FEEDBACK_URL && process.env.VENDOR_INTAKE_SECRET
    ),
  });
});

r.post(
  "/",
  asyncHandler(async (req, res) => {
    const url = process.env.VENDOR_FEEDBACK_URL || "";
    const secret = process.env.VENDOR_INTAKE_SECRET || "";
    if (!url || !secret) {
      return res
        .status(503)
        .json({ error: "Канал обратной связи не настроен" });
    }
    const parsed = FeedbackSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Опишите предложение (3+ символа)" });
    }
    const cfg = await refreshOrgConfig();
    try {
      const resp = await fetch(`${url.replace(/\/$/, "")}/api/vendor/intake`, {
        method: "POST",
        signal: AbortSignal.timeout(8000),
        headers: {
          "Content-Type": "application/json",
          "X-Intake-Token": secret,
        },
        body: JSON.stringify({
          ...parsed.data,
          clientName: cfg.brandName || "",
        }),
      });
      if (!resp.ok) {
        return res.status(502).json({
          error: "Не удалось доставить предложение, попробуйте позже",
        });
      }
      res.status(201).json({ ok: true });
    } catch {
      res
        .status(502)
        .json({ error: "Не удалось доставить предложение, попробуйте позже" });
    }
  })
);

export default r;
