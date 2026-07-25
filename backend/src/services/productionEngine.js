// Движок производства: разворачивает техкарту изделия в упорядоченный план
// документов iiko (перемещения + акты приготовления/разбора) от сырья до
// готовой продукции.
//
// Ядро намеренно ЧИСТОЕ: никаких запросов к iiko, БД и Express — все данные
// приходят через параметры (charts, stocks, resolveWarehouse). Благодаря этому
// движок тестируется отдельно и переиспользуется тремя сценариями из ТЗ
// (обычное задание, до-задание, конструктор заказных тортов) без дублирования.
//
// Пять шагов (ТЗ 4.3): развернуть дерево → масс-баланс → свернуть дубли →
// топологическая сортировка → сгенерировать документы.

// Фазы производства в технологическом порядке (ТЗ 3). Стадии можно пропускать,
// но нельзя менять местами — порядок в массиве и задаёт это правило.
export const PHASES = [
  { key: "RAW", label: "Сырьё", prefixes: [] },
  {
    key: "CLEAN",
    label: "Очистка",
    prefixes: ["ОЧИЩЕННЫЙ", "ОЧИЩЕННАЯ", "ОЧИЩЕННЫЕ"],
  },
  { key: "SEMI", label: "Полуфабрикат", prefixes: ["ПФ"] },
  { key: "ASSEMBLY", label: "Сборка", prefixes: ["СБОРКА"] },
  { key: "COATING", label: "Покрытие", prefixes: ["ПОКРЫТИЕ"] },
  { key: "CUTTING", label: "Нарезка", prefixes: ["НАРЕЗКА"] },
  { key: "DECOR", label: "Украшение", prefixes: ["УКРАШЕНИЕ"] },
  { key: "FINISHED", label: "Готовая продукция", prefixes: ["ГП"] },
];

const PHASE_ORDER = Object.fromEntries(PHASES.map((p, i) => [p.key, i]));

export const PHASE_LABEL = Object.fromEntries(
  PHASES.map((p) => [p.key, p.label])
);

// Нормализация имени для разбора префикса: схлопываем двойные пробелы (ТЗ 10 —
// в базе встречаются названия с лишними пробелами) и приводим к верхнему
// регистру.
function norm(name) {
  return String(name || "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

// Фаза узла по префиксу названия (ТЗ 3). Без префикса — сырьё (конец ветки).
export function detectPhase(name) {
  const n = norm(name);
  for (const p of PHASES) {
    for (const prefix of p.prefixes) {
      // Префикс — отдельное слово в начале названия: «ПФ МЕЛАНЖ», но не
      // «ПФАСОЛЬ». Для «ОЧИЩЕННЫЙ/АЯ/ЫЕ» правило то же.
      if (n === prefix || n.startsWith(`${prefix} `)) return p.key;
    }
  }
  return "RAW";
}

// Узел требует собственного акта приготовления, если это не сырьё.
export function isSemiProduct(name) {
  return detectPhase(name) !== "RAW";
}

// Округление количеств: производственные количества держим до 4 знаков —
// достаточно для граммов/штук и не тянет за собой ошибку double при сложении
// сотен компонентов.
const round = (n) => Math.round((Number(n) || 0) * 1e4) / 1e4;

export class ProductionEngineError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "ProductionEngineError";
    this.code = code;
  }
}

// Коэффициент масс-баланса (ТЗ 4.3, шаг 2): сколько раз нужно «повторить»
// закладку карты, чтобы получить нужное количество.
//   коэф = нужное количество ÷ выход карты
// Выход берём из карты (output), а если он не задан — из суммы закладки
// компонентов (у части карт выход не проставлен). Единицы не привязаны к кг:
// коэффициент — отношение, применяется к любым единицам (ТЗ 13.1).
export function massBalanceRatio(chart, needQty) {
  const components = Array.isArray(chart?.components) ? chart.components : [];
  const sumIn = components.reduce((s, c) => s + (Number(c.qty) || 0), 0);
  const output = Number(chart?.output) > 0 ? Number(chart.output) : sumIn;
  if (!(output > 0)) {
    throw new ProductionEngineError(
      `Пустая техкарта «${chart?.name || chart?.code || "?"}» — нулевой выход и закладка`,
      "EMPTY_CHART"
    );
  }
  return (Number(needQty) || 0) / output;
}

// Разворот дерева (шаги 1–3): рекурсивно обходим карты вниз, считаем потребности
// по масс-балансу и СВОРАЧИВАЕМ дубли — один и тот же ПФ из разных веток
// суммируется в одну потребность (ТЗ 4.3, шаг 3).
//
// getChart(code) → { code, name, output, components:[{code,name,qty,unit}] } | null
// Возвращает { needs: Map<code,{code,name,qty,unit,depth}>, raw: Map<...> }.
function expandTree(rootCode, rootName, rootQty, getChart) {
  const needs = new Map(); // полуфабрикаты (узлы с актом)
  const raw = new Map(); // сырьё (конец ветки)
  // Защита от цикла в картах: путь текущей рекурсии. Циклическая карта
  // (А входит в Б, Б входит в А) иначе повесила бы расчёт.
  const path = new Set();
  // Кэш карт в пределах одного расчёта (ТЗ 8): каждый узел запрашивается один
  // раз, даже если встречается в нескольких ветках.
  const chartCache = new Map();
  const chartOf = (code) => {
    if (!chartCache.has(code)) chartCache.set(code, getChart(code) || null);
    return chartCache.get(code);
  };

  const walk = (code, name, needQty, depth) => {
    if (path.has(code)) {
      throw new ProductionEngineError(
        `Циклическая техкарта: «${name || code}» входит сам в себя`,
        "CYCLE"
      );
    }
    const chart = chartOf(code);
    if (
      !chart ||
      !Array.isArray(chart.components) ||
      !chart.components.length
    ) {
      // Нет карты — дальше не разворачиваем (для ПФ это ошибка данных ТЗ 10,
      // но расчёт не роняем: узел просто становится «листом»).
      return;
    }
    const ratio = massBalanceRatio(chart, needQty);
    path.add(code);
    for (const comp of chart.components) {
      const cQty = round((Number(comp.qty) || 0) * ratio);
      if (!(cQty > 0)) continue;
      const key = comp.code;
      if (isSemiProduct(comp.name)) {
        const cur = needs.get(key) || {
          code: key,
          name: comp.name,
          qty: 0,
          unit: comp.unit || "",
          depth,
        };
        cur.qty = round(cur.qty + cQty);
        // Глубина = самая дальняя от корня, где встретился узел. Нужна для
        // устойчивой сортировки при равных зависимостях.
        cur.depth = Math.max(cur.depth, depth);
        needs.set(key, cur);
        walk(key, comp.name, cQty, depth + 1);
      } else {
        const cur = raw.get(key) || {
          code: key,
          name: comp.name,
          qty: 0,
          unit: comp.unit || "",
        };
        cur.qty = round(cur.qty + cQty);
        raw.set(key, cur);
      }
    }
    path.delete(code);
  };

  walk(rootCode, rootName, rootQty, 1);
  return { needs, raw, chartOf };
}

// Топологическая сортировка (ТЗ 4.3, шаг 4): компонент производится строго
// раньше того, куда он входит. Алгоритм Кана; при неоднозначности сортируем по
// фазе и глубине — так порядок стабилен между запусками (важно для тестов и
// для читаемости плана оператором).
export function topoSort(needs, chartOf) {
  const codes = [...needs.keys()];
  const inSet = new Set(codes);
  // Рёбра: компонент → потребитель.
  const deps = new Map(codes.map((c) => [c, new Set()]));
  for (const code of codes) {
    const chart = chartOf(code);
    for (const comp of chart?.components || []) {
      if (inSet.has(comp.code)) deps.get(code).add(comp.code);
    }
  }
  const ready = codes.filter((c) => deps.get(c).size === 0);
  const order = [];
  const done = new Set();
  const rank = (c) => {
    const n = needs.get(c);
    return [PHASE_ORDER[detectPhase(n.name)] ?? 99, -n.depth, n.name];
  };
  const cmp = (a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    for (let i = 0; i < ra.length; i += 1) {
      if (ra[i] < rb[i]) return -1;
      if (ra[i] > rb[i]) return 1;
    }
    return 0;
  };
  while (ready.length) {
    ready.sort(cmp);
    const code = ready.shift();
    if (done.has(code)) continue;
    done.add(code);
    order.push(code);
    for (const other of codes) {
      if (done.has(other)) continue;
      const d = deps.get(other);
      if (d.has(code)) {
        d.delete(code);
        if (d.size === 0) ready.push(other);
      }
    }
  }
  if (order.length !== codes.length) {
    // Осталось что-то с неразрешёнными зависимостями — цикл в картах.
    const rest = codes.filter((c) => !done.has(c));
    throw new ProductionEngineError(
      `Цикл в техкартах: ${rest.slice(0, 3).join(", ")}`,
      "CYCLE"
    );
  }
  return order;
}

// Основной расчёт (ТЗ 4.6). Возвращает ПЛАН — то, что увидят отделы на мониторе.
// Документы по плану сразу не создаются: они создаются на ФАКТ, введённый
// отделом (ТЗ 5.4), — этим занимается buildDocumentsForFact ниже.
//
// Параметры:
//   product: { code, name, unit }        — что производим
//   qty: number                          — сколько заказано
//   getChart(code) → chart | null        — техкарта узла
//   getStock(code, warehouseId) → number — остаток на складе
//   resolveWarehouse(phase, node) → { warehouseId, warehouseName, departmentId }
//                                        — склад/отдел зависят и от продукта (ТЗ 3.1)
//   gpWarehouseId                        — склад готовой продукции
//   branchWarehouseId                    — склад филиала-получателя (может быть пустым)
export function buildProductionPlan({
  product,
  qty,
  getChart,
  getStock,
  resolveWarehouse,
  gpWarehouseId,
  branchWarehouseId = "",
}) {
  const need = Number(qty) || 0;
  if (!(need > 0)) {
    throw new ProductionEngineError(
      "Количество должно быть больше нуля",
      "BAD_QTY"
    );
  }
  if (!product?.code) {
    throw new ProductionEngineError("Не указано изделие", "NO_PRODUCT");
  }

  // ТЗ 4.2: сначала проверяем остаток САМОГО заказанного изделия. Хватает —
  // производство не запускается вовсе, только отгрузка.
  const stockGp = round(getStock(product.code, gpWarehouseId) || 0);
  const toProduceGp = round(Math.max(0, need - stockGp));

  const nodes = [];
  let rawNeeds = [];

  if (toProduceGp > 0) {
    const { needs, raw, chartOf } = expandTree(
      product.code,
      product.name,
      toProduceGp,
      getChart
    );
    rawNeeds = [...raw.values()].sort((a, b) => b.qty - a.qty);
    const order = topoSort(needs, chartOf);

    // ТЗ 4.4: остаток проверяем на КАЖДОМ узле — акт только на недостающее.
    for (const code of order) {
      const n = needs.get(code);
      const phase = detectPhase(n.name);
      const wh = resolveWarehouse(phase, n) || {};
      const stock = round(getStock(code, wh.warehouseId) || 0);
      const toProduce = round(Math.max(0, n.qty - stock));
      const chart = chartOf(code);
      const components =
        toProduce > 0 && chart ? componentsFor(chart, toProduce) : [];
      nodes.push({
        code,
        name: n.name,
        unit: n.unit,
        phase,
        phaseLabel: PHASE_LABEL[phase],
        warehouseId: wh.warehouseId || "",
        warehouseName: wh.warehouseName || "",
        departmentId: wh.departmentId || "",
        needQty: n.qty,
        stockQty: stock,
        planQty: toProduce, // сколько реально произвести
        skipped: toProduce === 0, // остатка хватает — акт не нужен
        needsDisassembly: Boolean(chart?.disassembly),
        components,
      });
    }

    // ТЗ 4.6 (новое): акт на САМО изделие — раньше этот шаг отсутствовал.
    const rootChart = getChart(product.code);
    nodes.push({
      code: product.code,
      name: product.name,
      unit: product.unit || "",
      phase: "FINISHED",
      phaseLabel: PHASE_LABEL.FINISHED,
      warehouseId: gpWarehouseId || "",
      warehouseName: "",
      departmentId:
        (resolveWarehouse("FINISHED", product) || {}).departmentId || "",
      needQty: need,
      stockQty: stockGp,
      planQty: toProduceGp,
      skipped: false,
      needsDisassembly: false,
      components: rootChart ? componentsFor(rootChart, toProduceGp) : [],
      isRoot: true,
    });
  }

  return {
    product: {
      code: product.code,
      name: product.name,
      unit: product.unit || "",
    },
    orderedQty: need,
    stockGp,
    toProduceGp,
    // Ничего производить не нужно — заказ закрывается отгрузкой остатка.
    shipOnly: toProduceGp === 0,
    nodes,
    rawNeeds,
    // Финальная передача заказанного количества в филиал — ВСЕГДА и строго по
    // себестоимости (ТЗ 3, 11: иначе двойной счёт выручки).
    shipment: branchWarehouseId
      ? {
          from: gpWarehouseId || "",
          to: branchWarehouseId,
          code: product.code,
          name: product.name,
          qty: need,
          priceMode: "COST",
        }
      : null,
  };
}

// Компоненты узла на заданное количество выпуска (масс-баланс).
export function componentsFor(chart, outQty) {
  const ratio = massBalanceRatio(chart, outQty);
  return (chart.components || [])
    .map((c) => ({
      code: c.code,
      name: c.name,
      qty: round((Number(c.qty) || 0) * ratio),
      unit: c.unit || "",
      sourceWarehouseId: c.warehouseId || "",
    }))
    .filter((c) => c.qty > 0);
}

// Документы под ФАКТ отдела (ТЗ 5.4). Порядок жёсткий и обязательный:
// сначала перемещение ингредиентов на склад фазы, только потом акт
// приготовления — акт действует в рамках одного склада и не может ссылаться на
// то, чего на складе физически нет.
//
// node — узел плана; factQty — фактически произведённое количество.
export function buildDocumentsForFact({
  node,
  factQty,
  chart,
  sourceWarehouseOf,
}) {
  const fact = round(factQty);
  if (!(fact > 0)) {
    throw new ProductionEngineError("Факт должен быть больше нуля", "BAD_FACT");
  }
  const docs = [];
  const components = chart ? componentsFor(chart, fact) : node.components || [];
  for (const c of components) {
    const from =
      (sourceWarehouseOf && sourceWarehouseOf(c)) || c.sourceWarehouseId || "";
    // Перемещение нужно, только если компонент лежит на другом складе.
    if (from && from !== node.warehouseId) {
      docs.push({
        type: "TRANSFER",
        from,
        to: node.warehouseId,
        code: c.code,
        name: c.name,
        qty: c.qty,
        unit: c.unit,
      });
    }
  }
  docs.push({
    type: "PRODUCTION_ACT",
    warehouse: node.warehouseId,
    code: node.code,
    name: node.name,
    qty: fact,
    unit: node.unit || "",
    components,
  });
  if (node.needsDisassembly) {
    docs.push({
      type: "DISASSEMBLY_ACT",
      warehouse: node.warehouseId,
      code: node.code,
      name: node.name,
      qty: fact,
    });
  }
  return docs;
}

// Недостача по узлу (ТЗ 5.4): сколько ещё нужно доготовить. Отрицательной не
// бывает — излишек остаётся на складе и учтётся при следующей проверке
// остатков (ТЗ 13.1).
export function shortfall(planQty, factTotal) {
  return round(Math.max(0, (Number(planQty) || 0) - (Number(factTotal) || 0)));
}
