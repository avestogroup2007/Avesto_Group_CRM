// Дашборд руководителя: один экран «как идут дела сегодня». Собирает уже
// имеющиеся данные (касса, расхождения с iiko, расходы на согласовании,
// чек-листы) в снимок по филиалам + алерты. Ничего не считает заново в iiko —
// использует цифры, которые кассир уже внёс. Доступ — управленческие роли;
// управляющий видит только свой филиал (бухгалтер/офис — все).
import { Router } from "express";
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

const r = Router();
r.use(requireAuth);
r.use(requireRole("director", "finance", "accountant", "sysadmin", "manager"));

const num = (v) => Number(v || 0);
const ymdTashkent = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tashkent" });

// Виды оплат кассы, из которых складывается заявленная выручка дня.
const PAY_FIELDS = [
  "fiscal",
  "nonFiscal",
  "humo",
  "uzcard",
  "click",
  "payme",
  "uzumTezkor",
  "yandex",
  "transfer",
];

r.get(
  "/",
  asyncHandler(async (req, res) => {
    await refreshOrgConfig().catch(() => {});
    const date = req.query.date ? String(req.query.date) : ymdTashkent();
    const forced = forcedBranch(req.user, { alsoFree: FINANCE_FREE });

    // Филиалы в области видимости: управляющий — только свой.
    let branches = orgBranches();
    if (forced) branches = branches.filter((b) => String(b.id) === forced);

    // Условия выборок (касса/чек-листы/согласование/задачи). Все запросы не
    // зависят друг от друга — выполняем одним Promise.all (меньше round-trip
    // на самом нагруженном управленческом экране).
    const cashWhere = { date };
    if (forced) cashWhere.branchId = forced;
    const chkWhere = { date };
    if (forced) chkWhere.branchId = forced;
    const pendWhere = { approval: "pending", direction: "expense" };
    if (forced) pendWhere.branchId = forced;

    // Задачи команды: охват как в /api/todos (офис — все; остальные —
    // назначенные/созданные/по филиалу).
    const TODO_OFFICE = new Set(["director", "finance", "sysadmin"]);
    let todoScope = {};
    if (!TODO_OFFICE.has(req.user.role)) {
      const or = [{ assigneeId: req.user.uid }, { createdById: req.user.uid }];
      if (req.user.assignedBranch)
        or.push({ branchId: String(req.user.assignedBranch) });
      todoScope = { OR: or };
    }
    const startOfToday = new Date(`${date}T00:00:00+05:00`); // Asia/Tashkent

    const [cashRows, chkRows, pendCount, pendAgg, todoActive, todoOverdue] =
      await Promise.all([
        db.cashReport.findMany({ where: cashWhere }).catch(() => []),
        db.shiftChecklistRun
          .findMany({ where: chkWhere, select: { branchId: true, pct: true } })
          .catch(() => []),
        db.moneyTx.count({ where: pendWhere }).catch(() => 0),
        db.moneyTx
          .aggregate({ where: pendWhere, _sum: { amountUzs: true } })
          .catch(() => ({ _sum: { amountUzs: 0 } })),
        db.todoTask
          .count({ where: { AND: [todoScope, { status: { not: "done" } }] } })
          .catch(() => 0),
        db.todoTask
          .count({
            where: {
              AND: [
                todoScope,
                { status: { not: "done" }, dueDate: { lt: startOfToday } },
              ],
            },
          })
          .catch(() => 0),
      ]);

    const cashByBranch = new Map(cashRows.map((c) => [String(c.branchId), c]));
    const chkByBranch = new Map();
    for (const run of chkRows) {
      const k = String(run.branchId);
      const cur = chkByBranch.get(k) || { sum: 0, n: 0 };
      cur.sum += num(run.pct);
      cur.n += 1;
      chkByBranch.set(k, cur);
    }

    // Собираем строки по филиалам + считаем расхождения.
    const alerts = [];
    const rows = branches.map((b) => {
      const key = String(b.id);
      const c = cashByBranch.get(key);
      const declared = c ? PAY_FIELDS.reduce((s, f) => s + num(c[f]), 0) : 0;
      const iiko = c ? num(c.iiko) : 0;
      const discrepancy = declared - iiko; // <0 недостача, >0 излишек
      const chk = chkByBranch.get(key);
      const checklistPct = chk ? Math.round(chk.sum / chk.n) : null;
      const status = c ? c.status : "none";

      if (!c) {
        alerts.push({
          kind: "cash_missing",
          branchId: key,
          branch: orgBranchName(b.id),
          text: `Касса не сдана: ${orgBranchName(b.id)}`,
          severity: "warn",
        });
      } else if (iiko > 0 && Math.abs(discrepancy) > 0) {
        alerts.push({
          kind: discrepancy < 0 ? "shortage" : "surplus",
          branchId: key,
          branch: orgBranchName(b.id),
          text:
            `${discrepancy < 0 ? "Недостача" : "Излишек"} по кассе ` +
            `${orgBranchName(b.id)}: ${Math.abs(discrepancy).toLocaleString("ru-RU")} сум`,
          severity: discrepancy < 0 ? "bad" : "warn",
          amount: discrepancy,
        });
      }

      return {
        branchId: key,
        branch: orgBranchName(b.id),
        cashStatus: status, // none|submitted|confirmed
        declared,
        iiko,
        discrepancy,
        checklistPct,
      };
    });

    const pendingSum = num(pendAgg?._sum?.amountUzs);
    if (pendCount > 0) {
      alerts.push({
        kind: "expenses_pending",
        text: `Расходов на согласовании: ${pendCount} на ${pendingSum.toLocaleString("ru-RU")} сум`,
        severity: "warn",
      });
    }
    if (todoOverdue > 0) {
      alerts.push({
        kind: "todos_overdue",
        text: `Просроченных задач: ${todoOverdue}`,
        severity: "warn",
      });
    }

    const totals = {
      declared: rows.reduce((s, x) => s + x.declared, 0),
      iiko: rows.reduce((s, x) => s + x.iiko, 0),
      discrepancy: rows.reduce((s, x) => s + x.discrepancy, 0),
      branchesReported: rows.filter((x) => x.cashStatus !== "none").length,
      branchesTotal: rows.length,
    };

    res.json({
      date,
      scope: forced ? "branch" : "all",
      rows,
      totals,
      pendingExpenses: { count: pendCount, sumUzs: pendingSum },
      todos: { active: todoActive, overdue: todoOverdue },
      alerts,
    });
  })
);

export default r;
