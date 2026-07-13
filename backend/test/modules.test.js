// Модули (Back Office) + шаблоны чек-листов: включение только владельцем,
// гейтинг создания шаблонов по флагам, CRUD клиентом.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";

import { app } from "../src/app.js";
import { db } from "../src/db.js";
import { refreshModules } from "../src/services/modules.js";

const PASS = "mod_test_pass_123";
let server, base, ownerToken, directorToken, staffToken;

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
    ["mod_owner", "owner"],
    ["mod_director", "director"],
    ["mod_staff", "staff"],
  ]) {
    await db.user.upsert({
      where: { name },
      update: { passwordHash, role, active: true, source: "iiko" },
      create: { name, passwordHash, role, source: "iiko" },
    });
  }
  await db.checklistTemplate.deleteMany({});
  await db.moduleConfig.deleteMany({});
  server = app.listen(0);
  await new Promise((ok) => server.once("listening", ok));
  base = `http://127.0.0.1:${server.address().port}`;
  ownerToken = await login("mod_owner");
  directorToken = await login("mod_director");
  staffToken = await login("mod_staff");
});

after(async () => {
  await db.checklistTemplate.deleteMany({});
  await db.moduleConfig.deleteMany({});
  await refreshModules(true);
  server?.close();
});

test("модули: по умолчанию выключены; включает только владелец", async () => {
  const got = await (
    await fetch(`${base}/api/modules`, { headers: auth(directorToken) })
  ).json();
  assert.equal(got.flags.employeeChecklists, false);
  assert.ok(got.catalog.employeeChecklists.label);

  // Директор клиента включить модуль не может.
  const denied = await fetch(`${base}/api/modules`, {
    method: "PUT",
    headers: auth(directorToken),
    body: JSON.stringify({ employeeChecklists: true }),
  });
  assert.equal(denied.status, 403);

  // Владелец — включает.
  const saved = await fetch(`${base}/api/modules`, {
    method: "PUT",
    headers: auth(ownerToken),
    body: JSON.stringify({
      employeeChecklists: true,
      cleaningChecklists: false,
    }),
  });
  assert.equal(saved.status, 200);
  const flags = await saved.json();
  assert.equal(flags.employeeChecklists, true);
  assert.equal(flags.cleaningChecklists, false);
});

test("шаблоны: гейтинг по модулю; клиент создаёт по должности", async () => {
  await refreshModules(true);
  // Модуль cleaning выключен — создать уборочный шаблон нельзя (403).
  const gated = await fetch(`${base}/api/checklist-templates`, {
    method: "POST",
    headers: auth(directorToken),
    body: JSON.stringify({
      kind: "cleaning",
      title: "Уборка",
      items: [{ text: "Помыть пол", needPhoto: false }],
    }),
  });
  assert.equal(gated.status, 403);

  // employeeChecklists включён — шаблон по должности создаётся.
  const ok = await fetch(`${base}/api/checklist-templates`, {
    method: "POST",
    headers: auth(directorToken),
    body: JSON.stringify({
      kind: "role",
      position: "Официант",
      title: "Открытие смены официанта",
      items: [
        { text: "Проверить форму", needPhoto: false },
        { text: "Сервировка столов", needPhoto: true },
      ],
      scheduleType: "shift",
    }),
  });
  assert.equal(ok.status, 201);
  const tpl = await ok.json();
  assert.equal(tpl.position, "Официант");

  // staff не может создавать шаблоны.
  const staffDenied = await fetch(`${base}/api/checklist-templates`, {
    method: "POST",
    headers: auth(staffToken),
    body: JSON.stringify({
      kind: "role",
      title: "x",
      items: [{ text: "y" }],
    }),
  });
  assert.equal(staffDenied.status, 403);

  // Список видят все вошедшие (сотрудник — свои чек-листы).
  const list = await (
    await fetch(`${base}/api/checklist-templates`, {
      headers: auth(staffToken),
    })
  ).json();
  assert.ok(list.items.length >= 1);
  assert.equal(list.modules.employeeChecklists, true);

  // Правка и удаление — админом.
  const upd = await fetch(`${base}/api/checklist-templates/${tpl.id}`, {
    method: "PATCH",
    headers: auth(directorToken),
    body: JSON.stringify({ active: false }),
  });
  assert.equal(upd.status, 200);
  const del = await fetch(`${base}/api/checklist-templates/${tpl.id}`, {
    method: "DELETE",
    headers: auth(directorToken),
  });
  assert.equal(del.status, 200);
});

test("шаблон: почасовое окно from>=to отклоняется (400)", async () => {
  await refreshModules(true);
  const bad = await fetch(`${base}/api/checklist-templates`, {
    method: "POST",
    headers: auth(directorToken),
    body: JSON.stringify({
      kind: "role",
      title: "Плохое окно",
      items: [{ text: "x", needPhoto: false }],
      scheduleType: "hourly",
      fromHour: 20,
      toHour: 8,
    }),
  });
  assert.equal(bad.status, 400);
});

test("шаблон: PATCH тоже гейтится по модулю (нельзя переключить kind на выключенный)", async () => {
  await refreshModules(true);
  // employeeChecklists включён, cleaningChecklists выключен (из первого теста).
  const created = await (
    await fetch(`${base}/api/checklist-templates`, {
      method: "POST",
      headers: auth(directorToken),
      body: JSON.stringify({
        kind: "role",
        title: "Роль",
        items: [{ text: "x", needPhoto: false }],
        scheduleType: "shift",
      }),
    })
  ).json();
  // Переключить kind на cleaning (модуль выключен) — 403.
  const patched = await fetch(`${base}/api/checklist-templates/${created.id}`, {
    method: "PATCH",
    headers: auth(directorToken),
    body: JSON.stringify({ kind: "cleaning" }),
  });
  assert.equal(patched.status, 403);
  await fetch(`${base}/api/checklist-templates/${created.id}`, {
    method: "DELETE",
    headers: auth(directorToken),
  });
});
