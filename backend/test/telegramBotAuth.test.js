// Интеграционный тест самостоятельного входа в бота: /start → логин → пароль →
// привязка telegramId. Telegram API не вызывается по-настоящему (нет токена в
// тесте — вызовы молча пропускаются), проверяем эффект в БД.
import test from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";
import { db } from "../src/db.js";
import { handleUpdate } from "../src/services/telegramBot.js";

const TID = "990001234"; // тестовый telegram id (не пересекается с реальными)
const LOGIN = "bot_login_test";
const PASS = "secret123";

const priv = (text) => ({
  message: {
    chat: { id: TID, type: "private" },
    from: { id: TID, first_name: "Тест" },
    text,
    message_id: 100,
  },
});

test.before(async () => {
  await db.botSession
    .deleteMany({ where: { telegramId: TID } })
    .catch(() => {});
  await db.user.deleteMany({ where: { login: LOGIN } }).catch(() => {});
  const passwordHash = await bcrypt.hash(PASS, 10);
  await db.user.create({
    data: {
      name: "iiko-bottest",
      login: LOGIN,
      displayName: "Тест Уборщица",
      passwordHash,
      role: "staff",
      source: "iiko",
      active: true,
    },
  });
});

test.after(async () => {
  await db.botSession
    .deleteMany({ where: { telegramId: TID } })
    .catch(() => {});
  await db.user.deleteMany({ where: { login: LOGIN } }).catch(() => {});
});

test("неверный пароль не привязывает Telegram", async () => {
  await handleUpdate(priv("/start"));
  await handleUpdate(priv(LOGIN));
  await handleUpdate(priv("wrong-pass"));
  const u = await db.user.findFirst({ where: { login: LOGIN } });
  assert.equal(u.telegramId, null);
});

test("верный логин/пароль привязывает telegramId к сотруднику", async () => {
  await handleUpdate(priv("/start"));
  await handleUpdate(priv(LOGIN));
  await handleUpdate(priv(PASS));
  const u = await db.user.findFirst({ where: { login: LOGIN } });
  assert.equal(u.telegramId, TID);
  // Сессия входа очищена после привязки.
  const sess = await db.botSession.findUnique({
    where: { telegramId: TID },
  });
  assert.equal(sess, null);
});
