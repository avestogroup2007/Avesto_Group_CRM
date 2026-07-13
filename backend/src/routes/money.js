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
import { sendTelegram, esc, topicFor } from "../services/telegram.js";
import {
  refreshApprovalConfig,
  thresholdForBranch,
} from "../services/approvalConfig.js";

// Сумма для Telegram-сообщений (с разделителями разрядов).
const fmtMoney = (v) => Number(v).toLocaleString("ru-RU");

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

// ── Регулярные проводки: авто-заведение ежемесячных движений ────────────────
const pad2 = (x) => String(x).padStart(2, "0");
// Текущая дата в TZ сервера (Asia/Tashkent задаётся переменной TZ).
function ymdNow() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function nextMonth(m) {
  let y = +m.slice(0, 4);
  let mo = +m.slice(5, 7) + 1;
  if (mo > 12) {
    mo = 1;
    y += 1;
  }
  return `${y}-${pad2(mo)}`;
}
function daysInMonth(m) {
  return new Date(+m.slice(0, 4), +m.slice(5, 7), 0).getDate();
}

// Заводит недостающие ежемесячные движения по активным шаблонам. Идемпотентно:
// на каждый месяц свой refId (recur-<id>-<YYYYMM>), повторный вызов не дублирует.
// Вызывается лениво при чтении модуля денег. Ошибки не пробрасываем.
let recurringPromise = null; // single-flight: параллельные запросы не дублируют проход
async function ensureRecurringPosted() {
  if (recurringPromise) return recurringPromise;
  recurringPromise = doEnsureRecurringPosted().finally(() => {
    recurringPromise = null;
  });
  return recurringPromise;
}

async function doEnsureRecurringPosted() {
  const today = ymdNow();
  const curMonth = today.slice(0, 7);
  const curDay = +today.slice(8, 10);
  const templates = await db.moneyRecurring.findMany({
    where: { active: true },
  });
  for (const t of templates) {
    if (!t.startMonth) continue;
    // Начинаем с месяца после последнего заведённого (или со startMonth).
    let m =
      t.lastPostedMonth && t.lastPostedMonth >= t.startMonth
        ? nextMonth(t.lastPostedMonth)
        : t.startMonth;
    let last = t.lastPostedMonth;
    let guard = 0;
    while (m <= curMonth && guard < 60) {
      guard += 1;
      if (t.endMonth && m > t.endMonth) break;
      // Для текущего месяца ждём назначенный день; прошлые месяцы — сразу.
      if (m === curMonth && curDay < t.dayOfMonth) break;
      const day = Math.min(t.dayOfMonth || 1, daysInMonth(m));
      const date = `${m}-${pad2(day)}`;
      const rate = t.currency === "UZS" ? 1 : t.rate || 1;
      const refId = `recur-${t.id}-${m.replace("-", "")}`;
      const approved = t.autoApprove !== false;
      await db.moneyTx.upsert({
        where: { refId },
        update: {}, // уже заведён — не трогаем (историю не переписываем)
        create: {
          date,
          direction: t.direction || "expense",
          category: t.category,
          ddsArticle: t.ddsArticle || "",
          paymentType: t.paymentType || "Наличные",
          legalEntity: t.legalEntity || "",
          account: t.account || "",
          counterparty: t.counterparty || "",
          comment: t.comment || t.name,
          amount: t.amount,
          currency: t.currency || "UZS",
          rate,
          amountUzs: BigInt(toUzs(Number(t.amount), rate)),
          branchId: t.branchId || null,
          branchName: t.branchName || "",
          source: "recurring",
          refId,
          createdById: t.createdById || null,
          approval: approved ? "approved" : "pending",
          ...(approved ? { approvedAt: new Date() } : {}),
        },
      });
      last = m;
      m = nextMonth(m);
    }
    if (last && last !== t.lastPostedMonth) {
      await db.moneyRecurring.update({
        where: { id: t.id },
        data: { lastPostedMonth: last },
      });
    }
  }
}

// ── Список движений за период (с фильтрами) ────────────────────────────────
r.get(
  "/",
  asyncHandler(async (req, res) => {
    await ensureRecurringPosted().catch(() => {});
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
    // Итоги считаются агрегатами по ВСЕМУ фильтру (не по выданной странице):
    // при >1000 движений за период суммы на экране должны оставаться верными.
    // В итоги идут только согласованные — pending/rejected баланс не искажают.
    const [items, incAgg, expAgg, pending] = await Promise.all([
      db.moneyTx.findMany({
        where,
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        take: 1000,
      }),
      db.moneyTx.aggregate({
        _sum: { amountUzs: true },
        where: { ...where, approval: "approved", direction: "income" },
      }),
      db.moneyTx.aggregate({
        _sum: { amountUzs: true },
        where: { ...where, approval: "approved", direction: "expense" },
      }),
      db.moneyTx.count({ where: { ...where, approval: "pending" } }),
    ]);
    const income = n(incAgg._sum.amountUzs);
    const expense = n(expAgg._sum.amountUzs);
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
    await ensureRecurringPosted().catch(() => {});
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

// ── ДДС: движение денежных средств по месяцам и статьям ─────────────────────
// Отчёт для руководства: приток/отток по статьям ДДС, помесячно, за период.
// Только согласованные операции (заявки/отклонённые не входят). Роль доступа —
// как у всего модуля денег (офис).
r.get(
  "/dds",
  asyncHandler(async (req, res) => {
    const { from, to, branch } = req.query;
    const where = { approval: "approved" };
    if (branch) where.branchId = String(branch);
    if (from || to) where.date = {};
    if (from) where.date.gte = String(from);
    if (to) where.date.lte = String(to);
    const items = await db.moneyTx.findMany({
      where,
      select: {
        date: true,
        direction: true,
        ddsArticle: true,
        amountUzs: true,
      },
      take: 50000,
    });

    const monthOf = (d) => String(d).slice(0, 7); // YYYY-MM
    const monthsSet = new Set();
    // article -> { income: {month: sum}, expense: {month: sum}, tIn, tEx }
    const byArticle = new Map();
    const monthTotals = {}; // month -> { income, expense }
    for (const t of items) {
      const m = monthOf(t.date);
      monthsSet.add(m);
      const art = t.ddsArticle || "Без статьи";
      const a =
        byArticle.get(art) ||
        (byArticle.set(art, { income: {}, expense: {}, tIn: 0, tEx: 0 }),
        byArticle.get(art));
      const amt = n(t.amountUzs);
      const dir = t.direction === "income" ? "income" : "expense";
      a[dir][m] = (a[dir][m] || 0) + amt;
      if (dir === "income") a.tIn += amt;
      else a.tEx += amt;
      if (!monthTotals[m]) monthTotals[m] = { income: 0, expense: 0 };
      monthTotals[m][dir] += amt;
    }
    const months = [...monthsSet].sort();
    const pack = (dir, totalKey) =>
      [...byArticle.entries()]
        .map(([article, v]) => ({
          article,
          byMonth: v[dir],
          total: v[totalKey],
        }))
        .filter((x) => x.total > 0)
        .sort((x, y) => y.total - x.total);

    const totals = {
      income: Object.values(monthTotals).reduce((s, m) => s + m.income, 0),
      expense: Object.values(monthTotals).reduce((s, m) => s + m.expense, 0),
    };
    totals.net = totals.income - totals.expense;

    res.json({
      from: from || null,
      to: to || null,
      months,
      income: pack("income", "tIn"),
      expense: pack("expense", "tEx"),
      monthTotals: Object.fromEntries(
        months.map((m) => [
          m,
          {
            income: monthTotals[m]?.income || 0,
            expense: monthTotals[m]?.expense || 0,
            net: (monthTotals[m]?.income || 0) - (monthTotals[m]?.expense || 0),
          },
        ])
      ),
      totals,
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
    await db.auditLog
      .create({
        data: {
          userId: req.user.uid,
          event: "money_dict_add",
          detail: `Справочник кассы: добавлено «${entry.name}» (${entry.type})`,
          ip: req.ip,
        },
      })
      .catch(() => {});
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
    await db.auditLog
      .create({
        data: {
          userId: req.user.uid,
          event: "money_dict_edit",
          detail: `Справочник кассы: «${cur.name}» → «${entry.name}» (${entry.type})`,
          ip: req.ip,
        },
      })
      .catch(() => {});
    res.json(entry);
  })
);

r.delete(
  "/dict/:id",
  asyncHandler(async (req, res) => {
    // Читаем запись до удаления — чтобы в аудите осталось, что именно удалили.
    const cur = await db.moneyDict
      .findUnique({ where: { id: req.params.id } })
      .catch(() => null);
    await db.moneyDict.delete({ where: { id: req.params.id } }).catch(() => {});
    if (cur) {
      await db.auditLog
        .create({
          data: {
            userId: req.user.uid,
            event: "money_dict_delete",
            detail: `Справочник кассы: удалено «${cur.name}» (${cur.type})`,
            ip: req.ip,
          },
        })
        .catch(() => {});
    }
    res.json({ ok: true });
  })
);

// ── Создание движения ───────────────────────────────────────────────────────
const CreateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  direction: z.enum(["income", "expense"]),
  category: z.string().min(1).max(200),
  ddsArticle: z.string().default(""),
  paymentType: z.string().default("Наличные"),
  legalEntity: z.string().default(""),
  account: z.string().default(""),
  counterparty: z.string().max(300).default(""),
  comment: z.string().max(1000).default(""),
  amount: z.number().positive().max(9e15),
  currency: z.enum(["UZS", "RUB", "USD", "EUR"]).default("UZS"),
  // Верхняя граница курса — защита от переполнения: amount*rate не должно
  // давать Infinity (иначе BigInt(Math.round(...)) кидает 500 вместо 400).
  rate: z.number().positive().max(1e7).default(1),
  branchId: z.string().nullable().optional(),
  branchName: z.string().default(""),
  // Директор/финансы могут провести расход сразу, минуя согласование.
  postNow: z.boolean().default(false),
});

// Кто вправе согласовывать расходы (и проводить их сразу при создании).
const APPROVER_ROLES = ["director", "finance"];
const canApprove = (role) => role === "owner" || APPROVER_ROLES.includes(role);

r.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = CreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Неверный формат движения" });
    }
    const d = parsed.data;
    const rate = d.currency === "UZS" ? 1 : d.rate;
    const amountUzs = toUzs(d.amount, rate);
    // Приходы согласования не требуют. Расход становится заявкой (pending),
    // кроме случая, когда согласующий сам создаёт и просит провести сразу
    // ИЛИ сумма не превышает порог согласования (общий или по филиалу).
    let approval = "approved";
    const approvedFields = {};
    if (d.direction === "expense") {
      await refreshApprovalConfig().catch(() => {});
      const threshold = thresholdForBranch(d.branchId);
      const withinThreshold = threshold > 0 && amountUzs <= threshold;
      const postDirect = d.postNow && canApprove(req.user.role);
      approval = postDirect || withinThreshold ? "approved" : "pending";
      if (postDirect) {
        approvedFields.approvedById = req.user.uid;
        approvedFields.approvedAt = new Date();
      } else if (withinThreshold) {
        // Авто-согласование по порогу: фиксируем время, исполнитель — система.
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
        amountUzs: BigInt(amountUzs),
        branchId: d.branchId || null,
        branchName: d.branchName || "",
        source: "manual",
        createdById: req.user.uid,
        approval,
        ...approvedFields,
      },
    });
    // Заявка на расход — оповещаем офис в Telegram (best-effort).
    if (created.approval === "pending") {
      sendTelegram(
        `📝 <b>Новая заявка на расход</b>\n` +
          `${esc(created.category)} — <b>${fmtMoney(created.amountUzs)} сум</b>\n` +
          (created.counterparty
            ? `Контрагент: ${esc(created.counterparty)}\n`
            : "") +
          (created.comment ? `${esc(created.comment)}\n` : "") +
          `Филиал: ${esc(created.branchName || "—")}\n` +
          `Ожидает согласования.`,
        undefined,
        topicFor("expense")
      );
    }
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
    sendTelegram(
      `✅ <b>Расход согласован</b>\n` +
        `${esc(updated.category)} — <b>${fmtMoney(updated.amountUzs)} сум</b>`,
      undefined,
      topicFor("expense")
    );
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
    sendTelegram(
      `❌ <b>Заявка отклонена</b>\n` +
        `${esc(updated.category)} — <b>${fmtMoney(updated.amountUzs)} сум</b>` +
        (reason ? `\nПричина: ${esc(reason)}` : ""),
      undefined,
      topicFor("expense")
    );
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
    // Существенная правка согласованного движения (сумма/направление/дата)
    // не-апрувером возвращает его на согласование: иначе workflow обходится.
    const APPROVERS = new Set(["director", "finance"]);
    const material =
      data.amountUzs !== undefined ||
      data.direction !== undefined ||
      data.date !== undefined;
    if (
      existing.approval === "approved" &&
      material &&
      !APPROVERS.has(req.user.role)
    ) {
      data.approval = "pending";
      data.approvedById = null;
      data.approvedAt = null;
    }
    // Правка и снос старой авто-проводки — в одной транзакции: журнал Дт/Кт
    // пересоздаст её из новых данных при следующем чтении (ensureAutoPosted).
    const [updated] = await db.$transaction([
      db.moneyTx.update({ where: { id: req.params.id }, data }),
      db.posting.deleteMany({ where: { refId: `mtx-${req.params.id}` } }),
    ]);
    // Правка согласованного движения — след в журнале безопасности.
    if (existing.approval === "approved") {
      await db.auditLog
        .create({
          data: {
            userId: req.user.uid,
            event: "money_tx_update",
            detail: `Изменено согласованное движение ${req.params.id}: ${Object.keys(data).join(", ")}`,
            ip: req.ip,
          },
        })
        .catch(() => {});
    }
    res.json(ser(updated));
  })
);

// ── Удаление движения ───────────────────────────────────────────────────────
r.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    const existing = await db.moneyTx.findUnique({ where: { id } });
    if (!existing) return res.json({ ok: true });
    // Движение и его авто-проводка удаляются вместе — иначе журнал Дт/Кт
    // навсегда разойдётся с деньгами.
    await db.$transaction([
      db.posting.deleteMany({ where: { refId: `mtx-${id}` } }),
      db.moneyTx.delete({ where: { id } }),
    ]);
    await db.auditLog
      .create({
        data: {
          userId: req.user.uid,
          event: "money_tx_delete",
          detail: `Удалено движение ${existing.direction} ${existing.amountUzs} сум (${existing.category}) за ${existing.date}`,
          ip: req.ip,
        },
      })
      .catch(() => {});
    res.json({ ok: true });
  })
);

// ── Приход с филиала (инкассация принята офисом) — идемпотентно по refId ─────
const BranchIncomeSchema = z.object({
  refId: z.string().min(1),
  branchId: z.string().nullable().optional(),
  branchName: z.string().default(""),
  amount: z.number().positive().max(9e15),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  comment: z.string().max(1000).default(""),
});

r.post(
  "/branch-income",
  asyncHandler(async (req, res) => {
    // refId приходит от клиента: перезапись существующей записи (upsert)
    // фиксируется в журнале безопасности ниже по коду.
    const parsed = BranchIncomeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Неверный формат прихода" });
    }
    const d = parsed.data;
    const prior = await db.moneyTx.findUnique({ where: { refId: d.refId } });
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
    // Перезапись существующей инкассации (например, изменение суммы по тому
    // же refId) — след в журнале безопасности.
    if (prior && prior.amountUzs !== tx.amountUzs) {
      await db.auditLog
        .create({
          data: {
            userId: req.user.uid,
            event: "branch_income_update",
            detail: `Инкассация ${d.refId}: сумма ${prior.amountUzs} → ${tx.amountUzs}`,
            ip: req.ip,
          },
        })
        .catch(() => {});
    }
    res.status(201).json(ser(tx));
  })
);

// ── Регулярные проводки (шаблоны ежемесячных расходов/приходов) ──────────────
const RecurringSchema = z.object({
  name: z.string().min(1),
  direction: z.enum(["income", "expense"]).default("expense"),
  category: z.string().min(1).max(200),
  ddsArticle: z.string().default(""),
  paymentType: z.string().default("Наличные"),
  legalEntity: z.string().default(""),
  account: z.string().default(""),
  counterparty: z.string().max(300).default(""),
  comment: z.string().max(1000).default(""),
  amount: z.number().positive().max(9e15),
  currency: z.enum(["UZS", "RUB", "USD", "EUR"]).default("UZS"),
  // Верхняя граница курса — защита от переполнения: amount*rate не должно
  // давать Infinity (иначе BigInt(Math.round(...)) кидает 500 вместо 400).
  rate: z.number().positive().max(1e7).default(1),
  branchId: z.string().nullable().optional(),
  branchName: z.string().default(""),
  dayOfMonth: z.number().int().min(1).max(28).default(1),
  startMonth: z.string().regex(/^\d{4}-\d{2}$/),
  endMonth: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .or(z.literal(""))
    .default(""),
  autoApprove: z.boolean().default(true),
  active: z.boolean().default(true),
});

function serRec(t) {
  return { ...t, amount: n(t.amount) };
}

// Список шаблонов.
r.get(
  "/recurring",
  asyncHandler(async (req, res) => {
    const rows = await db.moneyRecurring.findMany({
      orderBy: { createdAt: "desc" },
    });
    res.json(rows.map(serRec));
  })
);

// Создать шаблон (и сразу завести уже наступившие месяцы).
r.post(
  "/recurring",
  asyncHandler(async (req, res) => {
    const parsed = RecurringSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Неверный формат шаблона" });
    }
    const d = parsed.data;
    const rate = d.currency === "UZS" ? 1 : d.rate;
    const created = await db.moneyRecurring.create({
      data: {
        name: d.name,
        direction: d.direction,
        category: d.category,
        ddsArticle: d.ddsArticle || "",
        paymentType: d.paymentType,
        legalEntity: d.legalEntity || "",
        account: d.account || "",
        counterparty: d.counterparty || "",
        comment: d.comment || "",
        amount: BigInt(Math.round(d.amount)),
        currency: d.currency,
        rate,
        branchId: d.branchId || null,
        branchName: d.branchName || "",
        dayOfMonth: d.dayOfMonth,
        startMonth: d.startMonth,
        endMonth: d.endMonth || "",
        autoApprove: d.autoApprove,
        active: d.active,
        createdById: req.user.uid,
      },
    });
    await ensureRecurringPosted().catch(() => {});
    res.status(201).json(serRec(created));
  })
);

// Изменить шаблон.
r.patch(
  "/recurring/:id",
  asyncHandler(async (req, res) => {
    const parsed = RecurringSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Неверный формат" });
    }
    const d = parsed.data;
    const data = {};
    for (const k of [
      "name",
      "direction",
      "category",
      "ddsArticle",
      "paymentType",
      "legalEntity",
      "account",
      "counterparty",
      "comment",
      "currency",
      "branchName",
      "dayOfMonth",
      "startMonth",
      "endMonth",
      "autoApprove",
      "active",
    ]) {
      if (d[k] !== undefined) data[k] = d[k];
    }
    if (d.branchId !== undefined) data.branchId = d.branchId || null;
    if (
      d.amount !== undefined ||
      d.currency !== undefined ||
      d.rate !== undefined
    ) {
      const existing = await db.moneyRecurring.findUnique({
        where: { id: req.params.id },
      });
      if (!existing) return res.status(404).json({ error: "Не найдено" });
      const amount = d.amount ?? Number(existing.amount);
      const currency = d.currency ?? existing.currency;
      const rate = currency === "UZS" ? 1 : (d.rate ?? existing.rate);
      data.amount = BigInt(Math.round(amount));
      data.rate = rate;
    }
    const updated = await db.moneyRecurring.update({
      where: { id: req.params.id },
      data,
    });
    await ensureRecurringPosted().catch(() => {});
    res.json(serRec(updated));
  })
);

// Удалить шаблон (заведённые ранее движения остаются в истории).
r.delete(
  "/recurring/:id",
  asyncHandler(async (req, res) => {
    await db.moneyRecurring
      .delete({ where: { id: req.params.id } })
      .catch(() => {});
    res.json({ ok: true });
  })
);

export default r;
