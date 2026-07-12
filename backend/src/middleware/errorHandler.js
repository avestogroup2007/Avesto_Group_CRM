// Единый обработчик ошибок. Ловит всё, что «вылетело» из маршрутов,
// пишет в лог и отдаёт клиенту безопасное сообщение без деталей стека.
import { log } from "../logger.js";

// 404 для несуществующих маршрутов.
export function notFound(req, res) {
  res.status(404).json({ error: "Маршрут не найден" });
}

// Express распознаёт обработчик ошибок именно по 4 аргументам (err, req, res, next).
export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  // Ошибки разбора тела запроса — вина клиента, а не сервера: отвечаем
  // честным кодом и не шумим в логах уровнем error.
  if (err && err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Некорректный JSON в теле запроса" });
  }
  if (err && err.type === "entity.too.large") {
    return res.status(413).json({ error: "Слишком большое тело запроса" });
  }
  log.error({ err, path: req.path }, "Необработанная ошибка");
  res.status(500).json({ error: "Внутренняя ошибка сервера" });
}
