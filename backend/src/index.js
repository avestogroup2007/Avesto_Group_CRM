// Точка входа API-сервера: поднимает приложение и слушает порт.
import { app } from "./app.js";
import { env } from "./env.js";
import { log } from "./logger.js";

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
