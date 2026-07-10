// Интеграционные тесты API задач: создание, список по правам, перевод фаз
// с проверкой роли/фазы на сервере, комментарий. Требует доступной БД.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";

import { app } from "../src/app.js";
import { db } from "../src/db.js";

const PASS = "tasks_test_pass_123";
const EXEC = "tasks_exec";
const CTRL = "tasks_ctrl";

let server;
let base;
let execToken;
let ctrlToken;
let execId;
let ctrlId;
let branchId;
let companyId;

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
  const company = await db.company.upsert({
    where: { id: "tasks-test-company" },
    update: {},
    create: { id: "tasks-test-company", name: "Tasks Test Co", inn: "000" },
  });
  companyId = company.id;
  const branch = await db.branch.upsert({
    where: { id: "tasks-test-branch" },
    update: {},
    create: { id: "tasks-test-branch", name: "Test Branch", companyId },
  });
  branchId = branch.id;

  // source=iiko — политика входа пускает только сотрудников из iiko.
  const exec = await db.user.upsert({
    where: { name: EXEC },
    update: {
      passwordHash,
      role: "staff",
      active: true,
      branchId,
      source: "iiko",
    },
    create: {
      name: EXEC,
      passwordHash,
      role: "staff",
      branchId,
      source: "iiko",
    },
  });
  execId = exec.id;
  const ctrl = await db.user.upsert({
    where: { name: CTRL },
    update: {
      passwordHash,
      role: "manager",
      active: true,
      branchId,
      source: "iiko",
    },
    create: {
      name: CTRL,
      passwordHash,
      role: "manager",
      branchId,
      source: "iiko",
    },
  });
  ctrlId = ctrl.id;

  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;

  execToken = await login(EXEC);
  ctrlToken = await login(CTRL);
});

after(async () => {
  await db.taskHistory.deleteMany({ where: { task: { branchId } } });
  await db.comment.deleteMany({ where: { task: { branchId } } });
  await db.task.deleteMany({ where: { branchId } });
  await db.auditLog.deleteMany({
    where: { user: { name: { in: [EXEC, CTRL] } } },
  });
  await db.user.deleteMany({ where: { name: { in: [EXEC, CTRL] } } });
  await db.branch.deleteMany({ where: { id: branchId } });
  await db.company.deleteMany({ where: { id: companyId } });
  await new Promise((resolve) => server.close(resolve));
  await db.$disconnect();
});

async function createTask() {
  const res = await fetch(`${base}/api/tasks`, {
    method: "POST",
    headers: auth(ctrlToken),
    body: JSON.stringify({
      title: "Тестовая задача",
      description: "описание",
      branchId,
      departmentId: "dep",
      executorId: execId,
      controllerId: ctrlId,
      category: "Прочее",
      priority: "Обычный",
      slaDeadline: new Date(Date.now() + 86400000).toISOString(),
    }),
  });
  return res;
}

test("создание задачи → 201, фаза 1, журнал created", async () => {
  const res = await createTask();
  assert.equal(res.status, 201);
  const task = await res.json();
  assert.equal(task.phase, 1);
  const hist = await db.taskHistory.count({
    where: { taskId: task.id, action: "created" },
  });
  assert.equal(hist, 1);
});

test("создание с пустым телом → 400", async () => {
  const res = await fetch(`${base}/api/tasks`, {
    method: "POST",
    headers: auth(ctrlToken),
    body: JSON.stringify({}),
  });
  assert.equal(res.status, 400);
});

test("список без токена → 401", async () => {
  const res = await fetch(`${base}/api/tasks`);
  assert.equal(res.status, 401);
});

test("исполнитель видит свою задачу в списке", async () => {
  await createTask();
  const res = await fetch(`${base}/api/tasks`, {
    headers: { Authorization: `Bearer ${execToken}` },
  });
  assert.equal(res.status, 200);
  const list = await res.json();
  assert.ok(list.some((t) => t.executorId === execId));
});

test("полный поток фаз: start(exec) → review(exec) → done(ctrl)", async () => {
  const task = await (await createTask()).json();

  // start исполнителем: фаза 1 → 3 (разрешено на фазах 1,2)
  let res = await fetch(`${base}/api/tasks/${task.id}/advance`, {
    method: "POST",
    headers: auth(execToken),
    body: JSON.stringify({ action: "start", toPhase: 3 }),
  });
  assert.equal(res.status, 200, "start должен пройти для исполнителя");

  // done исполнителем на фазе 3 — запрещено (только контролёр на фазе 4)
  res = await fetch(`${base}/api/tasks/${task.id}/advance`, {
    method: "POST",
    headers: auth(execToken),
    body: JSON.stringify({ action: "done", toPhase: 5 }),
  });
  assert.equal(res.status, 403, "done исполнителем должно быть 403");

  // review исполнителем: фаза 3 → 4
  res = await fetch(`${base}/api/tasks/${task.id}/advance`, {
    method: "POST",
    headers: auth(execToken),
    body: JSON.stringify({ action: "review", toPhase: 4 }),
  });
  assert.equal(res.status, 200, "review должен пройти для исполнителя");

  // done контролёром: фаза 4 → 5
  res = await fetch(`${base}/api/tasks/${task.id}/advance`, {
    method: "POST",
    headers: auth(ctrlToken),
    body: JSON.stringify({ action: "done", toPhase: 5 }),
  });
  assert.equal(res.status, 200, "done должен пройти для контролёра");

  const detail = await (
    await fetch(`${base}/api/tasks/${task.id}`, {
      headers: { Authorization: `Bearer ${ctrlToken}` },
    })
  ).json();
  assert.equal(detail.phase, 5);
  assert.ok(detail.history.length >= 4);
});

test("комментарий → 201 и запись в журнал", async () => {
  const task = await (await createTask()).json();
  const res = await fetch(`${base}/api/tasks/${task.id}/comment`, {
    method: "POST",
    headers: auth(execToken),
    body: JSON.stringify({ text: "Проверил" }),
  });
  assert.equal(res.status, 201);
  const comments = await db.comment.count({ where: { taskId: task.id } });
  assert.equal(comments, 1);
});
