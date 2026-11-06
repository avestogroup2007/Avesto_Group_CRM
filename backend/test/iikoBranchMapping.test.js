// Аналитика продаж под филиальной ролью: причина отказа должна называться
// своим именем. Раньше все три случая показывались одним текстом «филиал не
// сопоставлен с подразделением iiko» и отправляли администратора не в ту
// настройку — чаще всего сопоставление было на месте, а филиал сотруднику
// просто не назначили.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";

import { app } from "../src/app.js";
import { db } from "../src/db.js";
import {
  ORG_DEFAULTS,
  saveOrgConfig,
  refreshOrgConfig,
} from "../src/services/orgConfig.js";
import { invalidateUserAuthCache } from "../src/middleware/requireAuth.js";

const PASS = "branchmap_pass_123";
let server, base, token, userId;

async function login() {
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login: "bmap_manager", password: PASS }),
  });
  return (await res.json()).token;
}

// Меняем привязку сотрудника и сбрасываем кэш авторизации, иначе запрос
// продолжит видеть прежнее состояние в течение минуты.
async function setBranch(checklistBranch, allBranches = false) {
  await db.user.update({
    where: { id: userId },
    data: { checklistBranch, allBranches },
  });
  invalidateUserAuthCache(userId);
}

async function olap() {
  const res = await fetch(`${base}/api/iiko/olap`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ from: "2026-08-01", to: "2026-08-02" }),
  });
  return { status: res.status, body: await res.json() };
}

before(async () => {
  const passwordHash = await bcrypt.hash(PASS, 10);
  const u = await db.user.upsert({
    where: { name: "bmap_manager" },
    update: { passwordHash, role: "manager", active: true, source: "iiko" },
    create: {
      name: "bmap_manager",
      passwordHash,
      role: "manager",
      source: "iiko",
    },
  });
  userId = u.id;

  // Филиал 1 сопоставлен с iiko, филиал 2 — нет.
  await saveOrgConfig(
    {
      ...ORG_DEFAULTS,
      branches: [
        { ...ORG_DEFAULTS.branches[0], id: 1, iikoDept: "Микрорайон" },
        {
          ...ORG_DEFAULTS.branches[0],
          id: 2,
          name: "Без сопоставления",
          iikoDept: "",
        },
      ],
    },
    null
  );
  await refreshOrgConfig(true);

  server = app.listen(0);
  await new Promise((ok) => server.once("listening", ok));
  base = `http://127.0.0.1:${server.address().port}`;
  token = await login();
});

after(async () => {
  await db.orgConfig.deleteMany({ where: { id: 1 } });
  // Вход пишет запись в аудит — она ссылается на пользователя, поэтому
  // удаляем её раньше, иначе удаление упирается во внешний ключ.
  await db.auditLog.deleteMany({ where: { userId } });
  await db.user.deleteMany({ where: { name: "bmap_manager" } });
  server?.close();
});

test("филиал не назначен — говорим про кадры, а не про сопоставление", async () => {
  await setBranch(null);
  const { status, body } = await olap();
  assert.equal(status, 403);
  assert.match(body.error, /не назначен филиал/i);
  assert.match(body.error, /управление кадрами/i);
  // Именно этот случай раньше маскировался под проблему сопоставления.
  assert.ok(!/не сопоставлен/i.test(body.error));
});

test("филиала нет в настройках организации — отдельная причина", async () => {
  await setBranch("777");
  const { status, body } = await olap();
  assert.equal(status, 403);
  assert.match(body.error, /№777 не найден/i);
});

test("сопоставление пустое — говорим, какое поле заполнить", async () => {
  await setBranch("2");
  const { status, body } = await olap();
  assert.equal(status, 403);
  assert.match(body.error, /«Без сопоставления».*не сопоставлен/i);
  assert.match(body.error, /Подразделение iiko/i);
});

test("филиал сопоставлен — проверка доступа пройдена", async () => {
  await setBranch("1");
  const { status, body } = await olap();
  // iiko в тестовой среде не настроена: до неё дошли, значит доступ не мешает.
  assert.equal(status, 503);
  assert.equal(body.configured, false);
});

test("надзор за всеми филиалами снимает ограничение", async () => {
  // Филиал не назначен, но включён надзор — отказа по филиалу быть не должно.
  await setBranch(null, true);
  const { status } = await olap();
  assert.equal(status, 503);
});
