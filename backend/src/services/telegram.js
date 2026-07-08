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

// Отправить сообщение. best-effort: ошибки не пробрасываем наверх, чтобы сбой
// Telegram не ломал основную операцию (создание заявки, согласование и т.п.).
// chatId по умолчанию — из окружения; можно передать явный.
export async function sendTelegram(text, chatId) {
  const token = env.TELEGRAM_BOT_TOKEN;
  const chat = chatId || env.TELEGRAM_CHAT_ID;
  if (!token || !chat || !text) return { ok: false, skipped: true };
  try {
    const res = await fetch(`${API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chat,
        text: String(text).slice(0, 4000),
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
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

// Экранирование для HTML parse_mode.
export function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
