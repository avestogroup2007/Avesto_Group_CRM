// Интерактивный Telegram-бот чек-листов для линейного персонала (уборщицы и
// т.п.). Работает в ЛИЧНОМ чате: сотрудник, чей Telegram HR заранее привязал к
// филиалу, проходит чек-листы кнопками и присылает фото. Итог сохраняется в БД
// (ShiftChecklistRun) и сводкой уходит в тему «Чек-лист» общей группы.
//
// Приём обновлений — через вебхук (routes/telegram.js → handleUpdate). Токен и
// секрет вебхука задаются ТОЛЬКО в окружении хостинга.
import { env } from "../env.js";
import { db } from "../db.js";
import { log } from "../logger.js";
import { sendTelegram, topicFor, esc } from "./telegram.js";

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
const hourTashkent = () =>
  Number(
    new Date().toLocaleString("en-GB", {
      timeZone: "Asia/Tashkent",
      hour: "2-digit",
      hour12: false,
    })
  );

// ── Низкоуровневые вызовы Telegram ──────────────────────────────────────────
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

// Привязанный HR сотрудник по Telegram id.
async function linkedUser(tid) {
  return db.user
    .findUnique({ where: { telegramId: String(tid) } })
    .catch(() => null);
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
  await clearSession(from.id);
  if (!user) {
    const who = esc(
      [from.first_name, from.last_name].filter(Boolean).join(" ") ||
        from.username ||
        ""
    );
    await sendMsg(
      chatId,
      `👋 Здравствуйте${who ? ", " + who : ""}!\n\n` +
        `Ваш Telegram ещё не привязан к филиалу. Передайте в HR ваш ID:\n` +
        `<b>${from.id}</b>\n\n` +
        `После привязки снова отправьте /start.`
    );
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
    const view = await menuView(user);
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
    if (Array.isArray(msg.photo) && msg.photo.length) {
      await onPhoto(chatId, from, msg.photo);
      return;
    }
    const text = (msg.text || "").trim();
    const user = await linkedUser(from.id);
    if (text === "/start" || text === "/menu") {
      await onStart(chatId, from, user);
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
  hourSlots,
  branchHours,
  branchName,
  CHECKLIST_DEFS,
};
