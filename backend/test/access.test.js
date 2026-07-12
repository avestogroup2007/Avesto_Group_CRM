// Доступ по ролям + самопроверка: чтение всем, запись — только sysadmin/owner;
// самопроверка — только owner/vendor и возвращает статусы подсистем.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";

import { app } from "../src/app.js";
import { db } from "../src/db.js";

const PASS = "acc_test_pass_123";
let server, base, ownerT, sysadminT, directorT, staffT;

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
    ["acc_owner", "owner"],
    ["acc_sysadmin", "sysadmin"],
    ["acc_director", "director"],
    ["acc_staff", "staff"],
  ]) {
    await db.user.upsert({
      where: { name },
      update: { passwordHash, role, active: true, source: "iiko" },
      create: { name, passwordHash, role, source: "iiko" },
    });
  }
  await db.accessConfig.deleteMany({});
  server = app.listen(0);
  await new Promise((ok) => server.once("listening", ok));
  base = `http://127.0.0.1:${server.address().port}`;
  ownerT = await login("acc_owner");
  sysadminT = await login("acc_sysadmin");
  directorT = await login("acc_director");
  staffT = await login("acc_staff");
});

after(async () => {
  await db.accessConfig.deleteMany({});
  server?.close();
});

test("доступ: читают все; пишет только sysadmin/owner", async () => {
  const empty = await (
    await fetch(`${base}/api/access`, { headers: auth(staffT) })
  ).json();
  assert.deepEqual(empty.overrides, {});

  // Директор не может менять настройки доступа.
  const denied = await fetch(`${base}/api/access`, {
    method: "PUT",
    headers: auth(directorT),
    body: JSON.stringify({ overrides: { staff: { money: true } } }),
  });
  assert.equal(denied.status, 403);

  // Сисадмин задаёт: staff получает доступ к деньгам, теряет кассы.
  const saved = await fetch(`${base}/api/access`, {
    method: "PUT",
    headers: auth(sysadminT),
    body: JSON.stringify({
      overrides: { staff: { money: true, cash: false } },
    }),
  });
  assert.equal(saved.status, 200);
  const cfg = await saved.json();
  assert.equal(cfg.overrides.staff.money, true);
  assert.equal(cfg.overrides.staff.cash, false);

  // Мусор — 400.
  const bad = await fetch(`${base}/api/access`, {
    method: "PUT",
    headers: auth(sysadminT),
    body: JSON.stringify({ overrides: { staff: { money: "yes" } } }),
  });
  assert.equal(bad.status, 400);
});

test("самопроверка: только owner/vendor; отдаёт статусы подсистем", async () => {
  const denied = await fetch(`${base}/api/selftest`, {
    headers: auth(directorT),
  });
  assert.equal(denied.status, 403);

  const res = await fetch(`${base}/api/selftest`, { headers: auth(ownerT) });
  assert.equal(res.status, 200);
  const d = await res.json();
  assert.ok(Array.isArray(d.checks) && d.checks.length >= 5);
  const dbCheck = d.checks.find((c) => c.key === "db");
  assert.equal(dbCheck.status, "ok"); // база в тестах доступна
  assert.ok(d.summary && typeof d.summary.ok === "number");
});
