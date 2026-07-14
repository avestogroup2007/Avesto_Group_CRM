// Конфигурация модуля «Закупки и склад» (одна строка, id=1, кэш TTL 60 сек).
// Модуль универсальный (подходит любому бизнесу с товарным учётом): все пороги
// и режимы настраиваются здесь, ничего не «зашито» под конкретную компанию —
// это часть ориентира на продаваемый продукт.
import { z } from "zod";
import { db } from "../db.js";
import { log } from "./../logger.js";

export const ProcurementSchema = z.object({
  // Порог «резкого скачка» цены закупки к базовой (сезонной) цене, % — сигнал.
  spikeThresholdPct: z.number().min(1).max(500).default(20),
  // Порог «под наблюдением» (жёлтая зона), % — меньше сигнала, но заметно.
  watchThresholdPct: z.number().min(1).max(500).default(10),
  // Сколько последних закупок берём для базовой цены (медиана), когда сезонной
  // истории мало.
  baselineWindow: z.number().int().min(2).max(50).default(6),
  // Сколько прошлых лет учитываем для «сезонной нормы» (тот же месяц года).
  seasonalYears: z.number().int().min(1).max(5).default(2),
  // Минимально сезонных точек, чтобы доверять сезонной норме (иначе — окно).
  seasonalMinPoints: z.number().int().min(1).max(20).default(3),
  // Метод минимальных остатков: авто по расходу, вручную, или оба.
  stockMethod: z.enum(["auto", "manual", "both"]).default("both"),
  // Авто-минимум = средний дневной расход × N дней запаса.
  stockDaysCover: z.number().min(1).max(90).default(7),
  // Учитывать погоду (Open-Meteo, без ключа) как контекст сезонного роста.
  weatherEnabled: z.boolean().default(true),
  // Координаты для погоды (по умолчанию — Ташкент). Универсально: любой город.
  weatherLat: z.number().min(-90).max(90).default(41.311),
  weatherLon: z.number().min(-180).max(180).default(69.279),
  // Слать ли сигналы в Telegram.
  notifyTelegram: z.boolean().default(true),
});

function defaults() {
  return ProcurementSchema.parse({});
}

let cache = { data: defaults(), at: 0, loaded: false };
const TTL_MS = 60 * 1000;

export async function refreshProcurementConfig(force = false) {
  if (!force && cache.loaded && Date.now() - cache.at < TTL_MS)
    return cache.data;
  try {
    const row = await db.procurementConfig.findUnique({ where: { id: 1 } });
    const parsed = row ? ProcurementSchema.safeParse(row.data) : null;
    if (row && !parsed.success) {
      log.warn(
        { err: parsed.error?.message },
        "procurement: конфигурация не прошла валидацию — дефолты"
      );
    }
    cache = {
      data: parsed && parsed.success ? parsed.data : defaults(),
      at: Date.now(),
      loaded: true,
    };
  } catch (e) {
    log.warn({ err: e.message }, "procurement: не удалось прочитать из БД");
    cache.at = Date.now();
  }
  return cache.data;
}

export function getProcurementCached() {
  return cache.data;
}

export async function saveProcurementConfig(data, userId) {
  const parsed = ProcurementSchema.parse(data);
  await db.procurementConfig.upsert({
    where: { id: 1 },
    create: { id: 1, data: parsed, updatedById: userId || null },
    update: { data: parsed, updatedById: userId || null },
  });
  cache = { data: parsed, at: Date.now(), loaded: true };
  return parsed;
}

export { defaults as procurementDefaults };
