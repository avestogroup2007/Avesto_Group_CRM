// Модули продукта: какие функции включены на этой установке. Управляются
// владельцем системы из Back Office (PUT /api/modules, только owner). Клиент
// видит флаги (GET), но не меняет — он лишь настраивает содержимое включённого
// модуля в своей админке.
//
// Реестр MODULES — единый источник правды о доступных функциях: добавление
// новой возможности = новая запись здесь + флаг по умолчанию false (новые
// установки получают её выключенной, включает владелец по потребности).
import { z } from "zod";
import { db } from "../db.js";
import { log } from "./../logger.js";

// key -> { label, desc, default }. default:false — модуль по умолчанию выключен.
export const MODULES = {
  employeeChecklists: {
    label: "Чек-листы сотрудников",
    desc: "Чек-листы по должностям (управляющий, официант, повар и т.д.), настраиваются клиентом в админке.",
    default: false,
  },
  cleaningChecklists: {
    label: "Чек-листы уборки",
    desc: "Почасовые чек-листы уборки/санитарии с расписанием и фотоотчётом.",
    default: false,
  },
  cvm: {
    label: "CVM — ценность клиента",
    desc: "Клиентская база, RFM-сегментация, LTV, отток и кампании/офферы. Данные — ручной ввод/импорт Excel и обогащение из iiko Лояльность.",
    default: false,
  },
};

function defaults() {
  return Object.fromEntries(
    Object.entries(MODULES).map(([k, v]) => [k, v.default])
  );
}

// Схема: только известные ключи, только boolean. Неизвестные — отбрасываются.
export const ModuleSchema = z.object(
  Object.fromEntries(
    Object.keys(MODULES).map((k) => [
      k,
      z.boolean().default(MODULES[k].default),
    ])
  )
);

let cache = { data: defaults(), at: 0, loaded: false };
const TTL_MS = 60 * 1000;

export async function refreshModules(force = false) {
  if (!force && cache.loaded && Date.now() - cache.at < TTL_MS)
    return cache.data;
  try {
    const row = await db.moduleConfig.findUnique({ where: { id: 1 } });
    const merged = { ...defaults(), ...(row?.data || {}) };
    const parsed = ModuleSchema.safeParse(merged);
    if (row && !parsed.success) {
      log.warn(
        { err: parsed.error?.message },
        "modules: конфигурация не прошла валидацию — дефолты"
      );
    }
    cache = {
      data: parsed.success ? parsed.data : defaults(),
      at: Date.now(),
      loaded: true,
    };
  } catch (e) {
    log.warn({ err: e.message }, "modules: не удалось прочитать из БД");
    cache.at = Date.now();
  }
  return cache.data;
}

export function getModulesCached() {
  return cache.data;
}

export function moduleEnabled(key) {
  return Boolean(getModulesCached()[key]);
}

export async function saveModules(data, userId) {
  const parsed = ModuleSchema.parse({ ...defaults(), ...data });
  await db.moduleConfig.upsert({
    where: { id: 1 },
    create: { id: 1, data: parsed, updatedById: userId || null },
    update: { data: parsed, updatedById: userId || null },
  });
  cache = { data: parsed, at: Date.now(), loaded: true };
  return parsed;
}
