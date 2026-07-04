// Единый обработчик ошибок. Ловит всё, что «вылетело» из маршрутов,
// пишет в лог и отдаёт клиенту безопасное сообщение без деталей стека.
import { log } from "../logger.js";

// 404 для несуществующих маршрутов.
export function notFound(req, res) {
  res.status(404).json({ error: "Маршрут не найден" });
}

// eslint-disable-next-line no-unused-vars — Express распознаёт обработчик ошибок по 4 аргументам
export function errorHandler(err, req, res, next) {
  log.error({ err, path: req.path }, "Необработанная ошибка");
  if (res.headersSent) return next(err);
  res.status(500).json({ error: "Внутренняя ошибка сервера" });
}
