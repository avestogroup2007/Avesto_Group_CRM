// ФОТ — зарплатная ведомость: доступ по ролям, сохранение ставок и помесячных
// записей, расчёт итога (оклад vs почасовой), сериализация BigInt бонус/штраф.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";

import { app } from "../src/app.js";
import { db } from "../src/db.js";

const PASS = "payroll_test_pass_123";
const MONTH = "2026-04";
let server, base, directorToken, accountantToken, staffToken;
let uSalary, uHourly;

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
    ["pr_director", "director"],
    ["pr_accountant", "accountant"],
    ["pr_staff", "staff"],
  ]) {
    await db.user.upsert({
      where: { name },
      update: { passwordHash, role, active: true, source: "iiko" },
      create: { name, passwordHash, role, source: "iiko" },
    });
  }
  // Два «сотрудника» ведомости: один на окладе, один почасовой.
  const s = await db.user.upsert({
    where: { name: "pr_emp_salary" },
    update: {
      passwordHash,
      role: "staff",
      active: true,
      displayName: "Оклад Тест",
      position: "Повар",
    },
    create: {
      name: "pr_emp_salary",
      passwordHash,
      role: "staff",
      displayName: "Оклад Тест",
      position: "Повар",
    },
  });
  const h = await db.user.upsert({
    where: { name: "pr_emp_hourly" },
    update: {
      passwordHash,
      role: "staff",
      active: true,
      displayName: "Почас Тест",
      position: "Официант",
    },
    create: {
      name: "pr_emp_hourly",
      passwordHash,
      role: "staff",
      displayName: "Почас Тест",
      position: "Официант",
    },
  });
  uSalary = s.id;
  uHourly = h.id;

  server = app.listen(0);
  await new Promise((ok) => server.once("listening", ok));
  base = `http://127.0.0.1:${server.address().port}`;
  directorToken = await login("pr_director");
  accountantToken = await login("pr_accountant");
  staffToken = await login("pr_staff");
});

after(async () => {
  await db.payrollEntry.deleteMany({ where: { month: MONTH } });
  await db.payrollConfig.deleteMany({ where: { id: 1 } });
  await db.auditLog.deleteMany({
    where: { user: { name: { startsWith: "pr_" } } },
  });
  await db.user.deleteMany({ where: { name: { startsWith: "pr_" } } });
  server?.close();
});

test("ФОТ: линейному персоналу недоступен", async () => {
  const res = await fetch(`${base}/api/payroll?month=${MONTH}`, {
    headers: auth(staffToken),
  });
  assert.equal(res.status, 403);
});

test("ФОТ: бухгалтер видит ведомость (чтение), но не может менять ставки", async () => {
  const res = await fetch(`${base}/api/payroll?month=${MONTH}`, {
    headers: auth(accountantToken),
  });
  assert.equal(res.status, 200);
  const put = await fetch(`${base}/api/payroll/rates`, {
    method: "PUT",
    headers: jsonAuth(accountantToken),
    body: JSON.stringify({ rates: {} }),
  });
  assert.equal(put.status, 403);
});

test("ФОТ: сохранение ставок и помесячных записей, расчёт итога", async () => {
  // Ставки: оклад 5 000 000; почасовой 30 000/час.
  const ratesRes = await fetch(`${base}/api/payroll/rates`, {
    method: "PUT",
    headers: jsonAuth(directorToken),
    body: JSON.stringify({
      rates: {
        [uSalary]: { mode: "salary", amount: 5000000 },
        [uHourly]: { mode: "hourly", amount: 30000 },
      },
    }),
  });
  assert.equal(ratesRes.status, 200);

  // Записи: окладнику бонус 200 000, штраф 50 000; почасовику 160 часов.
  const e1 = await fetch(`${base}/api/payroll/entry`, {
    method: "PUT",
    headers: jsonAuth(directorToken),
    body: JSON.stringify({
      month: MONTH,
      userId: uSalary,
      hours: 0,
      bonus: 200000,
      penalty: 50000,
      note: "премия",
    }),
  });
  assert.equal(e1.status, 200);
  const e1b = await e1.json();
  // BigInt бонус/штраф сериализуются как числа.
  assert.equal(e1b.bonus, 200000);
  assert.equal(e1b.penalty, 50000);

  const e2 = await fetch(`${base}/api/payroll/entry`, {
    method: "PUT",
    headers: jsonAuth(directorToken),
    body: JSON.stringify({
      month: MONTH,
      userId: uHourly,
      hours: 160,
      bonus: 0,
      penalty: 0,
    }),
  });
  assert.equal(e2.status, 200);

  // Ведомость: проверяем расчёт.
  const res = await fetch(`${base}/api/payroll?month=${MONTH}`, {
    headers: auth(directorToken),
  });
  assert.equal(res.status, 200);
  const d = await res.json();
  assert.equal(d.month, MONTH);

  const rowS = d.rows.find((r) => r.userId === uSalary);
  assert.ok(rowS);
  assert.equal(rowS.mode, "salary");
  assert.equal(rowS.base, 5000000); // оклад = ставка
  assert.equal(rowS.total, 5000000 + 200000 - 50000); // база + бонус − штраф

  const rowH = d.rows.find((r) => r.userId === uHourly);
  assert.ok(rowH);
  assert.equal(rowH.mode, "hourly");
  assert.equal(rowH.base, 30000 * 160); // ставка × часы
  assert.equal(rowH.total, 30000 * 160);

  // totalPay = сумма итогов по строкам.
  const expected = d.rows.reduce((s, r) => s + r.total, 0);
  assert.equal(d.totalPay, expected);
});

test("ФОТ: запись обновляется (upsert), не дублируется", async () => {
  const upd = await fetch(`${base}/api/payroll/entry`, {
    method: "PUT",
    headers: jsonAuth(directorToken),
    body: JSON.stringify({
      month: MONTH,
      userId: uSalary,
      hours: 0,
      bonus: 300000,
      penalty: 0,
      note: "обновлено",
    }),
  });
  assert.equal(upd.status, 200);
  const count = await db.payrollEntry.count({
    where: { month: MONTH, userId: uSalary },
  });
  assert.equal(count, 1);
  const res = await fetch(`${base}/api/payroll?month=${MONTH}`, {
    headers: auth(directorToken),
  });
  const d = await res.json();
  const rowS = d.rows.find((r) => r.userId === uSalary);
  assert.equal(rowS.bonus, 300000);
  assert.equal(rowS.penalty, 0);
});

test("ФОТ: неверный формат записи отклоняется", async () => {
  const res = await fetch(`${base}/api/payroll/entry`, {
    method: "PUT",
    headers: jsonAuth(directorToken),
    body: JSON.stringify({ month: "2026/04", userId: uSalary }),
  });
  assert.equal(res.status, 400);
});
