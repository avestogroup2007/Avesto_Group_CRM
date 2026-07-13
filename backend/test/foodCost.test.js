// Себестоимость (food cost): чистый расчёт (приоритет источников цены),
// доступ к настройкам по ролям, отчёт закрыт без настроенной iiko.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";

import { app } from "../src/app.js";
import { db } from "../src/db.js";
import { computeFoodCost } from "../src/services/foodCostConfig.js";

const PASS = "foodcost_test_pass_123";
let server, base, directorToken, accountantToken, staffToken;

async function login(name) {
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login: name, password: PASS }),
  });
  return (await res.json()).token;
}
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const jsonAuth = (t) => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${t}`,
});

before(async () => {
  const passwordHash = await bcrypt.hash(PASS, 10);
  for (const [name, role] of [
    ["fc_director", "director"],
    ["fc_accountant", "accountant"],
    ["fc_staff", "staff"],
  ]) {
    await db.user.upsert({
      where: { name },
      update: { passwordHash, role, active: true, source: "iiko" },
      create: { name, passwordHash, role, source: "iiko" },
    });
  }
  server = app.listen(0);
  await new Promise((ok) => server.once("listening", ok));
  base = `http://127.0.0.1:${server.address().port}`;
  directorToken = await login("fc_director");
  accountantToken = await login("fc_accountant");
  staffToken = await login("fc_staff");
});

after(async () => {
  await db.foodCostConfig.deleteMany({ where: { id: 1 } });
  await db.auditLog.deleteMany({
    where: { user: { name: { startsWith: "fc_" } } },
  });
  await db.user.deleteMany({ where: { name: { startsWith: "fc_" } } });
  server?.close();
});

test("расчёт: приоритет цены (блюдо → группа → умолчание)", () => {
  const dishes = [
    // Ручная цена за единицу: 3000×10 = 30 000 при выручке 100 000 → 30%.
    { name: "Плов", group: "Кухня", revenue: 100000, qty: 10 },
    // % по группе «Бар» = 20% → 20 000.
    { name: "Лимонад", group: "Бар", revenue: 100000, qty: 40 },
    // Нет ни цены, ни группы в конфиге → общий defaultPct 35% → 35 000.
    { name: "Десерт", group: "Прочее", revenue: 100000, qty: 5 },
  ];
  const cfg = {
    defaultPct: 35,
    groupPct: { Бар: 20 },
    dishCost: { Плов: 3000 },
  };
  const { rows, totals } = computeFoodCost(dishes, cfg);
  const byName = Object.fromEntries(rows.map((r) => [r.name, r]));
  assert.equal(byName["Плов"].cost, 30000);
  assert.equal(byName["Плов"].source, "dish");
  assert.equal(byName["Плов"].foodCostPct, 30);
  assert.equal(byName["Лимонад"].cost, 20000);
  assert.equal(byName["Лимонад"].source, "group");
  assert.equal(byName["Десерт"].cost, 35000);
  assert.equal(byName["Десерт"].source, "default");
  // Итоги: выручка 300 000, себестоимость 85 000, маржа 215 000, ФК ≈ 28.3%.
  assert.equal(totals.revenue, 300000);
  assert.equal(totals.cost, 85000);
  assert.equal(totals.margin, 215000);
  assert.equal(totals.foodCostPct, 28.3);
  // Сортировка по выручке (все равны) не должна ронять расчёт.
  assert.equal(rows.length, 3);
});

test("расчёт: имя блюда как член прототипа не ломает расчёт", () => {
  // Блюдо с именем «constructor»/«toString» не должно ложно совпасть с
  // членом прототипа объекта и дать NaN в себестоимости/итогах.
  const { rows, totals } = computeFoodCost(
    [
      { name: "constructor", group: "toString", revenue: 100000, qty: 1 },
      { name: "Обычное", group: "Кухня", revenue: 100000, qty: 1 },
    ],
    { defaultPct: 30, groupPct: {}, dishCost: {} }
  );
  for (const r of rows) {
    assert.ok(Number.isFinite(r.cost), `cost ${r.name} должен быть числом`);
    assert.equal(r.cost, 30000);
  }
  assert.ok(Number.isFinite(totals.cost));
  assert.equal(totals.cost, 60000);
});

test("расчёт: пустой список и нулевая выручка безопасны", () => {
  assert.deepEqual(computeFoodCost([], {}).totals, {
    revenue: 0,
    cost: 0,
    margin: 0,
    foodCostPct: 0,
  });
  const one = computeFoodCost([{ name: "X", revenue: 0, qty: 0 }], {});
  assert.equal(one.rows[0].foodCostPct, 0);
});

test("настройки: линейному персоналу недоступны", async () => {
  const res = await fetch(`${base}/api/food-cost/config`, {
    headers: auth(staffToken),
  });
  assert.equal(res.status, 403);
});

test("настройки: бухгалтер читает, но не правит", async () => {
  const get = await fetch(`${base}/api/food-cost/config`, {
    headers: auth(accountantToken),
  });
  assert.equal(get.status, 200);
  const cfg = await get.json();
  assert.equal(typeof cfg.defaultPct, "number");

  const put = await fetch(`${base}/api/food-cost/config`, {
    method: "PUT",
    headers: jsonAuth(accountantToken),
    body: JSON.stringify({ defaultPct: 25, groupPct: {}, dishCost: {} }),
  });
  assert.equal(put.status, 403);
});

test("настройки: директор сохраняет и читает обратно", async () => {
  const put = await fetch(`${base}/api/food-cost/config`, {
    method: "PUT",
    headers: jsonAuth(directorToken),
    body: JSON.stringify({
      defaultPct: 28,
      groupPct: { Кухня: 32 },
      dishCost: { Плов: 3500 },
    }),
  });
  assert.equal(put.status, 200);
  const get = await fetch(`${base}/api/food-cost/config`, {
    headers: auth(directorToken),
  });
  const cfg = await get.json();
  assert.equal(cfg.defaultPct, 28);
  assert.equal(cfg.groupPct["Кухня"], 32);
  assert.equal(cfg.dishCost["Плов"], 3500);
});

test("настройки: неверный ФК% отклоняется", async () => {
  const put = await fetch(`${base}/api/food-cost/config`, {
    method: "PUT",
    headers: jsonAuth(directorToken),
    body: JSON.stringify({ defaultPct: 250, groupPct: {}, dishCost: {} }),
  });
  assert.equal(put.status, 400);
});

test("отчёт: неверный формат дат отклоняется (400)", async () => {
  const res = await fetch(`${base}/api/iiko/food-cost`, {
    method: "POST",
    headers: jsonAuth(directorToken),
    body: JSON.stringify({ from: "xxx", to: "2026-06-30" }),
  });
  assert.equal(res.status, 400);
});

test("отчёт: без настроенной iiko отдаёт 503 (configured:false)", async () => {
  const res = await fetch(`${base}/api/iiko/food-cost`, {
    method: "POST",
    headers: jsonAuth(directorToken),
    body: JSON.stringify({ from: "2026-06-01", to: "2026-06-30" }),
  });
  // В тестовой среде iiko не настроена — эндпоинт отвечает 503, а не падает.
  assert.equal(res.status, 503);
  const d = await res.json();
  assert.equal(d.configured, false);
});
