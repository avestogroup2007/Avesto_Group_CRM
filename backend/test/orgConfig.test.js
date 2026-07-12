// Тесты конфигурации организации: чтение, права на запись, валидация,
// сохранение и подхват ботом (окна чек-листов из конфига).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";

import { app } from "../src/app.js";
import { db } from "../src/db.js";
import { _internals } from "../src/services/telegramBot.js";
import { refreshOrgConfig } from "../src/services/orgConfig.js";

const PASS = "org_test_pass_123";
const DIRECTOR = "org_test_director";
const STAFF = "org_test_staff";

let server;
let base;
let dirToken;
let staffToken;

async function login(name) {
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login: name, password: PASS }),
  });
  return (await res.json()).token;
}

before(async () => {
  const passwordHash = await bcrypt.hash(PASS, 10);
  for (const [name, role] of [
    [DIRECTOR, "director"],
    [STAFF, "staff"],
  ]) {
    await db.user.upsert({
      where: { name },
      update: { passwordHash, role, active: true, source: "iiko" },
      create: { name, passwordHash, role, source: "iiko" },
    });
  }
  await db.orgConfig.deleteMany({});
  server = app.listen(0);
  await new Promise((ok) => server.once("listening", ok));
  base = `http://127.0.0.1:${server.address().port}`;
  dirToken = await login(DIRECTOR);
  staffToken = await login(STAFF);
});

after(async () => {
  await db.orgConfig.deleteMany({});
  await refreshOrgConfig(true); // вернуть дефолты в кэш для других тестов
  server?.close();
});

test("org: дефолты Avesto читаются, бренд доступен публично", async () => {
  const pub = await fetch(`${base}/api/org/public`);
  assert.equal(pub.status, 200);
  assert.equal((await pub.json()).brandName, "Avesto Group");

  const res = await fetch(`${base}/api/org`, {
    headers: { Authorization: `Bearer ${dirToken}` },
  });
  assert.equal(res.status, 200);
  const cfg = await res.json();
  assert.equal(cfg.branches.length, 6);
  assert.equal(cfg.branches[3].hours.from, 7); // цех 07–16
});

test("org: staff не пишет; директор сохраняет; бот видит новое окно", async () => {
  const cfgRes = await fetch(`${base}/api/org`, {
    headers: { Authorization: `Bearer ${dirToken}` },
  });
  const cfg = await cfgRes.json();

  const denied = await fetch(`${base}/api/org`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${staffToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(cfg),
  });
  assert.equal(denied.status, 403);

  // Директор меняет окно филиала 1 (08–20 → 09–18) и добавляет филиал.
  cfg.branches[0].hours = { from: 9, to: 18 };
  cfg.branches.push({
    id: 7,
    name: "Новый филиал",
    companyId: 1,
    iikoDept: "Novyy",
    cash: true,
    prod: false,
    hours: { from: 8, to: 20 },
  });
  const saved = await fetch(`${base}/api/org`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${dirToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(cfg),
  });
  assert.equal(saved.status, 200);

  // Бот берёт филиалы из конфига: новое окно и новый филиал видны сразу.
  await refreshOrgConfig(true);
  assert.deepEqual(_internals.branchHours(1), { from: 9, to: 18 });
  assert.equal(_internals.hourSlots(1).length, 10); // 09..18
  assert.equal(_internals.branchName(7), "Новый филиал");

  // Мусор — 400.
  const bad = await fetch(`${base}/api/org`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${dirToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ brandName: "", branches: [] }),
  });
  assert.equal(bad.status, 400);
});
