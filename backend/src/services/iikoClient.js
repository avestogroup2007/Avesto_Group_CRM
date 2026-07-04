// Клиент iikoWeb Public API (public-api.iikoweb.ru).
// Аутентификация: POST /auth с api_key → возвращает jwt (поле token) и
// expires_in (Unix-время). Далее токен передаётся в заголовке
// Authorization: Bearer <token>. Ключ api_key берётся из окружения (env) и
// НИКОГДА не уходит клиенту.
// Docs: https://public-api.iikoweb.ru/documentation
import { env } from "../env.js";

const BASE = env.IIKO_BASE_URL;

let cachedToken = null;
let tokenExpiry = 0; // мс epoch, когда токен считаем протухшим

// Настроена ли интеграция (есть ли api_key).
export function iikoConfigured() {
  return Boolean(env.IIKO_API_LOGIN);
}

// Ошибка «iiko не настроен» — маршрут превратит её в аккуратный 503.
export class IikoNotConfiguredError extends Error {
  constructor() {
    super("Интеграция iiko не настроена (нет IIKO_API_LOGIN)");
    this.name = "IikoNotConfiguredError";
  }
}

async function iikoFetch(path, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`iiko ${path} → ${res.status} ${text}`.trim());
  }
  // Некоторые ответы могут быть пустыми — подстрахуемся.
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

// Получить/обновить токен доступа.
// /auth принимает api_key (обязателен), а также необязательные app_id и
// client_secret. Ответ: { token, expires_in } (expires_in — Unix-время в сек).
async function getToken() {
  if (!iikoConfigured()) throw new IikoNotConfiguredError();
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  const payload = { api_key: env.IIKO_API_LOGIN };
  if (env.IIKO_API_ID) payload.app_id = env.IIKO_API_ID;
  if (env.IIKO_CLIENT_SECRET) payload.client_secret = env.IIKO_CLIENT_SECRET;

  const data = await iikoFetch("/auth", payload);
  cachedToken = data.token || data.access_token || data.jwt;
  if (!cachedToken) {
    throw new Error("iiko /auth не вернул token");
  }
  // expires_in — Unix-время (сек) истечения. Держим запас 60 сек.
  const nowSec = Math.floor(Date.now() / 1000);
  const expSec =
    typeof data.expires_in === "number" && data.expires_in > nowSec
      ? data.expires_in
      : nowSec + 55 * 60; // если не пришло — считаем ~55 минут
  tokenExpiry = (expSec - 60) * 1000;
  return cachedToken;
}

// Список ресторанов (точек) iiko — заменяет прежние «организации».
// Возвращает { stores: [{ id, store_name, department_id, time_zone, ... }] }.
export async function stores() {
  const token = await getToken();
  return iikoFetch("/entities/store/list", {}, token);
}

// Обратная совместимость: старое имя organizations() отдаёт список точек.
export async function organizations() {
  return stores();
}

// Экспорт актов реализации (продаж) за период по департаменту.
// departmentId — GUID департамента точки (store.department_id).
// from/to — даты в формате YYYY-MM-DD. Возвращает массив документов, у
// каждого поле items[] с { product, amount, price, sum, ... }.
export async function salesDocuments({ departmentId, from, to }) {
  const token = await getToken();
  return iikoFetch(
    "/document-processing/sales-document/export",
    { departmentId, from, to },
    token
  );
}

// Список пользователей iiko.
export async function users() {
  const token = await getToken();
  return iikoFetch("/entities/user/list", {}, token);
}

// Список продуктов (номенклатура).
export async function products() {
  const token = await getToken();
  return iikoFetch("/entities/products/list", {}, token);
}
