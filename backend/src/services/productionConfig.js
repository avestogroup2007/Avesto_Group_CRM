// Настройки производственного модуля (одна строка id=1, кэш TTL 60 сек).
//
// Главная из них — autoPost. Документы, рассчитанные по факту отдела, ВСЕГДА
// пишутся в журнал CRM; отправка их в iiko — отдельный, обратимый шаг. Пока
// схема документов конкретной сборки iiko не подтверждена на боевой базе,
// владелец держит autoPost выключенным: журнал наполняется, ошибок в iiko нет,
// а когда схема подтверждена — флаг включается и накопленное отправляется
// повторной отправкой (без потери данных).
import { z } from "zod";
import { db } from "../db.js";
import { log } from "./../logger.js";

export const ProductionSchema = z.object({
  // Отправлять созданные по факту документы в iiko сразу.
  autoPost: z.boolean().default(false),
  // Отправлять перемещения (TRANSFER). Отключается отдельно: не каждая сборка
  // iikoChain принимает перемещения через API, а акт приготовления — принимает.
  postTransfers: z.boolean().default(true),
  // Сколько раз повторять отправку документа автоматически, прежде чем
  // оставить его в журнале со статусом «ошибка» для ручного разбора.
  maxAttempts: z.number().int().min(1).max(10).default(3),
  // Префикс номера документа в iiko — чтобы созданные CRM документы были
  // видны в списке iiko и отличались от заведённых вручную.
  numberPrefix: z.string().max(20).default("CRM-"),
});

function defaults() {
  return {
    autoPost: false,
    postTransfers: true,
    maxAttempts: 3,
    numberPrefix: "CRM-",
  };
}

let cache = { data: defaults(), at: 0, loaded: false };
const TTL_MS = 60 * 1000;

export async function refreshProductionConfig(force = false) {
  if (!force && cache.loaded && Date.now() - cache.at < TTL_MS)
    return cache.data;
  try {
    const row = await db.productionConfig.findUnique({ where: { id: 1 } });
    const parsed = row ? ProductionSchema.safeParse(row.data) : null;
    if (row && parsed && !parsed.success) {
      log.warn(
        { err: parsed.error?.message },
        "production: конфигурация не прошла валидацию — дефолты"
      );
    }
    cache = {
      data: parsed && parsed.success ? parsed.data : defaults(),
      at: Date.now(),
      loaded: true,
    };
  } catch (e) {
    log.warn({ err: e.message }, "production: не удалось прочитать настройки");
    cache.at = Date.now();
  }
  return cache.data;
}

export function getProductionCached() {
  return cache.data;
}

export async function saveProductionConfig(data, userId) {
  const parsed = ProductionSchema.parse(data);
  await db.productionConfig.upsert({
    where: { id: 1 },
    create: { id: 1, data: parsed, updatedById: userId || null },
    update: { data: parsed, updatedById: userId || null },
  });
  cache = { data: parsed, at: Date.now(), loaded: true };
  return parsed;
}

// Только для тестов: сбросить кэш, чтобы следующее чтение пошло в БД.
export function _resetProductionConfigCache() {
  cache = { data: defaults(), at: 0, loaded: false };
}
