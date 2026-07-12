// Back Office владельца: доступ только owner/vendor (директор клиента — 403),
// CRUD клиентов с MRR-сводкой, доска развития, удаление — только владельцу.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";

import { app } from "../src/app.js";
import { db } from "../src/db.js";

const PASS = "vendor_test_pass_123";
let server, base, ownerToken, vendorToken, directorToken;

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
    ["vt_owner", "owner"],
    ["vt_vendor", "vendor"],
    ["vt_director", "director"],
  ]) {
    await db.user.upsert({
      where: { name },
      update: { passwordHash, role, active: true, source: "iiko" },
      create: { name, passwordHash, role, source: "iiko" },
    });
  }
  await db.vendorClient.deleteMany({});
  await db.featureRequest.deleteMany({});
  server = app.listen(0);
  await new Promise((ok) => server.once("listening", ok));
  base = `http://127.0.0.1:${server.address().port}`;
  ownerToken = await login("vt_owner");
  vendorToken = await login("vt_vendor");
  directorToken = await login("vt_director");
});

after(async () => {
  await db.vendorClient.deleteMany({});
  await db.featureRequest.deleteMany({});
  server?.close();
});

test("back office: директор клиента не видит, owner управляет, MRR считается", async () => {
  // Директор (клиентская роль) — 403.
  const denied = await fetch(`${base}/api/vendor/clients`, {
    headers: auth(directorToken),
  });
  assert.equal(denied.status, 403);

  // Owner создаёт клиентов.
  const c1 = await fetch(`${base}/api/vendor/clients`, {
    method: "POST",
    headers: auth(ownerToken),
    body: JSON.stringify({
      name: "Ресторан «Плов-Хаус»",
      status: "active",
      tariff: "Базовый",
      monthlyFee: 2_000_000,
    }),
  });
  assert.equal(c1.status, 201);
  const client1 = await c1.json();
  await fetch(`${base}/api/vendor/clients`, {
    method: "POST",
    headers: auth(ownerToken),
    body: JSON.stringify({ name: "Кафе «Лид»", status: "lead" }),
  });

  // Vendor видит список и сводку (MRR только по активным).
  const list = await fetch(`${base}/api/vendor/clients`, {
    headers: auth(vendorToken),
  });
  assert.equal(list.status, 200);
  const body = await list.json();
  assert.equal(body.summary.total, 2);
  assert.equal(body.summary.active, 1);
  assert.equal(body.summary.mrr, 2_000_000);

  // Vendor меняет статус, но удалить не может.
  const upd = await fetch(`${base}/api/vendor/clients/${client1.id}`, {
    method: "PATCH",
    headers: auth(vendorToken),
    body: JSON.stringify({ status: "paused" }),
  });
  assert.equal(upd.status, 200);
  const delDenied = await fetch(`${base}/api/vendor/clients/${client1.id}`, {
    method: "DELETE",
    headers: auth(vendorToken),
  });
  assert.equal(delDenied.status, 403);
  const delOk = await fetch(`${base}/api/vendor/clients/${client1.id}`, {
    method: "DELETE",
    headers: auth(ownerToken),
  });
  assert.equal(delOk.status, 200);
});

test("back office: доска развития; owner проходит и бизнес-маршруты", async () => {
  const f = await fetch(`${base}/api/vendor/features`, {
    method: "POST",
    headers: auth(vendorToken),
    body: JSON.stringify({
      title: "Отчёт по себестоимости",
      clientName: "Плов-Хаус",
      priority: "high",
    }),
  });
  assert.equal(f.status, 201);
  const feature = await f.json();
  const upd = await fetch(`${base}/api/vendor/features/${feature.id}`, {
    method: "PATCH",
    headers: auth(ownerToken),
    body: JSON.stringify({ status: "planned" }),
  });
  assert.equal(upd.status, 200);

  // owner — владелец: бизнес-маршруты (деньги) ему тоже доступны…
  const moneyOk = await fetch(`${base}/api/money`, {
    headers: auth(ownerToken),
  });
  assert.equal(moneyOk.status, 200);
  // …а команде продаж — нет.
  const moneyDenied = await fetch(`${base}/api/money`, {
    headers: auth(vendorToken),
  });
  assert.equal(moneyDenied.status, 403);
});
