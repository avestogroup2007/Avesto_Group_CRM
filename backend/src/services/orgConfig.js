// Конфигурация организации: бренд, юрлица и филиалы (с отделением iiko,
// признаком кассы/производства и окном чек-листов). Хранится одной JSON-
// строкой в OrgConfig (id=1); значения по умолчанию — текущая структура
// Avesto, поэтому существующая установка работает без каких-либо действий.
//
// Модуль держит конфигурацию в памяти (TTL 60 сек) и отдаёт её СИНХРОННО
// (getOrgCached) — это позволяет боту и хелперам не тянуть БД на каждый клик.
// refreshOrgConfig() зовётся в начале обработки вебхука и запросов /api/org.
import { z } from "zod";
import { db } from "../db.js";
import { log } from "./../logger.js";

export const ORG_DEFAULTS = {
  brandName: "Avesto Group",
  companies: [
    { id: 1, name: "«AVESTO CAFE» OK" },
    { id: 2, name: "«AVESTO SWEETS» OK" },
    { id: 3, name: "«INTERNATIONAL CATERING GROUP» MChJ" },
  ],
  branches: [
    // hours — рабочее окно санитарных обходов; prod — производственная точка
    // (цех/кейтеринг: без розничной кассы); iikoDept — имя Department в iiko.
    {
      id: 1,
      name: "Avesto Cafe — Микрорайон",
      companyId: 1,
      iikoDept: "Микрорайон",
      cash: true,
      prod: false,
      hours: { from: 8, to: 20 },
    },
    {
      id: 2,
      name: "Avesto Cafe — Узбекистанская",
      companyId: 1,
      iikoDept: "Uzbekistanskaya",
      cash: true,
      prod: false,
      hours: { from: 8, to: 20 },
    },
    {
      id: 3,
      name: "Avesto Sweets — Аэропорт",
      companyId: 2,
      iikoDept: "Aeroport",
      cash: true,
      prod: false,
      hours: { from: 8, to: 20 },
    },
    {
      id: 4,
      name: "Avesto Sweets — Наврузий цех",
      companyId: 2,
      iikoDept: "Navruzi Цех",
      cash: false,
      prod: true,
      hours: { from: 7, to: 16 },
    },
    {
      id: 5,
      name: "Avesto Sweets — Наврузий Магазин",
      companyId: 2,
      iikoDept: "Наврузи Магазин",
      cash: true,
      prod: false,
      hours: { from: 8, to: 20 },
    },
    {
      id: 6,
      name: "ICG — Кейтеринг (основной)",
      companyId: 3,
      iikoDept: "Кейтеринг (основной)",
      cash: false,
      prod: true,
      hours: { from: 7, to: 16 },
    },
  ],
};

export const OrgConfigSchema = z
  .object({
    brandName: z.string().min(1).max(80),
    companies: z
      .array(
        z.object({
          id: z.coerce.number().int(),
          name: z.string().min(1).max(200),
        })
      )
      .min(1)
      .max(50),
    branches: z
      .array(
        z.object({
          id: z.coerce.number().int(),
          name: z.string().min(1).max(200),
          companyId: z.coerce.number().int(),
          iikoDept: z.string().max(200).default(""),
          cash: z.boolean().default(true),
          prod: z.boolean().default(false),
          hours: z
            .object({
              from: z.coerce.number().int().min(0).max(23),
              to: z.coerce.number().int().min(0).max(23),
            })
            .refine((h) => h.from < h.to, {
              message: "Начало окна должно быть раньше конца",
            }),
        })
      )
      .min(1)
      .max(100),
  })
  // id филиалов уникальны — иначе orgBranchById (.find) вернёт первый, а
  // второй филиал станет «невидимым» для окон/сводок.
  .refine(
    (cfg) =>
      new Set(cfg.branches.map((b) => b.id)).size === cfg.branches.length,
    { message: "id филиалов должны быть уникальны" }
  )
  .refine(
    (cfg) =>
      new Set(cfg.companies.map((c) => c.id)).size === cfg.companies.length,
    { message: "id юр. лиц должны быть уникальны" }
  )
  // Каждый филиал ссылается на существующее юр. лицо (нет филиалов-сирот).
  .refine(
    (cfg) => {
      const ids = new Set(cfg.companies.map((c) => c.id));
      return cfg.branches.every((b) => ids.has(b.companyId));
    },
    { message: "Филиал ссылается на несуществующее юр. лицо" }
  );

let cache = { data: ORG_DEFAULTS, at: 0, loaded: false };
const TTL_MS = 60 * 1000;

// Подтянуть конфигурацию из БД (с TTL). Ошибка БД не роняет вызвавшего —
// остаёмся на предыдущем снимке (в худшем случае на дефолтах Avesto).
export async function refreshOrgConfig(force = false) {
  if (!force && cache.loaded && Date.now() - cache.at < TTL_MS)
    return cache.data;
  try {
    const row = await db.orgConfig.findUnique({ where: { id: 1 } });
    const parsed = row ? OrgConfigSchema.safeParse(row.data) : null;
    if (row && parsed && !parsed.success) {
      log.warn(
        { err: parsed.error?.message },
        "orgConfig: сохранённая конфигурация не прошла валидацию — откат на дефолты"
      );
    }
    cache = {
      data: parsed && parsed.success ? parsed.data : ORG_DEFAULTS,
      at: Date.now(),
      loaded: true,
    };
  } catch (e) {
    log.warn({ err: e.message }, "orgConfig: не удалось прочитать из БД");
    cache.at = Date.now();
  }
  return cache.data;
}

// Синхронный снимок (после первого refresh — актуальный, до — дефолты).
export function getOrgCached() {
  return cache.data;
}

export async function saveOrgConfig(data, userId) {
  const parsed = OrgConfigSchema.parse(data);
  await db.orgConfig.upsert({
    where: { id: 1 },
    create: { id: 1, data: parsed, updatedById: userId || null },
    update: { data: parsed, updatedById: userId || null },
  });
  cache = { data: parsed, at: Date.now(), loaded: true };
  return parsed;
}

// ── Хелперы по филиалам (читают кэшированный снимок) ────────────────────────
export function orgBranches() {
  return getOrgCached().branches;
}
export function orgBranchById(id) {
  return orgBranches().find((b) => Number(b.id) === Number(id)) || null;
}
export function orgBranchName(id) {
  return (orgBranchById(id) || {}).name || "—";
}
export function orgBranchHours(id) {
  const b = orgBranchById(id);
  return b ? b.hours : { from: 8, to: 20 };
}
export function orgHourSlots(id) {
  const { from, to } = orgBranchHours(id);
  const out = [];
  for (let h = from; h <= to; h++) out.push(`${String(h).padStart(2, "0")}:00`);
  return out;
}
