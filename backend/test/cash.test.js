// Интеграционные тесты API кассовых отчётов: сдача (upsert по филиал+дата),
// повторная сдача обновляет цифры, подтверждение офисом, выборка за период
// и запрет выборки для линейного персонала. Требует доступной БД.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";

import { app } from "../src/app.js";
import { db } from "../src/db.js";

const PASS = "cash_test_pass_123";
const CASHIER = "cash_test_cashier";
const DIRECTOR = "cash_test_director";
const BRANCH = "77"; // id филиала фронтенда (без FK)
const DATE = "2026-01-15";

let server;
let base;
let cashierToken;
let directorToken;

async function login(name) {
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login: name, password: PASS }),
  });
  const body = await res.json();
  return body.token;
}

function auth(token) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

before(async () => {
  const passwordHash = await bcrypt.hash(PASS, 10);
  for (const [name, role] of [
    [CASHIER, "staff"],
    [DIRECTOR, "director"],
  ]) {
    await db.user.upsert({
      where: { name },
      update: { passwordHash, role, active: true, source: "iiko" },
      create: { name, passwordHash, role, source: "iiko" },
    });
  }
  await db.cashReport.deleteMany({ where: { branchId: BRANCH } });

  server = app.listen(0);
  await new Promise((ok) => server.once("listening", ok));
  base = `http://127.0.0.1:${server.address().port}`;
  cashierToken = await login(CASHIER);
  directorToken = await login(DIRECTOR);
});

after(async () => {
  await db.cashReport.deleteMany({ where: { branchId: BRANCH } });
  server?.close();
});

test("касса: кассир сдаёт отчёт, повторная сдача обновляет цифры", async () => {
  const res = await fetch(`${base}/api/cash/report`, {
    method: "POST",
    headers: auth(cashierToken),
    body: JSON.stringify({
      branchId: BRANCH,
      branchName: "Тестовый филиал",
      date: DATE,
      fiscal: 1_000_000,
      nonFiscal: 200_000,
      humo: 300_000,
      iiko: 1_500_000,
    }),
  });
  assert.equal(res.status, 200);
  const saved = await res.json();
  assert.equal(saved.fiscal, 1_000_000);
  assert.equal(saved.status, "submitted");

  // Повторная сдача того же дня — upsert, не дубль.
  const res2 = await fetch(`${base}/api/cash/report`, {
    method: "POST",
    headers: auth(cashierToken),
    body: JSON.stringify({
      branchId: BRANCH,
      date: DATE,
      fiscal: 1_100_000,
      nonFiscal: 200_000,
    }),
  });
  assert.equal(res2.status, 200);
  const updated = await res2.json();
  assert.equal(updated.id, saved.id);
  assert.equal(updated.fiscal, 1_100_000);
});

test("касса: директор подтверждает отчёт, кассиру выборка запрещена", async () => {
  const res = await fetch(`${base}/api/cash/report/confirm`, {
    method: "POST",
    headers: auth(directorToken),
    body: JSON.stringify({ branchId: BRANCH, date: DATE }),
  });
  assert.equal(res.status, 200);
  const confirmed = await res.json();
  assert.equal(confirmed.status, "confirmed");
  assert.ok(confirmed.confirmedAt);

  // Выборка за период — офису можно…
  const list = await fetch(
    `${base}/api/cash/reports?from=${DATE}&to=${DATE}&branch=${BRANCH}`,
    { headers: auth(directorToken) }
  );
  assert.equal(list.status, 200);
  const { items } = await list.json();
  assert.equal(items.length, 1);
  assert.equal(items[0].status, "confirmed");

  // …а линейному персоналу — нет.
  const denied = await fetch(`${base}/api/cash/reports`, {
    headers: auth(cashierToken),
  });
  assert.equal(denied.status, 403);
});

test("чек-лист из веба пишется на сервер (via=app), мусор — 400", async () => {
  // Филиал должен существовать в конфигурации организации (дефолт: 1..6).
  const OKBRANCH = "1";
  const res = await fetch(`${base}/api/checklists/run`, {
    method: "POST",
    headers: auth(cashierToken),
    body: JSON.stringify({
      branchId: OKBRANCH,
      kind: "sanitary",
      date: DATE,
      slot: "09:00",
      items: [
        { text: "Унитаз очищен", done: true, needPhoto: true, hasPhoto: true },
        { text: "Пол вымыт", done: false, needPhoto: false, hasPhoto: false },
      ],
    }),
  });
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.pct, 50);
  const row = await db.shiftChecklistRun.findUnique({
    where: { id: body.id },
  });
  assert.equal(row.via, "app");
  assert.equal(row.branchId, OKBRANCH);
  await db.shiftChecklistRun.delete({ where: { id: body.id } });

  const bad = await fetch(`${base}/api/checklists/run`, {
    method: "POST",
    headers: auth(cashierToken),
    body: JSON.stringify({ branchId: OKBRANCH, kind: "wrong", date: DATE }),
  });
  assert.equal(bad.status, 400);

  // Неизвестный филиал (нет в конфигурации организации) — 400.
  const unknownBranch = await fetch(`${base}/api/checklists/run`, {
    method: "POST",
    headers: auth(cashierToken),
    body: JSON.stringify({
      branchId: "999999",
      kind: "open",
      date: DATE,
      items: [{ text: "x", done: true, needPhoto: false, hasPhoto: false }],
    }),
  });
  assert.equal(unknownBranch.status, 400);
});
