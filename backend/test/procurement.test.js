// Тесты ядра модуля «Закупки и склад» (чистые функции, без БД/сети).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  analyzePriceTrends,
  analyzeStock,
  computeMovement,
} from "../src/services/procurement.js";

const CFG = {
  spikeThresholdPct: 20,
  watchThresholdPct: 10,
  baselineWindow: 6,
  seasonalYears: 2,
  seasonalMinPoints: 2,
  stockMethod: "both",
  stockDaysCover: 7,
};
const D = (y, m, d) => new Date(Date.UTC(y, m - 1, d));

test("сезонная норма не считает нормальный сезонный рост аномалией", () => {
  // Зимой товар традиционно дорогой (~2000), летом дешевле (~1000).
  const entries = [
    {
      productId: "P1",
      productName: "Помидор",
      date: D(2023, 1, 10),
      price: 2000,
    },
    {
      productId: "P1",
      productName: "Помидор",
      date: D(2024, 1, 10),
      price: 2000,
    },
    {
      productId: "P1",
      productName: "Помидор",
      date: D(2024, 7, 10),
      price: 1000,
    },
    // Текущая закупка — снова январь, ~на уровне прошлых январей.
    {
      productId: "P1",
      productName: "Помидор",
      date: D(2025, 1, 12),
      price: 2100,
    },
  ];
  const { rows } = analyzePriceTrends(entries, CFG);
  const p = rows.find((r) => r.productId === "P1");
  assert.equal(p.baselineKind, "seasonal");
  assert.equal(p.flag, "normal"); // +5% к сезонной норме — не сигнал
});

test("резкий скачок цены помечается как spike", () => {
  const entries = [];
  for (let m = 1; m <= 6; m++)
    entries.push({
      productId: "P2",
      productName: "Мука",
      date: D(2024, m, 5),
      price: 1000,
    });
  // Текущая — резко дороже, сезонной истории для этого месяца нет → recent.
  entries.push({
    productId: "P2",
    productName: "Мука",
    date: D(2024, 8, 5),
    price: 1400,
  });
  const { rows, summary } = analyzePriceTrends(entries, CFG);
  const p = rows.find((r) => r.productId === "P2");
  assert.equal(p.baselineKind, "recent");
  assert.equal(p.flag, "spike");
  assert.equal(p.deltaPct, 40);
  assert.equal(summary.spike, 1);
});

test("товар с единственной закупкой помечается new (нет базы)", () => {
  const { rows } = analyzePriceTrends(
    [{ productId: "P3", productName: "Соль", date: D(2024, 3, 1), price: 500 }],
    CFG
  );
  assert.equal(rows[0].flag, "new");
});

test("статус остатка: ok / low / critical / negative + авто-минимум", () => {
  const items = [
    { productId: "A", name: "A", stock: 200, avgDailyConsumption: 10 }, // ok
    { productId: "B", name: "B", stock: 50, avgDailyConsumption: 10 }, // low (<70)
    { productId: "C", name: "C", stock: 5, avgDailyConsumption: 10 }, // critical (0.5 дня)
    { productId: "D", name: "D", stock: -3, avgDailyConsumption: 1 }, // negative
  ];
  const { rows, summary } = analyzeStock(items, CFG);
  const by = Object.fromEntries(rows.map((r) => [r.productId, r]));
  assert.equal(by.A.status, "ok");
  assert.equal(by.B.status, "low");
  assert.equal(by.B.effectiveMin, 70); // 10/день × 7 дней
  assert.equal(by.C.status, "critical");
  assert.equal(by.D.status, "negative");
  assert.equal(summary.negative, 1);
  assert.ok(by.B.suggestedOrder > 0);
});

test("ручной минимум перекрывает авто (метод both)", () => {
  const { rows } = analyzeStock(
    [
      {
        productId: "E",
        name: "E",
        stock: 100,
        avgDailyConsumption: 1,
        minQty: 500,
        manual: true,
      },
    ],
    CFG
  );
  assert.equal(rows[0].effectiveMin, 500);
  assert.equal(rows[0].minSource, "manual");
  assert.equal(rows[0].status, "low");
});

test("движение товара: расход, невозможный приход и минусовой остаток", () => {
  const { rows, summary } = computeMovement([
    { productId: "A", name: "A", open: 100, income: 50, close: 120 }, // расход 30
    { productId: "B", name: "B", open: 100, income: 0, close: 150 }, // «появился» товар
    { productId: "C", name: "C", open: 10, income: 0, close: -5 }, // минус
  ]);
  const by = Object.fromEntries(rows.map((r) => [r.productId, r]));
  assert.equal(by.A.consumption, 30);
  assert.equal(by.A.flag, "ok");
  assert.equal(by.B.flag, "impossible");
  assert.equal(by.C.flag, "negativeStock");
  assert.equal(summary.impossible, 1);
  assert.equal(summary.negativeStock, 1);
});
