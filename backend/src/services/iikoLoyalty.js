// iiko Лояльность (iikoCloud API, api-ru.iiko.services) — обогащение клиентов
// CVM данными из программы лояльности iiko. Это ОТДЕЛЬНЫЙ API от отчётного
// iikoServer: авторизация по apiLogin → access token, затем запрос информации о
// госте по телефону. Публичного «выгрузить всех гостей» в API нет, поэтому
// синхронизация ОБОГАЩАЕТ уже заведённых клиентов (по телефону): подтягивает имя
// и накопленные баллы/визиты, где iiko их отдаёт. Если ключи не заданы —
// бросаем IikoLoyaltyNotConfiguredError (маршрут вернёт 503), а импорт/ручной
// ввод CVM продолжают работать.
import { env } from "../env.js";
import { db } from "../db.js";
import { log } from "./../logger.js";
import { normalizePhone } from "./cvm.js";

export class IikoLoyaltyNotConfiguredError extends Error {
  constructor() {
    super("Интеграция iiko Лояльность не настроена");
    this.name = "IikoLoyaltyNotConfiguredError";
  }
}

export function iikoLoyaltyConfigured() {
  return Boolean(env.IIKO_LOYALTY_API_LOGIN && env.IIKO_LOYALTY_ORG_ID);
}

const BASE = () => env.IIKO_LOYALTY_API_URL.replace(/\/+$/, "");

async function jsonPost(path, body, token) {
  const res = await fetch(`${BASE()}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `iiko loyalty ${path} → ${res.status} ${text.slice(0, 200)}`
    );
  }
  return text ? JSON.parse(text) : {};
}

// Токен доступа iikoCloud (действует ~1 час; для нечастой синхронизации берём
// свежий на каждый запуск — кэш не усложняем).
async function accessToken() {
  const j = await jsonPost("/api/1/access_token", {
    apiLogin: env.IIKO_LOYALTY_API_LOGIN,
  });
  if (!j.token) throw new Error("iiko loyalty: пустой токен");
  return j.token;
}

// Информация о госте по телефону. Возвращает { name, walletBalance } либо null,
// если гость не найден. Разные сборки отдают чуть разные поля — читаем мягко.
async function guestByPhone(token, phone) {
  try {
    const j = await jsonPost(
      "/api/1/loyalty/iiko/get_customer_info",
      { organizationId: env.IIKO_LOYALTY_ORG_ID, type: "phone", phone },
      token
    );
    const c = j.customer || j;
    if (!c || (!c.id && !c.name)) return null;
    const wallet =
      Array.isArray(c.walletBalances) && c.walletBalances[0]
        ? Number(c.walletBalances[0].balance) || 0
        : Number(c.walletBalance) || 0;
    return {
      externalId: c.id || null,
      name:
        [c.name, c.surname].filter(Boolean).join(" ").trim() || c.name || "",
      walletBalance: wallet,
    };
  } catch (e) {
    // Гость не найден / временная ошибка по конкретному телефону — не валим весь
    // прогон, просто пропускаем этого клиента.
    log.debug?.({ err: e.message, phone }, "iiko loyalty: гость не подтянут");
    return null;
  }
}

// Обогащение: по клиентам с телефоном подтягиваем имя/externalId из лояльности.
// Ограничиваем число обращений (limit), чтобы не долбить API на большой базе.
export async function syncCustomersFromIiko({ limit = 500 } = {}) {
  if (!iikoLoyaltyConfigured()) throw new IikoLoyaltyNotConfiguredError();
  const token = await accessToken();
  const customers = await db.customer.findMany({
    where: { phone: { not: "" } },
    orderBy: { updatedAt: "asc" },
    take: Math.min(Math.max(limit, 1), 2000),
    select: { id: true, phone: true, name: true, externalId: true },
  });
  let enriched = 0;
  let notFound = 0;
  for (const c of customers) {
    const info = await guestByPhone(token, normalizePhone(c.phone));
    if (!info) {
      notFound += 1;
      continue;
    }
    await db.customer
      .update({
        where: { id: c.id },
        data: {
          source: "iiko",
          externalId: info.externalId || c.externalId || null,
          name: c.name || info.name || "",
        },
      })
      .catch(() => {});
    enriched += 1;
  }
  return { scanned: customers.length, enriched, notFound };
}
