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

const MANAGER = "cash_test_manager"; // привязан к филиалу BRANCH
const ACCT = "cash_test_acct"; // бухгалтер — видит все филиалы
const OTHER_BRANCH = "88";

let server;
let base;
let cashierToken;
let directorToken;
let managerToken;
let acctToken;

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
  for (const [name, role, branch] of [
    [CASHIER, "staff", null],
    [DIRECTOR, "director", null],
    [MANAGER, "manager", BRANCH],
    [ACCT, "accountant", null],
  ]) {
    await db.user.upsert({
      where: { name },
      update: {
        passwordHash,
        role,
        active: true,
        source: "iiko",
        checklistBranch: branch,
      },
      create: {
        name,
        passwordHash,
        role,
        source: "iiko",
        checklistBranch: branch,
      },
    });
  }
  await db.cashReport.deleteMany({
    where: { branchId: { in: [BRANCH, OTHER_BRANCH] } },
  });

  server = app.listen(0);
  await new Promise((ok) => server.once("listening", ok));
  base = `http://127.0.0.1:${server.address().port}`;
  cashierToken = await login(CASHIER);
  directorToken = await login(DIRECTOR);
  managerToken = await login(MANAGER);
  acctToken = await login(ACCT);
});

after(async () => {
  await db.cashReport.deleteMany({
    where: { branchId: { in: [BRANCH, OTHER_BRANCH] } },
  });
  await db.auditLog.deleteMany({
    where: { user: { name: { in: [MANAGER, ACCT] } } },
  });
  await db.user.deleteMany({ where: { name: { in: [MANAGER, ACCT] } } });
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

test("касса: управляющий видит отчёты только своего филиала, бухгалтер — все", async () => {
  // Офис (директор) заводит отчёты по двум филиалам.
  for (const b of [BRANCH, OTHER_BRANCH]) {
    const r = await fetch(`${base}/api/cash/report`, {
      method: "POST",
      headers: auth(directorToken),
      body: JSON.stringify({ branchId: b, date: "2026-02-01", fiscal: 100 }),
    });
    assert.equal(r.status, 200);
  }

  // Управляющий привязан к BRANCH — в выборке только его филиал.
  const mgr = await (
    await fetch(`${base}/api/cash/reports`, { headers: auth(managerToken) })
  ).json();
  const mgrBranches = new Set(mgr.items.map((x) => x.branchId));
  assert.ok(mgrBranches.has(BRANCH));
  assert.ok(!mgrBranches.has(OTHER_BRANCH), "чужой филиал не должен попадать");

  // Бухгалтер видит оба филиала (обзорная роль).
  const acct = await (
    await fetch(`${base}/api/cash/reports`, { headers: auth(acctToken) })
  ).json();
  const acctBranches = new Set(acct.items.map((x) => x.branchId));
  assert.ok(acctBranches.has(BRANCH) && acctBranches.has(OTHER_BRANCH));
});

test("касса: сдача управляющего принудительно на его филиал", async () => {
  // Просит чужой филиал 88, но привязан к BRANCH — запишется BRANCH.
  const res = await fetch(`${base}/api/cash/report`, {
    method: "POST",
    headers: auth(managerToken),
    body: JSON.stringify({
      branchId: OTHER_BRANCH,
      date: "2026-03-01",
      fiscal: 50,
    }),
  });
  assert.equal(res.status, 200);
  const own = await db.cashReport.findUnique({
    where: { branchId_date: { branchId: BRANCH, date: "2026-03-01" } },
  });
  assert.ok(own, "отчёт должен лечь на филиал управляющего");
  const other = await db.cashReport.findUnique({
    where: { branchId_date: { branchId: OTHER_BRANCH, date: "2026-03-01" } },
  });
  assert.equal(other, null, "на чужой филиал ничего не записано");
});
