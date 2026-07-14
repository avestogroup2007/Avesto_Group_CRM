// Тест сборки сигналов закупок/склада (чистая функция, без БД/сети).
import { test } from "node:test";
import assert from "node:assert/strict";
import { collectAlerts } from "../src/services/procurementAlerts.js";

test("collectAlerts: только скачки цен и проблемные остатки, по серьёзности", () => {
  const trends = {
    rows: [
      {
        productId: "p1",
        name: "Мука",
        flag: "spike",
        lastPrice: 1400,
        baseline: 1000,
        deltaPct: 40,
        baselineKind: "recent",
      },
      { productId: "p2", name: "Соль", flag: "normal", deltaPct: 0 },
    ],
  };
  const stock = {
    rows: [
      {
        productId: "p3",
        name: "Масло",
        status: "critical",
        stock: 2,
        daysCover: 1,
        suggestedOrder: 50,
      },
      { productId: "p4", name: "Сахар", status: "ok", stock: 100 },
      {
        productId: "p5",
        name: "Рис",
        status: "negative",
        stock: -3,
        daysCover: null,
        suggestedOrder: 0,
      },
    ],
  };
  const a = collectAlerts(trends, stock, "2026-07-14");
  assert.equal(a.length, 3); // spike + critical + negative (ok/normal — нет)
  // Порядок по серьёзности: price_spike → stock_negative → stock_critical
  assert.equal(a[0].kind, "price_spike");
  assert.equal(a[1].kind, "stock_negative");
  assert.equal(a[2].kind, "stock_critical");
  assert.ok(a[0].text.includes("Мука"));
  assert.ok(a[0].text.includes("40%"));
  assert.equal(a[0].day, "2026-07-14");
});

test("collectAlerts: пустые входы — пусто", () => {
  assert.deepEqual(collectAlerts({}, {}, "2026-07-14"), []);
  assert.deepEqual(collectAlerts(null, null, "2026-07-14"), []);
});
