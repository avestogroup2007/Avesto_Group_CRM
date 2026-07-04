// Проверяет вход на каждом защищённом маршруте.
// Токен лежит в httpOnly-cookie — JavaScript в браузере его не прочитает.
import jwt from "jsonwebtoken";
import { env } from "../env.js";

export function requireAuth(req, res, next) {
  const token = req.cookies?.token;
  if (!token) return res.status(401).json({ error: "Требуется вход" });
  try {
    // В payload лежит только { uid, role, branchId } — ничего секретного.
    req.user = jwt.verify(token, env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Сессия истекла, войдите заново" });
  }
}
