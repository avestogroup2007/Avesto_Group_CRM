// API задач: создание, список с проверкой прав (RBAC), перевод по 5 фазам с
// записью в неизменяемый журнал, детали и комментарии. Все правила фаз/ролей
// проверяются на сервере — фронт не может их обойти.
import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { asyncHandler } from "../util/asyncHandler.js";

const r = Router();
r.use(requireAuth);

// ── Список задач — сервер сам фильтрует по правам роли ──────────────────────
r.get(
  "/",
  asyncHandler(async (req, res) => {
    const { uid, role, branchId } = req.user;
    let where = {};

    // Директор/финансы/сисадмин видят всё. Остальные — по участию/филиалу.
    if (!["director", "finance", "sysadmin"].includes(role)) {
      const or = [
        { executorId: uid },
        { controllerId: uid },
        { createdById: uid },
      ];
      if (branchId) or.push({ branchId });
      where = { OR: or };
    }

    // Лимит выдачи: по умолчанию 500 свежих, ?limit=… до 2000 — защита
    // сервера и браузера от выдачи всей истории разом.
    const limit = Math.min(
      Math.max(parseInt(req.query.limit, 10) || 500, 1),
      2000
    );
    const tasks = await db.task.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    res.json(tasks);
  })
);

// ── Создание задачи ─────────────────────────────────────────────────────────
const CreateSchema = z.object({
  title: z.string().min(1),
  description: z.string().default(""),
  branchId: z.string().min(1),
  departmentId: z.string().default(""),
  executorId: z.string().min(1),
  controllerId: z.string().min(1),
  category: z.string().default(""),
  priority: z.string().default("Обычный"),
  amount: z.number().int().nullable().optional(),
  overBudget: z.boolean().optional(),
  slaDeadline: z.coerce.date(),
  extra: z.any().optional(),
});

r.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = CreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Неверный формат задачи" });
    }
    const d = parsed.data;
    const task = await db.$transaction(async (tx) => {
      const created = await tx.task.create({
        data: {
          title: d.title,
          description: d.description,
          branchId: d.branchId,
          departmentId: d.departmentId,
          executorId: d.executorId,
          controllerId: d.controllerId,
          category: d.category,
          priority: d.priority,
          amount: d.amount ?? null,
          overBudget: d.overBudget ?? false,
          slaDeadline: d.slaDeadline,
          extra: d.extra ?? undefined,
          createdById: req.user.uid,
          phase: 1,
        },
      });
      await tx.taskHistory.create({
        data: {
          taskId: created.id,
          userId: req.user.uid,
          action: "created",
          toPhase: 1,
        },
      });
      return created;
    });
    res.status(201).json(task);
  })
);

// ── Детали задачи (с журналом и комментариями) ──────────────────────────────
r.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const task = await db.task.findUnique({
      where: { id: req.params.id },
      include: {
        history: { orderBy: { at: "asc" } },
        comments: { orderBy: { at: "asc" } },
      },
    });
    if (!task) return res.status(404).json({ error: "Задача не найдена" });
    res.json(task);
  })
);

// ── Перевод по фазам — сервер проверяет право по роли и текущей фазе ─────────
const AdvanceSchema = z.object({
  action: z.enum(["start", "review", "done", "return"]),
  toPhase: z.number().int().min(1).max(5),
  note: z.string().optional(),
});

r.post(
  "/:id/advance",
  asyncHandler(async (req, res) => {
    const parsed = AdvanceSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Неверный формат действия" });
    }
    const { action, toPhase, note } = parsed.data;
    const { uid } = req.user;

    const task = await db.task.findUnique({ where: { id: req.params.id } });
    if (!task) return res.status(404).json({ error: "Задача не найдена" });

    const isExec = task.executorId === uid;
    const isCtrl = task.controllerId === uid;
    // «Взять в работу»/«на проверку» — только исполнитель; «принять/вернуть» — контролёр.
    const allowed =
      (action === "start" && isExec && [1, 2].includes(task.phase)) ||
      (action === "review" && isExec && task.phase === 3) ||
      (action === "done" && isCtrl && task.phase === 4) ||
      (action === "return" && isCtrl && task.phase === 4);
    if (!allowed) {
      return res
        .status(403)
        .json({ error: "Действие недоступно для вашей роли/фазы" });
    }

    const [updated] = await db.$transaction([
      db.task.update({ where: { id: task.id }, data: { phase: toPhase } }),
      db.taskHistory.create({
        data: {
          taskId: task.id,
          userId: uid,
          action,
          fromPhase: task.phase,
          toPhase,
          note: note ?? null,
        },
      }),
    ]);
    res.json(updated);
  })
);

// ── Комментарий к задаче (пишется и в журнал) ───────────────────────────────
const CommentSchema = z.object({ text: z.string().min(1) });

r.post(
  "/:id/comment",
  asyncHandler(async (req, res) => {
    const parsed = CommentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Пустой комментарий" });
    }
    const task = await db.task.findUnique({ where: { id: req.params.id } });
    if (!task) return res.status(404).json({ error: "Задача не найдена" });

    const [comment] = await db.$transaction([
      db.comment.create({
        data: { taskId: task.id, userId: req.user.uid, text: parsed.data.text },
      }),
      db.taskHistory.create({
        data: { taskId: task.id, userId: req.user.uid, action: "comment" },
      }),
    ]);
    res.status(201).json(comment);
  })
);

export default r;
