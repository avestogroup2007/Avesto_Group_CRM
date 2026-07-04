// Единый обработчик ошибок. Ловит всё, что «вылетело» из маршрутов,
// пишет в лог и отдаёт клиенту безопасное сообщение без деталей стека.
import { log } from "../logger.js";

// 404 для несуществующих маршрутов.
export function notFound(req, res) {
  res.status(404).json({ error: "Маршрут не найден" });
}

// Express распознаёт обработчик ошибок именно по 4 аргументам (err, req, res, next).
export function errorHandler(err, req, res, next) {
  log.error({ err, path: req.path }, "Необработанная ошибка");
  if (res.headersSent) return next(err);
  res.status(500).json({ error: "Внутренняя ошибка сервера" });
}
