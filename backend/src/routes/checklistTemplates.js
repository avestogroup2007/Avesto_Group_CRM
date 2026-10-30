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
import { listRoles } from "../services/iikoServer.js";

const r = Router();
r.use(requireAuth);

// Правка шаблонов чек-листов меняет, что и как отмечает персонал — пишем в
// журнал безопасности (как остальные конфигурационные поверхности).
async function logTpl(req, event, detail) {
  await db.auditLog
    .create({ data: { userId: req.user.uid, event, detail, ip: req.ip } })
    .catch(() => {});
}

const ItemSchema = z.object({
  text: z.string().min(1).max(200),
  needPhoto: z.boolean().default(false),
});

// Почасовой шаблон с окном from >= to даёт пустой список часов — чек-лист
// становится неоткрываемым. Требуем корректное окно (как в конфиге орг-ии).
const hourlyWindowOk = (d) =>
  d.scheduleType !== "hourly" ||
  d.fromHour == null ||
  d.toHour == null ||
  d.fromHour < d.toHour;

const TemplateBase = z.object({
  kind: z.enum(["role", "cleaning"]),
  position: z.string().max(120).default(""),
  // Рабочая зона: зал, кухня, бар, туалет и т.п. Пусто — чек-лист на всю
  // должность. Список зон не фиксирован: у цеха и у магазина они разные.
  zone: z.string().max(120).default(""),
  title: z.string().min(1).max(200),
  items: z.array(ItemSchema).min(1).max(40),
  scheduleType: z.enum(["daily", "shift", "hourly"]).default("daily"),
  fromHour: z.coerce.number().int().min(0).max(23).nullable().optional(),
  toHour: z.coerce.number().int().min(0).max(23).nullable().optional(),
  active: z.boolean().default(true),
});
const TemplateSchema = TemplateBase.refine(hourlyWindowOk, {
  message: "Начало окна должно быть раньше конца",
  path: ["toHour"],
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
      // Порядок «должность → зона» даёт готовую группировку в интерфейсе:
      // все чек-листы уборщицы идут подряд, внутри — по зонам.
      orderBy: [
        { kind: "asc" },
        { position: "asc" },
        { zone: "asc" },
        { createdAt: "asc" },
      ],
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
    await logTpl(
      req,
      "checklist_template_create",
      `Создан шаблон чек-листа «${created.title}» (${created.kind}${created.position ? `, ${created.position}` : ""})`
    );
    res.status(201).json(created);
  })
);

r.patch(
  "/:id",
  requireRole("director", "sysadmin"),
  asyncHandler(async (req, res) => {
    const parsed = TemplateBase.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Неверный формат чек-листа" });
    }
    // Правка не должна обойти гейтинг: если после правки шаблон относится к
    // выключенному модулю (сменили kind или включают active) — запрещаем.
    const cur = await db.checklistTemplate
      .findUnique({ where: { id: req.params.id } })
      .catch(() => null);
    if (!cur) return res.status(404).json({ error: "Чек-лист не найден" });
    const effKind = parsed.data.kind || cur.kind;
    const effActive =
      parsed.data.active !== undefined ? parsed.data.active : cur.active;
    // Окно почасового шаблона после слияния с текущим должно быть корректным.
    const merged = { ...cur, ...parsed.data };
    if (!hourlyWindowOk(merged)) {
      return res
        .status(400)
        .json({ error: "Начало окна должно быть раньше конца" });
    }
    await refreshModules().catch(() => {});
    if (effActive && !moduleEnabled(MODULE_FOR[effKind])) {
      return res
        .status(403)
        .json({ error: "Модуль выключен — обратитесь к владельцу системы" });
    }
    const updated = await db.checklistTemplate
      .update({ where: { id: req.params.id }, data: parsed.data })
      .catch(() => null);
    if (!updated) return res.status(404).json({ error: "Чек-лист не найден" });
    await logTpl(
      req,
      "checklist_template_update",
      `Изменён шаблон чек-листа «${updated.title}» (${updated.kind})`
    );
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
    await logTpl(
      req,
      "checklist_template_delete",
      `Удалён шаблон чек-листа «${deleted.title}» (${deleted.kind})`
    );
    res.json({ ok: true });
  })
);


// Справочники для редактора шаблонов: должности и зоны.
//
// Должности тянутся из iiko, а не вводятся руками: при ручном вводе
// «Официант» и «официант» становятся разными чек-листами, и сотруднику
// ничего не назначается. Если iiko недоступен — отдаём должности, уже
// заведённые у сотрудников в CRM, чтобы редактор не остался пустым.
//
// Зоны не фиксированы в коде: у цеха и у магазина они разные. Отдаём уже
// использованные плюс типовой набор, а завести новую можно вводом.
const DEFAULT_ZONES = ["Зал", "Кухня", "Бар", "Туалет", "Склад", "Витрина", "Цех"];
r.get(
  "/meta",
  asyncHandler(async (req, res) => {
    const [roles, usedPositions, usedZones] = await Promise.all([
      listRoles()
        .then((r) => Object.values(r.byCode || {}))
        .catch(() => []),
      db.user.findMany({
        where: { position: { not: "" } },
        select: { position: true },
        distinct: ["position"],
        take: 200,
      }),
      db.checklistTemplate.findMany({
        where: { zone: { not: "" } },
        select: { zone: true },
        distinct: ["zone"],
        take: 200,
      }),
    ]);
    const positions = [
      ...new Set([...roles, ...usedPositions.map((u) => u.position)]),
    ]
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, "ru"));
    const zones = [
      ...new Set([...usedZones.map((z) => z.zone), ...DEFAULT_ZONES]),
    ]
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, "ru"));
    res.json({ positions, zones });
  })
);

export default r;
