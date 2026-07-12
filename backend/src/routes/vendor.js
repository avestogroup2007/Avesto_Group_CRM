// Back Office владельца системы: клиенты (кто покупает систему) и доска
// развития продукта. Доступ — только owner (владелец) и vendor (его команда
// продаж). Бизнес-ролям клиента (director, finance…) раздел недоступен —
// в клиентских установках ролей owner/vendor просто нет.
import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { asyncHandler } from "../util/asyncHandler.js";

const r = Router();
r.use(requireAuth);
// Не через requireRole: owner проходит его всегда, а здесь нужен точный список.
r.use((req, res, next) => {
  if (!["owner", "vendor"].includes(req.user.role)) {
    return res.status(403).json({ error: "Раздел доступен владельцу системы" });
  }
  next();
});

const serClient = (c) => ({ ...c, monthlyFee: Number(c.monthlyFee || 0) });

const ClientSchema = z.object({
  name: z.string().min(1).max(200),
  contact: z.string().max(200).default(""),
  phone: z.string().max(50).default(""),
  status: z
    .enum(["lead", "demo", "active", "paused", "churned"])
    .default("lead"),
  tariff: z.string().max(100).default(""),
  monthlyFee: z.coerce.number().int().min(0).max(9e15).default(0),
  deployUrl: z.string().max(300).default(""),
  notes: z.string().max(2000).default(""),
});

// ── Клиенты ────────────────────────────────────────────────────────────────
r.get(
  "/clients",
  asyncHandler(async (req, res) => {
    const items = await db.vendorClient.findMany({
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 500,
    });
    // Сводка: активные и MRR (ежемесячная выручка по активным).
    const active = items.filter((c) => c.status === "active");
    res.json({
      items: items.map(serClient),
      summary: {
        total: items.length,
        active: active.length,
        leads: items.filter((c) => c.status === "lead" || c.status === "demo")
          .length,
        mrr: active.reduce((a, c) => a + Number(c.monthlyFee || 0), 0),
      },
    });
  })
);

r.post(
  "/clients",
  asyncHandler(async (req, res) => {
    const parsed = ClientSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Неверный формат клиента" });
    }
    const created = await db.vendorClient.create({
      data: { ...parsed.data, monthlyFee: BigInt(parsed.data.monthlyFee) },
    });
    res.status(201).json(serClient(created));
  })
);

r.patch(
  "/clients/:id",
  asyncHandler(async (req, res) => {
    const parsed = ClientSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Неверный формат клиента" });
    }
    const data = { ...parsed.data };
    if (data.monthlyFee !== undefined)
      data.monthlyFee = BigInt(data.monthlyFee);
    const updated = await db.vendorClient
      .update({ where: { id: req.params.id }, data })
      .catch(() => null);
    if (!updated) return res.status(404).json({ error: "Клиент не найден" });
    res.json(serClient(updated));
  })
);

r.delete(
  "/clients/:id",
  asyncHandler(async (req, res) => {
    // Удалять клиентов может только владелец (не команда продаж).
    if (req.user.role !== "owner") {
      return res.status(403).json({ error: "Удаление — только владельцу" });
    }
    const deleted = await db.vendorClient
      .delete({ where: { id: req.params.id } })
      .catch(() => null);
    if (!deleted) return res.status(404).json({ error: "Клиент не найден" });
    res.json({ ok: true });
  })
);

// ── Развитие продукта ──────────────────────────────────────────────────────
const FeatureSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).default(""),
  clientName: z.string().max(200).default(""),
  status: z.enum(["idea", "planned", "in_progress", "done"]).default("idea"),
  priority: z.enum(["low", "normal", "high"]).default("normal"),
});

r.get(
  "/features",
  asyncHandler(async (req, res) => {
    const items = await db.featureRequest.findMany({
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 500,
    });
    res.json({ items });
  })
);

r.post(
  "/features",
  asyncHandler(async (req, res) => {
    const parsed = FeatureSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Неверный формат запроса" });
    }
    const created = await db.featureRequest.create({ data: parsed.data });
    res.status(201).json(created);
  })
);

r.patch(
  "/features/:id",
  asyncHandler(async (req, res) => {
    const parsed = FeatureSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Неверный формат запроса" });
    }
    const updated = await db.featureRequest
      .update({ where: { id: req.params.id }, data: parsed.data })
      .catch(() => null);
    if (!updated) return res.status(404).json({ error: "Запись не найдена" });
    res.json(updated);
  })
);

r.delete(
  "/features/:id",
  asyncHandler(async (req, res) => {
    if (req.user.role !== "owner") {
      return res.status(403).json({ error: "Удаление — только владельцу" });
    }
    const deleted = await db.featureRequest
      .delete({ where: { id: req.params.id } })
      .catch(() => null);
    if (!deleted) return res.status(404).json({ error: "Запись не найдена" });
    res.json({ ok: true });
  })
);

export default r;
