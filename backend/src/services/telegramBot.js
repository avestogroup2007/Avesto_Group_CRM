// Интерактивный Telegram-бот чек-листов для линейного персонала (уборщицы и
// т.п.). Работает в ЛИЧНОМ чате: сотрудник, чей Telegram HR заранее привязал к
// филиалу, проходит чек-листы кнопками и присылает фото. Итог сохраняется в БД
// (ShiftChecklistRun) и сводкой уходит в тему «Чек-лист» общей группы.
//
// Приём обновлений — через вебхук (routes/telegram.js → handleUpdate). Токен и
// секрет вебхука задаются ТОЛЬКО в окружении хостинга.
import bcrypt from "bcrypt";
import { env } from "../env.js";
import { db } from "../db.js";
import { log } from "../logger.js";
import { sendTelegram, topicFor, esc } from "./telegram.js";
import {
  verifyIikoCredentials,
  iikoConfigured,
  salesReport,
  riskyReport,
} from "./iikoServer.js";
import { cached } from "./cache.js";

const API = "https://api.telegram.org";

// ── Конфигурация филиалов (зеркало фронтенда) ───────────────────────────────
const BRANCHES = [
  { id: 1, name: "Avesto Cafe — Микрорайон" },
  { id: 2, name: "Avesto Cafe — Узбекистанская" },
  { id: 3, name: "Avesto Sweets — Аэропорт" },
  { id: 4, name: "Avesto Sweets — Наврузий цех" },
  { id: 5, name: "Avesto Sweets — Наврузий Магазин" },
  { id: 6, name: "ICG — Кейтеринг (основной)" },
];
const PROD_BRANCH_IDS = new Set([4, 6]);
const branchName = (id) =>
  (BRANCHES.find((b) => b.id === Number(id)) || {}).name || "—";
const branchHours = (id) =>
  PROD_BRANCH_IDS.has(Number(id)) ? { from: 7, to: 16 } : { from: 8, to: 20 };
const hourSlots = (id) => {
  const { from, to } = branchHours(id);
  const out = [];
  for (let h = from; h <= to; h++) out.push(`${String(h).padStart(2, "0")}:00`);
  return out;
};

// ── Шаблоны чек-листов (зеркало фронтенда) ──────────────────────────────────
const SANITARY_ITEMS = [
  { text: "Унитаз очищен", needPhoto: true },
  { text: "Раковина вымыта", needPhoto: true },
  { text: "Пол вымыт", needPhoto: false },
  { text: "Туалетная бумага заправлена", needPhoto: true },
  { text: "Мыло заправлено", needPhoto: false },
  { text: "Средство/химия для мытья рук на месте", needPhoto: false },
  { text: "Бумага для сушки рук на месте", needPhoto: false },
];
const OPEN_ITEMS = [
  { text: "Оборудование включено", needPhoto: false },
  { text: "Температура холодильников в норме", needPhoto: false },
  { text: "Зал и столы чистые", needPhoto: true },
  { text: "Санузел проверен и убран", needPhoto: true },
  { text: "Кассовый размен на месте", needPhoto: false },
];
const CLOSE_ITEMS = [
  { text: "Уборка зала и кухни", needPhoto: true },
  { text: "Санузел убран", needPhoto: true },
  { text: "Касса сверена", needPhoto: false },
  { text: "Оборудование выключено", needPhoto: false },
  { text: "Мусор вынесен", needPhoto: false },
  { text: "Точка закрыта, сигнализация включена", needPhoto: false },
];
const CHECKLIST_DEFS = {
  sanitary: { label: "Санитарный обход", hourly: true, items: SANITARY_ITEMS },
  open: { label: "Открытие смены", hourly: false, items: OPEN_ITEMS },
  close: { label: "Закрытие смены", hourly: false, items: CLOSE_ITEMS },
};

// ── Время (Asia/Tashkent) ───────────────────────────────────────────────────
const ymdTashkent = () => {
  // en-CA даёт YYYY-MM-DD
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tashkent" });
};
// Дата N дней назад по Ташкенту (для «вчера», «7 дней»).
const ymdTashkentShift = (daysBack) =>
  new Date(Date.now() - daysBack * 86400000).toLocaleDateString("en-CA", {
    timeZone: "Asia/Tashkent",
  });
const hourTashkent = () =>
  Number(
    new Date().toLocaleString("en-GB", {
      timeZone: "Asia/Tashkent",
      hour: "2-digit",
      hour12: false,
    })
  );

// ── Низкоуровневые вызовы Telegram ──────────────────────────────────────────
// Управленческие роли: после входа им показывается меню сводок (чек-листы по
// всем филиалам, выручка дня), а не персональные чек-листы уборщицы.
const OFFICE_ROLES = new Set([
  "director",
  "finance",
  "accountant",
  "sysadmin",
  "manager",
]);
const ROLE_LABEL = {
  director: "Руководство",
  finance: "Финансист",
  manager: "Управляющий",
  accountant: "Бухгалтер",
  sysadmin: "Сист. администратор",
  staff: "Сотрудник",
};

export function botConfigured() {
  return Boolean(env.TELEGRAM_BOT_TOKEN);
}
async function tg(method, payload) {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, skipped: true };
  try {
    const res = await fetch(`${API}/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return await res.json().catch(() => ({ ok: false }));
  } catch (e) {
    log.warn({ err: e.message, method }, "telegram bot api error");
    return { ok: false, error: e.message };
  }
}
const sendMsg = (chatId, text, keyboard) =>
  tg("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
  });
const editMsg = (chatId, msgId, text, keyboard) =>
  tg("editMessageText", {
    chat_id: chatId,
    message_id: msgId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
  });
const answerCb = (id, text) =>
  tg("answerCallbackQuery", {
    callback_query_id: id,
    ...(text ? { text } : {}),
  });
const deleteMsg = (chatId, msgId) =>
  tg("deleteMessage", { chat_id: chatId, message_id: msgId });

// ── Сессия диалога (черновик чек-листа) ─────────────────────────────────────
async function getSession(tid) {
  const row = await db.botSession
    .findUnique({ where: { telegramId: String(tid) } })
    .catch(() => null);
  return row ? row.state : null;
}
async function setSession(tid, state) {
  const data = { state };
  await db.botSession
    .upsert({
      where: { telegramId: String(tid) },
      create: { telegramId: String(tid), state },
      update: data,
    })
    .catch((e) => log.warn({ err: e.message }, "botSession upsert"));
}
async function clearSession(tid) {
  await db.botSession
    .delete({ where: { telegramId: String(tid) } })
    .catch(() => {});
}

// Привязанный сотрудник по Telegram id.
async function linkedUser(tid) {
  return db.user
    .findUnique({ where: { telegramId: String(tid) } })
    .catch(() => null);
}

// Самостоятельный вход в бота: сотрудник вводит свой логин и пароль (как в
// приложении). Проверка та же, что при веб-входе: живой пароль iiko (SSO), при
// сбое — локальный bcrypt. Пускаем сотрудников из iiko и bootstrap-админа.
async function botAuthenticate(login, password) {
  const user = await db.user
    .findFirst({
      where: { active: true, OR: [{ login }, { name: login }] },
    })
    .catch(() => null);
  if (!user) return null;
  let ok = false;
  if (user.source === "iiko" && user.login) {
    ok = await verifyIikoCredentials(user.login, password).catch(() => false);
    if (!ok && user.passwordHash)
      ok = await bcrypt.compare(password, user.passwordHash).catch(() => false);
  } else if (user.passwordHash) {
    ok = await bcrypt.compare(password, user.passwordHash).catch(() => false);
  }
  if (!ok) return null;
  const allowed =
    user.source === "iiko" || user.name === env.BOOTSTRAP_ADMIN_LOGIN;
  return allowed ? user : null;
}

// Клавиатура выбора филиала (после привязки, если он ещё не задан).
function branchPickView() {
  const rows = [];
  for (let i = 0; i < BRANCHES.length; i += 2) {
    rows.push(
      BRANCHES.slice(i, i + 2).map((b) => ({
        text: b.name,
        callback_data: `setbr|${b.id}`,
      }))
    );
  }
  return { text: "Выберите ваш филиал:", keyboard: rows };
}

// Начать самостоятельный вход (запросить логин).
async function beginAuth(chatId, from) {
  await setSession(from.id, { flow: "auth", step: "login" });
  await sendMsg(chatId, "🔐 <b>Вход</b>\nВведите ваш логин (как в CRM/iiko):");
}

// Шаг диалога входа: получаем логин, затем пароль; при успехе привязываем
// Telegram к учётной записи. Сообщение с паролем удаляем из чата.
async function authStep(chatId, from, session, msg) {
  const text = (msg.text || "").trim();
  if (session.step === "login") {
    if (!text || text.startsWith("/")) {
      await sendMsg(chatId, "Введите логин (как в CRM/iiko):");
      return;
    }
    await setSession(from.id, { flow: "auth", step: "password", login: text });
    await sendMsg(chatId, "Введите пароль:");
    return;
  }
  if (session.step === "password") {
    const password = text;
    // Пароль в чате не храним — удаляем сообщение (в личке бот это может).
    await deleteMsg(chatId, msg.message_id);
    const user = await botAuthenticate(session.login, password);
    if (!user) {
      await clearSession(from.id);
      await sendMsg(
        chatId,
        "❌ Неверный логин или пароль. Отправьте /start, чтобы попробовать снова."
      );
      return;
    }
    // Привязываем Telegram к сотруднику (один Telegram — один сотрудник).
    try {
      await db.user.update({
        where: { id: user.id },
        data: { telegramId: String(from.id) },
      });
    } catch (e) {
      await clearSession(from.id);
      if (e.code === "P2002") {
        await sendMsg(
          chatId,
          "Этот Telegram уже привязан к другому сотруднику. Обратитесь к администратору."
        );
      } else {
        await sendMsg(chatId, "Не удалось привязать. Попробуйте позже.");
      }
      return;
    }
    await clearSession(from.id);
    const linked = await linkedUser(from.id);
    await sendMsg(
      chatId,
      `✅ Вход выполнен: <b>${esc(linked.displayName || linked.login || "")}</b>` +
        (linked.position ? `\n${esc(linked.position)}` : "")
    );
    if (OFFICE_ROLES.has(linked.role)) {
      const mv = mgmtMenuView(linked);
      await sendMsg(chatId, mv.text, mv.keyboard);
    } else if (!linked.checklistBranch) {
      const bp = branchPickView();
      await sendMsg(chatId, bp.text, bp.keyboard);
    } else {
      const view = await menuView(linked);
      await sendMsg(chatId, view.text, view.keyboard);
    }
    return;
  }
  // Непонятное состояние — сброс.
  await clearSession(from.id);
  await sendMsg(chatId, "Отправьте /start, чтобы войти.");
}

// ── Рендер ──────────────────────────────────────────────────────────────────
function checklistView(state) {
  const def = CHECKLIST_DEFS[state.kind];
  const doneN = state.items.filter((it) => it.done).length;
  const title =
    def.label + (state.slot ? ` · ${state.slot}` : "") + ` — ${state.date}`;
  const text =
    `🧾 <b>${esc(title)}</b>\n${esc(branchName(state.branchId))}\n` +
    `Отмечено ${doneN}/${state.items.length}` +
    (state.awaitingPhoto != null
      ? `\n\n📷 Пришлите фото для пункта: <b>${esc(
          state.items[state.awaitingPhoto].text
        )}</b>`
      : "");
  const rows = state.items.map((it, i) => {
    const mark = it.done ? "✅" : it.needPhoto ? "📷" : "⬜";
    const cam = it.needPhoto ? (it.photoFileId ? " 📎" : "") : "";
    const action = it.needPhoto && !it.photoFileId ? `ph|${i}` : `tg|${i}`;
    return [{ text: `${mark} ${it.text}${cam}`, callback_data: action }];
  });
  rows.push([
    { text: "✅ Сдать", callback_data: "submit" },
    { text: "✖️ Отмена", callback_data: "cancel" },
  ]);
  return { text, keyboard: rows };
}

async function menuView(user) {
  const branchId = user.checklistBranch;
  const date = ymdTashkent();
  const hNow = hourTashkent();
  const runs = await db.shiftChecklistRun
    .findMany({ where: { branchId: String(branchId), date } })
    .catch(() => []);
  const doneKey = new Set(
    runs.filter((r) => r.pct >= 100).map((r) => `${r.kind}|${r.slot || "-"}`)
  );
  const slots = hourSlots(branchId);
  const text =
    `👋 <b>${esc(user.displayName || "Сотрудник")}</b>\n` +
    `Филиал: ${esc(branchName(branchId))}\n` +
    `Дата: ${date} · окно обхода ${String(branchHours(branchId).from).padStart(
      2,
      "0"
    )}:00–${String(branchHours(branchId).to).padStart(2, "0")}:00\n\n` +
    `Выберите час санитарного обхода или чек-лист смены:`;
  const slotBtns = slots.map((sl) => {
    const done = doneKey.has(`sanitary|${sl}`);
    const h = Number(sl.slice(0, 2));
    const mark = done ? "✅" : h < hNow ? "⏰" : h === hNow ? "🔵" : "";
    return {
      text: `${mark}${sl}`.trim(),
      callback_data: `pick|sanitary|${sl}`,
    };
  });
  const rows = [];
  for (let i = 0; i < slotBtns.length; i += 3)
    rows.push(slotBtns.slice(i, i + 3));
  rows.push([
    {
      text: `${doneKey.has("open|-") ? "✅ " : ""}Открытие смены`,
      callback_data: "pick|open|-",
    },
    {
      text: `${doneKey.has("close|-") ? "✅ " : ""}Закрытие смены`,
      callback_data: "pick|close|-",
    },
  ]);
  return { text, keyboard: rows };
}

// ── Управленческое меню (руководство/офис) ──────────────────────────────────
function mgmtMenuView(user) {
  const text =
    `\u{1F44B} <b>${esc(user.displayName || user.login || "Сотрудник")}</b>\n` +
    `Роль: ${esc(ROLE_LABEL[user.role] || user.role)}\n\n` +
    `Что показать?`;
  const keyboard = [
    [
      { text: "\u{1F4CB} Чек-листы сегодня", callback_data: "mgr|checks|t" },
      { text: "\u{1F4CB} Вчера", callback_data: "mgr|checks|y" },
    ],
    [
      { text: "\u{1F4B0} Выручка сегодня", callback_data: "mgr|sales|t" },
      { text: "\u{1F4B0} Вчера", callback_data: "mgr|sales|y" },
      { text: "\u{1F4B0} 7 дней", callback_data: "mgr|sales|w" },
    ],
    [{ text: "\u{1F6A8} Подозрительные операции", callback_data: "mgr|risky" }],
    [
      { text: "\u{1F4B5} Деньги", callback_data: "mgr|money" },
      { text: "\u{1F5C2} Задачи", callback_data: "mgr|tasks" },
    ],
    [{ text: "\u{1F4DD} Мои чек-листы", callback_data: "mgr|own" }],
  ];
  return { text, keyboard };
}

// Ряд «назад + обновить» для экранов сводок; refresh — колбэк текущего экрана.
function mgmtBack(refresh) {
  return [
    [
      { text: "\u2039 Меню", callback_data: "mgr|menu" },
      { text: "\u{1F504} Обновить", callback_data: refresh },
    ],
  ];
}

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const money = (n) => Math.round(num(n)).toLocaleString("ru-RU") + " сум";

// Сводка чек-листов по всем филиалам за день: сколько часов санитарного
// обхода сдано (за сегодня — к текущему часу), сданы ли открытие/закрытие.
async function mgmtChecksView(day = "t") {
  const isToday = day !== "y";
  const date = isToday ? ymdTashkent() : ymdTashkentShift(1);
  const hNow = isToday ? hourTashkent() : 24; // за вчера ждём полное окно
  const runs = await db.shiftChecklistRun
    .findMany({ where: { date } })
    .catch(() => []);
  const done = new Set(
    runs
      .filter((r) => r.pct >= 100)
      .map((r) => `${r.branchId}|${r.kind}|${r.slot || "-"}`)
  );
  const lines = BRANCHES.map((b) => {
    const { from, to } = branchHours(b.id);
    const lastExpected = Math.min(hNow, to);
    const expected = Math.max(0, lastExpected - from + 1);
    let sanDone = 0;
    for (let h = from; h <= lastExpected; h++) {
      const slot = `${String(h).padStart(2, "0")}:00`;
      if (done.has(`${b.id}|sanitary|${slot}`)) sanDone += 1;
    }
    const open = done.has(`${b.id}|open|-`) ? "\u2705" : "—";
    const close = done.has(`${b.id}|close|-`) ? "\u2705" : "—";
    const san =
      expected > 0 ? `${sanDone}/${expected}` : "окно ещё не началось";
    const flag = expected > 0 && sanDone < expected ? " \u26A0\uFE0F" : "";
    return (
      `<b>${esc(b.name)}</b>\n` +
      `  обход: ${san}${flag} · открытие: ${open} · закрытие: ${close}`
    );
  });
  const text =
    `\u{1F4CB} <b>Чек-листы за ${date}</b>\n` +
    (isToday
      ? `Санитарный обход — сдано/ожидается к текущему часу.\n\n`
      : `Санитарный обход — сдано за полный день.\n\n`) +
    lines.join("\n");
  return { text, keyboard: mgmtBack(`mgr|checks|${day}`) };
}

// Периоды выручки: t — сегодня, y — вчера, w — последние 7 дней.
function salesPeriod(p) {
  const today = ymdTashkent();
  if (p === "y") {
    const d = ymdTashkentShift(1);
    return { from: d, to: d, label: `вчера (${d})` };
  }
  if (p === "w") {
    const d = ymdTashkentShift(6);
    return { from: d, to: today, label: `7 дней (${d} — ${today})` };
  }
  return { from: today, to: today, label: `сегодня (${today})` };
}

// Выручка из iiko. Кэш общий с веб-аналитикой: закрытые дни — 6 часов,
// период с «сегодня» — 3 минуты.
async function mgmtSalesView(period = "t") {
  const { from, to, label } = salesPeriod(period);
  const back = mgmtBack(`mgr|sales|${period}`);
  if (!iikoConfigured()) {
    return { text: "iiko не настроен — выручка недоступна.", keyboard: back };
  }
  const ttl = to === ymdTashkent() ? 3 * 60 * 1000 : 6 * 60 * 60 * 1000;
  try {
    const rep = await cached(`olap:${from}:${to}:all`, ttl, () =>
      salesReport({ from, to })
    );
    const byDept = {};
    let total = 0;
    let checks = 0;
    for (const r of rep.byDay || []) {
      const dep = String(r["Department"] || "—").trim() || "—";
      const sum = num(r["DishDiscountSumInt"]);
      byDept[dep] = (byDept[dep] || 0) + sum;
      total += sum;
      checks += num(r["UniqOrderId"]);
    }
    const lines = Object.entries(byDept)
      .sort((a, z) => z[1] - a[1])
      .map(([d, sum]) => `${esc(d)}: <b>${money(sum)}</b>`);
    const avg = checks > 0 ? total / checks : 0;
    const text =
      `\u{1F4B0} <b>Выручка за ${esc(label)}</b>\n\n` +
      `Итого: <b>${money(total)}</b>\n` +
      `Чеков: ${checks} · средний чек: ${money(avg)}\n\n` +
      (lines.length ? lines.join("\n") : "Продаж нет.");
    return { text, keyboard: back };
  } catch (e) {
    return {
      text: `Не удалось получить выручку из iiko: ${esc(e.message || "ошибка")}`,
      keyboard: back,
    };
  }
}

// Подозрительные операции за сегодня: удаления/сторно заказов и крупные
// скидки по сотрудникам (данные iiko, порог скидки 30 %).
async function mgmtRiskyView() {
  const date = ymdTashkent();
  const back = mgmtBack("mgr|risky");
  if (!iikoConfigured()) {
    return { text: "iiko не настроен — отчёт недоступен.", keyboard: back };
  }
  try {
    const rep = await cached(
      `risky:${date}:${date}:all:def`,
      3 * 60 * 1000,
      () => riskyReport({ from: date, to: date })
    );
    const t = rep.totals || {};
    const parts = [
      `\u{1F6A8} <b>Подозрительные операции за ${date}</b>\n`,
      `Удалений/сторно: <b>${num(t.delCount)}</b> на <b>${money(t.delSum)}</b>`,
      `Скидок всего: <b>${money(t.discountSum)}</b> · с флагом \u26A0\uFE0F: ${num(t.flagged)}`,
    ];
    const dels = (rep.deletions || []).slice(0, 5);
    if (dels.length) {
      parts.push(`\n<b>Удаления по сотрудникам:</b>`);
      for (const d of dels)
        parts.push(`• ${esc(d.name)}: ${d.count} шт на ${money(d.sum)}`);
    }
    const flagged = (rep.discounts || [])
      .filter((x) => x.flagged)
      .sort((a, z) => z.discount - a.discount)
      .slice(0, 5);
    if (flagged.length) {
      parts.push(`\n<b>Крупные скидки (\u2265 30 % оборота):</b>`);
      for (const d of flagged)
        parts.push(
          `• ${esc(d.name)}: скидка ${money(d.discount)} (${Math.round(
            d.share * 100
          )} %)`
        );
    }
    if (!dels.length && !flagged.length)
      parts.push(`\nНарушений не замечено \u2705`);
    return { text: parts.join("\n"), keyboard: back };
  } catch (e) {
    return {
      text: `Не удалось получить отчёт из iiko: ${esc(e.message || "ошибка")}`,
      keyboard: back,
    };
  }
}

// Деньги (данные CRM): баланс по согласованным операциям, приход/расход за
// сегодня и сколько заявок ждёт согласования.
async function mgmtMoneyView() {
  const back = mgmtBack("mgr|money");
  const date = ymdTashkent();
  try {
    const sum = (where) =>
      db.moneyTx
        .aggregate({ _sum: { amountUzs: true }, where })
        .then((r) => num(r._sum.amountUzs));
    const [incAll, expAll, incDay, expDay, pendCnt, pendSum] =
      await Promise.all([
        sum({ approval: "approved", direction: "income" }),
        sum({ approval: "approved", direction: "expense" }),
        sum({ approval: "approved", direction: "income", date }),
        sum({ approval: "approved", direction: "expense", date }),
        db.moneyTx.count({ where: { approval: "pending" } }),
        sum({ approval: "pending" }),
      ]);
    const text =
      `\u{1F4B5} <b>Деньги</b> (по данным CRM)\n\n` +
      `Баланс: <b>${money(incAll - expAll)}</b>\n\n` +
      `Сегодня (${date}):\n` +
      `  приход: <b>${money(incDay)}</b>\n` +
      `  расход: <b>${money(expDay)}</b>\n\n` +
      `На согласовании: <b>${pendCnt}</b> заявок на <b>${money(pendSum)}</b>`;
    return { text, keyboard: back };
  } catch (e) {
    return {
      text: `Не удалось получить данные: ${esc(e.message || "ошибка")}`,
      keyboard: back,
    };
  }
}

// Задачи (данные CRM): активные по фазам, просроченные SLA, новые за сегодня.
async function mgmtTasksView() {
  const back = mgmtBack("mgr|tasks");
  try {
    const now = new Date();
    const dayStart = new Date(`${ymdTashkent()}T00:00:00+05:00`);
    const [byPhase, overdue, createdToday] = await Promise.all([
      db.task.groupBy({ by: ["phase"], _count: { _all: true } }),
      db.task.count({
        where: { phase: { lt: 5 }, slaDeadline: { lt: now } },
      }),
      db.task.count({ where: { createdAt: { gte: dayStart } } }),
    ]);
    const cnt = {};
    let active = 0;
    for (const row of byPhase) {
      cnt[row.phase] = row._count._all;
      if (row.phase < 5) active += row._count._all;
    }
    const PH = [
      "Отправлено",
      "Просмотрено",
      "В работе",
      "На проверке",
      "Завершено",
    ];
    const lines = PH.map(
      (nm, i) => `  ${i + 1}. ${nm}: <b>${cnt[i + 1] || 0}</b>`
    );
    const text =
      `\u{1F5C2} <b>Задачи</b>\n\n` +
      `Активных: <b>${active}</b> · просрочено SLA: <b>${overdue}</b>` +
      (overdue > 0 ? " \u26A0\uFE0F" : "") +
      `\nНовых за сегодня: <b>${createdToday}</b>\n\n` +
      lines.join("\n");
    return { text, keyboard: back };
  } catch (e) {
    return {
      text: `Не удалось получить данные: ${esc(e.message || "ошибка")}`,
      keyboard: back,
    };
  }
}

function freshItems(kind) {
  return CHECKLIST_DEFS[kind].items.map((it) => ({
    text: it.text,
    needPhoto: it.needPhoto,
    done: false,
    photoFileId: null,
  }));
}

// ── Обработчики ──────────────────────────────────────────────────────────────
async function onStart(chatId, from, user) {
  if (!user) {
    // Не привязан — запускаем самостоятельный вход по логину/паролю.
    await beginAuth(chatId, from);
    return;
  }
  await clearSession(from.id);
  // Руководству/офису — сводки; линейному персоналу — чек-листы.
  if (OFFICE_ROLES.has(user.role)) {
    const mv = mgmtMenuView(user);
    await sendMsg(chatId, mv.text, mv.keyboard);
    return;
  }
  if (!user.checklistBranch) {
    const bp = branchPickView();
    await sendMsg(chatId, bp.text, bp.keyboard);
    return;
  }
  const view = await menuView(user);
  await sendMsg(chatId, view.text, view.keyboard);
}

async function openChecklist(chatId, msgId, from, user, kind, slotRaw) {
  const slot = slotRaw === "-" ? null : slotRaw;
  // Восстановим ранее сохранённые отметки за сегодня (если уже начинали).
  const date = ymdTashkent();
  const prev = await db.shiftChecklistRun
    .findFirst({
      where: {
        branchId: String(user.checklistBranch),
        kind,
        date,
        slot: slot || null,
      },
      orderBy: { createdAt: "desc" },
    })
    .catch(() => null);
  const base = freshItems(kind);
  if (prev && Array.isArray(prev.items)) {
    prev.items.forEach((p, i) => {
      if (base[i]) {
        base[i].done = !!p.done;
        base[i].photoFileId = p.photoFileId || null;
      }
    });
  }
  const state = {
    kind,
    slot,
    branchId: user.checklistBranch,
    items: base,
    awaitingPhoto: null,
    chatId,
    msgId,
  };
  await setSession(from.id, state);
  const view = checklistView(state);
  await editMsg(chatId, msgId, view.text, view.keyboard);
}

async function onCallback(cbq) {
  const from = cbq.from;
  const chatId = cbq.message?.chat?.id;
  const msgId = cbq.message?.message_id;
  const data = String(cbq.data || "");
  const user = await linkedUser(from.id);
  if (!user) {
    await answerCb(cbq.id, "Telegram не привязан. Отправьте /start.");
    return;
  }
  const parts = data.split("|");
  const cmd = parts[0];

  // Управленческое меню (только офисные роли).
  if (cmd === "mgr") {
    if (!OFFICE_ROLES.has(user.role)) {
      await answerCb(cbq.id, "Недоступно для вашей роли");
      return;
    }
    const action = parts[1];
    const param = parts[2];
    if (action === "menu") {
      const mv = mgmtMenuView(user);
      await editMsg(chatId, msgId, mv.text, mv.keyboard);
    } else if (action === "checks") {
      const cv = await mgmtChecksView(param || "t");
      await editMsg(chatId, msgId, cv.text, cv.keyboard);
    } else if (action === "sales") {
      // Ответ на колбэк сразу — OLAP может занять пару секунд.
      await answerCb(cbq.id, "Загружаю…");
      const sv = await mgmtSalesView(param || "t");
      await editMsg(chatId, msgId, sv.text, sv.keyboard);
      return;
    } else if (action === "risky") {
      await answerCb(cbq.id, "Загружаю…");
      const rv = await mgmtRiskyView();
      await editMsg(chatId, msgId, rv.text, rv.keyboard);
      return;
    } else if (action === "money") {
      const mv = await mgmtMoneyView();
      await editMsg(chatId, msgId, mv.text, mv.keyboard);
    } else if (action === "tasks") {
      const tv = await mgmtTasksView();
      await editMsg(chatId, msgId, tv.text, tv.keyboard);
    } else if (action === "own") {
      // Руководителю тоже можно проходить чек-листы (например, управляющему).
      if (!user.checklistBranch) {
        const bp = branchPickView();
        await editMsg(chatId, msgId, bp.text, bp.keyboard);
      } else {
        const view = await menuView(user);
        await editMsg(chatId, msgId, view.text, view.keyboard);
      }
    }
    await answerCb(cbq.id);
    return;
  }

  if (cmd === "setbr") {
    // Выбор филиала после привязки.
    const bid = parts[1];
    const updated = await db.user
      .update({ where: { id: user.id }, data: { checklistBranch: bid } })
      .catch(() => null);
    const view = await menuView(updated || { ...user, checklistBranch: bid });
    await editMsg(chatId, msgId, view.text, view.keyboard);
    await answerCb(cbq.id, "Филиал сохранён");
    return;
  }
  if (cmd === "pick") {
    await openChecklist(chatId, msgId, from, user, parts[1], parts[2]);
    await answerCb(cbq.id);
    return;
  }
  const state = await getSession(from.id);
  if (!state) {
    await answerCb(cbq.id, "Сессия истекла, отправьте /start.");
    return;
  }
  if (cmd === "cancel") {
    await clearSession(from.id);
    const view = OFFICE_ROLES.has(user.role)
      ? mgmtMenuView(user)
      : await menuView(user);
    await editMsg(chatId, msgId, view.text, view.keyboard);
    await answerCb(cbq.id, "Отменено");
    return;
  }
  if (cmd === "tg") {
    const i = Number(parts[1]);
    const it = state.items[i];
    if (it) it.done = !it.done;
    state.awaitingPhoto = null;
    await setSession(from.id, state);
    const view = checklistView(state);
    await editMsg(chatId, msgId, view.text, view.keyboard);
    await answerCb(cbq.id);
    return;
  }
  if (cmd === "ph") {
    const i = Number(parts[1]);
    state.awaitingPhoto = i;
    state.msgId = msgId;
    state.chatId = chatId;
    await setSession(from.id, state);
    const view = checklistView(state);
    await editMsg(chatId, msgId, view.text, view.keyboard);
    await answerCb(cbq.id, "Пришлите фото для этого пункта");
    return;
  }
  if (cmd === "submit") {
    await submitChecklist(chatId, msgId, from, user, state);
    await answerCb(cbq.id);
    return;
  }
  await answerCb(cbq.id);
}

async function onPhoto(chatId, from, photos) {
  const user = await linkedUser(from.id);
  if (!user) return;
  const state = await getSession(from.id);
  if (!state || state.awaitingPhoto == null) {
    await sendMsg(
      chatId,
      "Сначала выберите пункт с 📷 в чек-листе, затем пришлите фото."
    );
    return;
  }
  const best = photos[photos.length - 1]; // наибольшее разрешение
  const i = state.awaitingPhoto;
  if (state.items[i]) {
    state.items[i].photoFileId = best.file_id;
    state.items[i].done = true;
  }
  state.awaitingPhoto = null;
  await setSession(from.id, state);
  const view = checklistView(state);
  // Перерисовываем прежнее сообщение чек-листа и подтверждаем приём.
  if (state.chatId && state.msgId)
    await editMsg(state.chatId, state.msgId, view.text, view.keyboard);
  await sendMsg(chatId, "📷 Фото принято.");
}

async function submitChecklist(chatId, msgId, from, user, state) {
  const badPhoto = state.items.some(
    (it) => it.done && it.needPhoto && !it.photoFileId
  );
  if (badPhoto) {
    await sendMsg(
      chatId,
      "⚠️ К отмеченным пунктам с 📷 нужно приложить фото. Нажмите на такой пункт и пришлите фото."
    );
    return;
  }
  const total = state.items.length;
  const doneN = state.items.filter((it) => it.done).length;
  if (doneN === 0) {
    await sendMsg(chatId, "Отметьте хотя бы один пункт.");
    return;
  }
  const pct = Math.round((doneN / total) * 100);
  const date = ymdTashkent();
  await db.shiftChecklistRun
    .create({
      data: {
        branchId: String(state.branchId),
        kind: state.kind,
        date,
        slot: state.slot || null,
        items: state.items,
        pct,
        userId: user.id,
        via: "bot",
      },
    })
    .catch((e) => log.warn({ err: e.message }, "checklist run create"));
  await clearSession(from.id);

  const def = CHECKLIST_DEFS[state.kind];
  const label = def.label + (state.slot ? ` · ${state.slot}` : "");
  const summary =
    `🧾 <b>${esc(label)}</b>\n${esc(branchName(state.branchId))} · ${date}\n` +
    `Сотрудник: ${esc(user.displayName || user.login || "—")}\n` +
    `Выполнено ${pct}% (${doneN}/${total})`;
  // Сводка в тему «Чек-лист» общей группы.
  await sendTelegram(summary, undefined, topicFor("checklist"));
  // Фото-подтверждения — в ту же тему (до 6 штук).
  const thread = topicFor("checklist");
  const chat = env.TELEGRAM_CHAT_ID;
  if (chat) {
    const photoItems = state.items.filter((it) => it.photoFileId).slice(0, 6);
    for (const it of photoItems) {
      await tg("sendPhoto", {
        chat_id: chat,
        photo: it.photoFileId,
        caption: `${esc(it.text)} — ${esc(branchName(state.branchId))}`,
        parse_mode: "HTML",
        ...(thread ? { message_thread_id: Number(thread) } : {}),
      });
    }
  }
  await editMsg(
    chatId,
    msgId,
    `✅ Чек-лист сдан: <b>${esc(label)}</b>\nВыполнено ${pct}% (${doneN}/${total}).\nСпасибо!`
  );
  // Показать меню снова следующим сообщением.
  const view = await menuView(user);
  await sendMsg(chatId, view.text, view.keyboard);
}

// Точка входа: разбирает одно обновление вебхука.
export async function handleUpdate(update) {
  try {
    if (update.callback_query) {
      await onCallback(update.callback_query);
      return;
    }
    const msg = update.message;
    if (!msg) return;
    const chatId = msg.chat?.id;
    const from = msg.from || {};
    // В боте работаем только в личных чатах.
    if (msg.chat?.type !== "private") return;
    const text = (msg.text || "").trim();
    const user = await linkedUser(from.id);

    // /start и /menu доступны всегда (в т.ч. начинают вход, если не привязан).
    if (text === "/start" || text === "/menu") {
      await onStart(chatId, from, user);
      return;
    }

    // Не привязан — ведём диалог входа (логин → пароль).
    if (!user) {
      const session = await getSession(from.id);
      if (session && session.flow === "auth") {
        await authStep(chatId, from, session, msg);
        return;
      }
      await sendMsg(
        chatId,
        "Отправьте /start, чтобы войти по вашему логину и паролю."
      );
      return;
    }

    // Привязан — обычная работа.
    if (Array.isArray(msg.photo) && msg.photo.length) {
      await onPhoto(chatId, from, msg.photo);
      return;
    }
    if (text === "/id") {
      await sendMsg(chatId, `Ваш Telegram ID: <b>${from.id}</b>`);
      return;
    }
    // Прочее — подсказка.
    await sendMsg(chatId, "Отправьте /start, чтобы открыть чек-листы смены.");
  } catch (e) {
    log.warn({ err: e.message }, "handleUpdate failed");
  }
}

// Регистрация/снятие вебхука (для админского эндпоинта).
export async function setWebhook(url, secret) {
  return tg("setWebhook", {
    url,
    secret_token: secret,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
  });
}
export async function deleteWebhook() {
  return tg("deleteWebhook", { drop_pending_updates: false });
}
export async function webhookInfo() {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false };
  try {
    const res = await fetch(`${API}/bot${token}/getWebhookInfo`);
    return await res.json().catch(() => ({ ok: false }));
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// Экспорт для тестов.
export const _internals = {
  checklistView,
  freshItems,
  mgmtMenuView,
  mgmtChecksView,
  mgmtMoneyView,
  mgmtTasksView,
  salesPeriod,
  OFFICE_ROLES,
  hourSlots,
  branchHours,
  branchName,
  CHECKLIST_DEFS,
};
