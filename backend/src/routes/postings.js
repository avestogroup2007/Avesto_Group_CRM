// Бухгалтерия: двойная запись (Дт/Кт). Программа сама формирует проводки из
// движений денег (MoneyTx) по правилам «статья → пара счетов», а также даёт
// вести проводки вручную и строить оборотно-сальдовую ведомость (ОСВ).
//
// Доступ — офисные роли (директор/финансы/бухгалтер/сисадмин): бухгалтерия
// чувствительна, филиальный персонал сюда не ходит.
import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { log } from "../logger.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { asyncHandler } from "../util/asyncHandler.js";

const r = Router();
r.use(requireAuth);
r.use(requireRole("director", "finance", "accountant", "sysadmin"));

// Правка настроек бухгалтерии (план счетов, правила проводок) — только
// директор/сисадмин: это чувствительная настройка (дебет/кредит), меняющая, как
// формируются проводки. Чтение остаётся у всех офисных ролей.
const canEditCfg = requireRole("director", "sysadmin");
const logCfg = (req, event, detail) =>
  db.auditLog
    .create({ data: { userId: req.user.uid, event, detail, ip: req.ip } })
    .catch(() => {});

// BigInt → Number для JSON (суммы в пределах безопасного диапазона).
const n = (v) => (v == null ? 0 : Number(v));
const serP = (p) => ({ ...p, amount: n(p.amount) });

// ── План счетов по умолчанию (НСБУ Узбекистана, под ресторанный бизнес) ─────
// kind: active | passive | income | expense | contra.
const DEFAULT_ACCOUNTS = [
  { code: "5010", name: "Денежные средства в кассе", kind: "active" },
  { code: "5110", name: "Расчётный счёт", kind: "active" },
  { code: "4010", name: "Задолженность покупателей", kind: "active" },
  { code: "2910", name: "Товары на складах", kind: "active" },
  { code: "2010", name: "Основное производство (цех)", kind: "active" },
  { code: "0130", name: "Основные средства", kind: "active" },
  { code: "0230", name: "Износ основных средств", kind: "contra" },
  { code: "6010", name: "Задолженность поставщикам", kind: "passive" },
  { code: "6710", name: "Задолженность по оплате труда", kind: "passive" },
  { code: "6410", name: "Задолженность по налогам", kind: "passive" },
  { code: "6990", name: "Прочие обязательства", kind: "passive" },
  { code: "8300", name: "Уставный капитал", kind: "passive" },
  { code: "8330", name: "Нераспределённая прибыль", kind: "passive" },
  { code: "9010", name: "Доход от реализации", kind: "income" },
  {
    code: "9410",
    name: "Расходы по реализации (коммерческие)",
    kind: "expense",
  },
  { code: "9420", name: "Административные расходы", kind: "expense" },
  { code: "9430", name: "Прочие операционные расходы", kind: "expense" },
  { code: "9820", name: "Расходы по налогам", kind: "expense" },
];

// ── Правила авто-проводки по умолчанию ──────────────────────────────────────
// Для расхода: Дт = счёт затрат по статье, Кт = «авто» (касса/банк по типу
// оплаты). Для прихода: Дт = «авто», Кт = счёт дохода/капитала. Пустая сторона
// («") означает авто-подстановку кассы (5010) или банка (5110).
const DEFAULT_RULES = [
  // Расходы
  { direction: "expense", category: "Аренда", debit: "9420", credit: "" },
  {
    direction: "expense",
    category: "Зарплата (ФОТ)",
    debit: "9420",
    credit: "",
  },
  { direction: "expense", category: "Коммунальные", debit: "9420", credit: "" },
  {
    direction: "expense",
    category: "Расход Маркетинг",
    debit: "9410",
    credit: "",
  },
  {
    direction: "expense",
    category: "Расход автомашины",
    debit: "9420",
    credit: "",
  },
  { direction: "expense", category: "Хоз. расходы", debit: "9420", credit: "" },
  { direction: "expense", category: "Закупка ТМЦ", debit: "2910", credit: "" },
  { direction: "expense", category: "Налоги", debit: "9820", credit: "" },
  // Амортизация — не касса: Дт расходы, Кт износ ОС.
  {
    direction: "expense",
    category: "Амортизация",
    debit: "9420",
    credit: "0230",
  },
  { direction: "expense", category: "Прочее", debit: "9430", credit: "" },
  // Fallback для расхода (category "").
  { direction: "expense", category: "", debit: "9430", credit: "" },
  // Приходы
  {
    direction: "income",
    category: "Приход с филиала",
    debit: "",
    credit: "9010",
  },
  {
    direction: "income",
    category: "Пополнение уставного фонда",
    debit: "",
    credit: "8300",
  },
  // Fallback для прихода (category "").
  { direction: "income", category: "", debit: "", credit: "9010" },
];

// Разовое наполнение плана счетов и правил (идемпотентно, маркер в правилах).
let seedChecked = false;
async function ensureSeeded() {
  if (seedChecked) return;
  const cnt = await db.ledgerAccount.count();
  if (cnt === 0) {
    await db.ledgerAccount.createMany({
      data: DEFAULT_ACCOUNTS,
      skipDuplicates: true,
    });
  }
  const rcnt = await db.postingRule.count();
  if (rcnt === 0) {
    await db.postingRule.createMany({
      data: DEFAULT_RULES,
      skipDuplicates: true,
    });
  }
  seedChecked = true;
}

// Счёт кассы/банка по типу оплаты движения.
function cashAccount(paymentType) {
  const p = String(paymentType || "").toLowerCase();
  return p.includes("нал") ? "5010" : "5110";
}

// Подбор пары счетов Дт/Кт для движения по правилам (с fallback).
function pickAccounts(tx, rules) {
  const byKey = (dir, cat) =>
    rules.find(
      (x) => x.active !== false && x.direction === dir && x.category === cat
    );
  const rule =
    byKey(tx.direction, tx.category) || byKey(tx.direction, "") || null;
  const cash = cashAccount(tx.paymentType);
  let debit = rule && rule.debit ? rule.debit : "";
  let credit = rule && rule.credit ? rule.credit : "";
  if (tx.direction === "expense") {
    if (!debit) debit = "9430"; // затраты по умолчанию
    if (!credit) credit = cash; // оплачено кассой/банком
  } else {
    if (!debit) debit = cash; // деньги пришли в кассу/банк
    if (!credit) credit = "9010"; // доход по умолчанию
  }
  return { debit, credit };
}

// Формирует недостающие авто-проводки из согласованных движений денег.
// Идемпотентно: refId = mtx-<id>. Ленивая — вызывается при чтении журнала/ОСВ.
let autoPostPromise = null; // single-flight: параллельные чтения журнала
async function ensureAutoPosted() {
  if (autoPostPromise) return autoPostPromise;
  autoPostPromise = doEnsureAutoPosted().finally(() => {
    autoPostPromise = null;
  });
  return autoPostPromise;
}

async function doEnsureAutoPosted() {
  await ensureSeeded();
  const rules = await db.postingRule.findMany();
  // Согласованные движения, у которых ещё НЕТ авто-проводки: LEFT JOIN на
  // уровне БД вместо выгрузки всех refId в память (не деградирует с ростом
  // журнала). SQL статический — пользовательского ввода здесь нет.
  const missing = await db.$queryRaw`
    SELECT m.id FROM "MoneyTx" m
    LEFT JOIN "Posting" p ON p."refId" = 'mtx-' || m.id AND p.source = 'money-tx'
    WHERE m.approval = 'approved' AND p.id IS NULL
    ORDER BY m."createdAt" DESC
    LIMIT 500`;
  if (!missing.length) return;
  const txs = await db.moneyTx.findMany({
    where: { id: { in: missing.map((r) => r.id) } },
  });
  for (const tx of txs) {
    const refId = `mtx-${tx.id}`;
    const { debit, credit } = pickAccounts(tx, rules);
    await db.posting
      .create({
        data: {
          date: tx.date,
          number: "",
          debit,
          credit,
          amount: tx.amountUzs,
          currency: "UZS",
          description: [tx.category, tx.counterparty, tx.comment]
            .filter(Boolean)
            .join(" · "),
          legalEntity: tx.legalEntity || "",
          branchId: tx.branchId || null,
          branchName: tx.branchName || "",
          source: "money-tx",
          refId,
          moneyTxId: tx.id,
          createdById: tx.createdById || null,
        },
      })
      .catch((e) => {
        // Пропускаем ТОЛЬКО гонку/дубль по refId — прочие ошибки должны быть
        // видны, иначе проводка молча не появится никогда.
        if (e && e.code !== "P2002") {
          log.warn({ err: e.message, refId }, "авто-проводка не создана");
        }
      });
  }
}

// ── План счетов ─────────────────────────────────────────────────────────────
r.get(
  "/accounts",
  asyncHandler(async (req, res) => {
    await ensureSeeded();
    const rows = await db.ledgerAccount.findMany({
      orderBy: { code: "asc" },
    });
    res.json(rows);
  })
);

const AccountSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  kind: z
    .enum(["active", "passive", "income", "expense", "contra"])
    .default("active"),
  active: z.boolean().default(true),
});
r.post(
  "/accounts",
  canEditCfg,
  asyncHandler(async (req, res) => {
    const parsed = AccountSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: "Неверный формат счёта" });
    const d = parsed.data;
    const entry = await db.ledgerAccount.upsert({
      where: { code: d.code.trim() },
      update: { name: d.name.trim(), kind: d.kind, active: d.active },
      create: {
        code: d.code.trim(),
        name: d.name.trim(),
        kind: d.kind,
        active: d.active,
      },
    });
    await logCfg(
      req,
      "posting_account_upsert",
      `Счёт ${entry.code} «${entry.name}» (${entry.kind}), ${entry.active ? "активен" : "выключен"}`
    );
    res.status(201).json(entry);
  })
);

r.patch(
  "/accounts/:id",
  canEditCfg,
  asyncHandler(async (req, res) => {
    const parsed = AccountSchema.partial().safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: "Неверный формат счёта" });
    const d = parsed.data;
    const data = {};
    if (d.name !== undefined) data.name = d.name.trim();
    if (d.kind !== undefined) data.kind = d.kind;
    if (d.active !== undefined) data.active = d.active;
    const updated = await db.ledgerAccount
      .update({ where: { id: req.params.id }, data })
      .catch(() => null);
    if (!updated) return res.status(404).json({ error: "Счёт не найден" });
    await logCfg(
      req,
      "posting_account_update",
      `Счёт ${updated.code} «${updated.name}» изменён`
    );
    res.json(updated);
  })
);

r.delete(
  "/accounts/:id",
  canEditCfg,
  asyncHandler(async (req, res) => {
    const acc = await db.ledgerAccount
      .delete({ where: { id: req.params.id } })
      .catch(() => null);
    if (acc)
      await logCfg(
        req,
        "posting_account_delete",
        `Удалён счёт ${acc.code} «${acc.name}»`
      );
    res.json({ ok: true });
  })
);

// ── Правила авто-проводки ───────────────────────────────────────────────────
r.get(
  "/rules",
  asyncHandler(async (req, res) => {
    await ensureSeeded();
    const rows = await db.postingRule.findMany({
      orderBy: [{ direction: "asc" }, { category: "asc" }],
    });
    res.json(rows);
  })
);

const RuleSchema = z.object({
  direction: z.enum(["income", "expense"]),
  category: z.string().default(""),
  debit: z.string().default(""),
  credit: z.string().default(""),
  active: z.boolean().default(true),
});
r.post(
  "/rules",
  canEditCfg,
  asyncHandler(async (req, res) => {
    const parsed = RuleSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: "Неверный формат правила" });
    const d = parsed.data;
    const entry = await db.postingRule.upsert({
      where: {
        direction_category: { direction: d.direction, category: d.category },
      },
      update: { debit: d.debit, credit: d.credit, active: d.active },
      create: d,
    });
    await logCfg(
      req,
      "posting_rule_upsert",
      `Правило ${entry.direction}/${entry.category || "—"}: Дт ${entry.debit || "—"} Кт ${entry.credit || "—"}`
    );
    res.status(201).json(entry);
  })
);

r.patch(
  "/rules/:id",
  canEditCfg,
  asyncHandler(async (req, res) => {
    const parsed = RuleSchema.partial().safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: "Неверный формат правила" });
    const d = parsed.data;
    const data = {};
    for (const k of ["debit", "credit", "active"])
      if (d[k] !== undefined) data[k] = d[k];
    const updated = await db.postingRule
      .update({ where: { id: req.params.id }, data })
      .catch(() => null);
    if (!updated) return res.status(404).json({ error: "Правило не найдено" });
    await logCfg(
      req,
      "posting_rule_update",
      `Правило ${updated.direction}/${updated.category || "—"} изменено: Дт ${updated.debit || "—"} Кт ${updated.credit || "—"}`
    );
    res.json(updated);
  })
);

r.delete(
  "/rules/:id",
  canEditCfg,
  asyncHandler(async (req, res) => {
    const rule = await db.postingRule
      .delete({ where: { id: req.params.id } })
      .catch(() => null);
    if (rule)
      await logCfg(
        req,
        "posting_rule_delete",
        `Удалено правило ${rule.direction}/${rule.category || "—"}`
      );
    res.json({ ok: true });
  })
);

// ── Журнал проводок ─────────────────────────────────────────────────────────
r.get(
  "/",
  asyncHandler(async (req, res) => {
    await ensureAutoPosted().catch(() => {});
    const { from, to, branch, account, q } = req.query;
    const where = {};
    if (from || to) where.date = {};
    if (from) where.date.gte = String(from);
    if (to) where.date.lte = String(to);
    if (branch) where.branchId = String(branch);
    if (account) {
      const a = String(account);
      where.OR = [{ debit: a }, { credit: a }];
    }
    if (q) {
      const s = String(q);
      const like = { contains: s, mode: "insensitive" };
      where.AND = [{ OR: [{ description: like }, { number: like }] }];
    }
    // Итог — агрегатом по всему фильтру, а не по выданной странице (take).
    const [items, agg, count] = await Promise.all([
      db.posting.findMany({
        where,
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        take: 2000,
      }),
      db.posting.aggregate({ _sum: { amount: true }, where }),
      db.posting.count({ where }),
    ]);
    const total = n(agg._sum.amount);
    res.json({ items: items.map(serP), total, count });
  })
);

const PostingSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  number: z.string().default(""),
  debit: z.string().min(1),
  credit: z.string().min(1),
  amount: z.number().positive(),
  description: z.string().default(""),
  legalEntity: z.string().default(""),
  branchId: z.string().nullable().optional(),
  branchName: z.string().default(""),
});
r.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = PostingSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: "Неверный формат проводки" });
    const d = parsed.data;
    if (d.debit === d.credit)
      return res
        .status(400)
        .json({ error: "Дебет и кредит должны различаться" });
    const created = await db.posting.create({
      data: {
        date: d.date,
        number: d.number || "",
        debit: d.debit,
        credit: d.credit,
        amount: BigInt(Math.round(d.amount)),
        currency: "UZS",
        description: d.description || "",
        legalEntity: d.legalEntity || "",
        branchId: d.branchId || null,
        branchName: d.branchName || "",
        source: "manual",
        createdById: req.user.uid,
      },
    });
    // Ручная проводка напрямую влияет на оборотно-сальдовую ведомость —
    // фиксируем создание в журнале (как удаление и правку правил).
    await db.auditLog
      .create({
        data: {
          userId: req.user.uid,
          event: "posting_create",
          detail: `Создана проводка ${created.debit}/${created.credit} на ${created.amount} (${created.date})`,
          ip: req.ip,
        },
      })
      .catch(() => {});
    res.status(201).json(serP(created));
  })
);

r.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const parsed = PostingSchema.partial().safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: "Неверный формат" });
    const d = parsed.data;
    const data = {};
    for (const k of [
      "date",
      "number",
      "debit",
      "credit",
      "description",
      "legalEntity",
      "branchName",
    ])
      if (d[k] !== undefined) data[k] = d[k];
    if (d.branchId !== undefined) data.branchId = d.branchId || null;
    if (d.amount !== undefined) data.amount = BigInt(Math.round(d.amount));
    // Дт ≠ Кт всегда сравнивается по ИТОГОВЫМ значениям: частичный PATCH
    // одного поля (debit="9010" при credit="9010") тоже должен быть отклонён.
    if (data.debit !== undefined || data.credit !== undefined) {
      const cur = await db.posting.findUnique({ where: { id: req.params.id } });
      if (!cur) return res.status(404).json({ error: "Проводка не найдена" });
      const nd = data.debit ?? cur.debit;
      const nc = data.credit ?? cur.credit;
      if (nd === nc)
        return res
          .status(400)
          .json({ error: "Дебет и кредит должны различаться" });
    }
    const updated = await db.posting
      .update({ where: { id: req.params.id }, data })
      .catch(() => null);
    if (!updated) return res.status(404).json({ error: "Проводка не найдена" });
    await db.auditLog
      .create({
        data: {
          userId: req.user.uid,
          event: "posting_update",
          detail: `Изменена проводка ${updated.debit}/${updated.credit} на ${updated.amount} (${updated.date})`,
          ip: req.ip,
        },
      })
      .catch(() => {});
    res.json(serP(updated));
  })
);

r.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const deleted = await db.posting
      .delete({ where: { id: req.params.id } })
      .catch(() => null);
    if (!deleted) return res.status(404).json({ error: "Проводка не найдена" });
    await db.auditLog
      .create({
        data: {
          userId: req.user.uid,
          event: "posting_delete",
          detail: `Удалена проводка ${deleted.debit}/${deleted.credit} на ${deleted.amount} (${deleted.date})`,
          ip: req.ip,
        },
      })
      .catch(() => {});
    res.json({ ok: true });
  })
);

// ── Оборотно-сальдовая ведомость (ОСВ) ──────────────────────────────────────
// По каждому счёту: обороты за период (Дт/Кт) и конечное сальдо (нарастающим
// итогом до даты «to»). Сальдо считаем как Дт−Кт по всем проводкам ≤ to;
// знак интерпретируется по типу счёта на фронте.
r.get(
  "/trial-balance",
  asyncHandler(async (req, res) => {
    await ensureAutoPosted().catch(() => {});
    await ensureSeeded();
    const { from, to, branch } = req.query;
    const where = {};
    if (to) where.date = { lte: String(to) };
    if (branch) where.branchId = String(branch);
    const [accounts, postings] = await Promise.all([
      db.ledgerAccount.findMany({ orderBy: { code: "asc" } }),
      // Ограничение выдачи — защита от загрузки всей книги проводок в память.
      db.posting.findMany({ where, orderBy: { date: "desc" }, take: 100000 }),
    ]);
    const nameByCode = {};
    const kindByCode = {};
    for (const a of accounts) {
      nameByCode[a.code] = a.name;
      kindByCode[a.code] = a.kind;
    }
    // Аккумулируем: обороты за период [from,to] и сальдо (все ≤ to).
    const acc = {};
    const ensure = (code) => {
      if (!acc[code])
        acc[code] = {
          code,
          name: nameByCode[code] || "",
          kind: kindByCode[code] || "active",
          debitTurn: 0,
          creditTurn: 0,
          debitTotal: 0,
          creditTotal: 0,
        };
      return acc[code];
    };
    const inPeriod = (d) =>
      (!from || d >= String(from)) && (!to || d <= String(to));
    for (const p of postings) {
      const a = n(p.amount);
      const dr = ensure(p.debit);
      const cr = ensure(p.credit);
      dr.debitTotal += a;
      cr.creditTotal += a;
      if (inPeriod(p.date)) {
        dr.debitTurn += a;
        cr.creditTurn += a;
      }
    }
    const rows = Object.values(acc)
      .map((x) => ({
        ...x,
        balance: x.debitTotal - x.creditTotal, // >0 — дебетовое, <0 — кредитовое
      }))
      .sort((x, y) =>
        x.code.localeCompare(y.code, undefined, { numeric: true })
      );
    const totals = rows.reduce(
      (s, x) => ({
        debitTurn: s.debitTurn + x.debitTurn,
        creditTurn: s.creditTurn + x.creditTurn,
      }),
      { debitTurn: 0, creditTurn: 0 }
    );
    res.json({ rows, totals });
  })
);

export default r;
