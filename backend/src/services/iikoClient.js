// Клиент iikoCloud API. apiLogin берётся из окружения (env) и НИКОГДА не
// уходит клиенту. Токен доступа кэшируется (~55 минут).
// Docs: https://api-ru.iiko.services/
import { env } from "../env.js";

const BASE = env.IIKO_BASE_URL;

let cachedToken = null;
let tokenExpiry = 0;

// Настроена ли интеграция (есть ли apiLogin).
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
  return res.json();
}

// Получить/обновить токен доступа (живёт 60 мин, кэшируем на 55).
async function getToken() {
  if (!iikoConfigured()) throw new IikoNotConfiguredError();
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
  // v2-эндпоинт требует пару apiKey + clientSecret (старый /api/1/access_token
  // с apiLogin отвечает 403). apiKey = IIKO_API_LOGIN, clientSecret = IIKO_CLIENT_SECRET.
  const data = await iikoFetch("/api/v2/access_token", {
    apiKey: env.IIKO_API_LOGIN,
    clientSecret: env.IIKO_CLIENT_SECRET,
  });
  cachedToken = data.token || data.access_token || data.accessToken;
  tokenExpiry = Date.now() + 55 * 60 * 1000;
  return cachedToken;
}

// Список организаций (точек) — нужен для сопоставления филиалов.
export async function organizations() {
  const token = await getToken();
  return iikoFetch(
    "/api/1/organizations",
    { returnAdditionalInfo: true },
    token
  );
}

// OLAP-отчёт продаж.
export async function salesOlap({ from, to, groupBy, filters }) {
  const token = await getToken();
  return iikoFetch(
    "/api/1/reports/olap",
    {
      reportType: "SALES",
      buildSummary: true,
      groupByRowFields: groupBy,
      aggregateFields: ["DishAmountInt", "DishSumInt"],
      filters: {
        "OpenDate.Typed": {
          filterType: "DateRange",
          periodType: "CUSTOM",
          from,
          to,
        },
        ...(filters || {}),
      },
    },
    token
  );
}

// Клиенты программы лояльности.
export async function loyaltyCustomers({ organizationId }) {
  const token = await getToken();
  return iikoFetch(
    "/api/1/loyalty/iiko/customer/list",
    { organizationId },
    token
  );
}
