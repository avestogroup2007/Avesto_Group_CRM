// Отправка уведомлений в Telegram. Токен бота и id чата задаются ТОЛЬКО в
// окружении хостинга (Render) и никогда не уходят клиенту. Если интеграция не
// настроена — sendTelegram молча ничего не делает, остальная система работает.
// Токен получают у @BotFather; chat_id — id личного чата или группы с ботом.
import { env } from "../env.js";
import { log } from "../logger.js";

const API = "https://api.telegram.org";

// Настроена ли интеграция (есть токен бота и id чата по умолчанию).
export function telegramConfigured() {
  return Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID);
}

// Тема (message_thread_id) для вида уведомления. Позволяет раскладывать разные
// уведомления по темам одной группы: расходы — в свою тему, задачи — в свою.
// Id темы берётся из окружения (не секрет), пусто = общая лента группы.
export function topicFor(kind) {
  if (kind === "expense") return env.TELEGRAM_TOPIC_EXPENSES || undefined;
  if (kind === "task") return env.TELEGRAM_TOPIC_TASKS || undefined;
  if (kind === "cash") return env.TELEGRAM_TOPIC_CASH || undefined;
  return undefined;
}

// Отправить сообщение. best-effort: ошибки не пробрасываем наверх, чтобы сбой
// Telegram не ломал основную операцию (создание заявки, согласование и т.п.).
// chatId по умолчанию — из окружения; threadId — тема супергруппы (topic).
export async function sendTelegram(text, chatId, threadId) {
  const token = env.TELEGRAM_BOT_TOKEN;
  const chat = chatId || env.TELEGRAM_CHAT_ID;
  if (!token || !chat || !text) return { ok: false, skipped: true };
  try {
    const payload = {
      chat_id: chat,
      text: String(text).slice(0, 4000),
      parse_mode: "HTML",
      disable_web_page_preview: true,
    };
    if (threadId) payload.message_thread_id = Number(threadId);
    const res = await fetch(`${API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      log.warn(
        { status: res.status, err: data.description },
        "telegram send failed"
      );
      return { ok: false, error: data.description || `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    log.warn({ err: e.message }, "telegram send error");
    return { ok: false, error: e.message };
  }
}

// Помощник подключения: проверяет токен (getMe) и находит чаты, где бот уже
// побывал (getUpdates) — чтобы администратор увидел chat_id общего
// операционного чата и вписал его в TELEGRAM_CHAT_ID. Возвращает только id,
// тип и название чата — тексты сообщений и токен наружу не отдаём.
export async function getBotInfo() {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return { tokenSet: false, configured: false };
  }
  const result = {
    tokenSet: true,
    configured: telegramConfigured(),
    currentChatId: env.TELEGRAM_CHAT_ID || "",
    bot: null,
    tokenValid: false,
    unreachable: false, // сетевой сбой (Telegram недоступен), не «неверный токен»
    chats: [],
    topics: [], // темы супергруппы (message_thread_id + название), если видны
    hint: "",
  };
  // getMe — в отдельном try: сетевой сбой (недоступен Telegram) НЕ равен
  // «неверный токен», иначе оператор зря пойдёт перевыпускать рабочий токен.
  let me;
  try {
    const meRes = await fetch(`${API}/bot${token}/getMe`);
    me = await meRes.json().catch(() => ({}));
    if (!me.ok || !me.result) {
      result.hint = me.description || `getMe HTTP ${meRes.status}`;
      return result;
    }
  } catch (e) {
    result.unreachable = true;
    result.hint = e.message || "Не удалось связаться с Telegram";
    return result;
  }
  result.tokenValid = true;
  result.bot = {
    id: me.result.id,
    username: me.result.username || "",
    name: me.result.first_name || "",
  };
  try {
    // allowed_updates явно включает my_chat_member/chat_member — событие
    // добавления/повышения бота в группе приходит боту даже при privacy mode и
    // сразу даёт chat_id группы (обычные сообщения группы privacy mode прячет).
    const allowed = encodeURIComponent(
      JSON.stringify([
        "message",
        "edited_message",
        "channel_post",
        "my_chat_member",
        "chat_member",
      ])
    );
    const upRes = await fetch(
      `${API}/bot${token}/getUpdates?limit=50&timeout=0&allowed_updates=${allowed}`
    );
    const up = await upRes.json().catch(() => ({}));
    if (up.ok && Array.isArray(up.result)) {
      const seen = new Map();
      const topics = new Map();
      for (const u of up.result) {
        const m =
          u.message ||
          u.edited_message ||
          u.channel_post ||
          u.my_chat_member ||
          u.chat_member;
        const chat = m && m.chat;
        if (chat && chat.id != null && !seen.has(chat.id)) {
          const title =
            chat.title ||
            [chat.first_name, chat.last_name].filter(Boolean).join(" ") ||
            (chat.username ? `@${chat.username}` : "") ||
            "";
          seen.set(chat.id, {
            id: String(chat.id),
            type: chat.type || "",
            title,
          });
        }
        // Темы супергруппы: сообщение в теме несёт message_thread_id; имя темы
        // приходит в служебном forum_topic_created (в этом же или другом апдейте).
        const msg = u.message || u.edited_message;
        const tid = msg && msg.message_thread_id;
        if (tid != null && msg.is_topic_message) {
          const prev = topics.get(tid) || { id: String(tid), name: "" };
          const created = msg.forum_topic_created;
          if (created && created.name) prev.name = created.name;
          topics.set(tid, prev);
        }
      }
      result.chats = [...seen.values()];
      result.topics = [...topics.values()];
      if (!result.chats.length) {
        result.hint =
          "Бот в группе есть, но пока не «увидел» её. В Telegram у ботов включён " +
          "privacy mode — обычные сообщения группы боту не приходят. Сделайте одно " +
          "из: 1) назначьте бота администратором группы; или 2) в группе напишите " +
          "@имя_бота или команду /start; или 3) в @BotFather → Bot Settings → Group " +
          "Privacy → Turn off. Затем напишите в группе сообщение и нажмите «Проверить бота».";
      }
    } else {
      // getUpdates не работает, если у бота установлен webhook (409).
      result.hint =
        up.description ||
        "Не удалось получить обновления (возможно, у бота задан webhook).";
    }
  } catch (e) {
    result.hint = e.message || "Ошибка связи с Telegram";
  }
  return result;
}

// Экранирование для HTML parse_mode.
export function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
