// Менеджер задач (todo-доска): создание, список с охватом по ролям, правка
// статуса/важности, фильтры, удаление, права.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";

import { app } from "../src/app.js";
import { db } from "../src/db.js";

const PASS = "todo_test_pass_123";
let server, base, dirToken, staffToken, staff2Token;
let staffId, staff2Id;

async function login(name) {
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login: name, password: PASS }),
  });
  return (await res.json()).token;
}
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const jauth = (t) => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${t}`,
});

before(async () => {
  const passwordHash = await bcrypt.hash(PASS, 10);
  const mk = (name, role) =>
    db.user.upsert({
      where: { name },
      update: { passwordHash, role, active: true, source: "iiko" },
      create: { name, passwordHash, role, source: "iiko" },
    });
  await mk("td_director", "director");
  const s = await mk("td_staff", "staff");
  const s2 = await mk("td_staff2", "staff");
  staffId = s.id;
  staff2Id = s2.id;

  server = app.listen(0);
  await new Promise((ok) => server.once("listening", ok));
  base = `http://127.0.0.1:${server.address().port}`;
  dirToken = await login("td_director");
  staffToken = await login("td_staff");
  staff2Token = await login("td_staff2");
});

after(async () => {
  await db.todoTask.deleteMany({
    where: {
      OR: [
        { createdById: { in: [staffId, staff2Id] } },
        { assigneeId: { in: [staffId, staff2Id] } },
      ],
    },
  });
  await db.auditLog.deleteMany({
    where: { user: { name: { startsWith: "td_" } } },
  });
  await db.user.deleteMany({ where: { name: { startsWith: "td_" } } });
  server?.close();
});

test("создание и список: автор видит свою задачу", async () => {
  const res = await fetch(`${base}/api/todos`, {
    method: "POST",
    headers: jauth(staffToken),
    body: JSON.stringify({
      title: "Купить сахар",
      priority: "high",
      important: true,
    }),
  });
  assert.equal(res.status, 201);
  const t = await res.json();
  assert.equal(t.title, "Купить сахар");
  assert.equal(t.status, "todo");
  assert.equal(t.important, true);

  const list = await (
    await fetch(`${base}/api/todos`, { headers: auth(staffToken) })
  ).json();
  assert.ok(list.some((x) => x.id === t.id));
});

test("охват: чужую задачу линейный не видит, директор видит всё", async () => {
  const created = await (
    await fetch(`${base}/api/todos`, {
      method: "POST",
      headers: jauth(staffToken),
      body: JSON.stringify({ title: "Личная задача staff1" }),
    })
  ).json();
  // staff2 — не автор, не исполнитель → не видит.
  const l2 = await (
    await fetch(`${base}/api/todos`, { headers: auth(staff2Token) })
  ).json();
  assert.ok(!l2.some((x) => x.id === created.id));
  // Директор видит все.
  const ld = await (
    await fetch(`${base}/api/todos`, { headers: auth(dirToken) })
  ).json();
  assert.ok(ld.some((x) => x.id === created.id));
});

test("назначение: исполнитель видит задачу и имя проставлено", async () => {
  const created = await (
    await fetch(`${base}/api/todos`, {
      method: "POST",
      headers: jauth(dirToken),
      body: JSON.stringify({ title: "Сделать отчёт", assigneeId: staff2Id }),
    })
  ).json();
  const l2 = await (
    await fetch(`${base}/api/todos`, { headers: auth(staff2Token) })
  ).json();
  const mine = l2.find((x) => x.id === created.id);
  assert.ok(mine, "исполнитель должен видеть назначенную задачу");
  assert.equal(typeof mine.assigneeName, "string");
});

test("статус done проставляет doneAt; фильтр по статусу", async () => {
  const created = await (
    await fetch(`${base}/api/todos`, {
      method: "POST",
      headers: jauth(staffToken),
      body: JSON.stringify({ title: "Закрыть смену" }),
    })
  ).json();
  const upd = await fetch(`${base}/api/todos/${created.id}`, {
    method: "PATCH",
    headers: jauth(staffToken),
    body: JSON.stringify({ status: "done" }),
  });
  assert.equal(upd.status, 200);
  const t = await upd.json();
  assert.equal(t.status, "done");
  assert.ok(t.doneAt, "doneAt должен проставиться");

  const doneList = await (
    await fetch(`${base}/api/todos?status=done`, { headers: auth(staffToken) })
  ).json();
  assert.ok(doneList.every((x) => x.status === "done"));
  assert.ok(doneList.some((x) => x.id === created.id));
});

test("правка чужой задачи запрещена не-участнику", async () => {
  const created = await (
    await fetch(`${base}/api/todos`, {
      method: "POST",
      headers: jauth(staffToken),
      body: JSON.stringify({ title: "Только моя" }),
    })
  ).json();
  const res = await fetch(`${base}/api/todos/${created.id}`, {
    method: "PATCH",
    headers: jauth(staff2Token),
    body: JSON.stringify({ status: "done" }),
  });
  assert.equal(res.status, 403);
});

test("удаление автором; чужой удалить не может", async () => {
  const created = await (
    await fetch(`${base}/api/todos`, {
      method: "POST",
      headers: jauth(staffToken),
      body: JSON.stringify({ title: "Удалить меня" }),
    })
  ).json();
  const bad = await fetch(`${base}/api/todos/${created.id}`, {
    method: "DELETE",
    headers: auth(staff2Token),
  });
  assert.equal(bad.status, 403);
  const ok = await fetch(`${base}/api/todos/${created.id}`, {
    method: "DELETE",
    headers: auth(staffToken),
  });
  assert.equal(ok.status, 200);
});

test("meta отдаёт пользователей и филиалы", async () => {
  const m = await (
    await fetch(`${base}/api/todos/meta`, { headers: auth(staffToken) })
  ).json();
  assert.ok(Array.isArray(m.users) && m.users.length >= 1);
  assert.ok(Array.isArray(m.branches));
  assert.ok(m.users.every((u) => u.id && typeof u.name === "string"));
});

test("неверный формат создания отклоняется", async () => {
  const res = await fetch(`${base}/api/todos`, {
    method: "POST",
    headers: jauth(staffToken),
    body: JSON.stringify({ title: "" }),
  });
  assert.equal(res.status, 400);
});
