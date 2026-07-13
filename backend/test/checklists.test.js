// Заполнение чек-листов в приложении: сдача по шаблону (гейтинг по модулю,
// проверка шаблона), легаси-обход смены и отчёт для руководства.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";

import { app } from "../src/app.js";
import { db } from "../src/db.js";
import { refreshModules } from "../src/services/modules.js";
import { refreshOrgConfig } from "../src/services/orgConfig.js";

const PASS = "chk_test_pass_123";
const OKBRANCH = "1"; // существует в дефолтной конфигурации организации
let server, base, ownerToken, directorToken, staffToken, roleTplId, cleanTplId;

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
    ["chk_owner", "owner"],
    ["chk_director", "director"],
    ["chk_staff", "staff"],
  ]) {
    await db.user.upsert({
      where: { name },
      update: { passwordHash, role, active: true, source: "iiko" },
      create: { name, passwordHash, role, source: "iiko" },
    });
  }
  await db.shiftChecklistRun.deleteMany({});
  await db.checklistTemplate.deleteMany({});
  await db.moduleConfig.deleteMany({});
  await refreshModules(true);
  await refreshOrgConfig(true);
  server = app.listen(0);
  await new Promise((ok) => server.once("listening", ok));
  base = `http://127.0.0.1:${server.address().port}`;
  ownerToken = await login("chk_owner");
  directorToken = await login("chk_director");
  staffToken = await login("chk_staff");
});

after(async () => {
  await db.shiftChecklistRun.deleteMany({});
  await db.checklistTemplate.deleteMany({});
  await db.moduleConfig.deleteMany({});
  await refreshModules(true);
  server?.close();
});

test("шаблонный чек-лист нельзя сдать при выключенном модуле", async () => {
  await refreshModules(true);
  // Создаём шаблон напрямую в БД (модуль ещё выключен — через API нельзя).
  const tpl = await db.checklistTemplate.create({
    data: {
      kind: "role",
      position: "Официант",
      title: "Открытие смены",
      items: [{ text: "Форма чистая", needPhoto: false }],
      scheduleType: "shift",
      active: true,
    },
  });
  roleTplId = tpl.id;
  const res = await fetch(`${base}/api/checklists/run`, {
    method: "POST",
    headers: auth(staffToken),
    body: JSON.stringify({
      branchId: OKBRANCH,
      kind: "role",
      templateId: roleTplId,
      date: "2026-07-12",
      items: [{ text: "Форма чистая", done: true }],
    }),
  });
  assert.equal(res.status, 403);
});

test("владелец включает модуль — сотрудник сдаёт шаблон", async () => {
  const on = await fetch(`${base}/api/modules`, {
    method: "PUT",
    headers: auth(ownerToken),
    body: JSON.stringify({
      employeeChecklists: true,
      cleaningChecklists: true,
    }),
  });
  assert.equal(on.status, 200);
  await refreshModules(true);

  const res = await fetch(`${base}/api/checklists/run`, {
    method: "POST",
    headers: auth(staffToken),
    body: JSON.stringify({
      branchId: OKBRANCH,
      kind: "role",
      templateId: roleTplId,
      date: "2026-07-12",
      items: [
        { text: "Форма чистая", done: true },
        { text: "Столы накрыты", done: false },
      ],
    }),
  });
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.pct, 50);

  // Запись сохранена с ссылкой на шаблон и его заголовком (для отчёта).
  const run = await db.shiftChecklistRun.findUnique({ where: { id: body.id } });
  assert.equal(run.templateId, roleTplId);
  assert.equal(run.title, "Открытие смены");
  assert.equal(run.position, "Официант");
  assert.equal(run.via, "app");
});

test("шаблонный чек-лист: неизвестный шаблон и филиал отклоняются", async () => {
  const badTpl = await fetch(`${base}/api/checklists/run`, {
    method: "POST",
    headers: auth(staffToken),
    body: JSON.stringify({
      branchId: OKBRANCH,
      kind: "role",
      templateId: "no_such_id",
      date: "2026-07-12",
      items: [{ text: "x", done: true }],
    }),
  });
  assert.equal(badTpl.status, 400);

  const badBranch = await fetch(`${base}/api/checklists/run`, {
    method: "POST",
    headers: auth(staffToken),
    body: JSON.stringify({
      branchId: "999",
      kind: "role",
      templateId: roleTplId,
      date: "2026-07-12",
      items: [{ text: "x", done: true }],
    }),
  });
  assert.equal(badBranch.status, 400);
});

test("почасовой уборочный шаблон сохраняется со слотом", async () => {
  const tpl = await db.checklistTemplate.create({
    data: {
      kind: "cleaning",
      title: "Санузел",
      items: [{ text: "Пол вымыт", needPhoto: true }],
      scheduleType: "hourly",
      fromHour: 8,
      toHour: 20,
      active: true,
    },
  });
  cleanTplId = tpl.id;
  const res = await fetch(`${base}/api/checklists/run`, {
    method: "POST",
    headers: auth(staffToken),
    body: JSON.stringify({
      branchId: OKBRANCH,
      kind: "cleaning",
      templateId: cleanTplId,
      date: "2026-07-12",
      slot: "10:00",
      items: [
        { text: "Пол вымыт", done: true, needPhoto: true, hasPhoto: true },
      ],
    }),
  });
  assert.equal(res.status, 201);
  const run = await db.shiftChecklistRun.findUnique({
    where: { id: (await res.json()).id },
  });
  assert.equal(run.slot, "10:00");
  assert.equal(run.pct, 100);
});

test("легаси-обход смены сдаётся без шаблона", async () => {
  const res = await fetch(`${base}/api/checklists/run`, {
    method: "POST",
    headers: auth(staffToken),
    body: JSON.stringify({
      branchId: OKBRANCH,
      kind: "open",
      date: "2026-07-12",
      items: [{ text: "Оборудование включено", done: true }],
    }),
  });
  assert.equal(res.status, 201);
});

test("отчёт по чек-листам: руководству доступен, сотруднику — нет", async () => {
  const denied = await fetch(
    `${base}/api/checklists/report?from=2026-07-12&to=2026-07-12`,
    { headers: auth(staffToken) }
  );
  assert.equal(denied.status, 403);

  const ok = await fetch(
    `${base}/api/checklists/report?from=2026-07-12&to=2026-07-12`,
    { headers: auth(directorToken) }
  );
  assert.equal(ok.status, 200);
  const rep = await ok.json();
  assert.ok(rep.summary.total >= 3); // role + cleaning + open, созданные выше
  assert.ok(rep.summary.byKind.role >= 1);
  assert.ok(rep.summary.byKind.cleaning >= 1);
  assert.ok(rep.summary.avgPct >= 0 && rep.summary.avgPct <= 100);

  // Детализация: разбивка по филиалам и по шаблонам/видам.
  assert.ok(Array.isArray(rep.summary.byBranch));
  const br1 = rep.summary.byBranch.find((b) => b.key === OKBRANCH);
  assert.ok(br1 && br1.count >= 3 && br1.label.length > 0);
  assert.ok(Array.isArray(rep.summary.byTemplate));
  // Строка шаблона по должности использует его заголовок.
  assert.ok(rep.summary.byTemplate.some((t) => t.label === "Открытие смены"));
  // Легаси-обход отображается понятным названием, а не kind "open".
  assert.ok(
    rep.summary.byTemplate.some((t) => t.label === "Открытие смены") &&
      rep.summary.byTemplate.every((t) => t.label !== "open")
  );

  // Неверный период — 400.
  const bad = await fetch(
    `${base}/api/checklists/report?from=2026-07-20&to=2026-07-12`,
    { headers: auth(directorToken) }
  );
  assert.equal(bad.status, 400);
});
