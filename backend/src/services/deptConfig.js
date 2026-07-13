// Отделы и маршрутизация категорий задач. Управляется директором/сисадмином в
// админке; определяет видимость задач по отделам («закрытый» отдел виден только
// своим сотрудникам, финансам и высшему руководству). Одна строка (id=1),
// кэш TTL 60 сек, безопасные дефолты (совпадают с дефолтами фронтенда).
import { z } from "zod";
import { db } from "../db.js";
import { log } from "./../logger.js";

const DeptSchema = z.object({
  departments: z
    .array(
      z.object({
        id: z.string().min(1).max(40),
        name: z.string().min(1).max(120),
        restricted: z.boolean().default(false),
      })
    )
    .max(100),
  // Карта «категория → id отдела». Ключи/значения — строки.
  catDept: z
    .record(z.string().max(120), z.string().max(40))
    .refine((o) => Object.keys(o).length <= 300, {
      message: "Слишком много категорий",
    }),
});

// Дефолты — как во фронтенде (lib/org.js), чтобы до первой настройки поведение
// совпадало и на новых установках.
function defaults() {
  return {
    departments: [
      { id: "d1", name: "Финансовый отдел", restricted: true },
      { id: "d2", name: "IT-отдел", restricted: false },
      { id: "d3", name: "Эксплуатация", restricted: false },
      { id: "d4", name: "Снабжение", restricted: false },
      { id: "d5", name: "Управление", restricted: false },
    ],
    catDept: {
      "IT-поддержка": "d2",
      "Ремонт оборудования": "d3",
      "Финансы / Закупка": "d1",
      Прочее: "d4",
    },
  };
}

let cache = { data: defaults(), at: 0, loaded: false };
const TTL_MS = 60 * 1000;

export async function refreshDeptConfig(force = false) {
  if (!force && cache.loaded && Date.now() - cache.at < TTL_MS)
    return cache.data;
  try {
    const row = await db.deptConfig.findUnique({ where: { id: 1 } });
    const parsed = row ? DeptSchema.safeParse(row.data) : null;
    if (row && !parsed.success) {
      log.warn(
        { err: parsed.error?.message },
        "dept: конфигурация не прошла валидацию — дефолты"
      );
    }
    cache = {
      data: parsed && parsed.success ? parsed.data : defaults(),
      at: Date.now(),
      loaded: true,
    };
  } catch (e) {
    log.warn({ err: e.message }, "dept: не удалось прочитать из БД");
    cache.at = Date.now();
  }
  return cache.data;
}

export function getDeptCached() {
  return cache.data;
}

export async function saveDeptConfig(data, userId) {
  const parsed = DeptSchema.parse(data);
  // id отделов уникальны — иначе catDept/видимость ссылались бы неоднозначно.
  const ids = parsed.departments.map((d) => d.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error("id отделов должны быть уникальны");
  }
  await db.deptConfig.upsert({
    where: { id: 1 },
    create: { id: 1, data: parsed, updatedById: userId || null },
    update: { data: parsed, updatedById: userId || null },
  });
  cache = { data: parsed, at: Date.now(), loaded: true };
  return parsed;
}

export { DeptSchema };
