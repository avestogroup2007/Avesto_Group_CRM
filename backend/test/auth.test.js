// Интеграционные тесты: реально поднимают приложение и БД,
// проверяют живость и весь поток аутентификации.
// Запуск: npm test (node --test). Требует доступной БД (DATABASE_URL).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";

import { app } from "../src/app.js";
import { db } from "../src/db.js";

const TEST_LOGIN = "ci_test_user";
const TEST_PASSWORD = "ci_test_password_123";
// Ручная (не из iiko) учётка — политика входа должна её блокировать.
const MANUAL_LOGIN = "ci_test_manual";
const MANUAL_PASSWORD = "ci_test_manual_123";
// iiko-учётка с логином (SSO). В тестах iiko не настроен, поэтому живая
// проверка недоступна и вход проходит по локальному (кэш/временному) паролю.
const SSO_LOGIN = "ci_sso_login";
const SSO_PASSWORD = "ci_sso_password_123";

let server;
let base;

before(async () => {
  // Основной тестовый пользователь — «из iiko» (source=iiko): политика входа
  // пускает только таких. Не зависим от seed и демо-паролей.
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
  await db.user.upsert({
    where: { name: TEST_LOGIN },
    update: { passwordHash, role: "director", active: true, source: "iiko" },
    create: {
      name: TEST_LOGIN,
      passwordHash,
      role: "director",
      position: "CI",
      source: "iiko",
    },
  });

  // Ручная учётка (source=manual, не админ-исключение) — вход запрещён политикой.
  const manualHash = await bcrypt.hash(MANUAL_PASSWORD, 10);
  await db.user.upsert({
    where: { name: MANUAL_LOGIN },
    update: { passwordHash: manualHash, active: true, source: "manual" },
    create: {
      name: MANUAL_LOGIN,
      passwordHash: manualHash,
      role: "staff",
      position: "CI",
      source: "manual",
    },
  });

  // iiko-сотрудник с логином (SSO). iiko в тестах не настроен → fallback на
  // локальный пароль.
  const ssoHash = await bcrypt.hash(SSO_PASSWORD, 10);
  await db.user.upsert({
    where: { name: SSO_LOGIN },
    update: {
      passwordHash: ssoHash,
      active: true,
      source: "iiko",
      login: SSO_LOGIN,
    },
    create: {
      name: SSO_LOGIN,
      login: SSO_LOGIN,
      passwordHash: ssoHash,
      role: "manager",
      position: "CI",
      source: "iiko",
    },
  });

  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address();
  base = `http://127.0.0.1:${port}`;
});

after(async () => {
  await db.auditLog.deleteMany({
    where: { user: { name: { in: [TEST_LOGIN, MANUAL_LOGIN, SSO_LOGIN] } } },
  });
  await db.user.deleteMany({
    where: { name: { in: [TEST_LOGIN, MANUAL_LOGIN, SSO_LOGIN] } },
  });
  await new Promise((resolve) => server.close(resolve));
  await db.$disconnect();
});

// Достаёт значение cookie "token" из заголовка Set-Cookie ответа.
function tokenCookie(res) {
  const raw = res.headers.get("set-cookie");
  if (!raw) return null;
  const match = raw
    .split(/,(?=\s*token=)/)
    .find((c) => c.trim().startsWith("token="));
  return match ? match.split(";")[0].trim() : null;
}

test("GET /api/health отвечает ok", async () => {
  const res = await fetch(`${base}/api/health`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
});

test("GET /api/auth/me без cookie → 401", async () => {
  const res = await fetch(`${base}/api/auth/me`);
  assert.equal(res.status, 401);
});

test("login с неверным паролем → 401", async () => {
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login: TEST_LOGIN, password: "wrong" }),
  });
  assert.equal(res.status, 401);
});

test("login с пустым телом → 400", async () => {
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(res.status, 400);
});

test("несуществующий маршрут → 404", async () => {
  const res = await fetch(`${base}/api/nope`);
  assert.equal(res.status, 404);
});

test("вход ручной (не из iiko) учётки → 403 (пароль верный)", async () => {
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login: MANUAL_LOGIN, password: MANUAL_PASSWORD }),
  });
  assert.equal(res.status, 403, "не-iiko учётку политика не пускает");
});

test("iiko-учётка с логином: SSO недоступен → вход по локальному паролю", async () => {
  const ok = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login: SSO_LOGIN, password: SSO_PASSWORD }),
  });
  assert.equal(
    ok.status,
    200,
    "fallback на локальный пароль при недоступном iiko"
  );
  const bad = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login: SSO_LOGIN, password: "wrong" }),
  });
  assert.equal(bad.status, 401, "неверный пароль → 401");
});

test("полный поток: login → me → logout → me 401", async () => {
  // 1. Вход
  const loginRes = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login: TEST_LOGIN, password: TEST_PASSWORD }),
  });
  assert.equal(loginRes.status, 200);
  const loginBody = await loginRes.json();
  assert.equal(loginBody.name, TEST_LOGIN);
  assert.equal(loginBody.role, "director");
  assert.ok(loginBody.token, "login должен вернуть token в теле");

  // me по Bearer-токену (кросс-доменный путь github.io↔onrender)
  const meBearer = await fetch(`${base}/api/auth/me`, {
    headers: { Authorization: `Bearer ${loginBody.token}` },
  });
  assert.equal(meBearer.status, 200);

  const cookie = tokenCookie(loginRes);
  assert.ok(cookie, "должна прийти cookie token");

  // Cookie обязана быть HttpOnly.
  const setCookieRaw = loginRes.headers.get("set-cookie");
  assert.match(setCookieRaw, /HttpOnly/i);

  // 2. me с cookie → 200
  const meRes = await fetch(`${base}/api/auth/me`, {
    headers: { Cookie: cookie },
  });
  assert.equal(meRes.status, 200);
  const meBody = await meRes.json();
  assert.equal(meBody.name, TEST_LOGIN);

  // 3. logout → 200
  const logoutRes = await fetch(`${base}/api/auth/logout`, {
    method: "POST",
    headers: { Cookie: cookie },
  });
  assert.equal(logoutRes.status, 200);

  // 4. Вход зафиксирован в журнале безопасности.
  const logins = await db.auditLog.count({
    where: { event: "login", user: { name: TEST_LOGIN } },
  });
  assert.ok(logins >= 1, "вход должен попасть в AuditLog");
});
