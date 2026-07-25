// Производственный модуль: гейтинг модуля и ролей, задания/факт/до-задание,
// коррекция факта (оригинал неизменяем), журнал документов.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";

import { app } from "../src/app.js";
import { db } from "../src/db.js";
import { refreshModules } from "../src/services/modules.js";
import { effectiveFactTotal } from "../src/services/productionPlanner.js";

const PASS = "prod_test_pass_123";
let server, base, directorToken, staffToken, deptId;

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

async function setModule(on) {
  await db.moduleConfig.upsert({
    where: { id: 1 },
    update: { data: { production: on } },
    create: { id: 1, data: { production: on } },
  });
  await refreshModules(true);
}

before(async () => {
  const passwordHash = await bcrypt.hash(PASS, 10);
  for (const [name, role] of [
    ["prod_director", "director"],
    ["prod_staff", "staff"],
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
  directorToken = await login("prod_director");
  staffToken = await login("prod_staff");
});

after(async () => {
  await db.generatedDocument.deleteMany({
    where: { task: { nodeCode: { startsWith: "TEST_" } } },
  });
  await db.productionFact.deleteMany({
    where: { task: { nodeCode: { startsWith: "TEST_" } } },
  });
  await db.productionTask.deleteMany({
    where: { nodeCode: { startsWith: "TEST_" } },
  });
  await db.phaseWarehouseMap.deleteMany({ where: { warehouseId: "TEST_WH" } });
  await db.productionDepartment.deleteMany({
    where: { code: { startsWith: "TEST_" } },
  });
  await db.moduleConfig.deleteMany({ where: { id: 1 } });
  await db.auditLog.deleteMany({
    where: { user: { name: { startsWith: "prod_" } } },
  });
  await db.user.deleteMany({ where: { name: { startsWith: "prod_" } } });
  server?.close();
});

test("модуль выключен → 403", async () => {
  await setModule(false);
  const res = await fetch(`${base}/api/production/health`, {
    headers: auth(directorToken),
  });
  assert.equal(res.status, 403);
});

test("линейному персоналу расчёт недоступен", async () => {
  await setModule(true);
  const res = await fetch(`${base}/api/production/preview`, {
    method: "POST",
    headers: jsonAuth(staffToken),
    body: JSON.stringify({ productCode: "X", qty: 1 }),
  });
  assert.equal(res.status, 403);
});

test("диагностика показывает незавершённую настройку", async () => {
  await setModule(true);
  const res = await fetch(`${base}/api/production/health`, {
    headers: auth(directorToken),
  });
  assert.equal(res.status, 200);
  const d = await res.json();
  // iiko в тестовой среде не настроена — health не падает, а перечисляет issues.
  assert.equal(Array.isArray(d.issues), true);
  assert.ok(d.issues.length > 0);
});

test("справочник фаз отдаётся для UI", async () => {
  await setModule(true);
  const res = await fetch(`${base}/api/production/phases`, {
    headers: auth(directorToken),
  });
  const d = await res.json();
  assert.ok(d.phases.some((p) => p.key === "FINISHED"));
  assert.ok(d.phases.some((p) => p.key === "SEMI"));
});

test("расчёт без настроенной iiko отдаёт 503, а не падает", async () => {
  await setModule(true);
  const res = await fetch(`${base}/api/production/preview`, {
    method: "POST",
    headers: jsonAuth(directorToken),
    body: JSON.stringify({ productCode: "TEST_GP", qty: 5 }),
  });
  assert.equal(res.status, 503);
  const d = await res.json();
  assert.equal(d.configured, false);
});

test("отдел и правило «фаза → склад» создаются и читаются", async () => {
  await setModule(true);
  const dep = await fetch(`${base}/api/production/departments`, {
    method: "POST",
    headers: jsonAuth(directorToken),
    body: JSON.stringify({ code: "TEST_SB", name: "Тест Сборка" }),
  });
  assert.equal(dep.status, 201);
  deptId = (await dep.json()).id;

  const map = await fetch(`${base}/api/production/phase-map`, {
    method: "PUT",
    headers: jsonAuth(directorToken),
    body: JSON.stringify({
      phase: "ASSEMBLY",
      warehouseId: "TEST_WH",
      warehouseName: "Тестовый склад",
      departmentId: deptId,
    }),
  });
  assert.equal(map.status, 200);

  const list = await fetch(`${base}/api/production/departments`, {
    headers: auth(directorToken),
  });
  const d = await list.json();
  assert.ok(d.departments.some((x) => x.code === "TEST_SB"));
  assert.ok(d.phaseMaps.some((x) => x.warehouseId === "TEST_WH"));
});

test("факт: недостача создаёт до-задание, полный факт закрывает задание", async () => {
  await setModule(true);
  // Задание заводим напрямую — расчёт требует живой iiko, а проверяем здесь
  // именно логику факта/до-задания.
  const task = await db.productionTask.create({
    data: {
      nodeCode: "TEST_ML",
      nodeName: "ПФ ТЕСТ МЕЛАНЖ",
      phase: "SEMI",
      planQty: 10,
      unit: "кг",
      deliveryDate: new Date(),
      batchId: "TEST_BATCH",
      warehouseId: "TEST_WH",
      status: "IN_PROGRESS",
    },
  });

  // Факт меньше плана → до-задание на разницу (ТЗ 5.4).
  const r1 = await fetch(`${base}/api/production/tasks/${task.id}/fact`, {
    method: "POST",
    headers: jsonAuth(directorToken),
    body: JSON.stringify({ qty: 7 }),
  });
  assert.equal(r1.status, 200);
  const d1 = await r1.json();
  assert.equal(d1.shortfall, 3);
  assert.ok(d1.retryTask, "должно появиться до-задание");
  assert.equal(Number(d1.retryTask.planQty), 3);
  assert.equal(d1.retryTask.parentTaskId, task.id);

  // Задание остаётся в работе, пока есть недостача.
  const still = await db.productionTask.findUnique({ where: { id: task.id } });
  assert.equal(still.status, "IN_PROGRESS");

  // Догоняем факт до плана → задание закрывается.
  const r2 = await fetch(`${base}/api/production/tasks/${task.id}/fact`, {
    method: "POST",
    headers: jsonAuth(directorToken),
    body: JSON.stringify({ qty: 3 }),
  });
  const d2 = await r2.json();
  assert.equal(d2.shortfall, 0);
  assert.equal(d2.retryTask, null);
  const done = await db.productionTask.findUnique({ where: { id: task.id } });
  assert.equal(done.status, "DONE");
});

test("коррекция факта не стирает оригинал (ТЗ 13.2)", async () => {
  await setModule(true);
  const task = await db.productionTask.create({
    data: {
      nodeCode: "TEST_SB",
      nodeName: "СБОРКА ТЕСТ",
      phase: "ASSEMBLY",
      planQty: 100,
      unit: "кг",
      deliveryDate: new Date(),
      batchId: "TEST_BATCH",
      warehouseId: "TEST_WH",
      status: "IN_PROGRESS",
    },
  });
  // Опечатка: 500 вместо 50.
  const wrong = await fetch(`${base}/api/production/tasks/${task.id}/fact`, {
    method: "POST",
    headers: jsonAuth(directorToken),
    body: JSON.stringify({ qty: 500 }),
  });
  const wrongId = (await wrong.json()).fact.id;

  const fix = await fetch(
    `${base}/api/production/tasks/${task.id}/fact/correction`,
    {
      method: "POST",
      headers: jsonAuth(directorToken),
      body: JSON.stringify({ qty: 50, correctionOf: wrongId }),
    }
  );
  assert.equal(fix.status, 200);

  const facts = await db.productionFact.findMany({
    where: { taskId: task.id },
  });
  // Оригинал остался в истории — записи неизменяемые.
  assert.ok(facts.some((f) => f.id === wrongId && Number(f.qty) === 500));
  // Но в зачёт идёт исправленное значение, а не ошибочное.
  assert.equal(effectiveFactTotal(facts), 50);
});

test("предпросмотр факта (dryRun) не пишет документы", async () => {
  await setModule(true);
  const task = await db.productionTask.create({
    data: {
      nodeCode: "TEST_DRY",
      nodeName: "ПФ ТЕСТ СУХОЙ",
      phase: "SEMI",
      planQty: 5,
      unit: "кг",
      deliveryDate: new Date(),
      batchId: "TEST_BATCH",
      warehouseId: "TEST_WH",
      status: "IN_PROGRESS",
    },
  });
  const res = await fetch(`${base}/api/production/tasks/${task.id}/fact`, {
    method: "POST",
    headers: jsonAuth(directorToken),
    body: JSON.stringify({ qty: 5, dryRun: true }),
  });
  assert.equal(res.status, 200);
  const d = await res.json();
  assert.equal(d.preview, true);
  const facts = await db.productionFact.count({ where: { taskId: task.id } });
  assert.equal(facts, 0);
});

test("ручное задание создаётся без iiko и попадает в монитор отдела", async () => {
  await setModule(true);
  const res = await fetch(`${base}/api/production/tasks/manual`, {
    method: "POST",
    headers: jsonAuth(directorToken),
    body: JSON.stringify({
      nodeCode: "TEST_MANUAL",
      nodeName: "ПФ ТЕСТ РУЧНОЕ",
      phase: "SEMI",
      planQty: 12,
      unit: "кг",
      deliveryDate: new Date().toISOString().slice(0, 10),
    }),
  });
  assert.equal(res.status, 201);
  const task = await res.json();
  assert.equal(task.nodeName, "ПФ ТЕСТ РУЧНОЕ");
  assert.equal(task.status, "IN_PROGRESS");

  // Задание видно в общем списке — значит попадёт и на монитор отдела.
  const list = await fetch(`${base}/api/production/tasks`, {
    headers: auth(directorToken),
  });
  const d = await list.json();
  const found = d.tasks.find((t) => t.id === task.id);
  assert.ok(found, "ручное задание должно быть в списке");
  assert.equal(found.planQty, 12);
  assert.equal(found.left, 12);

  // И по нему сразу можно отчитаться о выполненном объёме.
  const fact = await fetch(`${base}/api/production/tasks/${task.id}/fact`, {
    method: "POST",
    headers: jsonAuth(directorToken),
    body: JSON.stringify({ qty: 12 }),
  });
  assert.equal(fact.status, 200);
  const fd = await fact.json();
  assert.equal(fd.shortfall, 0);
});

test("effectiveFactTotal: цепочка коррекций учитывается один раз", () => {
  const facts = [
    { id: "a", qty: 500, correctionOf: null },
    { id: "b", qty: 50, correctionOf: "a" },
    { id: "c", qty: 10, correctionOf: null },
  ];
  assert.equal(effectiveFactTotal(facts), 60); // b (вместо a) + c
});
