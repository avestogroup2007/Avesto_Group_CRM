// KPI сотрудников по чек-листам: дисциплина линейного персонала (сдачи, средний
// % выполнения, активные дни, последняя активность) за период. Данные реальные
// и серверные (ShiftChecklistRun.userId). Доступ — управленческие роли;
// управляющий видит свой филиал (бухгалтер/офис — все).
import { Router } from "express";
import { db } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { asyncHandler } from "../util/asyncHandler.js";
import { forcedBranch, FINANCE_FREE } from "../util/branchScope.js";

const r = Router();
r.use(requireAuth);
r.use(requireRole("director", "finance", "accountant", "sysadmin", "manager"));

const num = (v) => Number(v || 0);
const ymdShift = (daysBack) =>
  new Date(Date.now() - daysBack * 86400000).toLocaleDateString("en-CA", {
    timeZone: "Asia/Tashkent",
  });
const isYmd = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));

r.get(
  "/kpi",
  asyncHandler(async (req, res) => {
    const to = isYmd(req.query.to) ? String(req.query.to) : ymdShift(0);
    const from = isYmd(req.query.from) ? String(req.query.from) : ymdShift(29);
    const forced = forcedBranch(req.user, {
      alsoFree: FINANCE_FREE,
      failClosed: true,
    });

    const where = { date: { gte: from, lte: to }, userId: { not: null } };
    if (forced) where.branchId = forced;
    const runs = await db.shiftChecklistRun
      .findMany({
        where,
        select: { userId: true, pct: true, date: true },
        take: 20000,
      })
      .catch(() => []);

    // Агрегация по сотруднику.
    const byUser = new Map();
    for (const run of runs) {
      const k = run.userId;
      const cur = byUser.get(k) || {
        runs: 0,
        pctSum: 0,
        days: new Set(),
        last: "",
      };
      cur.runs += 1;
      cur.pctSum += num(run.pct);
      cur.days.add(run.date);
      if (run.date > cur.last) cur.last = run.date;
      byUser.set(k, cur);
    }

    // Имена/должности сотрудников одним запросом.
    const ids = [...byUser.keys()];
    const users = ids.length
      ? await db.user
          .findMany({
            where: { id: { in: ids } },
            select: { id: true, displayName: true, name: true, position: true },
          })
          .catch(() => [])
      : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    const rows = ids
      .map((id) => {
        const a = byUser.get(id);
        const u = userMap.get(id);
        return {
          userId: id,
          name: u ? u.displayName || u.name || "—" : "—",
          position: u ? u.position || "" : "",
          runs: a.runs,
          avgPct: a.runs ? Math.round(a.pctSum / a.runs) : 0,
          activeDays: a.days.size,
          lastActive: a.last,
        };
      })
      // Сортируем по средней результативности, затем по числу сдач.
      .sort((x, y) => y.avgPct - x.avgPct || y.runs - x.runs);

    const totals = {
      employees: rows.length,
      runs: rows.reduce((s, x) => s + x.runs, 0),
      avgPct: rows.length
        ? Math.round(rows.reduce((s, x) => s + x.avgPct, 0) / rows.length)
        : 0,
    };

    res.json({ from, to, scope: forced ? "branch" : "all", rows, totals });
  })
);

export default r;
