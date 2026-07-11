// Простой in-memory кэш с TTL для тяжёлых отчётов (iiko OLAP, PnL).
// Данные за закрытые (прошедшие) дни не меняются — их можно держать долго;
// «сегодня» кэшируем коротко. При росте нагрузки заменяется на Redis без
// изменения вызывающего кода.
const store = new Map();
const MAX_ENTRIES = 500;

export function cacheGet(key) {
  const e = store.get(key);
  if (!e) return undefined;
  if (Date.now() > e.exp) {
    store.delete(key);
    return undefined;
  }
  return e.value;
}

export function cacheSet(key, value, ttlMs) {
  if (store.size >= MAX_ENTRIES) {
    // Уборка протухших; если всё живое — чистим целиком (кэш, не хранилище).
    for (const [k, e] of store) if (Date.now() > e.exp) store.delete(k);
    if (store.size >= MAX_ENTRIES) store.clear();
  }
  store.set(key, { value, exp: Date.now() + ttlMs });
}

// Обёртка: вернуть из кэша или вычислить и положить.
export async function cached(key, ttlMs, fn) {
  const hit = cacheGet(key);
  if (hit !== undefined) return hit;
  const value = await fn();
  cacheSet(key, value, ttlMs);
  return value;
}
