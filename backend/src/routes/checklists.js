// Чек-листы, сдаваемые через веб-приложение. Пишутся в ту же таблицу, что и
// чек-листы Telegram-бота (ShiftChecklistRun, via="app") — сводки в боте видят
// сдачи из обоих каналов. Два вида:
//   • легаси-обходы смены (sanitary|open|close) — состав пунктов «прибит» в коде;
//   • по шаблонам из админки (role|cleaning) — состав задаёт клиент, включение
//     модуля контролирует владелец в Back Office. Отчёт для руководства.
import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { asyncHandler } from "../util/asyncHandler.js";
import {
  refreshOrgConfig,
  orgBranchById,
  orgBranchName,
} from "../services/orgConfig.js";
import { refreshModules, moduleEnabled } from "../services/modules.js";
import { forcedBranch } from "../util/branchScope.js";

// Понятные названия легаси-обходов для отчёта (шаблонные берут title из БД).
const LEGACY_LABELS = {
  sanitary: "Санитарный обход",
  open: "Открытие смены",
  close: "Закрытие смены",
};

const r = Router();
r.use(requireAuth);

// Какой модуль включает сдачу шаблонного чек-листа данного вида.
const MODULE_FOR = {
  role: "employeeChecklists",
  cleaning: "cleaningChecklists",
};

const RunSchema = z.object({
  branchId: z.string().min(1).max(20),
  kind: z.enum(["sanitary", "open", "close", "role", "cleaning"]),
  // Для шаблонных чек-листов — id шаблона (сервер берёт заголовок/должность из
  // БД, клиенту не доверяем). Для легаси-обходов не передаётся.
  templateId: z.string().max(40).nullable().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  slot: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable()
    .optional(),
  // Фото в записи не храним (веб держит их у себя) — только отметку о наличии.
  items: z
    .array(
      z.object({
        text: z.string().min(1).max(200),
        done: z.boolean(),
        needPhoto: z.boolean().default(false),
        hasPhoto: z.boolean().default(false),
      })
    )
    .min(1)
    .max(40),
});

// Сдача чек-листа из веб-приложения. Каждая сдача — новая запись (как у бота):
// история пересдач сохраняется, сводки берут последнюю по времени.
r.post(
  "/run",
  asyncHandler(async (req, res) => {
    const parsed = RunSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Неверный формат чек-листа" });
    }
    const d = parsed.data;
    // Привязанный к филиалу сотрудник сдаёт только по своему филиалу: клиенту не
    // доверяем — принудительно подставляем его филиал (нельзя накрутить чужой).
    const forced = forcedBranch(req.user);
    if (forced) d.branchId = forced;
    // Филиал должен существовать в конфигурации организации — иначе можно
    // накрутить сдачу чек-листов по несуществующей/чужой точке.
    await refreshOrgConfig().catch(() => {});
    if (!orgBranchById(d.branchId)) {
      return res.status(400).json({ error: "Неизвестный филиал" });
    }

    // Для шаблонных видов проверяем шаблон и модуль на сервере: заголовок и
    // должность берём из БД, чтобы отчёт не зависел от того, что прислал клиент.
    let title = null;
    let position = null;
    let templateId = null;
    if (d.kind === "role" || d.kind === "cleaning") {
      await refreshModules().catch(() => {});
      if (!moduleEnabled(MODULE_FOR[d.kind])) {
        return res
          .status(403)
          .json({ error: "Модуль чек-листов выключен владельцем системы" });
      }
      if (!d.templateId) {
        return res.status(400).json({ error: "Не указан шаблон чек-листа" });
      }
      const tpl = await db.checklistTemplate
        .findUnique({ where: { id: d.templateId } })
        .catch(() => null);
      if (!tpl || !tpl.active || tpl.kind !== d.kind) {
        return res.status(400).json({ error: "Шаблон не найден или отключён" });
      }
      title = tpl.title;
      position = tpl.position || null;
      templateId = tpl.id;
    }

    const done = d.items.filter((it) => it.done).length;
    const pct = Math.round((done / d.items.length) * 100);
    const run = await db.shiftChecklistRun.create({
      data: {
        branchId: d.branchId,
        kind: d.kind,
        date: d.date,
        slot: d.slot || null,
        items: d.items,
        pct,
        userId: req.user.uid,
        via: "app",
        templateId,
        title,
        position,
      },
    });
    res.status(201).json({ id: run.id, pct: run.pct });
  })
);

// Отчёт по чек-листам за период (для руководства). Показывает сдачи по дням,
// филиалам и шаблонам с процентом выполнения. Доступ — управленческие роли.
const ReportSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  branchId: z.string().min(1).max(20).optional(),
});

r.get(
  "/report",
  requireRole("director", "manager", "finance", "sysadmin"),
  asyncHandler(async (req, res) => {
    const parsed = ReportSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: "Неверный период" });
    }
    const { from, to } = parsed.data;
    if (from > to) {
      return res.status(400).json({ error: "Начало периода позже конца" });
    }
    await refreshOrgConfig().catch(() => {});
    // Привязанный к филиалу управляющий видит отчёт только по своему филиалу;
    // старшие роли — по выбранному (или всем, если не задан).
    // Чтение отчёта: филиальная роль без назначенного филиала не видит ничего.
    const forced = forcedBranch(req.user, { failClosed: true });
    const branchId = forced || parsed.data.branchId;
    const where = { date: { gte: from, lte: to } };
    if (branchId) where.branchId = branchId;
    const runs = await db.shiftChecklistRun.findMany({
      where,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 3000,
      select: {
        id: true,
        branchId: true,
        kind: true,
        date: true,
        slot: true,
        pct: true,
        title: true,
        position: true,
        templateId: true,
        via: true,
        createdAt: true,
      },
    });

    // Помощник группировки: копит count и сумму процентов по ключу.
    const group = (keyFn, labelFn) => {
      const map = new Map();
      for (const run of runs) {
        const key = keyFn(run);
        const cur = map.get(key) || {
          key,
          label: labelFn(run),
          count: 0,
          sum: 0,
        };
        cur.count += 1;
        cur.sum += run.pct;
        map.set(key, cur);
      }
      return [...map.values()]
        .map((g) => ({
          key: g.key,
          label: g.label,
          count: g.count,
          avgPct: Math.round(g.sum / g.count),
        }))
        .sort((a, b) => b.count - a.count);
    };

    let pctSum = 0;
    const byKind = {};
    for (const run of runs) {
      byKind[run.kind] = (byKind[run.kind] || 0) + 1;
      pctSum += run.pct;
    }
    // Разбивка по филиалам и по шаблонам/видам (для детализации в отчёте).
    const byBranch = group(
      (run) => run.branchId || "—",
      (run) => (run.branchId ? orgBranchName(run.branchId) : "Без филиала")
    );
    const byTemplate = group(
      (run) => run.templateId || run.kind,
      (run) => run.title || LEGACY_LABELS[run.kind] || run.kind
    );
    const summary = {
      total: runs.length,
      avgPct: runs.length ? Math.round(pctSum / runs.length) : 0,
      byKind,
      byBranch,
      byTemplate,
    };
    res.json({ runs, summary, from, to });
  })
);

export default r;
