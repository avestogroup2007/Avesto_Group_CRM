// Рабочие зоны: зал, кухня, бар, туалет, витрина, цех.
//
// Ведут их старшие должности — менеджер, шеф-повар (приходит из iiko как
// manager), бухгалтер, директор и сисадмин. Порядок работы: завести зону →
// указать, каким должностям она положена → назначить сотрудников → повесить
// на зону чек-листы. Читать список может любой авторизованный: зона нужна в
// выборе чек-листа и в карточке сотрудника.
import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { asyncHandler } from "../util/asyncHandler.js";

// Те же роли, что управляют чек-листами: зона и чек-лист — одна зона
// ответственности, разводить права по ним было бы неудобно в работе.
const ZONE_MANAGERS = ["director", "manager", "accountant", "sysadmin"];

const ZoneSchema = z.object({
  name: z.string().trim().min(1).max(80),
  // Филиал — id из конфигурации организации. Нечисловое значение отвергаем:
  // иначе привязка «протухает» и зона молча становится общесетевой.
  branchId: z
    .string()
    .trim()
    .regex(/^\d{1,6}$/)
    .nullable()
    .optional()
    .or(z.literal("")),
  positions: z.array(z.string().trim().min(1).max(120)).max(40).default([]),
  comment: z.string().max(300).default(""),
  active: z.boolean().default(true),
});

const r = Router();
r.use(requireAuth);

r.get(
  "/",
  asyncHandler(async (req, res) => {
    const where = {};
    if (req.query.active === "1") where.active = true;
    if (req.query.branch) where.branchId = String(req.query.branch);
    const items = await db.zone.findMany({
      where,
      orderBy: [{ name: "asc" }],
      take: 300,
    });
    res.json({ items });
  })
);

r.post(
  "/",
  requireRole(...ZONE_MANAGERS),
  asyncHandler(async (req, res) => {
    const parsed = ZoneSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Неверный формат зоны" });
    }
    const d = parsed.data;
    try {
      const created = await db.zone.create({
        data: {
          name: d.name,
          branchId: d.branchId ? String(d.branchId) : null,
          positions: d.positions,
          comment: d.comment,
          active: d.active,
        },
      });
      res.status(201).json(created);
    } catch (e) {
      // Имя зоны уникально: чек-листы и сотрудники ссылаются на неё строкой,
      // и два «Зала» сделали бы привязку неоднозначной.
      if (e && e.code === "P2002") {
        return res
          .status(409)
          .json({ error: "Зона с таким названием уже есть" });
      }
      throw e;
    }
  })
);

r.patch(
  "/:id",
  requireRole(...ZONE_MANAGERS),
  asyncHandler(async (req, res) => {
    const parsed = ZoneSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Неверный формат зоны" });
    }
    const d = parsed.data;
    const data = {};
    if (d.name !== undefined) data.name = d.name;
    if (d.branchId !== undefined)
      data.branchId = d.branchId ? String(d.branchId) : null;
    if (d.positions !== undefined) data.positions = d.positions;
    if (d.comment !== undefined) data.comment = d.comment;
    if (d.active !== undefined) data.active = d.active;
    try {
      const updated = await db.zone.update({
        where: { id: req.params.id },
        data,
      });
      res.json(updated);
    } catch (e) {
      if (e && e.code === "P2002") {
        return res
          .status(409)
          .json({ error: "Зона с таким названием уже есть" });
      }
      if (e && e.code === "P2025") {
        return res.status(404).json({ error: "Зона не найдена" });
      }
      throw e;
    }
  })
);

r.delete(
  "/:id",
  requireRole(...ZONE_MANAGERS),
  asyncHandler(async (req, res) => {
    const zone = await db.zone.findUnique({ where: { id: req.params.id } });
    if (!zone) return res.status(404).json({ error: "Зона не найдена" });
    // Удалять зону, на которой висят чек-листы, нельзя: шаблоны ссылаются на
    // неё по имени и остались бы «сиротами» — сотруднику пришёл бы чек-лист
    // несуществующей зоны. Предлагаем деактивировать вместо удаления.
    const used = await db.checklistTemplate.count({
      where: { zone: zone.name },
    });
    if (used > 0) {
      return res.status(409).json({
        error: `На зоне «${zone.name}» висит чек-листов: ${used}. Снимите их или отключите зону вместо удаления.`,
      });
    }
    await db.zone.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  })
);

export default r;
