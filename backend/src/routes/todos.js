// Лёгкий менеджер задач (доска/канбан): быстрые задачи с исполнителем, сроком,
// приоритетом и статусом todo/in_progress/done. Отдельно от формального
// процесса «заявок» (routes/tasks.js). Охват: офис (директор/финансы/сисадмин)
// видит все; остальные — назначенные им, созданные ими или по своему филиалу.
// Правка/удаление — автор, исполнитель или офис.
import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { asyncHandler } from "../util/asyncHandler.js";
import { refreshOrgConfig, orgBranches } from "../services/orgConfig.js";

const r = Router();
r.use(requireAuth);

const OFFICE = new Set(["director", "finance", "sysadmin"]);
const STATUSES = ["todo", "in_progress", "done"];
const PRIORITIES = ["low", "normal", "high"];

// Данные для форм: активные пользователи (исполнители) и филиалы.
r.get(
  "/meta",
  asyncHandler(async (req, res) => {
    await refreshOrgConfig().catch(() => {});
    const users = await db.user.findMany({
      where: { active: true, role: { notIn: ["owner", "vendor"] } },
      select: { id: true, displayName: true, name: true },
      orderBy: { displayName: "asc" },
      take: 1000,
    });
    res.json({
      users: users.map((u) => ({
        id: u.id,
        name: u.displayName || u.name || "—",
      })),
      branches: orgBranches().map((b) => ({ id: String(b.id), name: b.name })),
    });
  })
);

// Правило видимости (то же, что фильтр списка).
function scopeWhere(user) {
  if (OFFICE.has(user.role)) return {};
  const or = [{ assigneeId: user.uid }, { createdById: user.uid }];
  if (user.assignedBranch) or.push({ branchId: String(user.assignedBranch) });
  return { OR: or };
}

// Список с фильтрами: status, assignee, branch, priority, q (поиск по
// названию), overdue=1 (просроченные незавершённые).
r.get(
  "/",
  asyncHandler(async (req, res) => {
    const { status, assignee, branch, priority, q, overdue } = req.query;
    const and = [scopeWhere(req.user)];
    if (STATUSES.includes(String(status))) and.push({ status: String(status) });
    if (assignee) and.push({ assigneeId: String(assignee) });
    if (branch) and.push({ branchId: String(branch) });
    if (PRIORITIES.includes(String(priority)))
      and.push({ priority: String(priority) });
    if (q)
      and.push({
        title: { contains: String(q).slice(0, 100), mode: "insensitive" },
      });
    if (overdue === "1")
      and.push({ dueDate: { lt: new Date() }, status: { not: "done" } });
    if (req.query.important === "1") and.push({ important: true });

    const rows = await db.todoTask.findMany({
      where: { AND: and },
      orderBy: [{ createdAt: "desc" }],
      take: 1000,
    });

    // Имена исполнителей одним запросом (для отображения на карточках).
    const ids = [...new Set(rows.map((t) => t.assigneeId).filter(Boolean))];
    const users = ids.length
      ? await db.user.findMany({
          where: { id: { in: ids } },
          select: { id: true, displayName: true, name: true },
        })
      : [];
    const nameById = new Map(
      users.map((u) => [u.id, u.displayName || u.name || "—"])
    );
    res.json(
      rows.map((t) => ({
        ...t,
        assigneeName: t.assigneeId ? nameById.get(t.assigneeId) || "—" : null,
      }))
    );
  })
);

const CreateSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(4000).default(""),
  priority: z.enum(PRIORITIES).default("normal"),
  important: z.boolean().default(false),
  assigneeId: z.string().max(40).nullish(),
  branchId: z.string().max(40).nullish(),
  dueDate: z.coerce.date().nullish(),
});

r.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = CreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Неверный формат задачи" });
    }
    const d = parsed.data;
    const created = await db.todoTask.create({
      data: {
        title: d.title.trim(),
        description: d.description || "",
        priority: d.priority,
        important: d.important,
        assigneeId: d.assigneeId || null,
        branchId: d.branchId || null,
        dueDate: d.dueDate || null,
        createdById: req.user.uid,
      },
    });
    res.status(201).json(created);
  })
);

const UpdateSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  description: z.string().max(4000).optional(),
  status: z.enum(STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  important: z.boolean().optional(),
  assigneeId: z.string().max(40).nullish(),
  branchId: z.string().max(40).nullish(),
  dueDate: z.coerce.date().nullish(),
});

function canEdit(task, user) {
  return (
    OFFICE.has(user.role) ||
    task.createdById === user.uid ||
    task.assigneeId === user.uid
  );
}

r.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const parsed = UpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Неверный формат правки" });
    }
    const task = await db.todoTask.findUnique({ where: { id: req.params.id } });
    if (!task) return res.status(404).json({ error: "Задача не найдена" });
    if (!canEdit(task, req.user)) {
      return res.status(403).json({ error: "Нет доступа к этой задаче" });
    }
    const d = parsed.data;
    const data = {};
    if (d.title !== undefined) data.title = d.title.trim();
    if (d.description !== undefined) data.description = d.description;
    if (d.priority !== undefined) data.priority = d.priority;
    if (d.important !== undefined) data.important = d.important;
    // nullish: явный null очищает поле, undefined — не трогаем.
    if (d.assigneeId !== undefined) data.assigneeId = d.assigneeId || null;
    if (d.branchId !== undefined) data.branchId = d.branchId || null;
    if (d.dueDate !== undefined) data.dueDate = d.dueDate || null;
    if (d.status !== undefined) {
      data.status = d.status;
      data.doneAt = d.status === "done" ? new Date() : null;
    }
    const updated = await db.todoTask.update({
      where: { id: task.id },
      data,
    });
    res.json(updated);
  })
);

r.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const task = await db.todoTask.findUnique({ where: { id: req.params.id } });
    if (!task) return res.status(404).json({ error: "Задача не найдена" });
    if (!OFFICE.has(req.user.role) && task.createdById !== req.user.uid) {
      return res.status(403).json({ error: "Удалять может автор или офис" });
    }
    await db.todoTask.delete({ where: { id: task.id } });
    res.json({ ok: true });
  })
);

export default r;
