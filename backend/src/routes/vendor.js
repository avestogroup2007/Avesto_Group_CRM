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

// ── Входящие предложения от клиентских установок (без входа) ────────────────
// Клиентская система шлёт сюда «что улучшить» со своим секретом-токеном
// (VENDOR_INTAKE_SECRET задаётся в окружении ОБЕИХ сторон). Читается из
// process.env в момент запроса — чтобы тесты могли включать канал на лету.
const IntakeSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().max(2000).default(""),
  clientName: z.string().max(200).default(""),
});
r.post(
  "/intake",
  asyncHandler(async (req, res) => {
    const secret = process.env.VENDOR_INTAKE_SECRET || "";
    if (!secret) return res.status(404).end(); // канал не включён
    const got = String(req.get("x-intake-token") || "");
    if (got !== secret) return res.status(401).end();
    const parsed = IntakeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Неверный формат предложения" });
    }
    const created = await db.featureRequest.create({
      data: { ...parsed.data, status: "idea", priority: "normal" },
    });
    res.status(201).json({ ok: true, id: created.id });
  })
);

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

// ── Мониторинг работоспособности установки клиента ─────────────────────────
// ТОЛЬКО чтение /api/health чужой установки: Back Office by design не имеет
// никакого API для изменения или удаления данных в системе клиента.
function normalizeHealthUrl(raw) {
  let u = String(raw || "").trim();
  if (!u) return null;
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  let parsed;
  try {
    parsed = new URL(u);
  } catch {
    return null;
  }
  // В проде не ходим по внутренним адресам (защита от SSRF).
  const host = parsed.hostname;
  const isPrivate =
    host === "localhost" ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host);
  // Внутренние адреса разрешены только тестам (NODE_ENV=test или явный
  // рубильник) — в проде это защита от SSRF.
  const allowPrivate =
    process.env.NODE_ENV === "test" ||
    process.env.ALLOW_PRIVATE_HEALTH_CHECK === "1";
  if (isPrivate && !allowPrivate) return null;
  return `${parsed.origin}/api/health`;
}

r.post(
  "/clients/:id/check",
  asyncHandler(async (req, res) => {
    const client = await db.vendorClient.findUnique({
      where: { id: req.params.id },
    });
    if (!client) return res.status(404).json({ error: "Клиент не найден" });
    const url = normalizeHealthUrl(client.deployUrl);
    if (!url) {
      return res
        .status(400)
        .json({ error: "У клиента не указан корректный адрес установки" });
    }
    const started = Date.now();
    let ok = false;
    try {
      const resp = await fetch(url, {
        signal: AbortSignal.timeout(8000),
        headers: { Accept: "application/json" },
      });
      const body = await resp.json().catch(() => ({}));
      ok = resp.ok && body && body.ok === true;
    } catch {
      ok = false;
    }
    const latency = Date.now() - started;
    const updated = await db.vendorClient.update({
      where: { id: client.id },
      data: {
        lastCheckAt: new Date(),
        lastCheckOk: ok,
        lastLatencyMs: latency,
      },
    });
    res.json({
      ok,
      latencyMs: latency,
      checkedAt: updated.lastCheckAt,
    });
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
