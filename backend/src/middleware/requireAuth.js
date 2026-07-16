// Проверяет вход на каждом защищённом маршруте.
// Токен принимается двумя способами:
//  - httpOnly-cookie (same-origin, JS его не читает — безопаснее);
//  - заголовок Authorization: Bearer <token> (кросс-домен github.io↔onrender).
//
// Помимо подписи токена проверяется ЖИВОЕ состояние учётки в БД (с кэшем на
// минуту): заблокированный или уволенный сотрудник теряет доступ сразу, а не
// через 12 часов, когда истечёт токен. Роль и филиал тоже берутся свежие —
// понижение роли действует без перевыпуска токена.
import jwt from "jsonwebtoken";
import { env } from "../env.js";
import { db } from "../db.js";

function extractToken(req) {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith("Bearer ")) return auth.slice(7).trim();
  return req.cookies?.token || null;
}

// Кэш «uid → свежее состояние учётки» на 60 секунд: один SELECT в минуту на
// активного пользователя вместо запроса на каждый вызов API.
const FRESH_TTL_MS = 60 * 1000;
const freshCache = new Map(); // uid -> { at, ok, role, branchId }

// Сбросить кэш пользователя немедленно (после блокировки/смены роли в админке).
export function invalidateUserAuthCache(uid) {
  if (uid) freshCache.delete(uid);
  else freshCache.clear();
}

async function freshState(uid) {
  const hit = freshCache.get(uid);
  if (hit && Date.now() - hit.at < FRESH_TTL_MS) return hit;
  let user;
  let dbError = false;
  try {
    user = await db.user.findUnique({
      where: { id: uid },
      select: {
        active: true,
        iikoDeleted: true,
        role: true,
        branchId: true,
        checklistBranch: true,
      },
    });
  } catch {
    dbError = true;
  }
  // Сбой БД (не «пользователь заблокирован») НЕ кэшируем: иначе один таймаут
  // базы запирал бы пользователя на 60 сек уже после её восстановления.
  // Отдаём временный отказ (fail-closed), но со свежей перепроверкой на
  // следующем запросе — если есть валидный прежний снимок, используем его.
  if (dbError) {
    if (hit) return hit;
    return {
      at: 0,
      ok: false,
      dbError: true,
      role: null,
      branchId: null,
      assignedBranch: null,
    };
  }
  const ok = Boolean(user && user.active && !user.iikoDeleted);
  const state = {
    at: Date.now(),
    ok,
    role: user ? user.role : null,
    branchId: user ? user.branchId : null,
    // Рабочий филиал сотрудника (id из конфигурации организации, строкой) —
    // для серверного ограничения данных по филиалу у привязанных сотрудников.
    assignedBranch: user ? user.checklistBranch : null,
  };
  // Эвикция по TTL при переполнении (без сброса всего кэша — иначе стампид).
  if (freshCache.size > 2000) {
    const now = Date.now();
    for (const [k, v] of freshCache)
      if (now - v.at >= FRESH_TTL_MS) freshCache.delete(k);
    if (freshCache.size > 2000) freshCache.clear();
  }
  freshCache.set(uid, state);
  return state;
}

export async function requireAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: "Требуется вход" });
  let payload;
  try {
    // В payload лежит только { uid, role, branchId } — ничего секретного.
    // Явно фиксируем алгоритм (HMAC HS256) — не принимаем токены с другим alg.
    payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"] });
  } catch {
    return res.status(401).json({ error: "Сессия истекла, войдите заново" });
  }
  const state = await freshState(payload.uid);
  if (!state.ok) {
    // Разделяем «база недоступна» (временно, 503) и «учётка закрыта» (401):
    // при сбое БД повторный вход не поможет, и сообщение не должно пугать.
    if (state.dbError) {
      return res
        .status(503)
        .json({ error: "База временно недоступна, повторите попытку" });
    }
    return res.status(401).json({ error: "Доступ закрыт. Войдите заново." });
  }
  // Роль/филиал — свежие из БД (важнее, чем 12-часовой снимок в токене).
  // assignedBranch — рабочий филиал (checklistBranch) для серверного
  // ограничения данных по филиалу у привязанных сотрудников.
  req.user = {
    uid: payload.uid,
    role: state.role,
    branchId: state.branchId,
    assignedBranch: state.assignedBranch,
  };
  next();
}
