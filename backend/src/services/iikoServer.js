// Клиент iikoServer API (iiko RMS / iikoOffice), адрес вида
// https://host:port/resto/api. Логин/пароль пользователя iikoOffice задаются
// ТОЛЬКО в окружении хостинга и НИКОГДА не уходят клиенту.
// Поток: auth (login + SHA1(pass)) -> получаем token -> запросы OLAP v2 с
// ?key=token -> logout (сессия одна, обязательно закрываем).
// Ограничения iikoServer: запросы последовательно, период <= 1 месяца,
// buildSummary=false, <= 7 полей группировки.
import crypto from "node:crypto";
import { env } from "../env.js";

const BASE = (env.IIKO_SERVER_URL || "").replace(/\/+$/, "");

// Настроена ли интеграция (есть адрес сервера, логин и пароль).
export function iikoConfigured() {
  return Boolean(
    env.IIKO_SERVER_URL && env.IIKO_SERVER_LOGIN && env.IIKO_SERVER_PASSWORD
  );
}

// Ошибка «iiko не настроен» — маршрут превратит её в аккуратный 503.
export class IikoNotConfiguredError extends Error {
  constructor() {
    super("Интеграция iiko не настроена (нет IIKO_SERVER_URL/LOGIN/PASSWORD)");
    this.name = "IikoNotConfiguredError";
  }
}

function sha1(s) {
  return crypto.createHash("sha1").update(s, "utf8").digest("hex");
}

// Авторизация: возвращает токен (строка). Токен живёт недолго и одна сессия —
// поэтому логинимся под запрос и затем разлогиниваемся.
async function auth() {
  // Логин/пароль передаём в теле как application/x-www-form-urlencoded —
  // эндпоинт auth использует @FormParam и отклоняет query-параметры.
  const body =
    `login=${encodeURIComponent(env.IIKO_SERVER_LOGIN)}` +
    `&pass=${sha1(env.IIKO_SERVER_PASSWORD)}`;
  const res = await fetch(`${BASE}/resto/api/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const text = (await res.text()).trim();
  if (!res.ok) {
    throw new Error(`iiko auth → ${res.status} ${text}`.trim());
  }
  // Ответ — сам токен (строка). Иногда может прийти в кавычках.
  return text.replace(/^"|"$/g, "");
}

async function logout(key) {
  try {
    await fetch(`${BASE}/resto/api/logout?key=${encodeURIComponent(key)}`);
  } catch {
    // разлогин не критичен — молча игнорируем
  }
}

// Границы периода в формате iiko: from — начало дня, to — начало следующего
// дня после последней даты (в OLAP верхняя граница не включается).
function dayStart(ymd) {
  return `${ymd}T00:00:00.000`;
}
function nextDayStart(ymd) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T00:00:00.000`;
}

// Один OLAP-запрос под открытой сессией (key). Возвращает массив data.
async function runOlap(key, { from, to, departments, groupByRowFields }) {
  const filters = {
    // Этот сервер требует фильтр именно по «Учётному дню» (OpenDate.Typed).
    "OpenDate.Typed": {
      filterType: "DateRange",
      periodType: "CUSTOM",
      from: dayStart(from),
      to: nextDayStart(to),
    },
    DeletedWithWriteoff: {
      filterType: "ExcludeValues",
      values: ["DELETED_WITH_WRITEOFF", "DELETED_WITHOUT_WRITEOFF"],
    },
    OrderDeleted: {
      filterType: "IncludeValues",
      values: ["NOT_DELETED"],
    },
  };
  if (Array.isArray(departments) && departments.length) {
    filters.Department = { filterType: "IncludeValues", values: departments };
  }
  const body = {
    reportType: "SALES",
    buildSummary: false,
    groupByRowFields,
    groupByColFields: [],
    aggregateFields: ["DishSumInt", "DishDiscountSumInt", "DishAmountInt"],
    filters,
  };
  const res = await fetch(`${BASE}/resto/api/v2/reports/olap?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`iiko olap → ${res.status} ${text}`.trim());
  }
  const json = text ? JSON.parse(text) : {};
  return Array.isArray(json.data) ? json.data : [];
}

// Полный отчёт продаж за период (одна сессия iiko, несколько OLAP-срезов):
//  - byDay:   по дню и филиалу (выручка/график/KPI);
//  - byPay:   по типам оплат (вкладка «Оплаты»);
//  - byDish:  по блюдам (вкладки «Блюда»/«ABC»);
//  - byGroup: по группам блюд 1-го уровня (ABC по группам).
// Все, кроме byDay, best-effort: если конкретный срез не удался — вернём
// пустой, но выручка по дням (главное) не пострадает.
export async function salesReport({ from, to, departments }) {
  if (!iikoConfigured()) throw new IikoNotConfiguredError();
  const key = await auth();
  try {
    const opts = { from, to, departments };
    const byDay = await runOlap(key, {
      ...opts,
      groupByRowFields: ["OpenDate.Typed", "Department"],
    });
    const byPay = await runOlap(key, {
      ...opts,
      groupByRowFields: ["PayTypes"],
    }).catch(() => []);
    const byDish = await runOlap(key, {
      ...opts,
      groupByRowFields: ["DishName"],
    }).catch(() => []);
    // Все три уровня групп блюд одним запросом — для ABC по группам 1/2/3.
    const byGroups = await runOlap(key, {
      ...opts,
      groupByRowFields: [
        "DishGroup.TopParent",
        "DishGroup.SecondParent",
        "DishGroup.ThirdParent",
      ],
    }).catch(() => []);
    return { byDay, byPay, byDish, byGroups };
  } finally {
    await logout(key);
  }
}
