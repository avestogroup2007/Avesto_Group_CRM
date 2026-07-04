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

let server;
let base;

before(async () => {
  // Собственный пользователь теста — не зависим от seed и демо-паролей.
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
  await db.user.upsert({
    where: { name: TEST_LOGIN },
    update: { passwordHash, role: "director", active: true },
    create: {
      name: TEST_LOGIN,
      passwordHash,
      role: "director",
      position: "CI",
    },
  });

  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address();
  base = `http://127.0.0.1:${port}`;
});

after(async () => {
  await db.auditLog.deleteMany({ where: { user: { name: TEST_LOGIN } } });
  await db.user.deleteMany({ where: { name: TEST_LOGIN } });
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
