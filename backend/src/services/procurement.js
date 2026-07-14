// Ядро модуля «Закупки и склад» — ЧИСТЫЕ функции анализа (без БД и сети, легко
// тестируются). Универсально для любого бизнеса с товарным учётом:
//   • analyzePriceTrends — тренд цен закупки с учётом СЕЗОННОЙ нормы: сравниваем
//     цену не с общим средним, а с нормой того же месяца прошлых лет, чтобы не
//     принимать нормальный сезонный рост за аномалию. Флаги: spike/watch/drop.
//   • analyzeStock — статус остатка (ok/low/critical/negative) и рекомендация
//     заказа; минимум — авто (по расходу), ручной или оба.
//   • computeMovement — сверка движения (начало + приход − конец = расход) и
//     ловля невозможных ситуаций (отрицательный остаток, «появление» товара).

function median(nums) {
  const a = (nums || [])
    .map(Number)
    .filter((x) => Number.isFinite(x))
    .sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

function monthOf(d) {
  const dt = d instanceof Date ? d : new Date(d);
  return dt.getUTCMonth(); // 0..11
}
function yearOf(d) {
  const dt = d instanceof Date ? d : new Date(d);
  return dt.getUTCFullYear();
}

// entries: [{ productId, productName, unit, date, price, amount, supplier }]
// config: из ProcurementSchema. Возвращает { rows, summary }.
export function analyzePriceTrends(entries, config) {
  const cfg = config || {};
  const spikeT = Number(cfg.spikeThresholdPct) || 20;
  const watchT = Number(cfg.watchThresholdPct) || 10;
  const win = Number(cfg.baselineWindow) || 6;
  const seasonalYears = Number(cfg.seasonalYears) || 2;
  const seasonalMin = Number(cfg.seasonalMinPoints) || 3;

  // Группируем по товару.
  const byProduct = new Map();
  for (const e of Array.isArray(entries) ? entries : []) {
    if (!e || !e.productId || !Number.isFinite(Number(e.price))) continue;
    const arr = byProduct.get(e.productId) || [];
    arr.push({
      ...e,
      price: Number(e.price),
      date: e.date instanceof Date ? e.date : new Date(e.date),
    });
    byProduct.set(e.productId, arr);
  }

  const rows = [];
  for (const [productId, list] of byProduct) {
    list.sort((a, b) => a.date - b.date);
    const last = list[list.length - 1];
    const prev = list.slice(0, -1);
    if (!prev.length) {
      rows.push({
        productId,
        name: last.productName || productId,
        unit: last.unit || "",
        supplier: last.supplier || "",
        lastPrice: last.price,
        lastDate: last.date.toISOString().slice(0, 10),
        baseline: null,
        baselineKind: "new",
        deltaPct: 0,
        flag: "new",
        samples: list.length,
      });
      continue;
    }
    // Сезонная норма: тот же месяц года, но из ПРОШЛЫХ лет (в пределах окна лет).
    const lm = monthOf(last.date);
    const ly = yearOf(last.date);
    const seasonalPrices = prev
      .filter((e) => monthOf(e.date) === lm && yearOf(e.date) < ly)
      .filter((e) => ly - yearOf(e.date) <= seasonalYears)
      .map((e) => e.price);
    // Недавняя норма: медиана последних `win` закупок до текущей.
    const recentPrices = prev.slice(-win).map((e) => e.price);

    let baseline;
    let baselineKind;
    if (seasonalPrices.length >= seasonalMin) {
      baseline = median(seasonalPrices);
      baselineKind = "seasonal";
    } else {
      baseline = median(recentPrices);
      baselineKind = "recent";
    }
    const deltaPct =
      baseline && baseline > 0
        ? Math.round(((last.price - baseline) / baseline) * 1000) / 10
        : 0;
    let flag = "normal";
    if (deltaPct >= spikeT) flag = "spike";
    else if (deltaPct >= watchT) flag = "watch";
    else if (deltaPct <= -spikeT) flag = "drop";
    rows.push({
      productId,
      name: last.productName || productId,
      unit: last.unit || "",
      supplier: last.supplier || "",
      lastPrice: last.price,
      prevPrice: prev[prev.length - 1].price,
      lastDate: last.date.toISOString().slice(0, 10),
      baseline: baseline != null ? Math.round(baseline * 100) / 100 : null,
      baselineKind,
      deltaPct,
      flag,
      samples: list.length,
    });
  }

  // Сигналы вперёд, затем по величине отклонения.
  const rank = { spike: 0, drop: 1, watch: 2, normal: 3, new: 4 };
  rows.sort(
    (a, b) =>
      (rank[a.flag] ?? 9) - (rank[b.flag] ?? 9) ||
      Math.abs(b.deltaPct) - Math.abs(a.deltaPct)
  );
  const summary = {
    total: rows.length,
    spike: rows.filter((r) => r.flag === "spike").length,
    watch: rows.filter((r) => r.flag === "watch").length,
    drop: rows.filter((r) => r.flag === "drop").length,
  };
  return { rows, summary };
}

// items: [{ productId, name, stock, avgDailyConsumption, minQty, maxQty, manual }]
// config: из ProcurementSchema. Возвращает { rows, summary }.
export function analyzeStock(items, config) {
  const cfg = config || {};
  const method = cfg.stockMethod || "both";
  const daysCoverCfg = Number(cfg.stockDaysCover) || 7;

  const rows = (Array.isArray(items) ? items : []).map((it) => {
    const stock = Number(it.stock) || 0;
    const adc = Math.max(0, Number(it.avgDailyConsumption) || 0);
    const manualMin = it.minQty == null ? null : Number(it.minQty);
    const autoMin = Math.round(adc * daysCoverCfg * 100) / 100;
    let effectiveMin;
    if (method === "manual") effectiveMin = manualMin ?? 0;
    else if (method === "auto") effectiveMin = autoMin;
    else effectiveMin = it.manual && manualMin != null ? manualMin : autoMin;

    const daysCover = adc > 0 ? Math.round((stock / adc) * 10) / 10 : null;
    let status = "ok";
    if (stock < 0) status = "negative";
    else if (stock <= 0 || (daysCover != null && daysCover < 2))
      status = "critical";
    else if (stock < effectiveMin) status = "low";

    const target =
      it.maxQty != null ? Number(it.maxQty) : Math.max(effectiveMin * 2, 0);
    const needOrder = status === "low" || status === "critical";
    const suggestedOrder = needOrder
      ? Math.max(0, Math.round((target - stock) * 100) / 100)
      : 0;

    return {
      productId: it.productId,
      name: it.name || it.productId,
      stock,
      avgDailyConsumption: adc,
      daysCover,
      effectiveMin,
      minSource:
        method === "manual" || (it.manual && manualMin != null)
          ? "manual"
          : "auto",
      status,
      suggestedOrder,
    };
  });

  const rank = { negative: 0, critical: 1, low: 2, ok: 3 };
  rows.sort(
    (a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9) || a.stock - b.stock
  );
  const summary = {
    total: rows.length,
    negative: rows.filter((r) => r.status === "negative").length,
    critical: rows.filter((r) => r.status === "critical").length,
    low: rows.filter((r) => r.status === "low").length,
  };
  return { rows, summary };
}

// rows: [{ productId, name, unit, open, income, close }] — остаток на начало,
// приход за период, остаток на конец. Считает теоретический расход и ловит
// невозможные ситуации. eps — допуск на копейки/дробные единицы.
export function computeMovement(rows, eps = 0.001) {
  const out = (Array.isArray(rows) ? rows : []).map((r) => {
    const open = Number(r.open) || 0;
    const income = Number(r.income) || 0;
    const close = Number(r.close) || 0;
    const consumption = Math.round((open + income - close) * 1000) / 1000;
    let flag = "ok";
    if (close < -eps)
      flag = "negativeStock"; // остаток ушёл в минус
    else if (consumption < -eps) flag = "impossible"; // «появился» товар из ниоткуда
    return {
      productId: r.productId,
      name: r.name || r.productId,
      unit: r.unit || "",
      open,
      income,
      close,
      consumption,
      flag,
    };
  });
  const rank = { impossible: 0, negativeStock: 1, ok: 2 };
  out.sort((a, b) => (rank[a.flag] ?? 9) - (rank[b.flag] ?? 9));
  const summary = {
    total: out.length,
    impossible: out.filter((r) => r.flag === "impossible").length,
    negativeStock: out.filter((r) => r.flag === "negativeStock").length,
  };
  return { rows: out, summary };
}

export const _internals = { median, monthOf, yearOf };
