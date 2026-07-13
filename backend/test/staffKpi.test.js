// KPI сотрудников по чек-листам: доступ по ролям, агрегация (сдачи, средний %,
// дни), сортировка, ограничение по филиалу для управляющего.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";

import { app } from "../src/app.js";
import { db } from "../src/db.js";

const PASS = "kpi_test_pass_123";
let server, base, directorToken, staffToken, empAId, empBId;

async function login(name) {
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login: name, password: PASS }),
  });
  return (await res.json()).token;
}
const auth = (t) => ({ Authorization: `Bearer ${t}` });

// Дата N дней назад по Ташкенту.
const ymd = (back) =>
  new Date(Date.now() - back * 86400000).toLocaleDateString("en-CA", {
    timeZone: "Asia/Tashkent",
  });

before(async () => {
  const passwordHash = await bcrypt.hash(PASS, 10);
  const mk = (name, role, extra = {}) =>
    db.user.upsert({
      where: { name },
      update: { passwordHash, role, active: true, source: "iiko", ...extra },
      create: { name, passwordHash, role, source: "iiko", ...extra },
    });
  await mk("kpi_director", "director");
  await mk("kpi_staff", "staff");
  const a = await mk("kpi_emp_a", "staff", {
    displayName: "Алиса",
    position: "Официант",
  });
  const b = await mk("kpi_emp_b", "staff", { displayName: "Борис" });
  empAId = a.id;
  empBId = b.id;

  await db.shiftChecklistRun.deleteMany({
    where: { userId: { in: [empAId, empBId] } },
  });
  // Алиса: 2 сдачи (100 и 80 = ср.90) в филиале 1, разные дни.
  await db.shiftChecklistRun.createMany({
    data: [
      {
        branchId: "1",
        kind: "open",
        date: ymd(1),
        items: [],
        pct: 100,
        userId: empAId,
      },
      {
        branchId: "1",
        kind: "close",
        date: ymd(2),
        items: [],
        pct: 80,
        userId: empAId,
      },
      // Борис: 1 сдача 50% в филиале 2.
      {
        branchId: "2",
        kind: "open",
        date: ymd(1),
        items: [],
        pct: 50,
        userId: empBId,
      },
    ],
  });

  server = app.listen(0);
  await new Promise((ok) => server.once("listening", ok));
  base = `http://127.0.0.1:${server.address().port}`;
  directorToken = await login("kpi_director");
  staffToken = await login("kpi_staff");
});

after(async () => {
  await db.shiftChecklistRun.deleteMany({
    where: { userId: { in: [empAId, empBId] } },
  });
  await db.auditLog.deleteMany({
    where: { user: { name: { startsWith: "kpi_" } } },
  });
  await db.user.deleteMany({ where: { name: { startsWith: "kpi_" } } });
  server?.close();
});

test("KPI: линейному персоналу недоступен (403)", async () => {
  const res = await fetch(`${base}/api/staff/kpi`, {
    headers: auth(staffToken),
  });
  assert.equal(res.status, 403);
});

test("KPI: агрегация и сортировка по среднему %", async () => {
  const res = await fetch(
    `${base}/api/staff/kpi?from=${ymd(30)}&to=${ymd(0)}`,
    {
      headers: auth(directorToken),
    }
  );
  assert.equal(res.status, 200);
  const d = await res.json();
  const a = d.rows.find((r) => r.userId === empAId);
  const b = d.rows.find((r) => r.userId === empBId);
  assert.ok(a && b);
  assert.equal(a.runs, 2);
  assert.equal(a.avgPct, 90);
  assert.equal(a.activeDays, 2);
  assert.equal(a.name, "Алиса");
  assert.equal(b.avgPct, 50);
  // Сортировка: Алиса (90) выше Бориса (50).
  const ia = d.rows.findIndex((r) => r.userId === empAId);
  const ib = d.rows.findIndex((r) => r.userId === empBId);
  assert.ok(ia < ib);
});
