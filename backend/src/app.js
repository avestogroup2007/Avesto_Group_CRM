// Сборка Express-приложения (без запуска). Отдельно от index.js,
// чтобы тесты могли поднимать приложение на произвольном порту.
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";

import { env } from "./env.js";
import { log } from "./logger.js";
import authRoutes from "./auth/routes.js";
import iikoRoutes from "./routes/iiko.js";
import taskRoutes from "./routes/tasks.js";
import { notFound, errorHandler } from "./middleware/errorHandler.js";

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

// Проверка живости.
app.get("/api/health", (req, res) => res.json({ ok: true, time: Date.now() }));

// Маршруты.
app.use("/api/auth/login", authLimiter);
app.use("/api/auth", authRoutes);
app.use("/api/iiko", iikoRoutes);
app.use("/api/tasks", taskRoutes);

// Здесь позже подключим:
// app.use("/api/cash", cashRoutes);

// Обработка 404 и ошибок — всегда последними.
app.use(notFound);
app.use(errorHandler);
