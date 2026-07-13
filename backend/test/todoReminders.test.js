// Напоминания о задачах: выборка просроченных/сегодняшних с Telegram-
// исполнителем, дедуп за день, крон-эндпоинт с секретом.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";

import { app } from "../src/app.js";
import { db } from "../src/db.js";
import { remindOverdueTodos } from "../src/services/todoReminders.js";

const PASS = "todorem_test_pass_123";
let server, base;
let tgUserId, plainUserId;

const ymdTashkent = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tashkent" });
const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
};

before(async () => {
  const passwordHash = await bcrypt.hash(PASS, 10);
  // Исполнитель с Telegram и без.
  const tg = await db.user.upsert({
    where: { name: "tr_tg" },
    update: { passwordHash, role: "staff", active: true, telegramId: "990001" },
    create: {
      name: "tr_tg",
      passwordHash,
      role: "staff",
      telegramId: "990001",
    },
  });
  const plain = await db.user.upsert({
    where: { name: "tr_plain" },
    update: { passwordHash, role: "staff", active: true },
    create: { name: "tr_plain", passwordHash, role: "staff" },
  });
  tgUserId = tg.id;
  plainUserId = plain.id;
  await db.todoTask.deleteMany({
    where: { createdById: { in: [tgUserId, plainUserId] } },
  });

  server = app.listen(0);
  await new Promise((ok) => server.once("listening", ok));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await db.todoTask.deleteMany({
    where: {
      OR: [
        { createdById: { in: [tgUserId, plainUserId] } },
        { assigneeId: { in: [tgUserId, plainUserId] } },
      ],
    },
  });
  await db.user.deleteMany({ where: { name: { startsWith: "tr_" } } });
  server?.close();
});

const mkTodo = (data) =>
  db.todoTask.create({
    data: { title: "T", status: "todo", createdById: tgUserId, ...data },
  });

test("напоминание: просроченная задача с Telegram — выбирается и штампуется", async () => {
  const today = ymdTashkent();
  const overdue = await mkTodo({ assigneeId: tgUserId, dueDate: daysAgo(2) });
  // Без срока — не напоминаем.
  const noDue = await mkTodo({ assigneeId: tgUserId, dueDate: null });
  // Выполненная — не напоминаем.
  const done = await mkTodo({
    assigneeId: tgUserId,
    dueDate: daysAgo(3),
    status: "done",
  });
  // Исполнитель без Telegram — не напоминаем.
  const noTg = await mkTodo({ assigneeId: plainUserId, dueDate: daysAgo(1) });

  const res = await remindOverdueTodos();
  assert.ok(res.reminded >= 1);

  const after1 = await db.todoTask.findUnique({ where: { id: overdue.id } });
  assert.equal(after1.remindedOn, today);
  // Остальные не тронуты.
  for (const id of [noDue.id, done.id, noTg.id]) {
    const t = await db.todoTask.findUnique({ where: { id } });
    assert.equal(t.remindedOn, null);
  }
});

test("дедуп: повторный запуск в тот же день не напоминает снова", async () => {
  // После первого теста задача уже помечена сегодняшним числом.
  const res = await remindOverdueTodos();
  // Нет новых просроченных задач с Telegram → 0 напоминаний.
  assert.equal(res.reminded, 0);
});

test("крон: без секрета эндпоинт отключён (503)", async () => {
  // В тестовой среде TODO_REMINDER_SECRET не задан.
  const res = await fetch(`${base}/api/todos-cron/remind`, { method: "POST" });
  assert.equal(res.status, 503);
});
