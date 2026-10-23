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
import { log } from "../logger.js";
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
    const forced = forcedBranch(req.user, {
      alsoFree: FINANCE_FREE,
      failClosed: true,
    });

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

    // Ошибку чтения касс НЕ превращаем в пустой список: иначе сбой базы
    // выглядит как «ни один филиал не сдал кассу» — и руководитель идёт
    // ругать кассиров, хотя сломан сервер. Запоминаем причину и говорим о ней.
    let cashError = "";
    const [cashRows, chkRows, pendCount, pendAgg, todoActive, todoOverdue] =
      await Promise.all([
        db.cashReport.findMany({ where: cashWhere }).catch((e) => {
          cashError = e.message || "ошибка базы данных";
          log.error({ err: cashError, date }, "dashboard: кассы не прочитаны");
          return [];
        }),
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
      const chk = chkByBranch.get(key);
      const checklistPct = chk ? Math.round(chk.sum / chk.n) : null;

      // Точка без розничной кассы (цех, кейтеринг): сдавать ей нечего, и экран
      // «Касса» её даже не предлагает. Требовать с неё кассу — значит держать
      // вечный алерт, который невозможно закрыть. Строку оставляем ради
      // чек-листов, но кассовых цифр у неё нет.
      if (b.cash === false) {
        return {
          branchId: key,
          branch: orgBranchName(b.id),
          cashStatus: "na",
          declared: null,
          iiko: null,
          discrepancy: null,
          checklistPct,
        };
      }

      const c = cashByBranch.get(key);
      // Касса не сдана — цифр нет, а не «ноль»: «0» в колонке iiko читается
      // как «в iiko ноль продаж», хотя в iiko просто никто не заглядывал.
      const declared = c ? PAY_FIELDS.reduce((s, f) => s + num(c[f]), 0) : null;
      const iiko = c ? num(c.iiko) : null;
      const discrepancy = c ? declared - iiko : null; // <0 недостача, >0 излишек
      const status = c ? c.status : "none";

      // При сбое чтения касс не знаем, сдана касса или нет, — не утверждаем.
      if (!c && !cashError) {
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

    if (cashError) {
      alerts.unshift({
        kind: "cash_unavailable",
        text: "Не удалось прочитать кассы за день — данные ниже неполные. Проверьте сервер",
        severity: "bad",
      });
    }

    // Итоги — только по точкам с кассой: цех и кейтеринг кассу не сдают, и
    // «сдали 4 из 6» при двух точках без кассы выглядело бы как недосдача.
    const cashRowsOnly = rows.filter((x) => x.cashStatus !== "na");
    const totals = {
      declared: cashRowsOnly.reduce((s, x) => s + num(x.declared), 0),
      iiko: cashRowsOnly.reduce((s, x) => s + num(x.iiko), 0),
      discrepancy: cashRowsOnly.reduce((s, x) => s + num(x.discrepancy), 0),
      branchesReported: cashRowsOnly.filter((x) => x.cashStatus !== "none")
        .length,
      branchesTotal: cashRowsOnly.length,
    };

    res.json({
      date,
      scope: forced ? "branch" : "all",
      rows,
      totals,
      // Только флаг: сам текст ошибки Prisma может содержать адрес сервера
      // базы — он уходит в лог сервера, а не в браузер.
      cashUnavailable: Boolean(cashError),
      pendingExpenses: { count: pendCount, sumUzs: pendingSum },
      todos: { active: todoActive, overdue: todoOverdue },
      alerts,
    });
  })
);

export default r;
