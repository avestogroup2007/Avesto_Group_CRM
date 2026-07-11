// Демо-данные для локального стартового состояния (без бэкенда).
import { M, H, D, uid } from "../lib/format.js";
import {
  COMPANIES,
  BRANCHES,
  BRANCH_BUDGET,
  USERS,
  POSITIONS,
  DEFAULT_SLA,
  DEFAULT_SOPS,
  DEPARTMENTS,
  CAT_DEPT,
  ROUTE_TEMPLATES,
} from "../lib/org.js";

/* ----------------------------- демо-данные -------------------------------- */
export const TASK_SPEC = [
  {
    t: "Не работает терминал оплаты",
    d: "Терминал безналичной оплаты не проводит платежи, на кассе скопилась очередь.",
    b: 3,
    e: "u6",
    c: "u4",
    ph: 3,
    cat: "IT-поддержка",
    pr: "Критический",
    slaH: -1,
    com: 2,
    att: 1,
    fav: true,
  },
  {
    t: "Протёк кондиционер в зале",
    d: "Кондиционер в главном зале течёт, есть риск порчи документов.",
    b: 3,
    e: "u6",
    c: "u4",
    ph: 4,
    cat: "Ремонт оборудования",
    pr: "Высокий",
    slaH: 1,
    com: 5,
    att: 2,
  },
  {
    t: "Заявка на закупку ТМЦ (бумага, картриджи)",
    d: "Нужно закупить бумагу А4 и картриджи для филиала.",
    b: 3,
    e: "u9",
    c: "u4",
    ph: 2,
    cat: "Финансы / Закупка",
    pr: "Обычный",
    slaH: 20,
    com: 1,
    att: 0,
    amount: 45000,
  },
  {
    t: "Счёт на оплату аренды помещения",
    d: "Поступил счёт на аренду за текущий месяц, требуется согласование.",
    b: 1,
    e: "u8",
    c: "u3",
    ph: 4,
    cat: "Финансы / Закупка",
    pr: "Высокий",
    slaH: 4,
    com: 3,
    att: 1,
    amount: 90000,
  },
  {
    t: "Сломался принтер, не печатает накладные",
    d: "Принтер на складе перестал печатать, накладные не выгружаются.",
    b: 2,
    e: "u7",
    c: "u5",
    ph: 1,
    cat: "IT-поддержка",
    pr: "Высокий",
    slaH: 8,
    com: 0,
    att: 0,
  },
  {
    t: "Ремонт холодильной витрины",
    d: "Витрина не держала температуру, вызывали мастера.",
    b: 2,
    e: "u7",
    c: "u5",
    ph: 5,
    cat: "Ремонт оборудования",
    pr: "Высокий",
    slaH: -40,
    com: 8,
    att: 3,
    amount: 150000,
  },
  {
    t: "Замена ламп освещения в зале",
    d: "Перегорели лампы, заменили на новые.",
    b: 3,
    e: "u9",
    c: "u4",
    ph: 5,
    cat: "Ремонт оборудования",
    pr: "Обычный",
    slaH: -50,
    com: 2,
    att: 1,
    amount: 8000,
  },
  {
    t: "Обновление кассового ПО",
    d: "Установили обновление кассовой программы на всех кассах.",
    b: 3,
    e: "u6",
    c: "u4",
    ph: 5,
    cat: "IT-поддержка",
    pr: "Обычный",
    slaH: -30,
    com: 4,
    att: 0,
  },
  {
    t: "Не открывается замок склада",
    d: "Заклинило замок на складе, нет доступа к товару.",
    b: 4,
    e: "u11",
    c: "u10",
    ph: 1,
    cat: "Ремонт оборудования",
    pr: "Критический",
    slaH: 2,
    com: 0,
    att: 0,
    amount: 5000,
  },
  {
    t: "Закупка оборудования для филиала",
    d: "Требуется закупка нового оборудования, счёт на согласовании.",
    b: 4,
    e: "u11",
    c: "u10",
    ph: 4,
    cat: "Финансы / Закупка",
    pr: "Высокий",
    slaH: 6,
    com: 2,
    att: 1,
    amount: 150000,
  },
  {
    t: "Авария: прорыв трубы, затопление",
    d: "Прорвало трубу в подсобном помещении, идёт затопление.",
    b: 4,
    e: "u11",
    c: "u10",
    ph: 3,
    cat: "Ремонт оборудования",
    pr: "Критический",
    slaH: -0.5,
    com: 6,
    att: 1,
    amount: 95000,
    fav: true,
  },
  {
    t: "Заявка на отпуск",
    d: "Прошу предоставить ежегодный оплачиваемый отпуск.",
    b: 3,
    e: "u9",
    c: "u4",
    ph: 2,
    cat: "Прочее",
    pr: "Обычный",
    slaH: 40,
    com: 0,
    att: 0,
  },
  {
    t: "Слетел роутер, нет интернета",
    d: "Пропал интернет на филиале, не работают онлайн-кассы.",
    b: 2,
    e: "u7",
    c: "u5",
    ph: 3,
    cat: "IT-поддержка",
    pr: "Высокий",
    slaH: 2,
    com: 3,
    att: 0,
  },
  {
    t: "Списание просроченных продуктов",
    d: "Списание партии просроченных продуктов по акту.",
    b: 3,
    e: "u9",
    c: "u4",
    ph: 5,
    cat: "Прочее",
    pr: "Обычный",
    slaH: -60,
    com: 1,
    att: 1,
    amount: 12000,
  },
  {
    t: "Ремонт кофемашины",
    d: "Кофемашина не варит кофе, требуется ремонт.",
    b: 4,
    e: "u11",
    c: "u10",
    ph: 5,
    cat: "Ремонт оборудования",
    pr: "Обычный",
    slaH: -20,
    com: 3,
    att: 1,
    amount: 30000,
  },
  {
    t: "Повторный ремонт кофемашины",
    d: "Кофемашина снова вышла из строя через неделю после ремонта.",
    b: 4,
    e: "u11",
    c: "u10",
    ph: 3,
    cat: "Ремонт оборудования",
    pr: "Высокий",
    slaH: 3,
    com: 2,
    att: 0,
    amount: 35000,
    overBudget: true,
  },
];

export function makeSeed() {
  const now = Date.now();
  const tasks = TASK_SPEC.map((s, i) => {
    let createdAt;
    if (s.ph === 1) createdAt = now - (15 + (i % 5) * 5) * M;
    else if (s.ph === 2) createdAt = now - (1 + (i % 3)) * H;
    else if (s.ph === 3) createdAt = now - (1 + (i % 2)) * D;
    else if (s.ph === 4) createdAt = now - (2 + (i % 2)) * D;
    else createdAt = now - (5 + (i % 4)) * D;
    return {
      id: "t" + (i + 1),
      title: s.t,
      description: s.d,
      branchId: s.b,
      departmentId: CAT_DEPT[s.cat] || "d4",
      executorId: s.e,
      controllerId: s.c,
      createdBy: s.c,
      phase: s.ph,
      cat: s.cat,
      pr: s.pr,
      amount: s.amount || null,
      overBudget: !!s.overBudget,
      attachments: s.att || 0,
      favorite: !!s.fav,
      createdAt,
      slaDeadline: now + s.slaH * H,
      comments: Array.from({ length: s.com || 0 }, (_, k) => ({
        userId: k % 2 ? s.c : s.e,
        text: [
          "Принято в работу.",
          "Уточнил детали у поставщика.",
          "Жду подтверждения.",
          "Прикрепил фото.",
          "Готово, проверьте.",
          "Перепроверил ещё раз.",
        ][k % 6],
        at: createdAt + (k + 1) * 30 * M,
      })),
    };
  });

  const history = [];
  tasks.forEach((t, i) => {
    let prev = t.createdAt;
    const push = (userId, action, from, to, atRaw) => {
      const at = Math.min(Math.max(atRaw, prev + M), now - M);
      prev = at;
      history.push({ id: uid(), taskId: t.id, userId, action, from, to, at });
    };
    push(t.createdBy, "created", null, 1, t.createdAt);
    if (t.phase >= 2)
      push(t.executorId, "viewed", 1, 2, t.createdAt + (8 + (i % 5) * 3) * M);
    if (t.phase >= 3)
      push(t.executorId, "start", 2, 3, t.createdAt + (12 + (i % 4) * 4) * H);
    if (t.phase >= 4)
      push(t.executorId, "review", 3, 4, t.createdAt + (16 + (i % 4) * 3) * H);
    if (t.phase >= 5)
      push(t.controllerId, "done", 4, 5, t.createdAt + (40 + (i % 5) * 6) * H);
  });

  const openIds = ["u4", "u5", "u6", "u7", "u9", "u10", "u11"];
  const shifts = {};
  USERS.forEach((u) => {
    shifts[u.id] = {
      open: openIds.includes(u.id),
      openedAt: openIds.includes(u.id) ? now - 4 * H : null,
    };
  });

  // демо-табель: смены за прошедшие дни
  const timesheet = [];
  [
    "u4",
    "u5",
    "u6",
    "u7",
    "u8",
    "u9",
    "u10",
    "u11",
    "u12",
    "u13",
    "u14",
  ].forEach((id, k) => {
    for (let d = 1; d <= 4; d++) {
      const end = now - d * D + (2 - (k % 3)) * H;
      const dur = (8 + ((k + d) % 3)) * H + (k % 2 ? 30 * M : 0);
      timesheet.push({
        id: uid(),
        userId: id,
        start: end - dur,
        end,
        durationMs: dur,
      });
    }
  });

  // демо-отчёты по кассам филиалов
  const cashReports = [];
  const dstr = (ms) => {
    const dt = new Date(ms);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  };
  const BR_MGR = { 1: "u8", 2: "u5", 3: "u4", 4: "u10", 5: "u4" };
  const rnd = (base, p) => Math.round((base * p) / 1000) * 1000;
  [1, 2, 3, 4, 5].forEach((bId, bi) => {
    for (let d = 1; d <= 6; d++) {
      const base = 6_000_000 + bi * 1_400_000 + ((d * 37) % 9) * 300_000;
      const fiscal = rnd(base, 0.55),
        nonFiscal = rnd(base, 0.12);
      const humo = rnd(base, 0.11),
        uzcard = rnd(base, 0.07),
        click = rnd(base, 0.05),
        payme = rnd(base, 0.06);
      const uzumTezkor = d % 3 === 0 ? rnd(base, 0.02) : 0,
        yandex = d % 2 === 0 ? rnd(base, 0.03) : 0;
      const transfer = d % 4 === 0 ? rnd(base, 0.04) : 0,
        transferCount = transfer ? 1 + (d % 3) : 0;
      const expenses = rnd(base, 0.15),
        debt = d % 5 === 0 ? 200_000 : 0,
        noPay = d % 6 === 0 ? 150_000 : 0;
      const total =
        fiscal +
        nonFiscal +
        humo +
        uzcard +
        click +
        payme +
        uzumTezkor +
        yandex +
        transfer;
      const iiko = total + ((d % 3) - 1) * 50_000;
      const diff = total - iiko;
      const confirmed = d >= 3;
      cashReports.push({
        id: uid(),
        date: dstr(now - d * D),
        branchId: bId,
        userId: BR_MGR[bId],
        createdAt: now - d * D,
        status: confirmed ? "confirmed" : "submitted",
        submittedAt: now - d * D,
        confirmedAt: confirmed ? now - (d - 1) * D : undefined,
        confirmedBy: confirmed ? "u1" : undefined,
        comment:
          diff !== 0 ? "Расхождение по эквайрингу, уточняется у банка" : "",
        expensesNote: expenses
          ? [
              "Закупка продуктов на рынке",
              "Хозтовары и упаковка",
              "Мелкий ремонт оборудования",
              "Такси для доставки, вода",
            ][d % 4]
          : "",
        transfer,
        transferCount,
        fiscal,
        nonFiscal,
        humo,
        uzcard,
        click,
        payme,
        uzumTezkor,
        yandex,
        debt,
        noPay,
        expenses,
        iiko,
      });
    }
  });

  // демо-инкассации (передачи наличных в головной офис)
  const cashHandovers = [];
  [1, 2, 3, 4, 5].forEach((bId) => {
    const cashTotal = cashReports
      .filter((r) => r.branchId === bId)
      .reduce((a, r) => a + (r.fiscal || 0) + (r.nonFiscal || 0), 0);
    const part1 = Math.round((cashTotal * 0.6) / 1000) * 1000;
    const part2 = Math.round((cashTotal * 0.25) / 1000) * 1000;
    cashHandovers.push({
      id: uid(),
      branchId: bId,
      date: dstr(now - 3 * D),
      amount: part1,
      via: "Инкассатор банка",
      note: "",
      userId: BR_MGR[bId],
      createdAt: now - 3 * D,
      status: "received",
      receivedBy: "u1",
      receivedAt: now - 2 * D,
    });
    cashHandovers.push({
      id: uid(),
      branchId: bId,
      date: dstr(now - 1 * D),
      amount: part2,
      via: "Водитель офиса",
      note: "",
      userId: BR_MGR[bId],
      createdAt: now - 1 * D,
      status: "sent",
    });
  });

  // Продакшн-старт: демо-данные (сотрудники, задачи, кассы, табель) НЕ заводим —
  // они появляются из реальной работы и синхронизации кадров с iiko. Оставляем
  // только справочники-конфигурацию: филиалы, юр.лица, отделы, маршруты, SLA.
  void tasks;
  void history;
  void shifts;
  void timesheet;
  void cashReports;
  void cashHandovers;
  return {
    tasks: [],
    history: [],
    shifts: {},
    timesheet: [],
    cashReports: [],
    cashHandovers: [],
    shiftChecklists: [],
    cakeConfig: { bases: [], coatings: [], decors: [] },
    currentUserId: null,
    companies: COMPANIES.map((c) => ({ ...c })),
    branches: BRANCHES.map((b) => ({ ...b })),
    positions: POSITIONS.map((p) => ({ ...p })),
    users: [],
    departments: DEPARTMENTS.map((d) => ({ ...d })),
    catDept: { ...CAT_DEPT },
    routes: ROUTE_TEMPLATES.map((r) => ({
      ...r,
      steps: r.steps.map((st) => ({ ...st })),
    })),
    budgets: { ...BRANCH_BUDGET },
    sla: { ...DEFAULT_SLA },
    sops: JSON.parse(JSON.stringify(DEFAULT_SOPS)),
    settings: {
      voiceInput: true,
      watermark: true,
      ipRestrict: false,
      lang: "ru",
    },
  };
}
