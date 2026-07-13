// Справочники кассы: доступ по ролям и запись изменений в журнал безопасности
// (создание/переименование/удаление статей и типов оплат).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";

import { app } from "../src/app.js";
import { db } from "../src/db.js";

const PASS = "dict_test_pass_123";
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
    ["dict_director", "director"],
    ["dict_staff", "staff"],
  ]) {
    await db.user.upsert({
      where: { name },
      update: { passwordHash, role, active: true, source: "iiko" },
      create: { name, passwordHash, role, source: "iiko" },
    });
  }
  await db.auditLog.deleteMany({
    where: { event: { startsWith: "money_dict_" } },
  });
  await db.moneyDict.deleteMany({ where: { name: { startsWith: "ТЕСТ " } } });
  server = app.listen(0);
  await new Promise((ok) => server.once("listening", ok));
  base = `http://127.0.0.1:${server.address().port}`;
  directorToken = await login("dict_director");
  staffToken = await login("dict_staff");
});

after(async () => {
  await db.auditLog.deleteMany({
    where: { event: { startsWith: "money_dict_" } },
  });
  await db.moneyDict.deleteMany({ where: { name: { startsWith: "ТЕСТ " } } });
  server?.close();
});

test("линейный персонал не имеет доступа к справочникам кассы", async () => {
  const res = await fetch(`${base}/api/money/dict`, {
    headers: auth(staffToken),
  });
  assert.equal(res.status, 403);
});

test("добавление статьи пишется в журнал безопасности", async () => {
  const res = await fetch(`${base}/api/money/dict`, {
    method: "POST",
    headers: auth(directorToken),
    body: JSON.stringify({ type: "category", name: "ТЕСТ Статья" }),
  });
  assert.equal(res.status, 201);
  const entry = await res.json();
  assert.equal(entry.name, "ТЕСТ Статья");
  const logged = await db.auditLog.count({
    where: { event: "money_dict_add" },
  });
  assert.ok(logged >= 1);
  return entry;
});

test("переименование и удаление статьи логируются", async () => {
  // Заводим отдельную статью для правки/удаления.
  const created = await (
    await fetch(`${base}/api/money/dict`, {
      method: "POST",
      headers: auth(directorToken),
      body: JSON.stringify({ type: "ddsArticle", name: "ТЕСТ ДДС" }),
    })
  ).json();

  const upd = await fetch(`${base}/api/money/dict/${created.id}`, {
    method: "PATCH",
    headers: auth(directorToken),
    body: JSON.stringify({ name: "ТЕСТ ДДС 2" }),
  });
  assert.equal(upd.status, 200);
  assert.equal((await upd.json()).name, "ТЕСТ ДДС 2");

  const del = await fetch(`${base}/api/money/dict/${created.id}`, {
    method: "DELETE",
    headers: auth(directorToken),
  });
  assert.equal(del.status, 200);

  const editLogged = await db.auditLog.count({
    where: { event: "money_dict_edit" },
  });
  const delLogged = await db.auditLog.count({
    where: { event: "money_dict_delete" },
  });
  assert.ok(editLogged >= 1);
  assert.ok(delLogged >= 1);
  // Запись действительно удалена.
  const gone = await db.moneyDict.findUnique({ where: { id: created.id } });
  assert.equal(gone, null);
});
