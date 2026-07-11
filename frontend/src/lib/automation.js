// Автоматизация: триггеры, правила по умолчанию и генерация задач-последствий.
import { D, uid } from "../lib/format.js";

/* ------------------- автоматизация процессов (Digital Pipeline) ------------ */
// По образцу amoCRM: при событии по задаче применяются правила.
// Триггеры: phase (переход вперёд в фазу N), return (возврат на доработку),
// overdue (просрочка по SLA). Действия: notify (тост + журнал),
// priority (поднять приоритет), followup (создать задачу-напоминание).
export const AUTOMATION_TRIGGERS = [
  { type: "phase", phase: 3, label: "Задача взята в работу" },
  { type: "phase", phase: 4, label: "Отправлена на проверку" },
  { type: "phase", phase: 5, label: "Задача завершена" },
  { type: "return", label: "Возврат на доработку" },
  { type: "overdue", label: "Просрочка по сроку (SLA)" },
];

export const NOTIFY_TARGETS = [
  { key: "executor", label: "исполнителю" },
  { key: "controller", label: "контролёру" },
  { key: "chief", label: "руководству" },
];

export const DEFAULT_RULES = [
  {
    id: "r-overdue",
    name: "Просрочка → эскалация",
    active: true,
    trigger: { type: "overdue" },
    actions: [
      { type: "notify", target: "chief" },
      { type: "priority", pr: "Критический" },
    ],
  },
  {
    id: "r-return",
    name: "Возврат → уведомить исполнителя",
    active: true,
    trigger: { type: "return" },
    actions: [{ type: "notify", target: "executor" }],
  },
  {
    id: "r-done",
    name: "Завершение → уведомить контролёра",
    active: true,
    trigger: { type: "phase", phase: 5 },
    actions: [{ type: "notify", target: "controller" }],
  },
];

export const triggerLabel = (trg) => {
  const f = AUTOMATION_TRIGGERS.find(
    (x) => x.type === trg.type && (x.phase == null || x.phase === trg.phase),
  );
  return f ? f.label : trg.type;
};

// Совпадает ли триггер правила с событием (из истории или overdue-скана).
export function triggerMatches(trg, evt) {
  if (trg.type !== evt.type) return false;
  if (trg.type === "phase") return trg.phase === evt.phase;
  return true; // return | overdue
}

// Задача-напоминание, создаваемая действием followup.
export function makeFollowupTask(rule, src, cfg, now) {
  const days = Number(cfg.days) > 0 ? Number(cfg.days) : 3;
  return {
    id: "t" + uid().slice(0, 6),
    title: (cfg.title || "Напоминание: проверить результат").slice(0, 70),
    description:
      "Создано автоматически по правилу «" +
      rule.name +
      "» к задаче «" +
      src.title +
      "».",
    branchId: src.branchId,
    executorId: src.executorId,
    controllerId: src.controllerId,
    createdBy: src.controllerId || src.executorId,
    phase: 1,
    cat: src.cat,
    pr: "Обычный",
    amount: null,
    overBudget: false,
    departmentId: src.departmentId,
    attachments: 0,
    favorite: false,
    createdAt: now,
    slaDeadline: now + days * D,
    comments: [],
    autoFrom: src.id,
  };
}

/* ---------------------- автоматизация процессов (экран) -------------------- */
export const autoActionLabel = (ac) => {
  if (ac.type === "notify") {
    const i = NOTIFY_TARGETS.find((x) => x.key === ac.target);
    return "уведомить " + (i ? i.label : "");
  }
  if (ac.type === "priority") return "приоритет → " + ac.pr;
  if (ac.type === "followup")
    return "напоминание через " + (ac.days || 3) + " дн.";
  return ac.type;
};
