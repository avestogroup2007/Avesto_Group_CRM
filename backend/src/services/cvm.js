// CVM (Customer Value Management): чистая аналитика ценности клиентов —
// RFM-сегментация, LTV/метрики, отток. Все функции детерминированные и легко
// тестируются: на вход — список клиентов с агрегатами покупок, на выход —
// оценки, сегменты и сводка. «Сейчас» (now) передаётся аргументом, а не берётся
// из Date.now(), чтобы расчёт был воспроизводим.

const DAY = 24 * 60 * 60 * 1000;

// Нормализация телефона — ключ дедупа клиентов. Оставляем только цифры; ведущую
// «8» узбекского/локального набора не трогаем (нет надёжного правила без страны).
export function normalizePhone(v) {
  const digits = String(v ?? "").replace(/\D/g, "");
  return digits;
}

// Метаданные сегментов RFM: код → человекочитаемая подпись, описание и действие.
// Порядок — от самых ценных к «потерянным» (для стабильной сортировки в UI).
export const SEGMENTS = [
  {
    key: "champions",
    label: "Чемпионы",
    desc: "Покупают часто, много и недавно",
    action: "Поощрять, просить отзывы и рекомендации",
  },
  {
    key: "loyal",
    label: "Лояльные",
    desc: "Регулярные покупки, хорошая сумма",
    action: "Программа лояльности, допродажи",
  },
  {
    key: "potential",
    label: "Потенциальные",
    desc: "Недавние с ростом активности",
    action: "Вовлекать, повышать частоту",
  },
  {
    key: "new",
    label: "Новые",
    desc: "Купили недавно, но пока мало",
    action: "Онбординг, второй визит",
  },
  {
    key: "attention",
    label: "Требуют внимания",
    desc: "Средние по всем показателям, начали остывать",
    action: "Персональные предложения",
  },
  {
    key: "at_risk",
    label: "Под угрозой оттока",
    desc: "Раньше покупали активно, давно не возвращались",
    action: "Вернуть скидкой/оффером",
  },
  {
    key: "hibernating",
    label: "Спящие",
    desc: "Давно не покупали, активность была невысокой",
    action: "Реактивация, напоминание о себе",
  },
  {
    key: "lost",
    label: "Потерянные",
    desc: "Очень давно не покупали, низкая ценность",
    action: "Разовая win-back кампания или исключить",
  },
];

export const SEGMENT_LABEL = Object.fromEntries(
  SEGMENTS.map((s) => [s.key, s.label])
);

// Балл 1..5 по распределению значений (квантили). higher=true — большее значение
// лучше (Frequency/Monetary); false — меньшее лучше (Recency: свежее = лучше).
// Устойчиво к малым выборкам: при одном уникальном значении все получают 3.
function scorer(values, higher) {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const uniq = new Set(sorted).size;
  return (v) => {
    if (n === 0 || uniq <= 1) return 3;
    // Ранг = доля значений строго меньше v (0..1) → балл 1..5.
    let lo = 0;
    let hi = n;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid] < v) lo = mid + 1;
      else hi = mid;
    }
    const pct = lo / n; // доля значений строго меньше v
    let score = Math.min(5, Math.floor(pct * 5) + 1);
    if (!higher) score = 6 - score; // для Recency инвертируем (меньше дней = лучше)
    return score;
  };
}

// Сегмент по баллам R и среднему F/M (0.5 округляем вверх). Классическая карта
// RFM, сведённая к 8 понятным сегментам.
function segmentOf(r, f, m) {
  const fm = Math.round((f + m) / 2);
  if (r >= 4 && fm >= 4) return "champions";
  if (r >= 3 && fm >= 3) return "loyal";
  if (r >= 4 && f <= 1) return "new";
  if (r >= 4 && fm <= 3) return "potential";
  if (r >= 3 && fm <= 2) return "attention";
  if (r <= 2 && fm >= 3) return "at_risk";
  if (r <= 2 && fm === 2) return "hibernating";
  return "lost";
}

// Дни с последней покупки (Recency). Нет даты — большое число (максимальная
// давность), чтобы клиент не попадал в «свежие» без данных.
export function recencyDays(lastOrderAt, now) {
  if (!lastOrderAt) return Infinity;
  const t =
    lastOrderAt instanceof Date
      ? lastOrderAt.getTime()
      : +new Date(lastOrderAt);
  if (!Number.isFinite(t)) return Infinity;
  return Math.max(0, Math.floor((now - t) / DAY));
}

// Приводит агрегаты клиента к числам (BigInt totalSpent → Number аккуратно).
function money(v) {
  if (typeof v === "bigint") return Number(v);
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// Основной расчёт: по списку клиентов возвращает те же объекты + { recencyDays,
// r, f, m, rfm (строка «R F M»), score (R+F+M), segment }. churnDays нужен только
// для сводки, здесь не используется.
export function scoreCustomers(customers, now) {
  const list = Array.isArray(customers) ? customers : [];
  const recArr = list.map((c) => {
    const d = recencyDays(c.lastOrderAt, now);
    return Number.isFinite(d) ? d : Number.MAX_SAFE_INTEGER;
  });
  const freqArr = list.map((c) => Number(c.orders) || 0);
  const monArr = list.map((c) => money(c.totalSpent));
  const scoreR = scorer(recArr, false);
  const scoreF = scorer(freqArr, true);
  const scoreM = scorer(monArr, true);
  return list.map((c, i) => {
    const r = scoreR(recArr[i]);
    const f = scoreF(freqArr[i]);
    const m = scoreM(monArr[i]);
    return {
      ...c,
      recencyDays: Number.isFinite(recencyDays(c.lastOrderAt, now))
        ? recencyDays(c.lastOrderAt, now)
        : null,
      r,
      f,
      m,
      rfm: `${r}${f}${m}`,
      score: r + f + m,
      segment: segmentOf(r, f, m),
    };
  });
}

// Сводка по базе: итоги, метрики LTV, разбивка по сегментам, отток. churnDays —
// сколько дней без покупки считать оттоком (по умолчанию 60).
export function cvmSummary(customers, now, churnDays = 60) {
  const scored = scoreCustomers(customers, now);
  const count = scored.length;
  const totalSpent = scored.reduce((s, c) => s + money(c.totalSpent), 0);
  const totalOrders = scored.reduce((s, c) => s + (Number(c.orders) || 0), 0);
  const withConsent = scored.filter((c) => c.consent).length;

  let churned = 0;
  let active = 0;
  for (const c of scored) {
    const d = recencyDays(c.lastOrderAt, now);
    if (d > churnDays) churned += 1;
    else active += 1;
  }
  const atRisk = scored.filter((c) => c.segment === "at_risk").length;

  const bySegMap = new Map(
    SEGMENTS.map((s) => [s.key, { count: 0, revenue: 0 }])
  );
  for (const c of scored) {
    const e = bySegMap.get(c.segment) || { count: 0, revenue: 0 };
    e.count += 1;
    e.revenue += money(c.totalSpent);
    bySegMap.set(c.segment, e);
  }
  const bySegment = SEGMENTS.map((s) => {
    const e = bySegMap.get(s.key) || { count: 0, revenue: 0 };
    return {
      key: s.key,
      label: s.label,
      desc: s.desc,
      action: s.action,
      count: e.count,
      revenue: Math.round(e.revenue),
      share: count ? Math.round((e.count / count) * 1000) / 10 : 0,
    };
  });

  return {
    totals: {
      customers: count,
      active,
      churned,
      atRisk,
      withConsent,
      totalSpent: Math.round(totalSpent),
      avgLtv: count ? Math.round(totalSpent / count) : 0,
      avgOrderValue: totalOrders ? Math.round(totalSpent / totalOrders) : 0,
      avgFrequency: count ? Math.round((totalOrders / count) * 10) / 10 : 0,
      churnRate: count ? Math.round((churned / count) * 1000) / 10 : 0,
      churnDays,
    },
    bySegment,
  };
}
