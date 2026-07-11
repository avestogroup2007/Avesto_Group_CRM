// Маршруты Telegram-уведомлений. Токен бота хранится ТОЛЬКО в окружении и
// клиенту не отдаётся. /status — настроена ли интеграция; /test — отправить
// проверочное сообщение; /notify — переслать уведомление (из автоматизации
// на фронте) в чат. Доступ — офисные роли.
import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { asyncHandler } from "../util/asyncHandler.js";
import {
  telegramConfigured,
  sendTelegram,
  getBotInfo,
  topicFor,
  esc,
} from "../services/telegram.js";
import {
  handleUpdate,
  setWebhook,
  deleteWebhook,
  webhookInfo,
  botConfigured,
} from "../services/telegramBot.js";
import { env } from "../env.js";
import { log } from "../logger.js";

const r = Router();
r.use(requireAuth);

// Настроена ли интеграция — фронт покажет статус.
r.get("/status", (req, res) => res.json({ configured: telegramConfigured() }));

// Помощник подключения: проверка токена (getMe) и поиск chat_id общего чата
// (getUpdates). Только офисные роли. Токен наружу не отдаётся.
r.get(
  "/info",
  requireRole("director", "finance", "accountant", "sysadmin", "manager"),
  asyncHandler(async (req, res) => {
    res.json(await getBotInfo());
  })
);

// Проверочное сообщение — только офисные роли.
r.post(
  "/test",
  requireRole("director", "finance", "accountant", "sysadmin"),
  asyncHandler(async (req, res) => {
    if (!telegramConfigured()) {
      return res.status(503).json({
        error: "Telegram не настроен (нет TELEGRAM_BOT_TOKEN/CHAT_ID)",
        configured: false,
      });
    }
    // Читаемое имя отправителя вместо технического id.
    const u = await db.user
      .findUnique({
        where: { id: req.user.uid },
        select: { displayName: true, login: true, name: true },
      })
      .catch(() => null);
    const who = esc(
      (u && (u.displayName || u.login || u.name)) || req.user.uid
    );
    const out = await sendTelegram(
      `✅ <b>Avesto Group CRM</b>\nПроверочное сообщение. Уведомления подключены.\nОтправил: ${who}`
    );
    if (!out.ok)
      return res
        .status(502)
        .json({ error: out.error || "Не удалось отправить" });
    res.json({ ok: true });
  })
);

// Проверить темы: шлём по проверочному сообщению в каждую НАСТРОЕННУЮ тему
// (у которой задан TELEGRAM_TOPIC_*). Оператор сразу видит, что раскладка по
// темам работает и id указаны верно. Незаданные темы помечаем «пропущено».
const TOPIC_KINDS = [
  { kind: "expense", label: "Расходы" },
  { kind: "task", label: "Заявки" },
  { kind: "cash", label: "Касса" },
  { kind: "staff", label: "Персонал" },
  { kind: "report", label: "Отчёты" },
  { kind: "checklist", label: "Чек-лист" },
];
r.post(
  "/test-topics",
  requireRole("director", "finance", "accountant", "sysadmin", "manager"),
  asyncHandler(async (req, res) => {
    if (!telegramConfigured()) {
      return res.status(503).json({
        error: "Telegram не настроен (нет TELEGRAM_BOT_TOKEN/CHAT_ID)",
        configured: false,
      });
    }
    const results = [];
    for (const t of TOPIC_KINDS) {
      const thread = topicFor(t.kind);
      if (!thread) {
        results.push({ kind: t.kind, label: t.label, skipped: true });
        continue;
      }
      const out = await sendTelegram(
        `✅ <b>${esc(t.label)}</b> — тема подключена. Проверочное сообщение CRM.`,
        undefined,
        thread
      );
      results.push({
        kind: t.kind,
        label: t.label,
        id: String(thread),
        ok: out.ok,
        error: out.ok ? undefined : out.error,
      });
    }
    res.json({ ok: true, results });
  })
);

// Переслать уведомление в чат (вызывает автоматизация на фронте). Текст
// формирует клиент, но обрезаем и экранируем. best-effort: не настроен → 204.
// kind — в какую тему направить (см. topicFor). По умолчанию «task».
const NotifySchema = z.object({
  text: z.string().min(1).max(1000),
  kind: z
    .enum(["task", "cash", "report", "expense", "staff", "checklist"])
    .default("task"),
});
r.post(
  "/notify",
  requireRole("director", "finance", "accountant", "manager", "sysadmin"),
  asyncHandler(async (req, res) => {
    const parsed = NotifySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Нужен непустой text" });
    }
    if (!telegramConfigured()) return res.status(204).end();
    await sendTelegram(
      `🔔 ${esc(parsed.data.text)}`,
      undefined,
      topicFor(parsed.data.kind)
    );
    res.json({ ok: true });
  })
);

// ── Интерактивный бот чек-листов ────────────────────────────────────────────

// Публичный вебхук Telegram (без requireAuth). Защищён секретом в заголовке
// X-Telegram-Bot-Api-Secret-Token. Отвечаем 200 всегда, чтобы Telegram не
// повторял доставку; обработку ведём best-effort. Монтируется в app.js ДО
// защищённого роутера /api/telegram.
export async function telegramWebhook(req, res) {
  const secret = env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) return res.status(404).end(); // бот не включён
  const got = req.get("x-telegram-bot-api-secret-token");
  if (got !== secret) return res.status(401).end();
  res.json({ ok: true }); // отвечаем сразу
  try {
    await handleUpdate(req.body || {});
  } catch (e) {
    log.warn({ err: e.message }, "telegram webhook handler");
  }
}

// Управление вебхуком (только сисадмин). URL берём из PUBLIC_BASE_URL или
// RENDER_EXTERNAL_URL. Секрет — TELEGRAM_WEBHOOK_SECRET.
r.post(
  "/webhook/setup",
  requireRole("sysadmin", "director"),
  asyncHandler(async (req, res) => {
    if (!botConfigured())
      return res.status(503).json({ error: "Нет TELEGRAM_BOT_TOKEN" });
    if (!env.TELEGRAM_WEBHOOK_SECRET)
      return res
        .status(503)
        .json({ error: "Задайте TELEGRAM_WEBHOOK_SECRET в окружении" });
    const base = env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL;
    if (!base)
      return res.status(400).json({
        error: "Не задан внешний адрес (PUBLIC_BASE_URL / RENDER_EXTERNAL_URL)",
      });
    const url = `${base.replace(/\/$/, "")}/api/telegram/webhook`;
    const out = await setWebhook(url, env.TELEGRAM_WEBHOOK_SECRET);
    if (!out.ok)
      return res
        .status(502)
        .json({ error: out.description || "setWebhook не удался" });
    res.json({ ok: true, url });
  })
);
r.get(
  "/webhook/info",
  requireRole("sysadmin", "director"),
  asyncHandler(async (req, res) => {
    const info = await webhookInfo();
    const r2 = info.result || {};
    res.json({
      ok: !!info.ok,
      url: r2.url || "",
      pending: r2.pending_update_count || 0,
      lastError: r2.last_error_message || "",
    });
  })
);
r.delete(
  "/webhook",
  requireRole("sysadmin", "director"),
  asyncHandler(async (req, res) => {
    const out = await deleteWebhook();
    res.json({ ok: !!out.ok });
  })
);

export default r;
