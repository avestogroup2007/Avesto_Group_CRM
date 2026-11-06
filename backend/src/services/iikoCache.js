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

// Идущие прямо сейчас обращения к iiko: ключ → Promise. Нужны, чтобы десять
// одновременных открытий одного отчёта не породили десять запросов к iiko
// (у него одна сессия на пользователя — параллельные запросы её рвут).
const inFlight = new Map();

function once(key, fn) {
  const running = inFlight.get(key);
  if (running) return running;
  const p = (async () => {
    try {
      return await fn();
    } finally {
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, p);
  return p;
}

// Достать отчёт: память → БД → iiko. fetchFn вызывается только если данных
// нет нигде или они протухли.
export async function cachedReport({ kind, scope, from, to }, fetchFn) {
  const closed = periodClosed(to);
  const mk = memKey(kind, scope, from, to);

  const hitMem = cacheGet(mk);
  if (hitMem !== undefined) return hitMem;

  // Чтение из БД не должно ронять запрос: если база недоступна, просто идём
  // в iiko, как раньше.
  let stale = null;
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
    if (row) {
      const fresh = !row.expiresAt || row.expiresAt > new Date();
      if (fresh) {
        cacheSet(mk, row.payload, closed ? CLOSED_MEM_TTL_MS : OPEN_TTL_MS);
        return row.payload;
      }
      stale = row.payload;
    }
  } catch (e) {
    log.warn(
      { err: e.message, kind, scope },
      "iikoCache: чтение из БД не удалось"
    );
  }

  // Данные протухли, но они есть. Отдаём их сразу, а обновление запускаем в
  // фоне: отчёт из iiko тянется ~17 секунд, и держать пользователя всё это
  // время ради трёхминутной свежести незачем. Через минуту он увидит
  // обновлённые цифры, но ждать не будет никогда.
  if (stale !== null) {
    once(mk, async () => {
      try {
        const fresh = await fetchFn();
        cacheSet(mk, fresh, OPEN_TTL_MS);
        await store({ kind, scope, from, to, value: fresh, closed });
      } catch (e) {
        log.warn(
          { err: e.message, kind, scope },
          "iikoCache: фоновое обновление не удалось"
        );
      }
    });
    return stale;
  }

  // Данных нет совсем — ждать придётся, но одновременные запросы схлопываем
  // в один поход к iiko.
  const value = await once(mk, fetchFn);

  cacheSet(mk, value, closed ? CLOSED_MEM_TTL_MS : OPEN_TTL_MS);
  await store({ kind, scope, from, to, value, closed });
  return value;
}

// Запись в БД — best-effort: отчёт уже получен, терять его из-за проблемы с
// кэшем нельзя.
async function store({ kind, scope, from, to, value, closed }) {
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
    log.warn(
      { err: e.message, kind, scope },
      "iikoCache: запись в БД не удалась"
    );
  }
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
