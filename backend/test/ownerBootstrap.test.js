// Бутстрап владельца: аккаунт с логином из OWNER_LOGIN при входе получает роль
// owner (единственный безопасный способ назначить владельца).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";

import { app } from "../src/app.js";
import { db } from "../src/db.js";

const PASS = "owner_boot_pass_123";
let server, base;

async function login(name) {
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login: name, password: PASS }),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

before(async () => {
  const passwordHash = await bcrypt.hash(PASS, 10);
  // Аккаунт-владелец (пока роль staff) и обычный сотрудник — оба из iiko.
  await db.user.upsert({
    where: { name: "obt_owner" },
    update: {
      role: "staff",
      active: true,
      source: "iiko",
      login: "obt_owner",
      passwordHash,
    },
    create: {
      name: "obt_owner",
      role: "staff",
      source: "iiko",
      login: "obt_owner",
      passwordHash,
    },
  });
  await db.user.upsert({
    where: { name: "obt_plain" },
    update: {
      role: "staff",
      active: true,
      source: "iiko",
      login: "obt_plain",
      passwordHash,
    },
    create: {
      name: "obt_plain",
      role: "staff",
      source: "iiko",
      login: "obt_plain",
      passwordHash,
    },
  });
  server = app.listen(0);
  await new Promise((ok) => server.once("listening", ok));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  delete process.env.OWNER_LOGIN;
  await db.auditLog.deleteMany({
    where: { user: { name: { startsWith: "obt_" } } },
  });
  await db.user.deleteMany({ where: { name: { startsWith: "obt_" } } });
  server?.close();
});

test("OWNER_LOGIN повышает совпавший аккаунт до owner при входе", async () => {
  process.env.OWNER_LOGIN = "obt_owner";
  const r = await login("obt_owner");
  assert.equal(r.status, 200);
  assert.equal(r.body.role, "owner");
  const inDb = await db.user.findUnique({ where: { name: "obt_owner" } });
  assert.equal(inDb.role, "owner");
});

test("другой аккаунт не повышается", async () => {
  process.env.OWNER_LOGIN = "obt_owner";
  const r = await login("obt_plain");
  assert.equal(r.status, 200);
  assert.equal(r.body.role, "staff");
});

test("без OWNER_LOGIN повышения нет", async () => {
  delete process.env.OWNER_LOGIN;
  // Сбросим роль обратно на всякий случай.
  await db.user.update({
    where: { name: "obt_plain" },
    data: { role: "staff" },
  });
  const r = await login("obt_plain");
  assert.equal(r.body.role, "staff");
});
