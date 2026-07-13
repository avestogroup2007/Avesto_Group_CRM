// Планы и цели (план-факт): чистые расчёты темпа/процентов, доступ по ролям,
// факт из касс (iiko-выручка) и согласованных расходов.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";

import { app } from "../src/app.js";
import { db } from "../src/db.js";
import { monthMeta, computePlanFact } from "../src/services/planFact.js";

const PASS = "plan_test_pass_123";
const MONTH = "2026-03";
const BRANCH = "1";
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
    ["pl_director", "director"],
    ["pl_accountant", "accountant"],
    ["pl_staff", "staff"],
  ]) {
    await db.user.upsert({
      where: { name },
      update: { passwordHash, role, active: true, source: "iiko" },
      create: { name, passwordHash, role, source: "iiko" },
    });
  }
  // Факт выручки: касса филиала 1 с iiko-выручкой 4 000 000 (март).
  await db.cashReport.deleteMany({
    where: { branchId: BRANCH, date: { startsWith: `${MONTH}-` } },
  });
  await db.cashReport.create({
    data: {
      branchId: BRANCH,
      date: `${MONTH}-05`,
      userId: "plan-test",
      iiko: 4000000n,
    },
  });
  // Факт расходов: согласованный расход 1 000 000; заявка (pending) не считается.
  await db.moneyTx.deleteMany({ where: { comment: "PLANTEST" } });
  await db.moneyTx.create({
    data: {
      date: `${MONTH}-06`,
      direction: "expense",
      category: "Аренда",
      currency: "UZS",
      rate: 1,
      amount: 1000000n,
      amountUzs: 1000000n,
      approval: "approved",
      branchId: BRANCH,
      comment: "PLANTEST",
    },
  });
  await db.moneyTx.create({
    data: {
      date: `${MONTH}-07`,
      direction: "expense",
      category: "Маркетинг",
      currency: "UZS",
      rate: 1,
      amount: 500000n,
      amountUzs: 500000n,
      approval: "pending",
      branchId: BRANCH,
      comment: "PLANTEST",
    },
  });

  server = app.listen(0);
  await new Promise((ok) => server.once("listening", ok));
  base = `http://127.0.0.1:${server.address().port}`;
  directorToken = await login("pl_director");
  accountantToken = await login("pl_accountant");
  staffToken = await login("pl_staff");
});

after(async () => {
  await db.planEntry.deleteMany({ where: { month: MONTH } });
  await db.cashReport.deleteMany({
    where: { branchId: BRANCH, date: { startsWith: `${MONTH}-` } },
  });
  await db.moneyTx.deleteMany({ where: { comment: "PLANTEST" } });
  await db.auditLog.deleteMany({
    where: { user: { name: { startsWith: "pl_" } } },
  });
  await db.user.deleteMany({ where: { name: { startsWith: "pl_" } } });
  server?.close();
});

test("расчёт: прошедшие дни месяца по дате", () => {
  // Прошлый месяц целиком.
  assert.deepEqual(monthMeta("2026-03", "2026-05-10"), {
    daysInMonth: 31,
    daysElapsed: 31,
  });
  // Текущий месяц — по сегодняшний день.
  assert.deepEqual(monthMeta("2026-05", "2026-05-10"), {
    daysInMonth: 31,
    daysElapsed: 10,
  });
  // Будущий месяц ещё не начался.
  assert.deepEqual(monthMeta("2026-06", "2026-05-10"), {
    daysInMonth: 30,
    daysElapsed: 0,
  });
});

test("расчёт: проценты и темп план/факт", () => {
  const c = computePlanFact({
    planRevenue: 10000000,
    planExpense: 4000000,
    factRevenue: 4000000,
    factExpense: 1000000,
    daysInMonth: 30,
    daysElapsed: 15, // половина месяца → ожидаем 5 000 000
  });
  assert.equal(c.revenuePct, 40); // 4M из 10M
  assert.equal(c.expensePct, 25); // 1M из 4M
  assert.equal(c.expectedRevenue, 5000000);
  assert.equal(c.revenuePace, -1000000); // отстаём на 1M к сегодня
  assert.equal(c.revenuePacePct, 80); // 4M из ожидаемых 5M
  // Защита от деления на ноль.
  const zero = computePlanFact({
    planRevenue: 0,
    factRevenue: 100,
    daysInMonth: 30,
    daysElapsed: 0,
  });
  assert.equal(zero.revenuePct, 0);
  assert.equal(zero.expectedRevenue, 0);
});

test("план-факт: линейному персоналу недоступен", async () => {
  const res = await fetch(`${base}/api/plan?month=${MONTH}`, {
    headers: auth(staffToken),
  });
  assert.equal(res.status, 403);
});

test("план-факт: бухгалтер читает, но не правит план", async () => {
  const get = await fetch(`${base}/api/plan?month=${MONTH}`, {
    headers: auth(accountantToken),
  });
  assert.equal(get.status, 200);
  const put = await fetch(`${base}/api/plan/entry`, {
    method: "PUT",
    headers: jsonAuth(accountantToken),
    body: JSON.stringify({
      month: MONTH,
      branchId: BRANCH,
      revenue: 1,
      expense: 0,
    }),
  });
  assert.equal(put.status, 403);
});

test("план-факт: директор задаёт план, факт из касс и расходов", async () => {
  const put = await fetch(`${base}/api/plan/entry`, {
    method: "PUT",
    headers: jsonAuth(directorToken),
    body: JSON.stringify({
      month: MONTH,
      branchId: BRANCH,
      revenue: 10000000,
      expense: 4000000,
    }),
  });
  assert.equal(put.status, 200);

  const res = await fetch(`${base}/api/plan?month=${MONTH}`, {
    headers: auth(directorToken),
  });
  assert.equal(res.status, 200);
  const d = await res.json();
  const row = d.rows.find((x) => x.branchId === BRANCH);
  assert.ok(row);
  assert.equal(row.planRevenue, 10000000);
  assert.equal(row.factRevenue, 4000000); // из кассы iiko
  assert.equal(row.revenuePct, 40);
  assert.equal(row.planExpense, 4000000);
  assert.equal(row.factExpense, 1000000); // только согласованный расход
  assert.equal(row.expensePct, 25);
  // Итоги включают этот филиал.
  assert.ok(d.totals.factRevenue >= 4000000);
  assert.ok(d.totals.factExpense >= 1000000);
});

test("план-факт: неверный формат плана отклоняется", async () => {
  const res = await fetch(`${base}/api/plan/entry`, {
    method: "PUT",
    headers: jsonAuth(directorToken),
    body: JSON.stringify({ month: "2026/03", branchId: BRANCH }),
  });
  assert.equal(res.status, 400);
});
