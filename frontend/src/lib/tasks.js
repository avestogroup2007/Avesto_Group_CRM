// Домен задач: SLA, журнал (hist), видимость/фильтры, ИИ-разбор голосовых
// заявок, аномалии и расчёт аналитики.
import { C } from "../lib/theme.js";
import { M, H, D, uid, fmtDur } from "../lib/format.js";
import { ORG, userById, branchById, slaFor } from "../lib/org.js";
import { reducer } from "../lib/store.js";

export const ACTION_LABEL = {
  created: "Создал(а) заявку",
  viewed: "Просмотрел(а) задачу",
  start: "Взял(а) в работу",
  review: "Отправил(а) на проверку",
  done: "Принял(а) работу и завершил(а)",
  return: "Вернул(а) на доработку",
  comment: "Добавил(а) комментарий",
  step: "Выполнил(а) шаг",
};

// Статус SLA для задачи (Этап 2)
export function slaInfo(t, now) {
  if (t.phase >= 5) return { tone: "done", text: "Завершено", color: C.faint };
  const left = t.slaDeadline - now;
  if (left <= 0)
    return {
      tone: "bad",
      text: "Просрочено на " + fmtDur(-left),
      color: C.bad,
    };
  if (left < H)
    return { tone: "warn", text: "Осталось " + fmtDur(left), color: C.warn };
  return { tone: "ok", text: "Осталось " + fmtDur(left), color: C.ok };
}

/* ---------------- карта «когда задача вошла в фазу» (по журналу) ----------- */
export function getEnter(history) {
  const enter = {};
  [...history]
    .sort((a, z) => a.at - z.at)
    .forEach((h) => {
      if (h.to == null) return;
      enter[h.taskId] = enter[h.taskId] || {};
      if (enter[h.taskId][h.to] == null) enter[h.taskId][h.to] = h.at;
    });
  return enter;
}

/* ----------------------------- бюджеты ------------------------------------ */
// Потрачено по филиалу за месяц (заявки в работе + завершённые с суммой)
export function spentForBranch(tasks, branchId, now) {
  return tasks
    .filter(
      (t) =>
        t.branchId === branchId &&
        t.amount &&
        t.phase >= 2 &&
        now - t.createdAt < 30 * D,
    )
    .reduce((a, t) => a + t.amount, 0);
}

/* ---------------------- симуляция ИИ (Этап 4) ----------------------------- */
export function aiParse(text) {
  const s = text.toLowerCase();
  const map = [
    ["север", 2],
    ["юг", 3],
    ["восток", 4],
    ["центр", 1],
  ];
  let branchId = 3;
  for (const [k, id] of map)
    if (s.includes(k)) {
      branchId = id;
      break;
    }
  let cat = "Прочее";
  if (
    /(терминал|принтер|компьютер|интернет|роутер|сервер|касс|по\b|программ|1с)/.test(
      s,
    )
  )
    cat = "IT-поддержка";
  else if (
    /(кондиционер|потек|потёк|течёт|течет|сломал|не работает|ремонт|замок|труб|витрин|лампа|освещ|затопл|кофемашин|холодильник)/.test(
      s,
    )
  )
    cat = "Ремонт оборудования";
  else if (
    /(счёт|счет|оплат|деньг|бюджет|закуп|аренд|инвойс|накладн|товар|пакет)/.test(
      s,
    )
  )
    cat = "Финансы / Закупка";
  let pr = "Обычный";
  if (
    /(срочно|критич|горит|авари|прорыв|сейчас|немедленно|очеред|заканчива)/.test(
      s,
    )
  )
    pr = "Критический";
  else if (/(сегодня|быстро|важно|высок)/.test(s)) pr = "Высокий";
  let amount = null;
  const mt = s.replace(/\s/g, "").match(/(\d{4,})(сум|so['’]?m|som|руб|р|₽)/i);
  if (mt) amount = parseInt(mt[1], 10);
  const slaH = slaFor(pr);
  return { branchId, cat, pr, amount, slaH };
}

export function pickExecutor(branchId, cat) {
  const inB = ORG.users.filter(
    (u) => u.branchId === branchId && u.active !== false,
  );
  const want =
    cat === "IT-поддержка"
      ? ["Системный администратор", "Техник"]
      : cat === "Ремонт оборудования"
        ? ["Техник", "Системный администратор"]
        : cat.startsWith("Финансы")
          ? ["Бухгалтер", "Линейный сотрудник"]
          : ["Линейный сотрудник", "Техник"];
  for (const w of want) {
    const f = inB.find((u) => u.pos === w);
    if (f) return f.id;
  }
  const any = inB.find((u) => u.role === "staff" || u.role === "sysadmin");
  return any ? any.id : ""; // нет подходящего сотрудника — не назначаем
}

export function pickController(branchId) {
  const m = ORG.users.find(
    (u) =>
      u.role === "manager" && u.branchId === branchId && u.active !== false,
  );
  return m ? m.id : ""; // нет управляющего — не назначаем
}

export function aiSummary(t) {
  const ex = userById(t.executorId),
    ct = userById(t.controllerId);
  const stage =
    t.phase >= 5
      ? "Задача завершена и принята контролёром."
      : t.phase === 4
        ? "Работа выполнена и ожидает финальной проверки контролёра."
        : t.phase === 3
          ? "Задача в активной работе у исполнителя."
          : "Задача зафиксирована, идёт реакция ответственных.";
  return (
    `Суть: ${t.title.toLowerCase()}. Категория — ${t.cat}, приоритет — ${t.pr}. ` +
    `Исполнитель — ${ex?.pos} (${ex?.name}), контроль — ${ct?.pos} (${ct?.name}). ` +
    `${stage} Обсуждений в карточке: ${t.comments.length}.`
  );
}

export const VOICE_SAMPLES = [
  "На филиале Юг сломался терминал оплаты, очередь на кассе, срочно нужен мастер!",
  "На центральном складе заканчиваются фирменные пакеты, осталось две коробки, закажите ещё 500 штук",
  "На Севере не печатает принтер накладные, надо сегодня починить",
  "На Востоке опять потекла труба в подсобке, заливает, срочно",
];

/* ---------------- ИИ-ревизор: аномалии и системные инциденты --------------- */
export function detectAnomalies(tasks, history, now) {
  const enter = getEnter(history);
  // средняя сумма по категории (для поиска ценовых аномалий)
  const sums = {},
    cnt = {};
  tasks.forEach((t) => {
    if (t.amount) {
      sums[t.cat] = (sums[t.cat] || 0) + t.amount;
      cnt[t.cat] = (cnt[t.cat] || 0) + 1;
    }
  });
  const avgCat = {};
  Object.keys(sums).forEach((k) => (avgCat[k] = sums[k] / cnt[k]));

  const flags = {}; // taskId -> [строки]
  tasks.forEach((t) => {
    const f = [];
    const m = enter[t.id] || {};
    if (
      t.phase >= 5 &&
      m[5] &&
      m[5] - t.createdAt < 5 * M &&
      t.slaDeadline - t.createdAt > H
    )
      f.push("Подозрительно быстрое закрытие (возможно фиктивно)");
    if (t.amount && avgCat[t.cat] && t.amount > 1.4 * avgCat[t.cat])
      f.push("Сумма на 40%+ выше средней по категории");
    if (t.overBudget) f.push("Превышение бюджета филиала");
    if (f.length) flags[t.id] = f;
  });

  // системные инциденты: 3+ задач одной категории на одном филиале за 30 дней
  const groups = {};
  tasks.forEach((t) => {
    if (now - t.createdAt > 30 * D) return;
    const key = t.branchId + "|" + t.cat;
    (groups[key] = groups[key] || []).push(t);
  });
  const incidents = Object.entries(groups)
    .filter(([, arr]) => arr.length >= 3)
    .map(([key, arr]) => {
      const [bid, cat] = key.split("|");
      return {
        branchId: +bid,
        cat,
        count: arr.length,
        total: arr.reduce((a, t) => a + (t.amount || 0), 0),
      };
    })
    .sort((a, z) => z.count - a.count);

  return { flags, incidents };
}

/* ------------------------------- reducer ---------------------------------- */
export function hist(taskId, userId, action, from, to, note) {
  return {
    id: uid(),
    taskId,
    userId,
    action,
    from,
    to,
    at: Date.now(),
    note: note || null,
  };
}

export function routePhase(step, len) {
  return step >= len ? 5 : step === 0 ? 1 : step === len - 1 ? 4 : 3;
}

/* --------------------- видимость задач по ролям (RBAC) -------------------- */
// Видимость задач = граница доступа по ОТДЕЛАМ.
// Правила: высшее руководство видит всё; свои задачи (исполнитель/контролёр)
// видны всегда; задачи своего отдела — видны; финансы видят денежные задачи
// и закрытые (финансовые) отделы; управляющий филиала видит НЕзакрытые задачи
// своего филиала. Чужой закрытый отдел (например, финансовый) — недоступен.
export function visibleTasks(tasks, user) {
  if (user.role === "director") return tasks;
  const dept = user.departmentId;
  const restricted = new Set(
    ORG.departments.filter((d) => d.restricted).map((d) => d.id),
  );
  return tasks.filter((t) => {
    if (t.executorId === user.id || t.controllerId === user.id) return true; // своя задача
    if (t.assignees && t.assignees.includes(user.id)) return true; // участник маршрута
    if (dept != null && t.departmentId === dept) return true; // свой отдел
    if (
      (user.role === "finance" || user.role === "accountant") &&
      (t.amount || restricted.has(t.departmentId))
    )
      return true; // финконтроль
    if (
      user.role === "manager" &&
      t.branchId === user.branchId &&
      !restricted.has(t.departmentId)
    )
      return true; // свой филиал, кроме закрытых отделов
    return false;
  });
}

export function applyFilters(tasks, f, now) {
  return tasks.filter((t) => {
    if (f.branch !== "all" && t.branchId !== +f.branch) return false;
    if (f.company !== "all") {
      const b = branchById(t.branchId);
      if (!b || b.companyId !== +f.company) return false;
    }
    if (f.period !== "all") {
      const span = f.period === "7" ? 7 * D : 30 * D;
      if (now - t.createdAt > span) return false;
    }
    return true;
  });
}

/* --------------------------- расчёт аналитики ------------------------------ */
export function computeAnalytics(tasks, history, now) {
  const enter = getEnter(history);
  const ids = new Set(tasks.map((t) => t.id));

  const funnel = [];
  for (let p = 1; p <= 4; p++) {
    const durs = [];
    tasks.forEach((t) => {
      const m = enter[t.id];
      if (m && m[p] != null && m[p + 1] != null) durs.push(m[p + 1] - m[p]);
    });
    const avg = durs.length ? durs.reduce((a, b) => a + b, 0) / durs.length : 0;
    funnel.push({ from: p, to: p + 1, avg, count: durs.length });
  }
  const maxAvg = Math.max(1, ...funnel.map((f) => f.avg));
  const bottleneckIdx = funnel.reduce(
    (best, f, i) => (f.avg > funnel[best].avg ? i : best),
    0,
  );

  const execIds = [...new Set(tasks.map((t) => t.executorId))];
  const eff = execIds
    .map((id) => {
      const own = tasks.filter((t) => t.executorId === id);
      let overdue = 0;
      const reactions = [];
      own.forEach((t) => {
        const m = enter[t.id] || {};
        if (m[2] != null) reactions.push(m[2] - t.createdAt);
        if (t.phase >= 5) {
          if ((m[5] || 0) > t.slaDeadline) overdue++;
        } else if (now > t.slaDeadline) overdue++;
      });
      const total = own.length;
      const rate = total ? Math.round(((total - overdue) / total) * 100) : 100;
      const avgReact = reactions.length
        ? reactions.reduce((a, b) => a + b, 0) / reactions.length
        : 0;
      return { id, total, overdue, rate, avgReact };
    })
    .sort((a, z) => z.rate - a.rate);

  const byBranch = {};
  tasks.forEach((t) => {
    if (t.amount) byBranch[t.branchId] = (byBranch[t.branchId] || 0) + t.amount;
  });
  const fin = Object.entries(byBranch)
    .map(([bid, value]) => ({ name: branchById(+bid)?.name, value }))
    .sort((a, z) => z.value - a.value);
  const toPay = tasks
    .filter((t) => t.phase === 4 && t.amount)
    .reduce((a, t) => a + t.amount, 0);

  const overdueAll = tasks.filter(
    (t) => t.phase < 5 && now > t.slaDeadline,
  ).length;
  const slaRate = tasks.length
    ? Math.round(((tasks.length - overdueAll) / tasks.length) * 100)
    : 100;

  return {
    funnel,
    maxAvg,
    bottleneckIdx,
    eff,
    fin,
    toPay,
    active: tasks.filter((t) => t.phase < 5).length,
    overdueAll,
    done: tasks.filter((t) => t.phase >= 5).length,
    slaRate,
  };
}
