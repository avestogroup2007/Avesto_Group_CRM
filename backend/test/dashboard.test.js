// Дашборд руководителя: доступ по ролям, расчёт расхождений кассы и алертов,
// ограничение по филиалу для управляющего.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";

import { app } from "../src/app.js";
import { db } from "../src/db.js";
import { refreshOrgConfig } from "../src/services/orgConfig.js";

const PASS = "dash_test_pass_123";
const DATE = "2026-07-14";
let server, base, directorToken, staffToken, managerToken;

async function login(name) {
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login: name, password: PASS }),
  });
  return (await res.json()).token;
}
const auth = (t) => ({ Authorization: `Bearer ${t}` });

before(async () => {
  const passwordHash = await bcrypt.hash(PASS, 10);
  for (const [name, role, branch] of [
    ["dash_director", "director", null],
    ["dash_staff", "staff", null],
    ["dash_manager", "manager", "1"],
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
  await db.cashReport.deleteMany({ where: { date: DATE } });
  // Филиал 1: касса заявлена 1 000 000, iiko 1 100 000 → недостача 100 000.
  await db.cashReport.create({
    data: {
      branchId: "1",
      date: DATE,
      status: "submitted",
      userId: "dash-test",
      fiscal: 600000n,
      nonFiscal: 400000n,
      iiko: 1100000n,
    },
  });
  // Просроченная задача — для счётчика задач на дашборде.
  await db.todoTask.deleteMany({
    where: { title: { startsWith: "DASHTODO" } },
  });
  await db.todoTask.create({
    data: {
      title: "DASHTODO просрочка",
      createdById: "dash-test",
      status: "todo",
      dueDate: new Date("2026-07-01T00:00:00Z"),
    },
  });
  await refreshOrgConfig(true);
  server = app.listen(0);
  await new Promise((ok) => server.once("listening", ok));
  base = `http://127.0.0.1:${server.address().port}`;
  directorToken = await login("dash_director");
  staffToken = await login("dash_staff");
  managerToken = await login("dash_manager");
});

after(async () => {
  await db.cashReport.deleteMany({ where: { date: DATE } });
  await db.todoTask.deleteMany({
    where: { title: { startsWith: "DASHTODO" } },
  });
  await db.auditLog.deleteMany({
    where: { user: { name: { startsWith: "dash_" } } },
  });
  await db.user.deleteMany({ where: { name: { startsWith: "dash_" } } });
  server?.close();
});

test("дашборд: линейному персоналу недоступен (403)", async () => {
  const res = await fetch(`${base}/api/dashboard?date=${DATE}`, {
    headers: auth(staffToken),
  });
  assert.equal(res.status, 403);
});

test("дашборд: расхождение кассы считается и попадает в алерты", async () => {
  const res = await fetch(`${base}/api/dashboard?date=${DATE}`, {
    headers: auth(directorToken),
  });
  assert.equal(res.status, 200);
  const d = await res.json();
  const b1 = d.rows.find((r) => r.branchId === "1");
  assert.ok(b1, "должна быть строка филиала 1");
  assert.equal(b1.declared, 1000000);
  assert.equal(b1.iiko, 1100000);
  assert.equal(b1.discrepancy, -100000); // недостача
  // Алерт о недостаче присутствует.
  assert.ok(d.alerts.some((a) => a.kind === "shortage" && a.branchId === "1"));
  // Филиалы без кассы — алерт «не сдана».
  assert.ok(d.alerts.some((a) => a.kind === "cash_missing"));
});

test("дашборд: счётчик задач (активные/просроченные) и алерт", async () => {
  const res = await fetch(`${base}/api/dashboard?date=${DATE}`, {
    headers: auth(directorToken),
  });
  const d = await res.json();
  assert.ok(d.todos, "должен быть блок задач");
  assert.ok(d.todos.active >= 1, "есть активные задачи");
  assert.ok(d.todos.overdue >= 1, "есть просроченные задачи");
  assert.ok(d.alerts.some((a) => a.kind === "todos_overdue"));
});

test("дашборд: управляющий видит только свой филиал", async () => {
  const res = await fetch(`${base}/api/dashboard?date=${DATE}`, {
    headers: auth(managerToken),
  });
  assert.equal(res.status, 200);
  const d = await res.json();
  assert.equal(d.scope, "branch");
  assert.equal(d.rows.length, 1);
  assert.equal(d.rows[0].branchId, "1");
  // Чужих филиалов в алертах «не сдана» быть не должно.
  assert.ok(!d.alerts.some((a) => a.branchId && a.branchId !== "1"));
});

// Скриншот с боя: в 23:43 у всех шести точек «Касса не сдана» и нули в колонке
// iiko. Две из шести — цех и кейтеринг — розничной кассы не имеют вовсе, экран
// «Касса» их не предлагает, и алерт по ним закрыть было невозможно.
test("дашборд: точки без кассы не требуют сдачи кассы", async () => {
  const res = await fetch(`${base}/api/dashboard?date=${DATE}`, {
    headers: auth(directorToken),
  });
  const d = await res.json();
  // В настройках по умолчанию без кассы — Наврузий цех (4) и Кейтеринг (6).
  for (const id of ["4", "6"]) {
    const row = d.rows.find((r) => r.branchId === id);
    assert.equal(row.cashStatus, "na", `филиал ${id} без кассы`);
    assert.equal(row.iiko, null);
    assert.ok(
      !d.alerts.some((a) => a.kind === "cash_missing" && a.branchId === id),
      `по филиалу ${id} не должно быть алерта «не сдана»`
    );
  }
  // «Сдали X из Y» считается только по точкам с кассой: их четыре.
  assert.equal(d.totals.branchesTotal, 4);
  assert.equal(d.totals.branchesReported, 1);
});

test("дашборд: несданная касса — пусто, а не ноль", async () => {
  const res = await fetch(`${base}/api/dashboard?date=${DATE}`, {
    headers: auth(directorToken),
  });
  const d = await res.json();
  // Филиал 2 кассу не сдавал: «0» читался бы как «в iiko ноль продаж».
  const b2 = d.rows.find((r) => r.branchId === "2");
  assert.equal(b2.cashStatus, "none");
  assert.equal(b2.declared, null);
  assert.equal(b2.iiko, null);
  assert.equal(b2.discrepancy, null);
  // Итоги при этом остаются числами — их показывают крупно в шапке.
  assert.equal(d.totals.declared, 1000000);
  assert.equal(d.totals.iiko, 1100000);
  assert.equal(d.cashUnavailable, false);
});
