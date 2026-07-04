// Проверяет вход на каждом защищённом маршруте.
// Токен принимается двумя способами:
//  - httpOnly-cookie (same-origin, JS его не читает — безопаснее);
//  - заголовок Authorization: Bearer <token> (кросс-домен github.io↔onrender).
import jwt from "jsonwebtoken";
import { env } from "../env.js";

function extractToken(req) {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith("Bearer ")) return auth.slice(7).trim();
  return req.cookies?.token || null;
}

export function requireAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: "Требуется вход" });
  try {
    // В payload лежит только { uid, role, branchId } — ничего секретного.
    req.user = jwt.verify(token, env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Сессия истекла, войдите заново" });
  }
}
