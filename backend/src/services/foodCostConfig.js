// Себестоимость (food cost): гибрид iiko + ручная правка. Продажи (выручка и
// количество по блюдам) приходят из iiko; себестоимость проданных блюд —
// приоритетом: заданная в системе цена за единицу блюда → % по группе блюд →
// общий % по умолчанию. Где в iiko есть тех.карта, её себестоимость можно
// подставлять автоматически (следующий шаг, проверка на боевом деплое).
// Конфигурация — одна строка (id=1), кэш TTL 60 сек.
import { z } from "zod";
import { db } from "../db.js";
import { log } from "./../logger.js";

export const FoodCostSchema = z.object({
  // ФК% по умолчанию, когда себестоимость блюда неизвестна (нет тех.карты и
  // ручной цены). Типичный food cost общепита — около 30%.
  defaultPct: z.number().min(0).max(100).default(30),
  // ФК% по группе блюд 1-го уровня (напр. «Кухня» 32, «Бар» 20).
  groupPct: z
    .record(z.string().max(120), z.number().min(0).max(100))
    .default({})
    .refine((o) => Object.keys(o).length <= 500, {
      message: "Слишком много групп",
    }),
  // Абсолютная себестоимость единицы блюда, сум (ручная правка «гибрида»).
  dishCost: z
    .record(z.string().max(200), z.number().min(0).max(9e12))
    .default({})
    .refine((o) => Object.keys(o).length <= 20000, {
      message: "Слишком много блюд",
    }),
});

function defaults() {
  return { defaultPct: 30, groupPct: {}, dishCost: {} };
}

let cache = { data: defaults(), at: 0, loaded: false };
const TTL_MS = 60 * 1000;

export async function refreshFoodCostConfig(force = false) {
  if (!force && cache.loaded && Date.now() - cache.at < TTL_MS)
    return cache.data;
  try {
    const row = await db.foodCostConfig.findUnique({ where: { id: 1 } });
    const parsed = row ? FoodCostSchema.safeParse(row.data) : null;
    if (row && !parsed.success) {
      log.warn(
        { err: parsed.error?.message },
        "foodCost: конфигурация не прошла валидацию — дефолты"
      );
    }
    cache = {
      data: parsed && parsed.success ? parsed.data : defaults(),
      at: Date.now(),
      loaded: true,
    };
  } catch (e) {
    log.warn({ err: e.message }, "foodCost: не удалось прочитать из БД");
    cache.at = Date.now();
  }
  return cache.data;
}

export function getFoodCostCached() {
  return cache.data;
}

export async function saveFoodCostConfig(data, userId) {
  const parsed = FoodCostSchema.parse(data);
  await db.foodCostConfig.upsert({
    where: { id: 1 },
    create: { id: 1, data: parsed, updatedById: userId || null },
    update: { data: parsed, updatedById: userId || null },
  });
  cache = { data: parsed, at: Date.now(), loaded: true };
  return parsed;
}

// Чистый расчёт себестоимости по проданным блюдам (легко тестируется).
// dishes: [{ name, group, revenue, qty }] — из iiko OLAP по блюдам.
// Возвращает строки с себестоимостью, ФК% и маржой + итоги.
export function computeFoodCost(dishes, config) {
  const cfg = { ...defaults(), ...(config || {}) };
  const groupPct = cfg.groupPct || {};
  const dishCost = cfg.dishCost || {};
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const rows = (Array.isArray(dishes) ? dishes : []).map((d) => {
    const name = d.name || "—";
    const group = d.group || "";
    const revenue = Number(d.revenue) || 0;
    const qty = Number(d.qty) || 0;
    let cost;
    let source;
    // Доступ через hasOwnProperty: блюдо/группа с именем как у члена прототипа
    // (constructor/toString) не должны ложно совпадать и портить расчёт (NaN).
    if (has(dishCost, name) && dishCost[name] != null) {
      cost = Number(dishCost[name]) * qty;
      source = "dish"; // ручная цена за единицу
    } else if (group && has(groupPct, group) && groupPct[group] != null) {
      cost = (revenue * Number(groupPct[group])) / 100;
      source = "group"; // % по группе
    } else {
      cost = (revenue * cfg.defaultPct) / 100;
      source = "default"; // общий % по умолчанию
    }
    cost = Math.round(cost);
    const foodCostPct = revenue > 0 ? (cost / revenue) * 100 : 0;
    return {
      name,
      group,
      qty,
      revenue,
      cost,
      margin: revenue - cost,
      foodCostPct: Math.round(foodCostPct * 10) / 10,
      source,
    };
  });
  rows.sort((a, b) => b.revenue - a.revenue);
  const totRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const totCost = rows.reduce((s, r) => s + r.cost, 0);
  return {
    rows,
    totals: {
      revenue: totRevenue,
      cost: totCost,
      margin: totRevenue - totCost,
      foodCostPct:
        totRevenue > 0 ? Math.round((totCost / totRevenue) * 1000) / 10 : 0,
    },
  };
}
