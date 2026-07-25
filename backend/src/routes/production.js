// Производственный модуль (ТЗ 14.2): задания, мониторы отделов, факт-ввод,
// коррекция факта, справочник «фаза → склад», диагностика.
//
// Слой намеренно ТОНКИЙ: принять запрос → вызвать движок/планировщик → вернуть
// результат. Вся логика — в productionEngine.js (чистое ядро) и
// productionPlanner.js (данные и побочные эффекты).
import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { asyncHandler } from "../util/asyncHandler.js";
import { refreshModules, moduleEnabled } from "../services/modules.js";
import {
  planFor,
  createTasksFromPlan,
  submitFact,
  productionHealth,
  effectiveFactTotal,
  isIikoNotConfigured,
} from "../services/productionPlanner.js";
import { PHASES, ProductionEngineError } from "../services/productionEngine.js";

const r = Router();
r.use(requireAuth);

// Гейтинг модуля: включается владельцем в Back Office.
r.use(
  asyncHandler(async (req, res, next) => {
    await refreshModules().catch(() => {});
    if (!moduleEnabled("production")) {
      return res.status(403).json({
        error:
          "Модуль «Производство» выключен — обратитесь к владельцу системы",
      });
    }
    next();
  })
);

// Роли: расчёт и генерация документов — технолог/производство и офис (ТЗ 8).
// Отдельной роли «технолог» в системе нет, поэтому используем офисные роли +
// управляющего (он же бригадир на мониторе отдела).
const CAN_PLAN = requireRole("director", "finance", "accountant", "sysadmin");
const CAN_FACT = requireRole(
  "director",
  "finance",
  "accountant",
  "sysadmin",
  "manager"
);

function fail(res, e) {
  if (isIikoNotConfigured(e)) {
    return res.status(503).json({ error: e.message, configured: false });
  }
  if (e instanceof ProductionEngineError) {
    return res.status(400).json({ error: e.message, code: e.code });
  }
  if (e && e.statusCode)
    return res.status(e.statusCode).json({ error: e.message });
  return res.status(502).json({ error: e.message || "Ошибка расчёта" });
}

async function logProd(req, event, detail) {
  await db.auditLog
    .create({ data: { userId: req.user.uid, event, detail, ip: req.ip } })
    .catch(() => {});
}

// Диагностика: что настроено, что мешает (ТЗ 10, 12).
r.get(
  "/health",
  CAN_PLAN,
  asyncHandler(async (req, res) => res.json(await productionHealth()))
);

// Справочник фаз — для UI.
r.get("/phases", (req, res) =>
  res.json({ phases: PHASES.map((p) => ({ key: p.key, label: p.label })) })
);

// ── Предпросмотр плана (ТЗ 5.1, FR-9) ───────────────────────────────────────
// Показывает, ЧТО будет создано, до записи в iiko. Ничего не сохраняет.
const PreviewSchema = z.object({
  productCode: z.string().min(1),
  productName: z.string().max(300).optional(),
  qty: z.number().positive().max(1_000_000),
  branchWarehouseId: z.string().max(100).optional(),
  fresh: z.boolean().optional(),
  // Разовый состав из конструктора заказных тортов (ТЗ 5.2).
  customChart: z
    .object({
      name: z.string().max(300).optional(),
      output: z.number().positive(),
      components: z
        .array(
          z.object({
            code: z.string().min(1),
            name: z.string().max(300).default(""),
            qty: z.number().positive(),
            unit: z.string().max(40).default(""),
          })
        )
        .min(1)
        .max(200),
    })
    .nullable()
    .optional(),
});

r.post(
  "/preview",
  CAN_PLAN,
  asyncHandler(async (req, res) => {
    const parsed = PreviewSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: "Неверные параметры расчёта" });
    try {
      const plan = await planFor(parsed.data);
      res.json(plan);
    } catch (e) {
      fail(res, e);
    }
  })
);

// ── Задания ─────────────────────────────────────────────────────────────────
const CreateSchema = PreviewSchema.extend({
  deliveryDate: z.coerce.date(),
  shift: z.string().max(40).optional(),
  source: z.enum(["AUTO_ORDER", "AUTO_STOCK", "MANUAL"]).optional(),
  orderRef: z.string().max(200).nullable().optional(),
});

r.post(
  "/tasks",
  CAN_PLAN,
  asyncHandler(async (req, res) => {
    const parsed = CreateSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: "Неверные параметры задания" });
    const d = parsed.data;
    try {
      const plan = await planFor(d);
      const out = await createTasksFromPlan({
        plan,
        deliveryDate: d.deliveryDate,
        shift: d.shift || "",
        source: d.source || "MANUAL",
        orderRef: d.orderRef || null,
        userId: req.user.uid,
      });
      if (!out.duplicate) {
        await logProd(
          req,
          "production_tasks_create",
          `Задание на ${plan.product.name} ×${d.qty}: узлов ${out.tasks.length}`
        );
      }
      res.status(out.duplicate ? 200 : 201).json({ ...out, plan });
    } catch (e) {
      fail(res, e);
    }
  })
);

// Список заданий: общий вид или монитор отдела (ТЗ 5.4).
r.get(
  "/tasks",
  asyncHandler(async (req, res) => {
    const where = {};
    if (req.query.department) where.departmentId = String(req.query.department);
    if (req.query.batch) where.batchId = String(req.query.batch);
    if (req.query.status) where.status = String(req.query.status);
    const tasks = await db.productionTask.findMany({
      where,
      orderBy: [{ deliveryDate: "asc" }, { createdAt: "asc" }],
      take: 500,
      include: {
        facts: true,
        department: true,
        _count: { select: { documents: true } },
      },
    });
    res.json({
      tasks: tasks.map((t) => {
        const factTotal = effectiveFactTotal(t.facts);
        return {
          id: t.id,
          nodeCode: t.nodeCode,
          nodeName: t.nodeName,
          phase: t.phase,
          planQty: Number(t.planQty),
          factTotal,
          left: Math.max(0, Number(t.planQty) - factTotal),
          unit: t.unit,
          status: t.status,
          deliveryDate: t.deliveryDate,
          shift: t.shift,
          batchId: t.batchId,
          parentTaskId: t.parentTaskId,
          isRetry: Boolean(t.parentTaskId),
          departmentId: t.departmentId,
          departmentName: t.department?.name || "",
          warehouseId: t.warehouseId,
          documents: t._count.documents,
          createdAt: t.createdAt,
        };
      }),
    });
  })
);

// Документы, созданные по заданию (журнал, ТЗ 6).
r.get(
  "/tasks/:id/documents",
  asyncHandler(async (req, res) => {
    const docs = await db.generatedDocument.findMany({
      where: { taskId: req.params.id },
      orderBy: { createdAt: "asc" },
      take: 500,
    });
    res.json({
      documents: docs.map((d) => ({ ...d, qty: Number(d.qty) })),
    });
  })
);

// История факт-вводов по заданию (неизменяемая, с коррекциями — ТЗ 6, 13.2).
r.get(
  "/tasks/:id/facts",
  asyncHandler(async (req, res) => {
    const facts = await db.productionFact.findMany({
      where: { taskId: req.params.id },
      orderBy: { reportedAt: "asc" },
      take: 500,
    });
    res.json({
      facts: facts.map((f) => ({ ...f, qty: Number(f.qty) })),
      factTotal: effectiveFactTotal(facts),
    });
  })
);

// ── Факт отдела (ТЗ 5.4) ────────────────────────────────────────────────────
const FactSchema = z.object({
  qty: z.number().positive().max(1_000_000),
  note: z.string().max(500).optional(),
  // Подтверждение перед созданием документов (ТЗ 13.2, защита от опечатки).
  dryRun: z.boolean().optional(),
});

r.post(
  "/tasks/:id/fact",
  CAN_FACT,
  asyncHandler(async (req, res) => {
    const parsed = FactSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: "Неверное количество" });
    try {
      const out = await submitFact({
        taskId: req.params.id,
        qty: parsed.data.qty,
        userId: req.user.uid,
        note: parsed.data.note || "",
        dryRun: Boolean(parsed.data.dryRun),
      });
      if (!parsed.data.dryRun) {
        await logProd(
          req,
          "production_fact",
          `Факт по заданию ${req.params.id}: ${parsed.data.qty}, документов ${out.documents.length}`
        );
      }
      res.json(out);
    } catch (e) {
      fail(res, e);
    }
  })
);

// Коррекция ранее введённого факта (ТЗ 13.2): оригинал НЕ переписывается —
// добавляется новая запись со ссылкой на исправляемую.
const CorrectionSchema = FactSchema.extend({
  correctionOf: z.string().min(1),
});

r.post(
  "/tasks/:id/fact/correction",
  requireRole("director", "sysadmin"),
  asyncHandler(async (req, res) => {
    const parsed = CorrectionSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: "Неверные параметры коррекции" });
    const orig = await db.productionFact.findUnique({
      where: { id: parsed.data.correctionOf },
    });
    if (!orig || orig.taskId !== req.params.id)
      return res.status(404).json({ error: "Исходный факт не найден" });
    try {
      const out = await submitFact({
        taskId: req.params.id,
        qty: parsed.data.qty,
        userId: req.user.uid,
        note: parsed.data.note || "",
        correctionOf: parsed.data.correctionOf,
      });
      await logProd(
        req,
        "production_fact_correction",
        `Коррекция факта ${parsed.data.correctionOf}: было ${Number(orig.qty)}, стало ${parsed.data.qty}`
      );
      res.json(out);
    } catch (e) {
      fail(res, e);
    }
  })
);

// ── Отделы и справочник складов по фазам (ТЗ 3.1, вариант Б) ────────────────
r.get(
  "/departments",
  asyncHandler(async (req, res) => {
    const [departments, maps] = await Promise.all([
      db.productionDepartment.findMany({ orderBy: { name: "asc" }, take: 200 }),
      db.phaseWarehouseMap.findMany({ take: 500 }),
    ]);
    res.json({ departments, phaseMaps: maps });
  })
);

const DeptSchema = z.object({
  code: z.string().min(1).max(40),
  name: z.string().min(1).max(200),
  telegramTopic: z.string().max(40).optional(),
});

r.post(
  "/departments",
  requireRole("director", "sysadmin"),
  asyncHandler(async (req, res) => {
    const parsed = DeptSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: "Неверный формат отдела" });
    const created = await db.productionDepartment
      .create({ data: parsed.data })
      .catch(() => null);
    if (!created)
      return res.status(400).json({ error: "Отдел с таким кодом уже есть" });
    await logProd(
      req,
      "production_department_create",
      `Отдел «${created.name}»`
    );
    res.status(201).json(created);
  })
);

const MapSchema = z.object({
  phase: z.string().min(1).max(40),
  category: z.string().max(200).nullable().optional(),
  warehouseId: z.string().min(1).max(100),
  warehouseName: z.string().max(200).optional(),
  departmentId: z.string().min(1),
});

r.put(
  "/phase-map",
  requireRole("director", "sysadmin"),
  asyncHandler(async (req, res) => {
    const parsed = MapSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: "Неверный формат правила" });
    const d = parsed.data;
    // upsert по составному ключу с NULL-категорией Prisma не поддерживает
    // (NULL не сравнивается в уникальном индексе) — ищем и пишем вручную.
    const existing = await db.phaseWarehouseMap.findFirst({
      where: { phase: d.phase, category: d.category || null },
    });
    const data = {
      warehouseId: d.warehouseId,
      warehouseName: d.warehouseName || "",
      departmentId: d.departmentId,
    };
    const saved = existing
      ? await db.phaseWarehouseMap.update({ where: { id: existing.id }, data })
      : await db.phaseWarehouseMap.create({
          data: { phase: d.phase, category: d.category || null, ...data },
        });
    await logProd(
      req,
      "production_phase_map",
      `Склад фазы ${d.phase}${d.category ? ` / ${d.category}` : ""} → ${d.warehouseName || d.warehouseId}`
    );
    res.json(saved);
  })
);

export default r;
