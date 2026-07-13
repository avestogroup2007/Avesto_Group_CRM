// Бот: быстрые действия с задачами — «Мои задачи», закрытие, добавление
// одним сообщением. Проверяем вью-список и текстовый флоу создания.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

import { db } from "../src/db.js";
import { handleUpdate, _internals } from "../src/services/telegramBot.js";

const TID = "880042"; // telegramId тестового пользователя
let userId;

before(async () => {
  const u = await db.user.upsert({
    where: { name: "bt_todo" },
    update: {
      role: "staff",
      active: true,
      telegramId: TID,
      displayName: "Бот Тест",
    },
    create: {
      name: "bt_todo",
      passwordHash: "x",
      role: "staff",
      telegramId: TID,
      displayName: "Бот Тест",
    },
  });
  userId = u.id;
  await db.todoTask.deleteMany({ where: { createdById: userId } });
  await db.botSession.deleteMany({ where: { telegramId: TID } });
});

after(async () => {
  await db.todoTask.deleteMany({
    where: { OR: [{ createdById: userId }, { assigneeId: userId }] },
  });
  await db.botSession.deleteMany({ where: { telegramId: TID } });
  await db.user.deleteMany({ where: { name: "bt_todo" } });
});

test("todoListView: показывает мои задачи и кнопки закрытия", async () => {
  await db.todoTask.create({
    data: {
      title: "Проверить холодильник",
      assigneeId: userId,
      createdById: userId,
    },
  });
  const v = await _internals.todoListView({ id: userId, role: "staff" });
  assert.match(v.text, /Мои задачи/);
  assert.match(v.text, /Проверить холодильник/);
  // Есть кнопка закрытия задачи, «Новая задача» и «Меню».
  const flat = v.keyboard.flat();
  assert.ok(flat.some((b) => b.callback_data.startsWith("todo|done|")));
  assert.ok(flat.some((b) => b.callback_data === "todo|new"));
  assert.ok(flat.some((b) => b.callback_data === "backmenu"));
});

test("создание задачи из бота: текст в сессии → новая TodoTask", async () => {
  // Пользователь нажал «Новая задача» — стоит сессия ожидания текста.
  await db.botSession.upsert({
    where: { telegramId: TID },
    update: { state: { flow: "todo", step: "title" } },
    create: { telegramId: TID, state: { flow: "todo", step: "title" } },
  });
  await handleUpdate({
    message: {
      chat: { id: Number(TID), type: "private" },
      from: { id: Number(TID) },
      text: "Заказать упаковку",
    },
  });
  // Задача создана на исполнителя-себя, сессия очищена.
  const created = await db.todoTask.findFirst({
    where: { title: "Заказать упаковку", assigneeId: userId },
  });
  assert.ok(created, "задача должна создаться");
  assert.equal(created.createdById, userId);
  const sess = await db.botSession.findUnique({ where: { telegramId: TID } });
  assert.equal(sess, null, "сессия должна очиститься после создания");
});

test("пустой ввод не создаёт задачу", async () => {
  await db.botSession.upsert({
    where: { telegramId: TID },
    update: { state: { flow: "todo", step: "title" } },
    create: { telegramId: TID, state: { flow: "todo", step: "title" } },
  });
  const before = await db.todoTask.count({ where: { assigneeId: userId } });
  await handleUpdate({
    message: {
      chat: { id: Number(TID), type: "private" },
      from: { id: Number(TID) },
      text: "   ",
    },
  });
  const after = await db.todoTask.count({ where: { assigneeId: userId } });
  assert.equal(after, before, "пустой текст не создаёт задачу");
});
