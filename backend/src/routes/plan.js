// Планы и цели (план-факт): месячный план выручки/расходов по филиалам против
// факта. Факт выручки — сверённая с iiko выручка касс (CashReport.iiko) за
// месяц; факт расходов — согласованные расходы «Учёта денег». Разбивка по дням
// даёт темп (опережение/отставание к сегодня). Чтение — управленческие роли
// (управляющий видит свой филиал); правку плана — директор/сисадмин.
import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { asyncHandler } from "../util/asyncHandler.js";
import { forcedBranch, FINANCE_FREE } from "../util/branchScope.js";
import {
  refreshOrgConfig,
  orgBranches,
  orgBranchName,
} from "../services/orgConfig.js";
import { monthMeta, computePlanFact } from "../services/planFact.js";

const r = Router();
r.use(requireAuth);
r.use(requireRole("director", "finance", "accountant", "sysadmin", "manager"));

const num = (v) => Number(v || 0);
const isMonth = (s) => /^\d{4}-\d{2}$/.test(String(s || ""));
const ymdTashkent = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tashkent" });

r.get(
  "/",
  asyncHandler(async (req, res) => {
    await refreshOrgConfig().catch(() => {});
    const month = isMonth(req.query.month)
      ? String(req.query.month)
      : ymdTashkent().slice(0, 7);
    const forced = forcedBranch(req.user, {
      alsoFree: FINANCE_FREE,
      failClosed: true,
    });

    let branches = orgBranches();
    if (forced) branches = branches.filter((b) => String(b.id) === forced);

    const datePrefix = `${month}-`; // операционные даты месяца: "YYYY-MM-…"

    // План по филиалам за месяц.
    const planWhere = { month };
    if (forced) planWhere.branchId = forced;
    // Факт выручки: суммируем сверённую выручку iiko по кассам за месяц.
    const cashWhere = { date: { startsWith: datePrefix } };
    if (forced) cashWhere.branchId = forced;
    // Факт расходов: согласованные расходы за месяц.
    const expWhere = {
      direction: "expense",
      approval: "approved",
      date: { startsWith: datePrefix },
    };
    if (forced) expWhere.branchId = forced;

    const [plans, cashRows, expRows] = await Promise.all([
      db.planEntry.findMany({ where: planWhere }).catch(() => []),
      db.cashReport
        .findMany({
          where: cashWhere,
          select: { branchId: true, iiko: true },
        })
        .catch(() => []),
      db.moneyTx
        .groupBy({
          by: ["branchId"],
          where: expWhere,
          _sum: { amountUzs: true },
        })
        .catch(() => []),
    ]);

    const planByBranch = new Map(plans.map((p) => [String(p.branchId), p]));
    const revByBranch = new Map();
    for (const c of cashRows) {
      const k = String(c.branchId);
      revByBranch.set(k, (revByBranch.get(k) || 0) + num(c.iiko));
    }
    const expByBranch = new Map(
      expRows.map((e) => [String(e.branchId), num(e._sum?.amountUzs)])
    );

    const today = ymdTashkent();
    const { daysInMonth, daysElapsed } = monthMeta(month, today);

    const rows = branches.map((b) => {
      const key = String(b.id);
      const plan = planByBranch.get(key);
      const calc = computePlanFact({
        planRevenue: plan ? num(plan.revenue) : 0,
        planExpense: plan ? num(plan.expense) : 0,
        factRevenue: revByBranch.get(key) || 0,
        factExpense: expByBranch.get(key) || 0,
        daysInMonth,
        daysElapsed,
      });
      return { branchId: key, branch: orgBranchName(b.id), ...calc };
    });

    const sum = (f) => rows.reduce((s, x) => s + x[f], 0);
    const totalPlanRev = sum("planRevenue");
    const totalFactRev = sum("factRevenue");
    const totalPlanExp = sum("planExpense");
    const totalFactExp = sum("factExpense");
    const pct = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);

    res.json({
      month,
      scope: forced ? "branch" : "all",
      daysInMonth,
      daysElapsed,
      rows,
      totals: {
        planRevenue: totalPlanRev,
        factRevenue: totalFactRev,
        revenuePct: pct(totalFactRev, totalPlanRev),
        planExpense: totalPlanExp,
        factExpense: totalFactExp,
        expensePct: pct(totalFactExp, totalPlanExp),
        expectedRevenue: sum("expectedRevenue"),
      },
    });
  })
);

const EntrySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  branchId: z.string().min(1).max(40),
  revenue: z.number().min(0).max(9e14).default(0),
  expense: z.number().min(0).max(9e14).default(0),
});

r.put(
  "/entry",
  requireRole("director", "sysadmin"),
  asyncHandler(async (req, res) => {
    const parsed = EntrySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Неверный формат плана" });
    }
    const d = parsed.data;
    const saved = await db.planEntry.upsert({
      where: { month_branchId: { month: d.month, branchId: d.branchId } },
      create: {
        month: d.month,
        branchId: d.branchId,
        revenue: BigInt(Math.round(d.revenue)),
        expense: BigInt(Math.round(d.expense)),
      },
      update: {
        revenue: BigInt(Math.round(d.revenue)),
        expense: BigInt(Math.round(d.expense)),
      },
    });
    await db.auditLog
      .create({
        data: {
          userId: req.user.uid,
          event: "plan_update",
          detail: `План ${d.month}, филиал ${d.branchId}: выручка ${d.revenue}, расходы ${d.expense}`,
          ip: req.ip,
        },
      })
      .catch(() => {});
    res.json({
      branchId: saved.branchId,
      month: saved.month,
      revenue: num(saved.revenue),
      expense: num(saved.expense),
    });
  })
);

export default r;
