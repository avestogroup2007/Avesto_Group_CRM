// Самопроверка системы (Back Office): владелец запускает набор проверок
// подсистем и видит, что работает, а что требует настройки. Реальные проверки
// (БД, конфигурация iiko/Telegram/ИИ, модули, каналы), не имитация.
import { Router } from "express";
import { db } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { asyncHandler } from "../util/asyncHandler.js";
import { iikoConfigured } from "../services/iikoServer.js";
import { telegramConfigured } from "../services/telegram.js";
import { botConfigured } from "../services/telegramBot.js";
import { aiConfigured } from "../services/ai.js";
import { refreshModules } from "../services/modules.js";
import { refreshOrgConfig } from "../services/orgConfig.js";

const r = Router();
r.use(requireAuth);
r.use((req, res, next) => {
  if (!["owner", "vendor"].includes(req.user.role)) {
    return res.status(403).json({ error: "Самопроверка — раздел владельца" });
  }
  next();
});

// Каждая проверка: { key, label, status: ok|warn|fail, detail }.
r.get(
  "/",
  asyncHandler(async (req, res) => {
    const checks = [];

    // 1. База данных: реальный запрос.
    const t0 = Date.now();
    const dbOk = await db.$queryRaw`SELECT 1`.then(
      () => true,
      () => false
    );
    checks.push({
      key: "db",
      label: "База данных (PostgreSQL)",
      status: dbOk ? "ok" : "fail",
      detail: dbOk ? `отвечает за ${Date.now() - t0} мс` : "недоступна",
    });

    // 2. Конфигурация организации читается.
    let orgOk = false;
    let orgBranches = 0;
    try {
      const cfg = await refreshOrgConfig(true);
      orgOk = true;
      orgBranches = cfg.branches.length;
    } catch {
      orgOk = false;
    }
    checks.push({
      key: "org",
      label: "Конфигурация организации",
      status: orgOk ? "ok" : "fail",
      detail: orgOk ? `филиалов: ${orgBranches}` : "не читается",
    });

    // 3. Модули.
    const flags = await refreshModules(true).catch(() => ({}));
    const onCount = Object.values(flags).filter(Boolean).length;
    checks.push({
      key: "modules",
      label: "Модули продукта",
      status: "ok",
      detail: `включено: ${onCount}`,
    });

    // 4. Интеграция iiko (наличие настроек — не сетевой вызов).
    checks.push({
      key: "iiko",
      label: "Интеграция iiko",
      status: iikoConfigured() ? "ok" : "warn",
      detail: iikoConfigured()
        ? "настроена"
        : "не настроена (задайте IIKO_* в окружении)",
    });

    // 5. Telegram-уведомления.
    checks.push({
      key: "telegram",
      label: "Telegram-уведомления",
      status: telegramConfigured() ? "ok" : "warn",
      detail: telegramConfigured() ? "настроены" : "не настроены",
    });

    // 6. Telegram-бот (вебхук).
    checks.push({
      key: "bot",
      label: "Telegram-бот (чек-листы, сводки)",
      status: botConfigured() ? "ok" : "warn",
      detail: botConfigured() ? "токен задан" : "нет TELEGRAM_BOT_TOKEN",
    });

    // 7. ИИ-помощник.
    checks.push({
      key: "ai",
      label: "ИИ-помощник (Claude)",
      status: aiConfigured() ? "ok" : "warn",
      detail: aiConfigured() ? "ключ задан" : "нет ANTHROPIC_API_KEY",
    });

    // 8. Канал обратной связи (клиент → Back Office).
    const feedbackOn = Boolean(
      process.env.VENDOR_INTAKE_SECRET && process.env.VENDOR_FEEDBACK_URL
    );
    checks.push({
      key: "feedback",
      label: "Канал обратной связи",
      status: feedbackOn ? "ok" : "warn",
      detail: feedbackOn ? "настроен" : "не настроен (по желанию)",
    });

    const summary = {
      ok: checks.filter((c) => c.status === "ok").length,
      warn: checks.filter((c) => c.status === "warn").length,
      fail: checks.filter((c) => c.status === "fail").length,
    };
    res.json({ checks, summary, at: new Date().toISOString() });
  })
);

export default r;
