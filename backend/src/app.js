// Сборка Express-приложения (без запуска). Отдельно от index.js,
// чтобы тесты могли поднимать приложение на произвольном порту.
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";

import * as Sentry from "@sentry/node";

import { env } from "./env.js";
import { log } from "./logger.js";
import { db } from "./db.js";
import authRoutes from "./auth/routes.js";
import iikoRoutes from "./routes/iiko.js";
import taskRoutes from "./routes/tasks.js";
import moneyRoutes from "./routes/money.js";
import postingRoutes from "./routes/postings.js";
import cashRoutes from "./routes/cash.js";
import telegramRoutes, { telegramWebhook } from "./routes/telegram.js";
import aiRoutes from "./routes/ai.js";
import { notFound, errorHandler } from "./middleware/errorHandler.js";

// Мониторинг ошибок: включается только при заданном SENTRY_DSN — узнаём о
// сбоях раньше пользователей. Личные данные в события не пишем.
if (env.SENTRY_DSN && env.NODE_ENV !== "test") {
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    sendDefaultPii: false,
    tracesSampleRate: 0,
  });
}

export const app = express();

// За reverse-proxy (Caddy/Render/Railway) — доверяем заголовку X-Forwarded-For,
// чтобы req.ip и rate-limit видели реальный адрес клиента.
app.set("trust proxy", 1);

// В тестах не шумим HTTP-логами.
if (env.NODE_ENV !== "test") {
  app.use(pinoHttp({ logger: log }));
}
app.use(helmet()); // заголовки безопасности одной строкой
app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true, // разрешаем cookie между фронтом и API
  })
);
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());

// Ограничение частоты запросов на вход — защита от перебора паролей.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 20, // не больше 20 попыток входа с одного IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Слишком много попыток входа, попробуйте позже" },
});

// Общий предохранитель на весь API: щедрый для обычной работы одного
// пользователя, но останавливает флуд/скрейпинг. В тестах выключен, чтобы
// интеграционные прогоны не упирались в лимит.
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300, // 300 запросов в минуту с одного IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Слишком много запросов, попробуйте позже" },
});

// ИИ-маршруты дергают платный Claude API — лимит жёстче остальных.
const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Слишком много запросов к ИИ, попробуйте позже" },
});

// Проверка живости (для аптайм-мониторинга): сервер + доступность БД.
app.get("/api/health", async (req, res) => {
  const dbOk = await db.$queryRaw`SELECT 1`.then(
    () => true,
    () => false
  );
  res.status(dbOk ? 200 : 503).json({ ok: dbOk, db: dbOk, time: Date.now() });
});

// Публичный вебхук Telegram-бота — ДО защищённого роутера /api/telegram,
// т.к. Telegram вызывает его без токена авторизации (защита — секрет в
// заголовке). Свой rate-limit: вебхук стоит до общего apiLimiter.
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});
if (env.NODE_ENV !== "test") {
  app.use("/api/telegram/webhook", webhookLimiter);
}
app.post("/api/telegram/webhook", telegramWebhook);

// Маршруты.
if (env.NODE_ENV !== "test") {
  app.use("/api", apiLimiter);
}
app.use("/api/auth/login", authLimiter);
// Смена пароля — та же защита от перебора, что и вход.
app.use("/api/auth/change-password", authLimiter);
app.use("/api/ai", aiLimiter);
app.use("/api/auth", authRoutes);
app.use("/api/iiko", iikoRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/money", moneyRoutes);
app.use("/api/postings", postingRoutes);
app.use("/api/telegram", telegramRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/cash", cashRoutes);

// Обработка 404 и ошибок — всегда последними. Sentry ставится перед нашим
// обработчиком: ошибка сначала уходит в мониторинг, затем клиенту как обычно.
if (env.SENTRY_DSN && env.NODE_ENV !== "test") {
  Sentry.setupExpressErrorHandler(app);
}
app.use(notFound);
app.use(errorHandler);
