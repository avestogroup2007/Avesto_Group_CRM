// Крон-эндпоинт напоминаний о задачах: внешний планировщик (Render Cron/пингер)
// раз в день дёргает POST /api/todos-cron/remind с секретом в заголовке
// X-Cron-Secret. Без авторизации пользователя (у крона нет JWT), поэтому
// защита — секрет. Пустой TODO_REMINDER_SECRET = напоминания отключены (503).
import { Router } from "express";
import { env } from "../env.js";
import { asyncHandler } from "../util/asyncHandler.js";
import { remindOverdueTodos } from "../services/todoReminders.js";

const r = Router();

r.post(
  "/remind",
  asyncHandler(async (req, res) => {
    const secret = env.TODO_REMINDER_SECRET;
    if (!secret) {
      return res
        .status(503)
        .json({ error: "Напоминания отключены (нет TODO_REMINDER_SECRET)" });
    }
    if (req.get("x-cron-secret") !== secret) {
      return res.status(403).json({ error: "Неверный секрет" });
    }
    const result = await remindOverdueTodos();
    res.json({ ok: true, ...result });
  })
);

export default r;
