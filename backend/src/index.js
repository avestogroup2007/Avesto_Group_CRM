// Точка входа API-сервера.
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";

import { env } from "./env.js";
import { log } from "./logger.js";
import authRoutes from "./auth/routes.js";
import { notFound, errorHandler } from "./middleware/errorHandler.js";

const app = express();

// За reverse-proxy (Caddy/Render/Railway) — доверяем заголовку X-Forwarded-For,
// чтобы req.ip и rate-limit видели реальный адрес клиента.
app.set("trust proxy", 1);

app.use(pinoHttp({ logger: log }));
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
app.get("/api/health", (req, res) =>
  res.json({ ok: true, time: Date.now() })
);

// Маршруты.
app.use("/api/auth/login", authLimiter);
app.use("/api/auth", authRoutes);

// Здесь позже (Этап 2–3) подключим:
// app.use("/api/tasks", taskRoutes);
// app.use("/api/cash", cashRoutes);
// app.use("/api/iiko", iikoRoutes);

// Обработка 404 и ошибок — всегда последними.
app.use(notFound);
app.use(errorHandler);

const server = app.listen(env.PORT, () =>
  log.info(`API запущен на порту ${env.PORT}`)
);

// Аккуратная остановка.
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    log.info(`Получен ${sig}, останавливаю сервер...`);
    server.close(() => process.exit(0));
  });
}

export { app };
