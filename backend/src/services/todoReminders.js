// Напоминания о задачах: раз в день шлём исполнителю в Telegram список его
// просроченных и сегодняшних незавершённых задач. Дедуп за день — поле
// remindedOn (YYYY-MM-DD): повторный запуск в тот же день не спамит. Отправка
// best-effort (sendTelegram сам молчит, если Telegram не настроен).
import { db } from "../db.js";
import { sendTelegram, esc } from "./telegram.js";

const ymdTashkent = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tashkent" });

// Конец текущего дня по Ташкенту в UTC — задачи со сроком «сегодня и раньше».
function endOfTodayUtc() {
  const ymd = ymdTashkent(); // YYYY-MM-DD в Asia/Tashkent (UTC+5)
  // 23:59:59 Ташкента = 18:59:59 UTC того же дня.
  return new Date(`${ymd}T18:59:59.999Z`);
}

const dueLabel = (dueYmd, today) =>
  dueYmd < today ? "просрочена" : "на сегодня";

// Собрать и разослать напоминания. Возвращает сводку для крон-ответа.
export async function remindOverdueTodos() {
  const today = ymdTashkent();
  const cutoff = endOfTodayUtc();

  // Незавершённые задачи со сроком ≤ сегодня, с исполнителем, ещё не
  // напоминавшиеся сегодня.
  const tasks = await db.todoTask.findMany({
    where: {
      status: { not: "done" },
      dueDate: { not: null, lte: cutoff },
      assigneeId: { not: null },
      OR: [{ remindedOn: null }, { remindedOn: { not: today } }],
    },
    take: 2000,
  });
  if (!tasks.length) return { reminded: 0, recipients: 0, tasks: 0 };

  // Исполнители с привязанным Telegram.
  const ids = [...new Set(tasks.map((t) => t.assigneeId))];
  const users = await db.user.findMany({
    where: { id: { in: ids }, telegramId: { not: null }, active: true },
    select: { id: true, telegramId: true, displayName: true, name: true },
  });
  const userById = new Map(users.map((u) => [u.id, u]));

  // Группируем задачи по исполнителю (только у кого есть Telegram).
  const byUser = new Map();
  for (const t of tasks) {
    if (!userById.has(t.assigneeId)) continue;
    const arr = byUser.get(t.assigneeId) || [];
    arr.push(t);
    byUser.set(t.assigneeId, arr);
  }

  let reminded = 0;
  const stampIds = [];
  for (const [uid, list] of byUser) {
    const u = userById.get(uid);
    const lines = list
      .slice(0, 30)
      .map((t) => {
        const dueYmd = new Date(t.dueDate).toLocaleDateString("en-CA", {
          timeZone: "Asia/Tashkent",
        });
        return `• ${esc(t.title)} — <b>${dueLabel(dueYmd, today)}</b> (срок ${dueYmd})`;
      })
      .join("\n");
    const text =
      `🔔 <b>Напоминание о задачах</b>\n` +
      `${esc(u.displayName || u.name || "")}, к выполнению:\n${lines}`;
    await sendTelegram(text, u.telegramId);
    reminded += list.length;
    for (const t of list) stampIds.push(t.id);
  }

  // Отметить как «напомнили сегодня» — чтобы не слать повторно в тот же день.
  if (stampIds.length) {
    await db.todoTask.updateMany({
      where: { id: { in: stampIds } },
      data: { remindedOn: today },
    });
  }
  return {
    reminded,
    recipients: byUser.size,
    tasks: tasks.length,
    date: today,
  };
}
