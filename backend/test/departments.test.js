// Отделы: чтение всем вошедшим, запись — директору/сисадмину, аудит,
// уникальность id и очистка карты категорий на клиенте (проверяем сервер).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";

import { app } from "../src/app.js";
import { db } from "../src/db.js";
import { refreshDeptConfig } from "../src/services/deptConfig.js";

const PASS = "dept_test_pass_123";
let server, base, directorToken, staffToken;

async function login(name) {
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login: name, password: PASS }),
  });
  return (await res.json()).token;
}
const auth = (t) => ({
  Authorization: `Bearer ${t}`,
  "Content-Type": "application/json",
});

before(async () => {
  const passwordHash = await bcrypt.hash(PASS, 10);
  for (const [name, role] of [
    ["dept_director", "director"],
    ["dept_staff", "staff"],
  ]) {
    await db.user.upsert({
      where: { name },
      update: { passwordHash, role, active: true, source: "iiko" },
      create: { name, passwordHash, role, source: "iiko" },
    });
  }
  await db.deptConfig.deleteMany({});
  await refreshDeptConfig(true);
  server = app.listen(0);
  await new Promise((ok) => server.once("listening", ok));
  base = `http://127.0.0.1:${server.address().port}`;
  directorToken = await login("dept_director");
  staffToken = await login("dept_staff");
});

after(async () => {
  await db.auditLog.deleteMany({
    where: { user: { name: { in: ["dept_director", "dept_staff"] } } },
  });
  await db.deptConfig.deleteMany({});
  await db.user.deleteMany({
    where: { name: { in: ["dept_director", "dept_staff"] } },
  });
  await refreshDeptConfig(true);
  server?.close();
});

test("чтение отделов — всем вошедшим, дефолты до настройки", async () => {
  const res = await fetch(`${base}/api/departments`, {
    headers: auth(staffToken),
  });
  assert.equal(res.status, 200);
  const cfg = await res.json();
  assert.ok(Array.isArray(cfg.departments) && cfg.departments.length >= 1);
  assert.ok(cfg.catDept && typeof cfg.catDept === "object");
});

test("запись — только директору/сисадмину; изменения сохраняются и в аудит", async () => {
  const body = {
    departments: [
      { id: "d1", name: "Финансовый отдел", restricted: true },
      { id: "d2", name: "Маркетинг", restricted: false },
    ],
    catDept: { Прочее: "d2" },
  };
  // Сотрудник записать не может.
  const denied = await fetch(`${base}/api/departments`, {
    method: "PUT",
    headers: auth(staffToken),
    body: JSON.stringify(body),
  });
  assert.equal(denied.status, 403);

  // Директор — сохраняет.
  const ok = await fetch(`${base}/api/departments`, {
    method: "PUT",
    headers: auth(directorToken),
    body: JSON.stringify(body),
  });
  assert.equal(ok.status, 200);
  const saved = await ok.json();
  assert.equal(saved.departments.length, 2);
  assert.equal(saved.departments[1].name, "Маркетинг");
  assert.equal(saved.catDept["Прочее"], "d2");

  // Прочитали заново — вернулось сохранённое.
  const back = await (
    await fetch(`${base}/api/departments`, { headers: auth(staffToken) })
  ).json();
  assert.equal(back.departments.length, 2);

  const logged = await db.auditLog.count({
    where: { event: "dept_config_update" },
  });
  assert.ok(logged >= 1);
});

test("дублирующиеся id отделов отклоняются (400)", async () => {
  const res = await fetch(`${base}/api/departments`, {
    method: "PUT",
    headers: auth(directorToken),
    body: JSON.stringify({
      departments: [
        { id: "d1", name: "А", restricted: false },
        { id: "d1", name: "Б", restricted: false },
      ],
      catDept: {},
    }),
  });
  assert.equal(res.status, 400);
});

test("мусорный формат отклоняется (400)", async () => {
  const res = await fetch(`${base}/api/departments`, {
    method: "PUT",
    headers: auth(directorToken),
    body: JSON.stringify({ departments: "нет", catDept: {} }),
  });
  assert.equal(res.status, 400);
});
