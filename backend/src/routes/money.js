// Учёт и контроль денег компании (казначейство). Заменяет ручной Excel:
// ввод приходов/расходов (тип, контрагент, комментарий, сумма+валюта, филиал),
// баланс, отчёт за период и агрегаты для аналитики. Приход с филиала
// (инкассация) заводится автоматически и без дублей (по refId).
//
// Доступ — офисные роли (директор/финансы/бухгалтер/сисадмин): деньги
// компании чувствительны, филиальный персонал сюда не ходит.
import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { asyncHandler } from "../util/asyncHandler.js";

const r = Router();
r.use(requireAuth);
r.use(requireRole("director", "finance", "accountant", "sysadmin"));

// Справочники по умолчанию (плюс к ним подмешиваются реально использованные).
const DEFAULT_CATEGORIES = [
  "Приход с филиала",
  "Пополнение уставного фонда",
  "Хоз. расходы",
  "Расход Маркетинг",
  "Расход автомашины",
  "Аренда",
  "Зарплата (ФОТ)",
  "Коммунальные",
  "Закупка ТМЦ",
  "Налоги",
  "Прочее",
];
const DEFAULT_PAY_TYPES = [
  "Наличные",
  "Перечисление",
  "Карта",
  "Click",
  "Payme",
  "Прочее",
];
const CURRENCIES = ["UZS", "RUB", "USD", "EUR"];

// BigInt → Number для JSON (суммы заведомо в пределах безопасного диапазона).
const n = (v) => (v == null ? 0 : Number(v));
function ser(t) {
  return {
    ...t,
    amount: n(t.amount),
    amountUzs: n(t.amountUzs),
  };
}

// Пересчёт в сум: для UZS курс = 1.
function toUzs(amount, rate) {
  return Math.round(amount * (rate || 1));
}

// ── Список движений за период (с фильтрами) ────────────────────────────────
r.get(
  "/",
  asyncHandler(async (req, res) => {
    const { from, to, branch, direction, category, q } = req.query;
    const where = {};
    if (from || to) where.date = {};
    if (from) where.date.gte = String(from);
    if (to) where.date.lte = String(to);
    if (branch) where.branchId = String(branch);
    if (direction === "income" || direction === "expense")
      where.direction = direction;
    if (category) where.category = String(category);
    if (q) {
      const s = String(q);
      where.OR = [
        { counterparty: { contains: s, mode: "insensitive" } },
        { comment: { contains: s, mode: "insensitive" } },
        { category: { contains: s, mode: "insensitive" } },
      ];
    }
    const items = await db.moneyTx.findMany({
      where,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 1000,
    });
    let income = 0;
    let expense = 0;
    for (const t of items) {
      if (t.direction === "income") income += n(t.amountUzs);
      else expense += n(t.amountUzs);
    }
    res.json({
      items: items.map(ser),
      totals: { income, expense, net: income - expense },
    });
  })
);

// ── Сводка: баланс (всё время) + агрегаты за период для отчёта/аналитики ────
r.get(
  "/summary",
  asyncHandler(async (req, res) => {
    const { from, to, branch } = req.query;

    // Баланс за всё время (по филиалу или по всей компании).
    const balWhere = {};
    if (branch) balWhere.branchId = String(branch);
    const [inAll, exAll] = await Promise.all([
      db.moneyTx.aggregate({
        _sum: { amountUzs: true },
        where: { ...balWhere, direction: "income" },
      }),
      db.moneyTx.aggregate({
        _sum: { amountUzs: true },
        where: { ...balWhere, direction: "expense" },
      }),
    ]);
    const balance = n(inAll._sum.amountUzs) - n(exAll._sum.amountUzs);

    // Движения за период — для группировок.
    const where = { ...balWhere };
    if (from || to) where.date = {};
    if (from) where.date.gte = String(from);
    if (to) where.date.lte = String(to);
    const items = await db.moneyTx.findMany({ where });

    const period = { income: 0, expense: 0, net: 0 };
    const byCategory = {};
    const byPaymentType = {};
    const byCounterparty = {};
    const byBranch = {};
    const byDay = {};
    const byCurrency = {};
    for (const t of items) {
      const a = n(t.amountUzs);
      if (t.direction === "income") period.income += a;
      else period.expense += a;
      // Группировки считаем по расходам (для контроля «на что уходят деньги»),
      // но храним и приходы отдельным знаком через direction.
      const bump = (obj, key) => {
        const k = key || "—";
        if (!obj[k]) obj[k] = { income: 0, expense: 0 };
        obj[k][t.direction === "income" ? "income" : "expense"] += a;
      };
      bump(byCategory, t.category);
      bump(byPaymentType, t.paymentType);
      bump(byBranch, t.branchName || "Без филиала");
      if (t.direction === "expense") bump(byCounterparty, t.counterparty);
      const d = t.date;
      if (!byDay[d]) byDay[d] = { income: 0, expense: 0 };
      byDay[d][t.direction === "income" ? "income" : "expense"] += a;
      const c = t.currency || "UZS";
      byCurrency[c] = (byCurrency[c] || 0) + n(t.amount);
    }
    period.net = period.income - period.expense;

    const toArr = (obj) =>
      Object.entries(obj)
        .map(([name, v]) => ({ name, ...v, net: v.income - v.expense }))
        .sort((x, y) => y.expense - x.expense);

    res.json({
      balance,
      period,
      byCategory: toArr(byCategory),
      byPaymentType: toArr(byPaymentType),
      byBranch: toArr(byBranch),
      byCounterparty: toArr(byCounterparty).slice(0, 20),
      byDay: Object.entries(byDay)
        .map(([date, v]) => ({ date, ...v, net: v.income - v.expense }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      byCurrency: Object.entries(byCurrency).map(([currency, amount]) => ({
        currency,
        amount,
      })),
    });
  })
);

// ── Справочники (для выпадающих списков ввода) ──────────────────────────────
r.get(
  "/dictionaries",
  asyncHandler(async (req, res) => {
    const rows = await db.moneyTx.findMany({
      select: { category: true, counterparty: true, paymentType: true },
      take: 2000,
      orderBy: { createdAt: "desc" },
    });
    const uniq = (arr) => [...new Set(arr.filter(Boolean))];
    const categories = uniq([
      ...DEFAULT_CATEGORIES,
      ...rows.map((x) => x.category),
    ]);
    const paymentTypes = uniq([
      ...DEFAULT_PAY_TYPES,
      ...rows.map((x) => x.paymentType),
    ]);
    const counterparties = uniq(rows.map((x) => x.counterparty)).slice(0, 200);
    res.json({
      categories,
      paymentTypes,
      counterparties,
      currencies: CURRENCIES,
    });
  })
);

// ── Создание движения ───────────────────────────────────────────────────────
const CreateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  direction: z.enum(["income", "expense"]),
  category: z.string().min(1),
  paymentType: z.string().default("Наличные"),
  counterparty: z.string().default(""),
  comment: z.string().default(""),
  amount: z.number().positive(),
  currency: z.enum(["UZS", "RUB", "USD", "EUR"]).default("UZS"),
  rate: z.number().positive().default(1),
  branchId: z.string().nullable().optional(),
  branchName: z.string().default(""),
});

r.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = CreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Неверный формат движения" });
    }
    const d = parsed.data;
    const rate = d.currency === "UZS" ? 1 : d.rate;
    const created = await db.moneyTx.create({
      data: {
        date: d.date,
        direction: d.direction,
        category: d.category,
        paymentType: d.paymentType,
        counterparty: d.counterparty,
        comment: d.comment,
        amount: BigInt(Math.round(d.amount)),
        currency: d.currency,
        rate,
        amountUzs: BigInt(toUzs(d.amount, rate)),
        branchId: d.branchId || null,
        branchName: d.branchName || "",
        source: "manual",
        createdById: req.user.uid,
      },
    });
    res.status(201).json(ser(created));
  })
);

// ── Правка движения ─────────────────────────────────────────────────────────
r.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const parsed = CreateSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Неверный формат" });
    }
    const existing = await db.moneyTx.findUnique({
      where: { id: req.params.id },
    });
    if (!existing) return res.status(404).json({ error: "Не найдено" });
    const d = { ...parsed.data };
    const data = {};
    for (const k of [
      "date",
      "direction",
      "category",
      "paymentType",
      "counterparty",
      "comment",
      "currency",
      "branchId",
      "branchName",
    ]) {
      if (d[k] !== undefined)
        data[k] = d[k] === "" && k === "branchId" ? null : d[k];
    }
    // Пересчёт суммы/курса, если изменили сумму, валюту или курс.
    if (
      d.amount !== undefined ||
      d.currency !== undefined ||
      d.rate !== undefined
    ) {
      const amount = d.amount ?? Number(existing.amount);
      const currency = d.currency ?? existing.currency;
      const rate = currency === "UZS" ? 1 : (d.rate ?? existing.rate);
      data.amount = BigInt(Math.round(amount));
      data.rate = rate;
      data.amountUzs = BigInt(toUzs(amount, rate));
    }
    const updated = await db.moneyTx.update({
      where: { id: req.params.id },
      data,
    });
    res.json(ser(updated));
  })
);

// ── Удаление движения ───────────────────────────────────────────────────────
r.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await db.moneyTx.delete({ where: { id: req.params.id } }).catch(() => {});
    res.json({ ok: true });
  })
);

// ── Приход с филиала (инкассация принята офисом) — идемпотентно по refId ─────
const BranchIncomeSchema = z.object({
  refId: z.string().min(1),
  branchId: z.string().nullable().optional(),
  branchName: z.string().default(""),
  amount: z.number().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  comment: z.string().default(""),
});

r.post(
  "/branch-income",
  asyncHandler(async (req, res) => {
    const parsed = BranchIncomeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Неверный формат прихода" });
    }
    const d = parsed.data;
    // upsert по refId — повторный вызов не создаст дубль.
    const tx = await db.moneyTx.upsert({
      where: { refId: d.refId },
      update: {
        amount: BigInt(Math.round(d.amount)),
        amountUzs: BigInt(Math.round(d.amount)),
        branchId: d.branchId || null,
        branchName: d.branchName || "",
        date: d.date,
      },
      create: {
        date: d.date,
        direction: "income",
        category: "Приход с филиала",
        paymentType: "Наличные",
        counterparty: "",
        comment: d.comment,
        amount: BigInt(Math.round(d.amount)),
        currency: "UZS",
        rate: 1,
        amountUzs: BigInt(Math.round(d.amount)),
        branchId: d.branchId || null,
        branchName: d.branchName || "",
        source: "branch-transfer",
        refId: d.refId,
        createdById: req.user.uid,
      },
    });
    res.status(201).json(ser(tx));
  })
);

export default r;
