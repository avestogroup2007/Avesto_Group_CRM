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

// Переслать уведомление в чат (вызывает автоматизация на фронте). Текст
// формирует клиент, но обрезаем и экранируем. best-effort: не настроен → 204.
const NotifySchema = z.object({
  text: z.string().min(1).max(1000),
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
      topicFor("task")
    );
    res.json({ ok: true });
  })
);

export default r;
