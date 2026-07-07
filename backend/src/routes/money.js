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
const DEFAULT_DDS = [
  "Выручка",
  "Инкассация с филиала",
  "Зарплата (ФОТ)",
  "Аренда",
  "Коммунальные",
  "Закупка ТМЦ",
  "Маркетинг",
  "Хозрасходы",
  "Транспорт",
  "Налоги",
  "Пополнение уставного фонда",
  "Прочее",
];
const DEFAULT_LEGAL = [
  "«AVESTO CAFE» OK",
  "«AVESTO SWEETS» OK",
  "«INTERNATIONAL CATERING GROUP» MChJ",
];
const CURRENCIES = ["UZS", "RUB", "USD", "EUR"];
const DICT_TYPES = [
  "category",
  "counterparty",
  "ddsArticle",
  "branch",
  "legalEntity",
  "account",
  "paymentType",
];

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
    // В итоги идут только согласованные — заявки на согласовании (pending) и
    // отклонённые (rejected) баланс не искажают. В списке показываем всё.
    let income = 0;
    let expense = 0;
    let pending = 0;
    for (const t of items) {
      if (t.approval === "pending") pending += 1;
      if (t.approval !== "approved") continue;
      if (t.direction === "income") income += n(t.amountUzs);
      else expense += n(t.amountUzs);
    }
    res.json({
      items: items.map(ser),
      totals: { income, expense, net: income - expense, pending },
    });
  })
);

// ── Сводка: баланс (всё время) + агрегаты за период для отчёта/аналитики ────
r.get(
  "/summary",
  asyncHandler(async (req, res) => {
    const { from, to, branch } = req.query;

    // Баланс за всё время (по филиалу или по всей компании). Только
    // согласованные операции — заявки и отклонённые в баланс не входят.
    const balWhere = { approval: "approved" };
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

    // Движения за период — для группировок (тоже только согласованные).
    const where = { ...balWhere };
    if (from || to) where.date = {};
    if (from) where.date.gte = String(from);
    if (to) where.date.lte = String(to);
    const items = await db.moneyTx.findMany({ where });

    const period = { income: 0, expense: 0, net: 0 };
    const byCategory = {};
    const byDds = {};
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
      if (t.ddsArticle) bump(byDds, t.ddsArticle);
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

    // Число заявок на согласовании (без учёта периода — очередь всегда актуальна).
    const pendingWhere = { approval: "pending" };
    if (branch) pendingWhere.branchId = String(branch);
    const pendingCount = await db.moneyTx.count({ where: pendingWhere });

    const toArr = (obj) =>
      Object.entries(obj)
        .map(([name, v]) => ({ name, ...v, net: v.income - v.expense }))
        .sort((x, y) => y.expense - x.expense);

    res.json({
      balance,
      period,
      pendingCount,
      byCategory: toArr(byCategory),
      byDds: toArr(byDds),
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

// ── Справочники ────────────────────────────────────────────────────────────
// Возвращаем по каждому типу массив записей {id, name, parent}. Базовые
// значения при первом запуске заносятся в БД (ensureSeeded) — тогда у них
// есть id, и их можно переименовать/удалить, как и заведённые вручную.
// Записи без id (id=null) — это значения из реальных проводок (для подсказок),
// их не редактируем: они существуют в данных, а не в справочнике.

// Разовое наполнение справочников базовыми значениями. Идемпотентно: маркер в
// БД гарантирует, что после ручного удаления базовой записи она не вернётся
// при следующем запуске сервера.
let seedChecked = false;
async function ensureSeeded() {
  if (seedChecked) return;
  const marker = await db.moneyDict.findFirst({ where: { type: "__seed" } });
  if (!marker) {
    const seeds = [
      ...DEFAULT_CATEGORIES.map((name) => ({ type: "category", name })),
      ...DEFAULT_PAY_TYPES.map((name) => ({ type: "paymentType", name })),
      ...DEFAULT_DDS.map((name) => ({ type: "ddsArticle", name })),
      ...DEFAULT_LEGAL.map((name) => ({ type: "legalEntity", name })),
    ];
    await db.moneyDict.createMany({ data: seeds, skipDuplicates: true });
    await db.moneyDict
      .create({ data: { type: "__seed", name: "v1" } })
      .catch(() => {});
  }
  seedChecked = true;
}

async function buildDict() {
  await ensureSeeded();
  const [rows, txs] = await Promise.all([
    db.moneyDict.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
    }),
    db.moneyTx.findMany({
      select: { category: true, counterparty: true },
      take: 2000,
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const dbByType = {};
  for (const t of DICT_TYPES) dbByType[t] = [];
  for (const r of rows) if (dbByType[r.type]) dbByType[r.type].push(r); // «__seed» игнорируем

  // Значения из проводок (id=null) идут первыми, записи справочника (с id) их
  // перекрывают — так у базовой записи, встречающейся в данных, остаётся id.
  const merge = (dbRows, used = []) => {
    const map = new Map();
    for (const name of used)
      if (name && !map.has(name)) map.set(name, { id: null, name });
    for (const r of dbRows)
      map.set(r.name, { id: r.id, name: r.name, parent: r.parent || "" });
    return [...map.values()];
  };

  return {
    category: merge(
      dbByType.category,
      txs.map((x) => x.category)
    ),
    counterparty: merge(
      dbByType.counterparty,
      txs.map((x) => x.counterparty)
    ),
    ddsArticle: merge(dbByType.ddsArticle),
    branch: merge(dbByType.branch),
    legalEntity: merge(dbByType.legalEntity),
    account: merge(dbByType.account),
    paymentType: merge(dbByType.paymentType),
    currencies: CURRENCIES,
  };
}

r.get(
  "/dict",
  asyncHandler(async (req, res) => {
    res.json(await buildDict());
  })
);

// Добавить запись справочника (тип + название, для счёта — юр. лицо в parent).
const DictSchema = z.object({
  type: z.enum([
    "category",
    "counterparty",
    "ddsArticle",
    "branch",
    "legalEntity",
    "account",
    "paymentType",
  ]),
  name: z.string().min(1),
  parent: z.string().default(""),
});
r.post(
  "/dict",
  asyncHandler(async (req, res) => {
    const parsed = DictSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Неверный формат справочника" });
    }
    const d = parsed.data;
    const entry = await db.moneyDict.upsert({
      where: { type_name: { type: d.type, name: d.name.trim() } },
      update: { active: true, parent: d.parent || "" },
      create: { type: d.type, name: d.name.trim(), parent: d.parent || "" },
    });
    res.status(201).json(entry);
  })
);

// Редактировать запись справочника (переименовать, сменить юр. лицо у счёта).
// Правим только записи, заведённые вручную (с id); базовые — из кода, неизменны.
const DictPatchSchema = z.object({
  name: z.string().min(1),
  parent: z.string().default(""),
});
r.patch(
  "/dict/:id",
  asyncHandler(async (req, res) => {
    const parsed = DictPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Неверный формат справочника" });
    }
    const cur = await db.moneyDict.findUnique({ where: { id: req.params.id } });
    if (!cur) return res.status(404).json({ error: "Запись не найдена" });
    const name = parsed.data.name.trim();
    const parent = parsed.data.parent || "";
    // Не даём создать дубль (тот же тип + имя у другой записи).
    if (name !== cur.name) {
      const clash = await db.moneyDict.findUnique({
        where: { type_name: { type: cur.type, name } },
      });
      if (clash && clash.id !== cur.id) {
        return res.status(409).json({ error: "Такая запись уже существует" });
      }
    }
    const entry = await db.moneyDict.update({
      where: { id: cur.id },
      data: { name, parent },
    });
    res.json(entry);
  })
);

r.delete(
  "/dict/:id",
  asyncHandler(async (req, res) => {
    await db.moneyDict.delete({ where: { id: req.params.id } }).catch(() => {});
    res.json({ ok: true });
  })
);

// ── Создание движения ───────────────────────────────────────────────────────
const CreateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  direction: z.enum(["income", "expense"]),
  category: z.string().min(1),
  ddsArticle: z.string().default(""),
  paymentType: z.string().default("Наличные"),
  legalEntity: z.string().default(""),
  account: z.string().default(""),
  counterparty: z.string().default(""),
  comment: z.string().default(""),
  amount: z.number().positive(),
  currency: z.enum(["UZS", "RUB", "USD", "EUR"]).default("UZS"),
  rate: z.number().positive().default(1),
  branchId: z.string().nullable().optional(),
  branchName: z.string().default(""),
  // Директор/финансы могут провести расход сразу, минуя согласование.
  postNow: z.boolean().default(false),
});

// Кто вправе согласовывать расходы (и проводить их сразу при создании).
const APPROVER_ROLES = ["director", "finance"];
const canApprove = (role) => APPROVER_ROLES.includes(role);

r.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = CreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Неверный формат движения" });
    }
    const d = parsed.data;
    const rate = d.currency === "UZS" ? 1 : d.rate;
    // Приходы согласования не требуют. Расход становится заявкой (pending),
    // кроме случая, когда согласующий сам создаёт и просит провести сразу.
    let approval = "approved";
    const approvedFields = {};
    if (d.direction === "expense") {
      const postDirect = d.postNow && canApprove(req.user.role);
      approval = postDirect ? "approved" : "pending";
      if (postDirect) {
        approvedFields.approvedById = req.user.uid;
        approvedFields.approvedAt = new Date();
      }
    }
    const created = await db.moneyTx.create({
      data: {
        date: d.date,
        direction: d.direction,
        category: d.category,
        ddsArticle: d.ddsArticle || "",
        paymentType: d.paymentType,
        legalEntity: d.legalEntity || "",
        account: d.account || "",
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
        approval,
        ...approvedFields,
      },
    });
    res.status(201).json(ser(created));
  })
);

// ── Согласование / отклонение заявки на расход ──────────────────────────────
const RejectSchema = z.object({ reason: z.string().default("") });
r.post(
  "/:id/approve",
  requireRole(...APPROVER_ROLES),
  asyncHandler(async (req, res) => {
    const tx = await db.moneyTx.findUnique({ where: { id: req.params.id } });
    if (!tx) return res.status(404).json({ error: "Не найдено" });
    if (tx.approval !== "pending") {
      return res.status(409).json({ error: "Заявка уже обработана" });
    }
    const updated = await db.moneyTx.update({
      where: { id: tx.id },
      data: {
        approval: "approved",
        approvedById: req.user.uid,
        approvedAt: new Date(),
        rejectReason: "",
      },
    });
    res.json(ser(updated));
  })
);

r.post(
  "/:id/reject",
  requireRole(...APPROVER_ROLES),
  asyncHandler(async (req, res) => {
    const parsed = RejectSchema.safeParse(req.body || {});
    const reason = parsed.success ? parsed.data.reason : "";
    const tx = await db.moneyTx.findUnique({ where: { id: req.params.id } });
    if (!tx) return res.status(404).json({ error: "Не найдено" });
    if (tx.approval !== "pending") {
      return res.status(409).json({ error: "Заявка уже обработана" });
    }
    const updated = await db.moneyTx.update({
      where: { id: tx.id },
      data: {
        approval: "rejected",
        approvedById: req.user.uid,
        approvedAt: new Date(),
        rejectReason: reason || "",
      },
    });
    res.json(ser(updated));
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
      "ddsArticle",
      "legalEntity",
      "account",
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
