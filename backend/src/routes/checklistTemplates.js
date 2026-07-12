// Шаблоны чек-листов, настраиваемые клиентом в админке (когда модуль включён
// владельцем в Back Office). role — по должности, cleaning — почасовая уборка.
// Чтение — всем вошедшим (сотрудник видит свои чек-листы), запись — админ
// клиента (director/sysadmin). Гейтинг по флагам модулей: нельзя создавать
// шаблоны выключенного модуля.
import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { asyncHandler } from "../util/asyncHandler.js";
import { refreshModules, moduleEnabled } from "../services/modules.js";

const r = Router();
r.use(requireAuth);

const ItemSchema = z.object({
  text: z.string().min(1).max(200),
  needPhoto: z.boolean().default(false),
});

const TemplateSchema = z.object({
  kind: z.enum(["role", "cleaning"]),
  position: z.string().max(120).default(""),
  title: z.string().min(1).max(200),
  items: z.array(ItemSchema).min(1).max(40),
  scheduleType: z.enum(["daily", "shift", "hourly"]).default("daily"),
  fromHour: z.coerce.number().int().min(0).max(23).nullable().optional(),
  toHour: z.coerce.number().int().min(0).max(23).nullable().optional(),
  active: z.boolean().default(true),
});

// Какой модуль нужен для kind шаблона.
const MODULE_FOR = {
  role: "employeeChecklists",
  cleaning: "cleaningChecklists",
};

r.get(
  "/",
  asyncHandler(async (req, res) => {
    await refreshModules().catch(() => {});
    const where = {};
    if (req.query.kind) where.kind = String(req.query.kind);
    const items = await db.checklistTemplate.findMany({
      where,
      orderBy: [{ kind: "asc" }, { position: "asc" }, { createdAt: "asc" }],
      take: 500,
    });
    res.json({
      items,
      modules: {
        employeeChecklists: moduleEnabled("employeeChecklists"),
        cleaningChecklists: moduleEnabled("cleaningChecklists"),
      },
    });
  })
);

r.post(
  "/",
  requireRole("director", "sysadmin"),
  asyncHandler(async (req, res) => {
    const parsed = TemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Неверный формат чек-листа" });
    }
    await refreshModules().catch(() => {});
    if (!moduleEnabled(MODULE_FOR[parsed.data.kind])) {
      return res
        .status(403)
        .json({ error: "Модуль выключен — обратитесь к владельцу системы" });
    }
    const created = await db.checklistTemplate.create({ data: parsed.data });
    res.status(201).json(created);
  })
);

r.patch(
  "/:id",
  requireRole("director", "sysadmin"),
  asyncHandler(async (req, res) => {
    const parsed = TemplateSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Неверный формат чек-листа" });
    }
    const updated = await db.checklistTemplate
      .update({ where: { id: req.params.id }, data: parsed.data })
      .catch(() => null);
    if (!updated) return res.status(404).json({ error: "Чек-лист не найден" });
    res.json(updated);
  })
);

r.delete(
  "/:id",
  requireRole("director", "sysadmin"),
  asyncHandler(async (req, res) => {
    const deleted = await db.checklistTemplate
      .delete({ where: { id: req.params.id } })
      .catch(() => null);
    if (!deleted) return res.status(404).json({ error: "Чек-лист не найден" });
    res.json({ ok: true });
  })
);

export default r;
