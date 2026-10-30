// Постоянный кэш отчётов iiko (в БД, поверх кэша в памяти).
//
// Проблема, которую решает. Отчёты iiko тяжёлые: один отчёт продаж — это семь
// OLAP-срезов подряд, а у iikoServer одна сессия на пользователя, поэтому
// запросы идут последовательно и занимают секунды. Кэш в памяти эту нагрузку
// снимал лишь частично: процесс на Render засыпает после ~15 минут простоя,
// и после пробуждения кэш пуст — первый пользователь каждое утро заново
// выкачивает весь период.
//
// Решение. Два уровня:
//   1) память — мгновенный ответ в пределах жизни процесса;
//   2) БД — переживает перезапуск, сон сервиса и деплой.
//
// Ключевое наблюдение: отчёт за ЗАКРЫТЫЙ день уже не изменится. Такие записи
// храним бессрочно (expiresAt = null) и в iiko за ними больше не ходим.
// Период, задевающий сегодняшний день, живёт коротко — продажи дописываются.
import { db } from "../db.js";
import { log } from "./../logger.js";
import { cacheGet, cacheSet } from "./cache.js";

// Сегодняшняя дата по Ташкенту — учётный день сети.
export function todayTashkent() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tashkent" });
}

// Период закрыт, если его последний день уже прошёл.
export function periodClosed(to) {
  return String(to) < todayTashkent();
}

// Сколько держать «живой» период (задевающий сегодня) — 3 минуты, как было.
const OPEN_TTL_MS = 3 * 60 * 1000;
// Память для закрытых периодов: данные неизменны, но саму копию в процессе
// дольше суток держать незачем — БД рядом и читается быстро.
const CLOSED_MEM_TTL_MS = 12 * 60 * 60 * 1000;

function memKey(kind, scope, from, to) {
  return `iiko:${kind}:${scope}:${from}:${to}`;
}

// Достать отчёт: память → БД → iiko. fetchFn вызывается только если данных
// нет нигде или они протухли.
export async function cachedReport(
  { kind, scope, from, to },
  fetchFn
) {
  const closed = periodClosed(to);
  const mk = memKey(kind, scope, from, to);

  const hitMem = cacheGet(mk);
  if (hitMem !== undefined) return hitMem;

  // Чтение из БД не должно ронять запрос: если база недоступна, просто идём
  // в iiko, как раньше.
  try {
    const row = await db.iikoReportCache.findUnique({
      where: {
        kind_scope_periodFrom_periodTo: {
          kind,
          scope,
          periodFrom: from,
          periodTo: to,
        },
      },
    });
    const fresh = row && (!row.expiresAt || row.expiresAt > new Date());
    if (fresh) {
      cacheSet(mk, row.payload, closed ? CLOSED_MEM_TTL_MS : OPEN_TTL_MS);
      return row.payload;
    }
  } catch (e) {
    log.warn({ err: e.message, kind, scope }, "iikoCache: чтение из БД не удалось");
  }

  const value = await fetchFn();

  cacheSet(mk, value, closed ? CLOSED_MEM_TTL_MS : OPEN_TTL_MS);
  // Запись в БД — тоже best-effort: отчёт уже получен, терять его из-за
  // проблемы с кэшем нельзя.
  try {
    const expiresAt = closed ? null : new Date(Date.now() + OPEN_TTL_MS);
    await db.iikoReportCache.upsert({
      where: {
        kind_scope_periodFrom_periodTo: {
          kind,
          scope,
          periodFrom: from,
          periodTo: to,
        },
      },
      create: {
        kind,
        scope,
        periodFrom: from,
        periodTo: to,
        payload: value,
        expiresAt,
      },
      update: { payload: value, fetchedAt: new Date(), expiresAt },
    });
  } catch (e) {
    log.warn({ err: e.message, kind, scope }, "iikoCache: запись в БД не удалась");
  }
  return value;
}

// Уборка протухших записей. Закрытые периоды (expiresAt = null) не трогаем —
// это и есть накопленная история, ради которой всё затевалось.
export async function pruneExpired() {
  try {
    const res = await db.iikoReportCache.deleteMany({
      where: { expiresAt: { not: null, lt: new Date() } },
    });
    return res.count;
  } catch (e) {
    log.warn({ err: e.message }, "iikoCache: уборка не удалась");
    return 0;
  }
}

// Сброс кэша по виду отчёта — на случай, когда настройки влияют на расчёт
// (например, изменили себестоимость блюд и food cost надо пересчитать).
export async function invalidateKind(kind) {
  try {
    const res = await db.iikoReportCache.deleteMany({ where: { kind } });
    return res.count;
  } catch (e) {
    log.warn({ err: e.message, kind }, "iikoCache: сброс не удался");
    return 0;
  }
}
