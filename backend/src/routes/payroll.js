// Зарплатная ведомость (ФОТ): ставки по сотрудникам (оклад/почасовой) +
// помесячные часы/бонусы/штрафы = итог к выплате. Ставки задаются в системе
// (в iiko-API их нет). Часы для почасовых пока вводятся вручную; авто-подстановка
// из iiko-посещаемости — следующий шаг (нужна проверка на боевом деплое).
// Чтение — офисным ролям; запись ставок и ведомости — директору/сисадмину.
import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { asyncHandler } from "../util/asyncHandler.js";
import {
  PayrollSchema,
  refreshPayrollConfig,
  savePayrollConfig,
} from "../services/payrollConfig.js";

const r = Router();
r.use(requireAuth);
r.use(requireRole("director", "finance", "accountant", "sysadmin"));

const num = (v) => (v == null ? 0 : Number(v));
const isMonth = (s) => /^\d{4}-\d{2}$/.test(String(s || ""));

// Ведомость за месяц: сотрудники (активные) со ставкой, часами/бонусом/штрафом
// и посчитанным итогом.
r.get(
  "/",
  asyncHandler(async (req, res) => {
    const month = isMonth(req.query.month)
      ? String(req.query.month)
      : new Date().toISOString().slice(0, 7);
    const cfg = await refreshPayrollConfig(true);
    const rates = cfg.rates || {};

    const [users, entries] = await Promise.all([
      db.user.findMany({
        where: { active: true, role: { notIn: ["owner", "vendor"] } },
        select: { id: true, displayName: true, name: true, position: true },
        orderBy: { displayName: "asc" },
      }),
      db.payrollEntry.findMany({ where: { month } }),
    ]);
    const entryMap = new Map(entries.map((e) => [e.userId, e]));

    let totalPay = 0;
    const rows = users.map((u) => {
      const rate = rates[u.id] || { mode: "salary", amount: 0 };
      const e = entryMap.get(u.id);
      const hours = e ? num(e.hours) : 0;
      const bonus = e ? num(e.bonus) : 0;
      const penalty = e ? num(e.penalty) : 0;
      const base =
        rate.mode === "hourly"
          ? Math.round(num(rate.amount) * hours)
          : num(rate.amount);
      const total = base + bonus - penalty;
      totalPay += total;
      return {
        userId: u.id,
        name: u.displayName || u.name || "—",
        position: u.position || "",
        mode: rate.mode,
        rate: num(rate.amount),
        hours,
        bonus,
        penalty,
        base,
        total,
        note: e ? e.note : "",
      };
    });

    res.json({ month, rows, totalPay });
  })
);

// Сохранить ставки (карта userId -> {mode, amount}).
r.put(
  "/rates",
  requireRole("director", "sysadmin"),
  asyncHandler(async (req, res) => {
    const parsed = PayrollSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Неверный формат ставок" });
    }
    const saved = await savePayrollConfig(parsed.data, req.user.uid);
    await db.auditLog
      .create({
        data: {
          userId: req.user.uid,
          event: "payroll_rates_update",
          detail: `Ставки ФОТ обновлены (${Object.keys(saved.rates).length} сотр.)`,
          ip: req.ip,
        },
      })
      .catch(() => {});
    res.json(saved);
  })
);

// Помесячные данные ведомости по сотруднику (часы/бонус/штраф).
const EntrySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  userId: z.string().min(1).max(40),
  hours: z.number().min(0).max(1000).default(0),
  bonus: z.number().min(0).max(9e12).default(0),
  penalty: z.number().min(0).max(9e12).default(0),
  note: z.string().max(500).default(""),
});

r.put(
  "/entry",
  requireRole("director", "sysadmin"),
  asyncHandler(async (req, res) => {
    const parsed = EntrySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Неверный формат записи" });
    }
    const d = parsed.data;
    const saved = await db.payrollEntry.upsert({
      where: { month_userId: { month: d.month, userId: d.userId } },
      create: {
        month: d.month,
        userId: d.userId,
        hours: d.hours,
        bonus: BigInt(Math.round(d.bonus)),
        penalty: BigInt(Math.round(d.penalty)),
        note: d.note,
      },
      update: {
        hours: d.hours,
        bonus: BigInt(Math.round(d.bonus)),
        penalty: BigInt(Math.round(d.penalty)),
        note: d.note,
      },
    });
    await db.auditLog
      .create({
        data: {
          userId: req.user.uid,
          event: "payroll_entry_update",
          detail: `Ведомость ${d.month}, сотрудник ${d.userId}: часы ${d.hours}, бонус ${d.bonus}, штраф ${d.penalty}`,
          ip: req.ip,
        },
      })
      .catch(() => {});
    res.json({
      userId: saved.userId,
      hours: saved.hours,
      bonus: num(saved.bonus),
      penalty: num(saved.penalty),
      note: saved.note,
    });
  })
);

export default r;
