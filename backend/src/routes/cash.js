// Кассовые отчёты филиалов: сдача ежедневного отчёта (upsert по филиал+дата),
// подтверждение офисом и выборка за период. Раньше отчёты жили только в
// браузере кассира (localStorage) — теперь сервер хранит их централизованно:
// их видят офис, Telegram-бот и отчёты по филиалам.
import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { asyncHandler } from "../util/asyncHandler.js";
import { forcedBranch, FINANCE_FREE } from "../util/branchScope.js";
import { sendTelegram, esc, topicFor } from "../services/telegram.js";

const r = Router();
r.use(requireAuth);

// Виды оплат, из которых складывается заявленная выручка дня (без expenses/iiko).
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
// Порог расхождения, ниже которого не шумим (округления при вводе).
const DISCREPANCY_TOLERANCE = 1000;

// Чистый расчёт расхождения кассы с iiko (для алерта и тестов). diff<0 —
// недостача, diff>0 — излишек. alert=true, если iiko внесён и расхождение выше
// порога.
export function cashDiscrepancy(report) {
  const iiko = Number(report.iiko || 0);
  const declared = PAY_FIELDS.reduce((s, f) => s + Number(report[f] || 0), 0);
  const diff = declared - iiko;
  return {
    declared,
    iiko,
    diff,
    alert: iiko > 0 && Math.abs(diff) > DISCREPANCY_TOLERANCE,
  };
}

// Сверка кассы с iiko: при существенном расхождении шлём алерт в тему «Касса».
async function maybeAlertDiscrepancy(report) {
  const { declared, iiko, diff, alert } = cashDiscrepancy(report);
  if (!alert) return;
  const fmt = (v) => Number(v).toLocaleString("ru-RU");
  const shortage = diff < 0;
  await sendTelegram(
    `${shortage ? "🔴" : "🟡"} <b>Расхождение кассы</b>\n` +
      `${esc(report.branchName || report.branchId)} · ${report.date}\n` +
      `Заявлено: <b>${fmt(declared)}</b> · iiko: <b>${fmt(iiko)}</b>\n` +
      `${shortage ? "Недостача" : "Излишек"}: <b>${fmt(Math.abs(diff))} сум</b>`,
    undefined,
    topicFor("cash")
  );
}

// Верхняя граница — защита от мусорного ввода (в БД поля BigInt).
const int = z.coerce.number().int().min(0).max(9e15).default(0);

// BigInt из БД -> обычные числа в JSON (res.json не умеет BigInt).
const MONEY_FIELDS = [
  "fiscal",
  "nonFiscal",
  "humo",
  "uzcard",
  "click",
  "payme",
  "uzumTezkor",
  "yandex",
  "transfer",
  "expenses",
  "iiko",
];
function ser(r) {
  const out = { ...r };
  for (const k of MONEY_FIELDS) out[k] = Number(r[k] || 0);
  return out;
}
const ReportSchema = z.object({
  branchId: z.string().min(1),
  branchName: z.string().default(""),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fiscal: int,
  nonFiscal: int,
  humo: int,
  uzcard: int,
  click: int,
  payme: int,
  uzumTezkor: int,
  yandex: int,
  transfer: int,
  expenses: int,
  iiko: int,
  comment: z.string().max(1000).default(""),
});

// Сдать/обновить отчёт за день (кассир). Один отчёт на филиал в день —
// повторная сдача обновляет цифры, но не сбрасывает подтверждение офиса.
r.post(
  "/report",
  asyncHandler(async (req, res) => {
    const parsed = ReportSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Неверный формат отчёта" });
    }
    const { branchId: bodyBranch, date, ...rest } = parsed.data;
    // Привязанный к филиалу кассир сдаёт только по своему филиалу — иначе можно
    // перезаписать чужой отчёт. Старшие роли сдают по указанному в теле.
    const forced = forcedBranch(req.user);
    const branchId = forced || bodyBranch;
    // Подтверждённый офисом отчёт линейный персонал переписать не может —
    // иначе цифры можно менять задним числом, а подтверждение останется.
    const existing = await db.cashReport
      .findUnique({ where: { branchId_date: { branchId, date } } })
      .catch(() => null);
    const OFFICE = new Set(["director", "finance", "accountant", "sysadmin"]);
    if (
      existing &&
      existing.status === "confirmed" &&
      !OFFICE.has(req.user.role)
    ) {
      return res.status(409).json({
        error: "Отчёт уже подтверждён офисом — изменения только через офис",
      });
    }
    const doUpsert = () =>
      db.cashReport.upsert({
        where: { branchId_date: { branchId, date } },
        create: { branchId, date, ...rest, userId: req.user.uid },
        update: { ...rest, userId: req.user.uid },
      });
    // Одновременная сдача двумя кассирами: гонка create даёт P2002 — один
    // повтор превращает её в обычное обновление.
    const saved = await doUpsert().catch((e) => {
      if (e && e.code === "P2002") return doUpsert();
      throw e;
    });
    // Правка существующего отчёта — след в журнале безопасности.
    if (existing) {
      await db.auditLog
        .create({
          data: {
            userId: req.user.uid,
            event: "cash_report_update",
            detail: `Касса ${branchId} за ${date}: отчёт перезаписан (был статус ${existing.status})`,
            ip: req.ip,
          },
        })
        .catch(() => {});
    }

    // Авто-алерт расхождения кассы с iiko: если сумма по видам оплат не сходится
    // с выручкой iiko, система «кричит» о недостаче/излишке в Telegram (тема
    // «Касса»). Порог — 1000 сум, чтобы не шуметь на копеечных округлениях.
    await maybeAlertDiscrepancy(saved).catch(() => {});

    res.json(ser(saved));
  })
);

// Подтвердить отчёт (офис): фиксируем кто и когда.
r.post(
  "/report/confirm",
  requireRole("director", "finance", "accountant", "sysadmin"),
  asyncHandler(async (req, res) => {
    const { branchId, date } = req.body || {};
    if (!branchId || !/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) {
      return res.status(400).json({ error: "Нужны branchId и date" });
    }
    const updated = await db.cashReport
      .update({
        where: {
          branchId_date: { branchId: String(branchId), date: String(date) },
        },
        data: {
          status: "confirmed",
          confirmedAt: new Date(),
          confirmedBy: req.user.uid,
        },
      })
      .catch(() => null);
    if (!updated) return res.status(404).json({ error: "Отчёт не найден" });
    res.json(ser(updated));
  })
);

// Отчёты за период (офис и управляющие): ?from&to&branch.
r.get(
  "/reports",
  requireRole("director", "finance", "accountant", "sysadmin", "manager"),
  asyncHandler(async (req, res) => {
    const { from, to, branch } = req.query;
    const where = {};
    if (from || to) where.date = {};
    if (from) where.date.gte = String(from);
    if (to) where.date.lte = String(to);
    // Управляющий видит кассу только своего филиала; бухгалтер/офис — все.
    // failClosed: филиальная роль без назначенного филиала не видит ничего.
    const forced = forcedBranch(req.user, {
      alsoFree: FINANCE_FREE,
      failClosed: true,
    });
    const eff = forced || branch;
    if (eff) where.branchId = String(eff);
    const items = await db.cashReport.findMany({
      where,
      orderBy: [{ date: "desc" }, { branchId: "asc" }],
      take: 500,
    });
    res.json({ items: items.map(ser) });
  })
);

export default r;
