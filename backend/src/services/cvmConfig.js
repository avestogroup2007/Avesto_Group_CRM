// Конфигурация CVM (одна строка id=1, кэш TTL 60 сек): окно оттока в днях и
// шаблон оффера по умолчанию. Пороги RFM считаются по распределению (квантили),
// поэтому в настройке не нужны — храним только то, что действительно настраивают.
import { z } from "zod";
import { db } from "../db.js";
import { log } from "./../logger.js";

export const CvmSchema = z.object({
  // Сколько дней без покупки считать оттоком (для метрики «отток» и сигналов).
  churnDays: z.number().int().min(7).max(730).default(60),
  // Текст оффера по умолчанию при создании кампании (можно переопределить).
  defaultOffer: z.string().max(1000).default(""),
});

function defaults() {
  return { churnDays: 60, defaultOffer: "" };
}

let cache = { data: defaults(), at: 0, loaded: false };
const TTL_MS = 60 * 1000;

export async function refreshCvmConfig(force = false) {
  if (!force && cache.loaded && Date.now() - cache.at < TTL_MS)
    return cache.data;
  try {
    const row = await db.cvmConfig.findUnique({ where: { id: 1 } });
    const parsed = row ? CvmSchema.safeParse(row.data) : null;
    if (row && !parsed.success) {
      log.warn(
        { err: parsed.error?.message },
        "cvm: конфигурация не прошла валидацию — дефолты"
      );
    }
    cache = {
      data: parsed && parsed.success ? parsed.data : defaults(),
      at: Date.now(),
      loaded: true,
    };
  } catch (e) {
    log.warn({ err: e.message }, "cvm: не удалось прочитать из БД");
    cache.at = Date.now();
  }
  return cache.data;
}

export function getCvmCached() {
  return cache.data;
}

export async function saveCvmConfig(data, userId) {
  const parsed = CvmSchema.parse(data);
  await db.cvmConfig.upsert({
    where: { id: 1 },
    create: { id: 1, data: parsed, updatedById: userId || null },
    update: { data: parsed, updatedById: userId || null },
  });
  cache = { data: parsed, at: Date.now(), loaded: true };
  return parsed;
}
