// Движок производства: разворот дерева, масс-баланс, свёртка дублей,
// топологическая сортировка, учёт остатков, документы под факт.
// Проверки соответствуют критериям приёмки ТЗ (раздел 9).
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  detectPhase,
  isSemiProduct,
  massBalanceRatio,
  buildProductionPlan,
  buildDocumentsForFact,
  componentsFor,
  shortfall,
  ProductionEngineError,
} from "../src/services/productionEngine.js";

// ── Тестовое дерево ────────────────────────────────────────────────────────
// ГП ТОРТ ─┬─ СБОРКА КОРЖ ─┬─ ПФ МЕЛАНЖ ── Яйцо, Сахар (сырьё)
//          │               └─ Мука (сырьё)
//          └─ ПФ МЕЛАНЖ (тот же ПФ во второй ветке → свёртка дублей)
const CHARTS = {
  GP: {
    code: "GP",
    name: "ГП ТОРТ",
    output: 1,
    components: [
      { code: "SB", name: "СБОРКА КОРЖ", qty: 0.8, unit: "кг" },
      { code: "ML", name: "ПФ МЕЛАНЖ", qty: 0.2, unit: "кг" },
    ],
  },
  SB: {
    code: "SB",
    name: "СБОРКА КОРЖ",
    output: 1,
    components: [
      { code: "ML", name: "ПФ МЕЛАНЖ", qty: 0.5, unit: "кг" },
      { code: "FL", name: "Мука", qty: 0.5, unit: "кг" },
    ],
  },
  ML: {
    code: "ML",
    name: "ПФ МЕЛАНЖ",
    output: 1,
    components: [
      { code: "EG", name: "Яйцо", qty: 0.6, unit: "кг" },
      { code: "SG", name: "Сахар", qty: 0.4, unit: "кг" },
    ],
  },
};

const getChart = (code) => CHARTS[code] || null;
// Склад фазы: в тестах — по фазе (в бою функция учитывает и продукт, ТЗ 3.1).
const resolveWarehouse = (phase) => ({
  warehouseId: `WH_${phase}`,
  warehouseName: phase,
  departmentId: `DEP_${phase}`,
});
const noStock = () => 0;

test("фаза определяется по префиксу, сырьё — без префикса", () => {
  assert.equal(detectPhase("ПФ МЕЛАНЖ"), "SEMI");
  assert.equal(detectPhase("СБОРКА КОРЖ"), "ASSEMBLY");
  assert.equal(detectPhase("ГП ТОРТ"), "FINISHED");
  assert.equal(detectPhase("ОЧИЩЕННЫЙ КАРТОФЕЛЬ"), "CLEAN");
  assert.equal(detectPhase("Мука"), "RAW");
  // Двойные пробелы в названиях (ТЗ 10) не должны ломать разбор.
  assert.equal(detectPhase("ПФ   МЕЛАНЖ"), "SEMI");
  // Префикс — отдельное слово: «ПФАСОЛЬ» это сырьё, а не полуфабрикат.
  assert.equal(detectPhase("ПФАСОЛЬ"), "RAW");
  assert.equal(isSemiProduct("Мука"), false);
  assert.equal(isSemiProduct("ПФ МЕЛАНЖ"), true);
});

test("масс-баланс: коэффициент = нужно ÷ выход карты", () => {
  assert.equal(
    massBalanceRatio({ output: 2, components: [{ qty: 2 }] }, 10),
    5
  );
  // Выход не задан — берём сумму закладки.
  assert.equal(
    massBalanceRatio({ components: [{ qty: 4 }, { qty: 6 }] }, 5),
    0.5
  );
  // Пустая карта (ТЗ 10) — понятная ошибка, а не NaN в расчёте.
  assert.throws(
    () => massBalanceRatio({ components: [] }, 5),
    (e) => e instanceof ProductionEngineError && e.code === "EMPTY_CHART"
  );
});

test("план: свёртка дублей — один акт на суммарное количество", () => {
  const plan = buildProductionPlan({
    product: { code: "GP", name: "ГП ТОРТ", unit: "шт" },
    qty: 10,
    getChart,
    getStock: noStock,
    resolveWarehouse,
    gpWarehouseId: "WH_GP",
  });
  const ml = plan.nodes.filter((n) => n.code === "ML");
  // ПФ МЕЛАНЖ встречается в двух ветках → ровно ОДИН узел (ТЗ 4.3 шаг 3).
  assert.equal(ml.length, 1);
  // 10 ГП → СБОРКА 8 кг → МЕЛАНЖ 4 кг; плюс напрямую в ГП 2 кг = 6 кг.
  assert.equal(ml[0].needQty, 6);
});

test("план: топологическая сортировка — компонент раньше потребителя", () => {
  const plan = buildProductionPlan({
    product: { code: "GP", name: "ГП ТОРТ", unit: "шт" },
    qty: 10,
    getChart,
    getStock: noStock,
    resolveWarehouse,
    gpWarehouseId: "WH_GP",
  });
  const idx = (code) => plan.nodes.findIndex((n) => n.code === code);
  assert.ok(idx("ML") < idx("SB"), "МЕЛАНЖ должен идти раньше СБОРКИ");
  assert.ok(idx("SB") < idx("GP"), "СБОРКА должна идти раньше ГП");
  // Само изделие — последним узлом, с актом на него (ТЗ 4.6, «новое»).
  assert.equal(plan.nodes[plan.nodes.length - 1].code, "GP");
  assert.equal(plan.nodes[plan.nodes.length - 1].isRoot, true);
});

test("план: сырьё сворачивается по всему дереву", () => {
  const plan = buildProductionPlan({
    product: { code: "GP", name: "ГП ТОРТ", unit: "шт" },
    qty: 10,
    getChart,
    getStock: noStock,
    resolveWarehouse,
    gpWarehouseId: "WH_GP",
  });
  const raw = Object.fromEntries(plan.rawNeeds.map((r) => [r.code, r.qty]));
  // МЕЛАНЖ 6 кг → Яйцо 3.6, Сахар 2.4; Мука — из СБОРКИ 8 кг → 4.
  assert.equal(raw.EG, 3.6);
  assert.equal(raw.SG, 2.4);
  assert.equal(raw.FL, 4);
});

test("остаток изделия покрывает заказ — производство не запускается", () => {
  const plan = buildProductionPlan({
    product: { code: "GP", name: "ГП ТОРТ", unit: "шт" },
    qty: 10,
    getChart,
    getStock: (code) => (code === "GP" ? 12 : 0),
    resolveWarehouse,
    gpWarehouseId: "WH_GP",
    branchWarehouseId: "WH_BRANCH",
  });
  assert.equal(plan.shipOnly, true);
  assert.equal(plan.toProduceGp, 0);
  assert.equal(plan.nodes.length, 0);
  // Отгрузка всё равно есть — и строго по себестоимости (ТЗ 3, 11).
  assert.equal(plan.shipment.qty, 10);
  assert.equal(plan.shipment.priceMode, "COST");
});

test("остаток изделия частичный — производим только недостачу", () => {
  const plan = buildProductionPlan({
    product: { code: "GP", name: "ГП ТОРТ", unit: "шт" },
    qty: 10,
    getChart,
    getStock: (code) => (code === "GP" ? 4 : 0),
    resolveWarehouse,
    gpWarehouseId: "WH_GP",
  });
  assert.equal(plan.toProduceGp, 6);
  const ml = plan.nodes.find((n) => n.code === "ML");
  assert.equal(ml.needQty, 3.6); // 6 ГП вместо 10 → потребности пропорционально
});

test("остаток узла — акт только на разницу, при достатке узел пропускается", () => {
  const plan = buildProductionPlan({
    product: { code: "GP", name: "ГП ТОРТ", unit: "шт" },
    qty: 10,
    getChart,
    // МЕЛАНЖа на складе 2 кг из нужных 6, СБОРКИ хватает с запасом.
    getStock: (code) => (code === "ML" ? 2 : code === "SB" ? 100 : 0),
    resolveWarehouse,
    gpWarehouseId: "WH_GP",
  });
  const ml = plan.nodes.find((n) => n.code === "ML");
  assert.equal(ml.planQty, 4); // 6 − 2
  assert.equal(ml.skipped, false);
  const sb = plan.nodes.find((n) => n.code === "SB");
  assert.equal(sb.planQty, 0);
  assert.equal(sb.skipped, true); // остатка достаточно — акт не нужен (ТЗ 4.4)
});

test("документы под факт: перемещение всегда перед актом", () => {
  const node = {
    code: "ML",
    name: "ПФ МЕЛАНЖ",
    unit: "кг",
    warehouseId: "WH_SEMI",
    needsDisassembly: false,
  };
  const docs = buildDocumentsForFact({
    node,
    factQty: 5,
    chart: CHARTS.ML,
    // Сырьё лежит на складе сырья — значит нужно перемещение.
    sourceWarehouseOf: () => "WH_RAW",
  });
  assert.equal(docs[0].type, "TRANSFER");
  assert.equal(docs[1].type, "TRANSFER");
  assert.equal(docs[2].type, "PRODUCTION_ACT");
  // Акт — строго на факт, а не на план (ТЗ 5.4).
  assert.equal(docs[2].qty, 5);
  // Перемещения — на пересчитанные под факт количества.
  assert.equal(docs[0].qty, 3); // Яйцо 0.6 × 5
  assert.equal(docs[1].qty, 2); // Сахар 0.4 × 5
});

test("документы под факт: компонент уже на складе фазы — без перемещения", () => {
  const docs = buildDocumentsForFact({
    node: { code: "ML", name: "ПФ МЕЛАНЖ", warehouseId: "WH_SEMI" },
    factQty: 5,
    chart: CHARTS.ML,
    sourceWarehouseOf: () => "WH_SEMI", // уже там
  });
  assert.equal(docs.length, 1);
  assert.equal(docs[0].type, "PRODUCTION_ACT");
});

test("документы под факт: нулевой/отрицательный факт отклоняется", () => {
  assert.throws(
    () =>
      buildDocumentsForFact({
        node: { code: "ML", warehouseId: "W" },
        factQty: 0,
        chart: CHARTS.ML,
      }),
    (e) => e instanceof ProductionEngineError && e.code === "BAD_FACT"
  );
});

test("недостача: план − факт, излишек не уходит в минус", () => {
  assert.equal(shortfall(10, 7), 3);
  assert.equal(shortfall(10, 10), 0);
  assert.equal(shortfall(10, 12), 0); // излишек остаётся остатком (ТЗ 13.1)
});

test("циклическая техкарта не вешает расчёт", () => {
  const cyclic = {
    A: {
      code: "A",
      name: "ПФ А",
      output: 1,
      components: [{ code: "B", name: "ПФ Б", qty: 1 }],
    },
    B: {
      code: "B",
      name: "ПФ Б",
      output: 1,
      components: [{ code: "A", name: "ПФ А", qty: 1 }],
    },
  };
  assert.throws(
    () =>
      buildProductionPlan({
        product: { code: "A", name: "ПФ А" },
        qty: 1,
        getChart: (c) => cyclic[c] || null,
        getStock: noStock,
        resolveWarehouse,
        gpWarehouseId: "WH_GP",
      }),
    (e) => e instanceof ProductionEngineError && e.code === "CYCLE"
  );
});

test("нулевое количество заказа отклоняется", () => {
  assert.throws(
    () =>
      buildProductionPlan({
        product: { code: "GP", name: "ГП ТОРТ" },
        qty: 0,
        getChart,
        getStock: noStock,
        resolveWarehouse,
        gpWarehouseId: "WH_GP",
      }),
    (e) => e instanceof ProductionEngineError && e.code === "BAD_QTY"
  );
});

test("масс-баланс сходится: списанное сырьё = выпуск (ТЗ 9)", () => {
  // Для карт без потерь сумма закладки = выходу, значит по всей цепочке
  // суммарное сырьё должно равняться выпуску ГП.
  const plan = buildProductionPlan({
    product: { code: "GP", name: "ГП ТОРТ", unit: "шт" },
    qty: 10,
    getChart,
    getStock: noStock,
    resolveWarehouse,
    gpWarehouseId: "WH_GP",
  });
  const rawTotal = plan.rawNeeds.reduce((s, r) => s + r.qty, 0);
  assert.equal(Math.round(rawTotal * 1e4) / 1e4, 10);
});

test("componentsFor пересчитывает состав под нужный выпуск", () => {
  const comps = componentsFor(CHARTS.ML, 2);
  assert.deepEqual(
    comps.map((c) => [c.code, c.qty]),
    [
      ["EG", 1.2],
      ["SG", 0.8],
    ]
  );
});
