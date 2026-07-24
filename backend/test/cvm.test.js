// CVM: чистая аналитика (RFM/сводка), гейтинг модуля и ролей, создание клиента.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";

import { app } from "../src/app.js";
import { db } from "../src/db.js";
import { refreshModules } from "../src/services/modules.js";
import {
  scoreCustomers,
  cvmSummary,
  normalizePhone,
} from "../src/services/cvm.js";

// Включить/выключить модуль CVM и сбросить 60-сек кэш модулей (иначе гейт
// в маршруте отдаёт устаревшее значение между тестами).
async function setCvmModule(on) {
  await db.moduleConfig.upsert({
    where: { id: 1 },
    update: { data: { cvm: on } },
    create: { id: 1, data: { cvm: on } },
  });
  await refreshModules(true);
}

const PASS = "cvm_test_pass_123";
let server, base, directorToken, staffToken;

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
    ["cvm_director", "director"],
    ["cvm_staff", "staff"],
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
  directorToken = await login("cvm_director");
  staffToken = await login("cvm_staff");
});

after(async () => {
  await db.customer.deleteMany({
    where: { phone: { startsWith: "99890000" } },
  });
  await db.moduleConfig.deleteMany({ where: { id: 1 } });
  await db.auditLog.deleteMany({
    where: { user: { name: { startsWith: "cvm_" } } },
  });
  await db.user.deleteMany({ where: { name: { startsWith: "cvm_" } } });
  server?.close();
});

// Фиксированное «сейчас» для воспроизводимости.
const NOW = new Date("2026-07-24T00:00:00Z").getTime();
const daysAgo = (n) => new Date(NOW - n * 24 * 60 * 60 * 1000);

test("нормализация телефона: только цифры", () => {
  assert.equal(normalizePhone("+998 (90) 123-45-67"), "998901234567");
  assert.equal(normalizePhone(null), "");
});

test("RFM: чемпион и потерянный получают ожидаемые сегменты", () => {
  const customers = [
    // Свежий, частый, дорогой → чемпион.
    {
      id: "a",
      lastOrderAt: daysAgo(2),
      orders: 40,
      totalSpent: 50_000_000n,
      consent: true,
    },
    // Средний.
    {
      id: "b",
      lastOrderAt: daysAgo(30),
      orders: 8,
      totalSpent: 5_000_000n,
      consent: false,
    },
    // Давно не был, мало и дёшево → потерянный/спящий.
    {
      id: "c",
      lastOrderAt: daysAgo(400),
      orders: 1,
      totalSpent: 100_000n,
      consent: false,
    },
  ];
  const scored = scoreCustomers(customers, NOW);
  const by = Object.fromEntries(scored.map((c) => [c.id, c]));
  assert.equal(by.a.segment, "champions");
  assert.ok(["lost", "hibernating"].includes(by.c.segment));
  // Recency в днях считается корректно.
  assert.equal(by.a.recencyDays, 2);
});

test("сводка: LTV/итоги и отток по окну", () => {
  const customers = [
    {
      id: "a",
      lastOrderAt: daysAgo(2),
      orders: 10,
      totalSpent: 10_000_000n,
      consent: true,
    },
    {
      id: "b",
      lastOrderAt: daysAgo(100),
      orders: 2,
      totalSpent: 2_000_000n,
      consent: false,
    },
  ];
  const { totals, bySegment } = cvmSummary(customers, NOW, 60);
  assert.equal(totals.customers, 2);
  assert.equal(totals.totalSpent, 12_000_000);
  assert.equal(totals.avgLtv, 6_000_000);
  assert.equal(totals.churned, 1); // b (100 дн > 60)
  assert.equal(totals.withConsent, 1);
  assert.equal(
    bySegment.reduce((s, x) => s + x.count, 0),
    2
  );
});

test("пустая база безопасна", () => {
  const { totals } = cvmSummary([], NOW, 60);
  assert.equal(totals.customers, 0);
  assert.equal(totals.avgLtv, 0);
  assert.equal(totals.churnRate, 0);
});

test("гейтинг модуля: выключен → 403", async () => {
  await setCvmModule(false);
  const res = await fetch(`${base}/api/cvm/summary`, {
    headers: auth(directorToken),
  });
  assert.equal(res.status, 403);
});

test("гейтинг роли: линейному персоналу недоступно", async () => {
  await setCvmModule(true);
  const res = await fetch(`${base}/api/cvm/summary`, {
    headers: auth(staffToken),
  });
  assert.equal(res.status, 403);
});

test("директор: создаёт клиента и видит сводку (модуль включён)", async () => {
  await setCvmModule(true);
  const create = await fetch(`${base}/api/cvm/customers`, {
    method: "POST",
    headers: jsonAuth(directorToken),
    body: JSON.stringify({
      name: "Тест Клиент",
      phone: "998900001122",
      orders: 5,
      totalSpent: 3_000_000,
      consent: true,
    }),
  });
  assert.equal(create.status, 201);
  const summary = await fetch(`${base}/api/cvm/summary`, {
    headers: auth(directorToken),
  });
  assert.equal(summary.status, 200);
  const d = await summary.json();
  assert.ok(d.totals.customers >= 1);
  assert.ok(Array.isArray(d.bySegment));
});

test("неверные настройки CVM отклоняются", async () => {
  await setCvmModule(true);
  const res = await fetch(`${base}/api/cvm/config`, {
    method: "PUT",
    headers: jsonAuth(directorToken),
    body: JSON.stringify({ churnDays: 5 }), // < 7 → invalid
  });
  assert.equal(res.status, 400);
});
