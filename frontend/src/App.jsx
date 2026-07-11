import React, { useState, useEffect, useMemo, useReducer } from "react";
import { createPortal } from "react-dom";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Cell,
  ResponsiveContainer,
  Tooltip,
  CartesianGrid,
} from "recharts";
import {
  Inbox,
  PlusCircle,
  BarChart3,
  Building2,
  Settings,
  Archive,
  Clock,
  Paperclip,
  MessageSquare,
  Star,
  X,
  CheckCircle2,
  RotateCcw,
  Play,
  Send,
  Bot,
  ChevronRight,
  ChevronDown,
  Filter,
  Download,
  Printer,
  ShieldCheck,
  AlertTriangle,
  Users,
  Power,
  Sparkles,
  Info,
  Award,
  Mic,
  AlertCircle,
  Camera,
  ListChecks,
  Server,
  Lock,
  Activity,
  TrendingUp,
  FileText,
  Wallet,
  Menu,
  CalendarDays,
  ArrowUp,
  Banknote,
  Trash2,
  Pencil,
  Check,
  GripVertical,
  Cake,
} from "lucide-react";
import Logo from "./Logo.jsx";
import IikoPanel from "./IikoPanel.jsx";
import CakeConstructor from "./CakeConstructor.jsx";
import IikoProduction from "./IikoProduction.jsx";
import { apiGet, apiPost, apiPatch, apiDelete, changePassword } from "./api.js";
import { FONT, C, PHASES } from "./lib/theme.js";
import {
  Avatar,
  PhasePill,
  MiniRail,
  PhaseRail,
  Badge,
  BigBtn,
  Meta,
  Field,
  Select,
  Kpi,
  Ring,
  StatusBadge,
  NiceSelect,
  NiceDate,
  CashNumField,
  ScrollTopButton,
  AdInput,
  AdToggle,
  AdCard,
} from "./components/ui.jsx";
import TimesheetView from "./pages/Timesheet.jsx";
import ShiftChecklistsView from "./pages/ShiftChecklists.jsx";
import CashRegisterView from "./pages/CashRegister.jsx";
import MoneyView from "./pages/Money.jsx";
import SalesAnalytics from "./pages/SalesAnalytics.jsx";
import { usePersisted } from "./lib/hooks.js";
import { LANG, syncLang, tr } from "./lib/i18n.js";
import {
  M,
  H,
  D,
  TZ,
  uid,
  fmtDur,
  fmtMoney,
  fmtWork,
  fmtWorkH,
  fmtSum,
  fmtDateTime,
  initials,
  avatarColor,
  lightTone,
  ymdNow,
} from "./lib/format.js";
import { CHECKLIST_DEFS, branchHours, hourSlots } from "./lib/checklists.js";
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
  assignByActor,
  ORG,
  syncOrg,
  userById,
  branchById,
  companyOfBranch,
  deptById,
  deptForCategory,
  budgetFor,
  slaFor,
  sopFor,
} from "./lib/org.js";

/* ============================================================================
   Avesto Group CRM System  (интерактивный прототип, MVP)
   Реализует 5 фаз заявок, роли Исполнитель/Контролёр, неизменяемый журнал,
   SLA-таймеры, смены, SOP-чек-листы, контроль бюджетов, ИИ-маршрутизацию,
   поиск аномалий, дашборд директора и личную аналитику сотрудника.
   ============================================================================ */

const ACTION_LABEL = {
  created: "Создал(а) заявку",
  viewed: "Просмотрел(а) задачу",
  start: "Взял(а) в работу",
  review: "Отправил(а) на проверку",
  done: "Принял(а) работу и завершил(а)",
  return: "Вернул(а) на доработку",
  comment: "Добавил(а) комментарий",
  step: "Выполнил(а) шаг",
};

const STORAGE_KEY = "avesto.crm.v11"; // продакшн-старт без демо-данных — старые локальные данные (демо) игнорируются

// Статус SLA для задачи (Этап 2)
function slaInfo(t, now) {
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

/* ----------------------------- демо-данные -------------------------------- */
const TASK_SPEC = [
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

function makeSeed() {
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

/* ---------------- карта «когда задача вошла в фазу» (по журналу) ----------- */
function getEnter(history) {
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
function spentForBranch(tasks, branchId, now) {
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
function aiParse(text) {
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
function pickExecutor(branchId, cat) {
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
function pickController(branchId) {
  const m = ORG.users.find(
    (u) =>
      u.role === "manager" && u.branchId === branchId && u.active !== false,
  );
  return m ? m.id : ""; // нет управляющего — не назначаем
}
function aiSummary(t) {
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
const VOICE_SAMPLES = [
  "На филиале Юг сломался терминал оплаты, очередь на кассе, срочно нужен мастер!",
  "На центральном складе заканчиваются фирменные пакеты, осталось две коробки, закажите ещё 500 штук",
  "На Севере не печатает принтер накладные, надо сегодня починить",
  "На Востоке опять потекла труба в подсобке, заливает, срочно",
];

/* ---------------- ИИ-ревизор: аномалии и системные инциденты --------------- */
function detectAnomalies(tasks, history, now) {
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
function hist(taskId, userId, action, from, to, note) {
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
function routePhase(step, len) {
  return step >= len ? 5 : step === 0 ? 1 : step === len - 1 ? 4 : 3;
}

/* ------------------- автоматизация процессов (Digital Pipeline) ------------ */
// По образцу amoCRM: при событии по задаче применяются правила.
// Триггеры: phase (переход вперёд в фазу N), return (возврат на доработку),
// overdue (просрочка по SLA). Действия: notify (тост + журнал),
// priority (поднять приоритет), followup (создать задачу-напоминание).
const AUTOMATION_TRIGGERS = [
  { type: "phase", phase: 3, label: "Задача взята в работу" },
  { type: "phase", phase: 4, label: "Отправлена на проверку" },
  { type: "phase", phase: 5, label: "Задача завершена" },
  { type: "return", label: "Возврат на доработку" },
  { type: "overdue", label: "Просрочка по сроку (SLA)" },
];
const NOTIFY_TARGETS = [
  { key: "executor", label: "исполнителю" },
  { key: "controller", label: "контролёру" },
  { key: "chief", label: "руководству" },
];
const DEFAULT_RULES = [
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
const triggerLabel = (trg) => {
  const f = AUTOMATION_TRIGGERS.find(
    (x) => x.type === trg.type && (x.phase == null || x.phase === trg.phase),
  );
  return f ? f.label : trg.type;
};
// Совпадает ли триггер правила с событием (из истории или overdue-скана).
function triggerMatches(trg, evt) {
  if (trg.type !== evt.type) return false;
  if (trg.type === "phase") return trg.phase === evt.phase;
  return true; // return | overdue
}
// Задача-напоминание, создаваемая действием followup.
function makeFollowupTask(rule, src, cfg, now) {
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

function init() {
  return {
    ...makeSeed(),
    view: "inbox",
    selectedId: null,
    filters: { company: "all", branch: "all", period: "all" },
    hydrated: false,
  };
}
function reducer(s, a) {
  switch (a.type) {
    case "HYDRATE":
      return { ...s, ...a.data, hydrated: true };
    case "MARK_HYDRATED":
      return { ...s, hydrated: true };
    case "SET_VIEW":
      return { ...s, view: a.view, selectedId: null };
    case "SELECT": {
      const t = s.tasks.find((x) => x.id === a.id);
      let tasks = s.tasks,
        history = s.history;
      if (t && t.phase === 1 && !t.routeId) {
        const me = s.currentUserId;
        if (t.executorId === me || t.controllerId === me) {
          tasks = s.tasks.map((x) => (x.id === t.id ? { ...x, phase: 2 } : x));
          history = [...s.history, hist(t.id, me, "viewed", 1, 2)];
        }
      }
      return { ...s, tasks, history, selectedId: a.id };
    }
    case "CLOSE_TASK":
      return { ...s, selectedId: null };
    case "SET_USER":
      return {
        ...s,
        currentUserId: a.id,
        selectedId: null,
        filters: { company: "all", branch: "all", period: "all" },
      };
    case "TOGGLE_SHIFT": {
      const cur = s.shifts[a.id] || { open: false };
      const open = !cur.open;
      const now = Date.now();
      let timesheet = s.timesheet || [];
      if (!open && cur.openedAt) {
        timesheet = [
          {
            id: uid(),
            userId: a.id,
            start: cur.openedAt,
            end: now,
            durationMs: Math.max(0, now - cur.openedAt),
          },
          ...timesheet,
        ];
      }
      return {
        ...s,
        timesheet,
        shifts: { ...s.shifts, [a.id]: { open, openedAt: open ? now : null } },
      };
    }
    case "ADVANCE":
      return {
        ...s,
        tasks: s.tasks.map((x) => (x.id === a.id ? { ...x, phase: a.to } : x)),
        history: [
          ...s.history,
          hist(a.id, s.currentUserId, a.action, a.from, a.to),
        ],
      };
    // Автоматизация: добавить задачу-напоминание без смены вида/выбора.
    case "ADD_TASK_SILENT":
      return {
        ...s,
        tasks: [a.task, ...s.tasks],
        history: [
          ...s.history,
          hist(a.task.id, a.task.createdBy, "created", null, 1),
        ],
      };
    // Автоматизация: поднять приоритет задачи.
    case "SET_PRIORITY":
      return {
        ...s,
        tasks: s.tasks.map((x) => (x.id === a.id ? { ...x, pr: a.pr } : x)),
      };
    case "TOGGLE_FAV":
      return {
        ...s,
        tasks: s.tasks.map((x) =>
          x.id === a.id ? { ...x, favorite: !x.favorite } : x,
        ),
      };
    case "ADD_COMMENT":
      return {
        ...s,
        tasks: s.tasks.map((x) =>
          x.id === a.id
            ? {
                ...x,
                comments: [
                  ...x.comments,
                  { userId: s.currentUserId, text: a.text, at: Date.now() },
                ],
              }
            : x,
        ),
        history: [
          ...s.history,
          hist(a.id, s.currentUserId, "comment", null, null),
        ],
      };
    case "CREATE_TASK":
      return {
        ...s,
        view: "inbox",
        selectedId: a.task.id,
        tasks: [a.task, ...s.tasks],
        history: [
          ...s.history,
          hist(a.task.id, a.task.createdBy, "created", null, 1),
        ],
      };
    case "SET_FILTER":
      return { ...s, filters: { ...s.filters, [a.key]: a.value } };
    case "ADD_USER":
      return { ...s, users: [...s.users, a.user] };
    case "UPDATE_USER":
      return {
        ...s,
        users: s.users.map((u) => (u.id === a.id ? { ...u, ...a.patch } : u)),
      };
    case "ADD_POSITION":
      return { ...s, positions: [...s.positions, a.position] };
    case "ADD_COMPANY":
      return { ...s, companies: [...s.companies, a.company] };
    case "ROUTE_ADVANCE": {
      const tasks = s.tasks.map((t) => {
        if (t.id !== a.id) return t;
        const ns = t.currentStep + 1;
        return {
          ...t,
          currentStep: ns,
          phase: routePhase(ns, t.steps.length),
          attachments: (t.attachments || 0) + (a.addAtt || 0),
        };
      });
      return {
        ...s,
        tasks,
        history: [
          ...s.history,
          hist(a.id, a.userId, "step", null, null, a.note),
        ],
      };
    }
    case "ROUTE_RETURN": {
      const tasks = s.tasks.map((t) => {
        if (t.id !== a.id) return t;
        const ns = Math.max(0, t.currentStep - 1);
        return { ...t, currentStep: ns, phase: routePhase(ns, t.steps.length) };
      });
      return {
        ...s,
        tasks,
        history: [
          ...s.history,
          hist(a.id, a.userId, "return", null, null, a.note),
        ],
      };
    }
    case "ADD_ROUTE":
      return { ...s, routes: [...s.routes, a.route] };
    case "UPDATE_ROUTE":
      return {
        ...s,
        routes: s.routes.map((r) => (r.id === a.id ? { ...r, ...a.patch } : r)),
      };
    case "ADD_DEPARTMENT":
      return { ...s, departments: [...s.departments, a.department] };
    case "UPDATE_DEPARTMENT":
      return {
        ...s,
        departments: s.departments.map((d) =>
          d.id === a.id ? { ...d, ...a.patch } : d,
        ),
      };
    case "SET_CATDEPT":
      return { ...s, catDept: { ...s.catDept, [a.category]: a.departmentId } };
    case "ADD_BRANCH":
      return {
        ...s,
        branches: [...s.branches, a.branch],
        budgets: { ...s.budgets, [a.branch.id]: a.branch.monthly || 0 },
      };
    case "SET_BUDGET":
      return { ...s, budgets: { ...s.budgets, [a.branchId]: a.value } };
    case "SET_SLA":
      return { ...s, sla: { ...s.sla, [a.priority]: a.hours } };
    case "SET_SOP":
      return {
        ...s,
        sops: {
          ...s.sops,
          [a.category]: { steps: a.steps, requirePhoto: a.requirePhoto },
        },
      };
    case "SET_SETTING":
      return { ...s, settings: { ...(s.settings || {}), [a.key]: a.value } };
    case "SAVE_CASH_REPORT": {
      const list = s.cashReports || [];
      const at = Date.now();
      const idx = list.findIndex(
        (r) => r.branchId === a.report.branchId && r.date === a.report.date,
      );
      const next =
        idx >= 0
          ? list.map((r, i) =>
              i === idx
                ? {
                    ...r,
                    ...a.report,
                    id: r.id,
                    createdAt: r.createdAt,
                    status: "submitted",
                    submittedAt: at,
                    updatedAt: at,
                  }
                : r,
            )
          : [
              {
                ...a.report,
                id: uid(),
                createdAt: at,
                status: "submitted",
                submittedAt: at,
              },
              ...list,
            ];
      return { ...s, cashReports: next };
    }
    case "CONFIRM_CASH_REPORT":
      return {
        ...s,
        cashReports: (s.cashReports || []).map((r) =>
          r.id === a.id
            ? {
                ...r,
                status: "confirmed",
                confirmedAt: Date.now(),
                confirmedBy: a.userId,
              }
            : r,
        ),
      };
    case "DELETE_CASH_REPORT":
      return {
        ...s,
        cashReports: (s.cashReports || []).filter((r) => r.id !== a.id),
      };
    case "ADD_HANDOVER":
      return {
        ...s,
        cashHandovers: [
          { ...a.handover, id: uid(), status: "sent", createdAt: Date.now() },
          ...(s.cashHandovers || []),
        ],
      };
    case "SAVE_CHECKLIST": {
      // upsert по (kind, branchId, date, slot) — повторная сдача обновляет запись.
      const run = a.run;
      const same = (r) =>
        r.kind === run.kind &&
        r.branchId === run.branchId &&
        r.date === run.date &&
        (r.slot || null) === (run.slot || null);
      const list = s.shiftChecklists || [];
      const idx = list.findIndex(same);
      const rec = {
        ...run,
        id: idx >= 0 ? list[idx].id : uid(),
        at: Date.now(),
      };
      const next =
        idx >= 0 ? list.map((r, i) => (i === idx ? rec : r)) : [rec, ...list];
      return { ...s, shiftChecklists: next };
    }
    case "CAKE_STD_ADD": {
      const cfg = s.cakeConfig || { bases: [], coatings: [], decors: [] };
      const listc = cfg[a.cat] || [];
      return {
        ...s,
        cakeConfig: {
          ...cfg,
          [a.cat]: [...listc, { ...a.item, id: uid() }],
        },
      };
    }
    case "CAKE_STD_UPD": {
      const cfg = s.cakeConfig || { bases: [], coatings: [], decors: [] };
      return {
        ...s,
        cakeConfig: {
          ...cfg,
          [a.cat]: (cfg[a.cat] || []).map((x) =>
            x.id === a.id ? { ...x, ...a.patch } : x,
          ),
        },
      };
    }
    case "CAKE_STD_DEL": {
      const cfg = s.cakeConfig || { bases: [], coatings: [], decors: [] };
      return {
        ...s,
        cakeConfig: {
          ...cfg,
          [a.cat]: (cfg[a.cat] || []).filter((x) => x.id !== a.id),
        },
      };
    }
    case "CONFIRM_HANDOVER":
      return {
        ...s,
        cashHandovers: (s.cashHandovers || []).map((h) =>
          h.id === a.id
            ? {
                ...h,
                status: "received",
                receivedBy: a.userId,
                receivedAt: Date.now(),
              }
            : h,
        ),
      };
    case "DELETE_HANDOVER":
      return {
        ...s,
        cashHandovers: (s.cashHandovers || []).filter((h) => h.id !== a.id),
      };
    case "RESET":
      return { ...init(), ...makeSeed(), hydrated: true, view: s.view };
    default:
      return s;
  }
}

/* --------------------- видимость задач по ролям (RBAC) -------------------- */
// Видимость задач = граница доступа по ОТДЕЛАМ.
// Правила: высшее руководство видит всё; свои задачи (исполнитель/контролёр)
// видны всегда; задачи своего отдела — видны; финансы видят денежные задачи
// и закрытые (финансовые) отделы; управляющий филиала видит НЕзакрытые задачи
// своего филиала. Чужой закрытый отдел (например, финансовый) — недоступен.
function visibleTasks(tasks, user) {
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
function applyFilters(tasks, f, now) {
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

/* ----------------------------- персистентность ----------------------------- */
const store = {
  async load() {
    try {
      if (typeof window !== "undefined" && window.storage) {
        const r = await window.storage.get(STORAGE_KEY);
        return r ? JSON.parse(r.value) : null;
      }
    } catch (e) {}
    return null;
  },
  async save(data) {
    try {
      if (typeof window !== "undefined" && window.storage)
        await window.storage.set(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {}
  },
};

/* ----------------------------- мелкие компоненты --------------------------- */

/* ------------------------------ карточка задачи ---------------------------- */
function TaskCard({ t, now, onOpen, onFav, anomaly }) {
  const p = PHASES[t.phase - 1];
  const sla = slaInfo(t, now);
  const b = branchById(t.branchId);
  return (
    <button
      onClick={() => onOpen(t.id)}
      className="relative w-full text-left rounded-2xl bg-white overflow-hidden transition focus:outline-none"
      style={{
        border: `1px solid ${C.border}`,
        boxShadow: "0 1px 2px rgba(15,23,42,.04)",
      }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.boxShadow = "0 8px 24px rgba(15,23,42,.10)")
      }
      onMouseLeave={(e) =>
        (e.currentTarget.style.boxShadow = "0 1px 2px rgba(15,23,42,.04)")
      }
    >
      <span
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 5,
          background: p.color,
        }}
      />
      <div className="p-3 pl-4">
        <div className="flex items-start justify-between gap-2">
          <h4
            className="font-bold leading-snug"
            style={{
              color: C.ink,
              fontSize: 15,
              overflowWrap: "break-word",
              minWidth: 0,
            }}
          >
            {t.title}
          </h4>
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onFav(t.id);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.stopPropagation();
                onFav(t.id);
              }
            }}
            className="shrink-0 -mr-1 -mt-1 p-1 rounded-lg"
            title="В избранное"
          >
            <Star
              size={18}
              fill={t.favorite ? "#FACC15" : "none"}
              color={t.favorite ? "#FACC15" : C.faint}
            />
          </span>
        </div>
        <div className="mt-1" style={{ fontSize: 13, color: C.sub }}>
          {b?.name} • {t.cat}
        </div>

        {anomaly && (
          <div
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg"
            style={{
              background: "#FEF2F2",
              color: C.bad,
              padding: "3px 8px",
              fontSize: 11.5,
              fontWeight: 600,
            }}
          >
            <AlertTriangle size={13} /> ИИ-ревизор: аномалия
          </div>
        )}

        <div className="mt-2.5 space-y-1.5" style={{ fontSize: 13 }}>
          <div
            className="flex items-center gap-2 min-w-0"
            style={{ color: C.sub }}
          >
            <Avatar id={t.executorId} size={22} />
            <span className="flex-1 min-w-0 truncate">
              <b style={{ color: C.ink, fontWeight: 600 }}>
                {tr("Исполнитель:")}
              </b>{" "}
              {userById(t.executorId)?.name}
            </span>
          </div>
          <div
            className="flex items-center gap-2 min-w-0"
            style={{ color: C.sub }}
          >
            <Avatar id={t.controllerId} size={22} />
            <span className="flex-1 min-w-0 truncate">
              <b style={{ color: C.ink, fontWeight: 600 }}>
                {tr("Контролёр:")}
              </b>{" "}
              {userById(t.controllerId)?.name}
            </span>
          </div>
        </div>

        <div className="mt-2.5">
          <MiniRail phase={t.phase} />
        </div>

        <div className="mt-2.5 flex items-center justify-between">
          <span
            className="inline-flex items-center gap-1.5 rounded-lg font-semibold"
            style={{
              fontSize: 12.5,
              color: sla.color,
              background: t.phase >= 5 ? C.line : sla.color + "14",
              padding: "3px 9px",
            }}
          >
            <Clock size={13} /> {sla.text}
          </span>
          <div
            className="flex items-center gap-3"
            style={{ color: C.faint, fontSize: 13 }}
          >
            <span className="inline-flex items-center gap-1">
              <MessageSquare size={14} /> {t.comments.length}
            </span>
            <span className="inline-flex items-center gap-1">
              <Paperclip size={14} /> {t.attachments}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}

/* ---------------------------- доска (Канбан) ------------------------------- */
function Board({
  tasks,
  now,
  onOpen,
  onFav,
  flags,
  me,
  dispatch,
  notify,
  shiftOpen,
}) {
  const counts = PHASES.map((p) => tasks.filter((t) => t.phase === p.n).length);
  const firstNonEmpty = (PHASES.find((p, i) => counts[i] > 0) || PHASES[0]).n;
  const [active, setActive] = useState(firstNonEmpty);
  const [dragId, setDragId] = useState(null);
  const [overPhase, setOverPhase] = useState(null);
  const colCards = (n) => tasks.filter((t) => t.phase === n);

  // Кого текущий пользователь может тащить (исполнитель/контролёр, смена
  // открыта, не регламентная задача, не завершено).
  const canDrag = (t) =>
    !!shiftOpen &&
    !t.routeId &&
    t.phase < 5 &&
    !!me &&
    (t.executorId === me.id || t.controllerId === me.id);

  // План перехода при переносе задачи в фазу target — те же правила, что и
  // кнопки в карточке. null = такой перенос недоступен.
  const planMove = (t, target) => {
    if (!t || t.routeId || t.phase >= 5 || !me) return null;
    const isExec = t.executorId === me.id;
    const isCtrl = t.controllerId === me.id;
    if (isExec && (t.phase === 1 || t.phase === 2) && target === 3)
      return {
        action: "start",
        from: t.phase,
        to: 3,
        msg: "Задача взята в работу",
      };
    if (isExec && t.phase === 3 && target === 4)
      return { action: "review", from: 3, to: 4, needFinish: true };
    if (isCtrl && t.phase === 4 && target === 5)
      return {
        action: "done",
        from: 4,
        to: 5,
        msg: "Работа принята, задача завершена",
      };
    if (isCtrl && t.phase === 4 && target === 3)
      return {
        action: "return",
        from: 4,
        to: 3,
        msg: "Возвращено исполнителю на доработку",
      };
    return null;
  };

  const drop = (target, id) => {
    const t = tasks.find((x) => x.id === (id || dragId));
    setDragId(null);
    setOverPhase(null);
    if (!t || t.phase === target) return;
    if (!shiftOpen)
      return notify && notify("Откройте смену, чтобы менять статус");
    const plan = planMove(t, target);
    if (!plan)
      return notify && notify("Такой переход недоступен для вашей роли");
    // Переход «на проверку» требует чек-листа и фото — открываем карточку.
    if (plan.needFinish) {
      onOpen(t.id);
      return notify && notify("Завершите чек-лист и фото в карточке задачи");
    }
    dispatch({
      type: "ADVANCE",
      id: t.id,
      action: plan.action,
      from: plan.from,
      to: plan.to,
    });
    notify && notify(plan.msg);
  };

  // Плоская render-функция (не компонент) — чтобы при перерисовке доски во
  // время перетаскивания карточки не перемонтировались (иначе «призрак» drag
  // застревает). Реконсиляция идёт по key={t.id}.
  const renderCards = (n) => {
    const col = colCards(n);
    if (col.length === 0)
      return (
        <div
          className="text-center py-6"
          style={{ color: C.faint, fontSize: 13 }}
        >
          {tr("Нет задач")}
        </div>
      );
    return (
      <>
        {col.map((t) => {
          const drg = canDrag(t);
          return (
            <div
              key={t.id}
              draggable={drg}
              onDragStart={(e) => {
                if (!drg) return;
                setDragId(t.id);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", t.id);
              }}
              onDragEnd={() => {
                setDragId(null);
                setOverPhase(null);
              }}
              style={{
                cursor: drg ? "grab" : "default",
                opacity: dragId === t.id ? 0.4 : 1,
              }}
            >
              <TaskCard
                t={t}
                now={now}
                onOpen={onOpen}
                onFav={onFav}
                anomaly={!!(flags && flags[t.id])}
              />
            </div>
          );
        })}
      </>
    );
  };
  return (
    <>
      {/* Телефон/планшет: переключатель фаз + одна колонка (всё помещается, без горизонтальной прокрутки) */}
      <div className="xl:hidden">
        <div className="flex flex-wrap gap-1.5 pb-1">
          {PHASES.map((p, i) => {
            const on = active === p.n;
            return (
              <button
                key={p.n}
                onClick={() => setActive(p.n)}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-bold"
                style={{
                  background: on ? p.color : "#fff",
                  color: on ? "#fff" : C.ink,
                  border: `1px solid ${on ? p.color : C.border}`,
                  fontSize: 12.5,
                  whiteSpace: "nowrap",
                }}
              >
                <span
                  style={{
                    background: on ? "#fff" : p.color,
                    width: 8,
                    height: 8,
                    borderRadius: 99,
                  }}
                />
                {tr(p.label)}
                <span
                  className="rounded-full font-bold"
                  style={{
                    background: on ? "rgba(255,255,255,.25)" : p.soft,
                    color: on ? "#fff" : p.color,
                    fontSize: 11,
                    padding: "0 7px",
                  }}
                >
                  {counts[i]}
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-col gap-2.5 mt-1">{renderCards(active)}</div>
      </div>

      {/* Десктоп (xl+): 5 равных колонок во всю ширину — без горизонтального ползунка */}
      <div
        className="hidden xl:flex items-center gap-1.5 mb-2"
        style={{ fontSize: 12, color: C.faint }}
      >
        <GripVertical size={13} />
        Перетащите карточку в соседнюю колонку, чтобы сменить статус задачи.
      </div>
      <div
        className="hidden xl:grid gap-3"
        style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))" }}
      >
        {PHASES.map((p, i) => (
          <div key={p.n} className="min-w-0">
            <div className="flex items-center gap-2 px-1 pb-2.5">
              <span
                className="shrink-0"
                style={{
                  background: p.color,
                  width: 10,
                  height: 10,
                  borderRadius: 99,
                }}
              />
              <span
                className="font-bold uppercase truncate"
                style={{ color: C.ink, fontSize: 11.5, letterSpacing: ".03em" }}
              >
                {tr(p.label)}
              </span>
              <span
                className="ml-auto shrink-0 rounded-full font-bold"
                style={{
                  background: p.soft,
                  color: p.color,
                  fontSize: 11.5,
                  padding: "1px 8px",
                }}
              >
                {counts[i]}
              </span>
            </div>
            <div
              className="flex flex-col gap-2.5 rounded-2xl p-2 transition-colors"
              onDragOver={(e) => {
                if (!dragId) return;
                e.preventDefault();
                if (overPhase !== p.n) setOverPhase(p.n);
              }}
              onDragLeave={() =>
                setOverPhase((cur) => (cur === p.n ? null : cur))
              }
              onDrop={(e) => {
                e.preventDefault();
                drop(p.n, e.dataTransfer.getData("text/plain"));
              }}
              style={{
                background: overPhase === p.n ? p.soft : "#FBFCFE",
                border: `1px dashed ${overPhase === p.n ? p.color : C.border}`,
                minHeight: 120,
              }}
            >
              {renderCards(p.n)}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/* ----------------------------- деталь задачи ------------------------------- */
function TaskDetail({
  t,
  now,
  me,
  history,
  dispatch,
  notify,
  anomalyFlags,
  shiftOpen,
  onClose,
}) {
  const [comment, setComment] = useState("");
  const [summary, setSummary] = useState(null);
  const sop = sopFor(t.cat);
  const steps = sop.steps;
  const needPhoto = sop.requirePhoto;
  const [checks, setChecks] = useState(() => steps.map(() => false));
  const [photoTaken, setPhotoTaken] = useState(false);

  const isExec = t.executorId === me.id;
  const isCtrl = t.controllerId === me.id;
  const sla = slaInfo(t, now);
  const b = branchById(t.branchId);
  const co = companyOfBranch(t.branchId);
  const log = history
    .filter((h) => h.taskId === t.id)
    .sort((a, z) => a.at - z.at);
  const allChecked = checks.every(Boolean);
  const canFinish = allChecked && (!needPhoto || photoTaken);

  const act = (action, from, to, msg) => {
    dispatch({ type: "ADVANCE", id: t.id, action, from, to });
    notify(msg);
  };

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end"
      style={{
        background: "rgba(30,16,10,.42)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
      }}
      onClick={onClose}
    >
      <div
        className="h-full w-full bg-white overflow-y-auto fade-up"
        style={{ maxWidth: 560, boxShadow: "-24px 0 60px rgba(30,16,10,.22)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="sticky top-0 z-10 bg-white px-5 py-4 flex items-start justify-between gap-3"
          style={{ borderBottom: `1px solid ${C.border}` }}
        >
          <div className="min-w-0">
            <div
              className="flex items-center gap-2 mb-1"
              style={{ fontSize: 12.5, color: C.faint }}
            >
              <span>Заявка #{t.id.replace("t", "")}</span>
              <ChevronRight size={13} />
              <span className="truncate">{b?.name}</span>
            </div>
            <h2
              className="font-extrabold leading-tight"
              style={{ color: C.ink, fontSize: 18, overflowWrap: "break-word" }}
            >
              {t.title}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl shrink-0"
            style={{ background: C.line }}
            title="Закрыть"
          >
            <X size={18} color={C.sub} />
          </button>
        </div>

        <div className="px-5 py-5 space-y-5">
          <div
            className="rounded-2xl p-4"
            style={{ background: "#FBFCFE", border: `1px solid ${C.border}` }}
          >
            {t.routeId ? (
              <StepRail steps={t.steps} current={t.currentStep} />
            ) : (
              <PhaseRail phase={t.phase} />
            )}
          </div>

          {anomalyFlags && anomalyFlags.length > 0 && (
            <div
              className="rounded-2xl p-4"
              style={{ background: "#FEF2F2", border: `1px solid #FECACA` }}
            >
              <div
                className="flex items-center gap-2 font-bold mb-1.5"
                style={{ color: C.bad, fontSize: 14 }}
              >
                <AlertTriangle size={16} /> ИИ-ревизор обнаружил аномалии
              </div>
              <ul
                className="space-y-1"
                style={{ fontSize: 13, color: "#991B1B" }}
              >
                {anomalyFlags.map((f, i) => (
                  <li key={i}>• {f}</li>
                ))}
              </ul>
            </div>
          )}

          {/* блок ответственности */}
          <div
            className="rounded-2xl p-4 space-y-3"
            style={{ border: `1px solid ${C.border}` }}
          >
            {t.routeId ? (
              <RouteResp t={t} />
            ) : (
              <>
                <RespRow
                  id={t.executorId}
                  role={tr("Исполнитель — кто делает")}
                />
                <RespRow
                  id={t.controllerId}
                  role={tr("Контролёр — кто следит")}
                />
              </>
            )}
            <div
              className="flex items-center gap-2 rounded-xl px-3 py-2"
              style={{
                background: t.phase >= 5 ? C.line : sla.color + "14",
                color: sla.color,
                fontSize: 14,
                fontWeight: 700,
              }}
            >
              <Clock size={16} /> Срок (SLA): {sla.text}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3" style={{ fontSize: 13.5 }}>
            <Meta label={tr("Юр. лицо")} value={co?.name} />
            <Meta label={tr("Филиал")} value={b?.name} />
            <Meta label={tr("Категория")} value={t.cat} />
            <Meta
              label={tr("Отдел")}
              value={
                <span className="inline-flex items-center gap-1.5">
                  {deptById(t.departmentId)?.name || "—"}
                  {deptById(t.departmentId)?.restricted && (
                    <Lock size={12} color={C.bad} />
                  )}
                </span>
              }
            />
            <Meta label={tr("Приоритет")} value={tr(t.pr)} />
            <Meta label={tr("Создана")} value={fmtDateTime(t.createdAt)} />
            <Meta
              label={tr("Текущая фаза")}
              value={<PhasePill phase={t.phase} small />}
            />
          </div>

          <div>
            <div
              style={{
                fontSize: 12.5,
                color: C.faint,
                fontWeight: 600,
                marginBottom: 4,
              }}
            >
              {tr("Описание")}
            </div>
            <p style={{ fontSize: 14.5, color: C.ink, lineHeight: 1.55 }}>
              {t.description}
            </p>
          </div>

          {t.amount != null && (
            <div
              className="rounded-xl px-4 py-3"
              style={{ background: "#FBFCFE", border: `1px solid ${C.border}` }}
            >
              <div style={{ fontSize: 12.5, color: C.faint, fontWeight: 600 }}>
                Доп. поля (JSONB)
              </div>
              <div style={{ fontSize: 16, color: C.ink, fontWeight: 700 }}>
                {tr("Сумма")}: {fmtMoney(t.amount)}
              </div>
              {t.overBudget && (
                <div
                  className="mt-1 inline-flex items-center gap-1.5"
                  style={{ fontSize: 12.5, color: C.bad, fontWeight: 600 }}
                >
                  <Wallet size={14} /> Превышен бюджет филиала — требуется
                  одобрение финансиста
                </div>
              )}
            </div>
          )}

          {t.routeId && (
            <RouteFlow
              t={t}
              me={me}
              shiftOpen={shiftOpen}
              dispatch={dispatch}
              notify={notify}
            />
          )}

          {/* SOP чек-лист в фазе «В работе» для исполнителя */}
          {!t.routeId && isExec && t.phase === 3 && (
            <div
              className="rounded-2xl p-4"
              style={{ border: `1px solid ${C.border}` }}
            >
              <div
                className="flex items-center gap-2 font-bold mb-1"
                style={{ color: C.ink, fontSize: 15 }}
              >
                <ListChecks size={17} color={PHASES[2].color} /> Регламент
                (SOP): отметьте все шаги
              </div>
              <div style={{ fontSize: 12.5, color: C.sub, marginBottom: 10 }}>
                Кнопка «Выполнил» разблокируется только после всех шагов и фото.
              </div>
              <div className="space-y-2">
                {steps.map((st, i) => (
                  <label
                    key={i}
                    className="flex items-start gap-2.5 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={checks[i]}
                      onChange={() =>
                        setChecks((c) => c.map((v, k) => (k === i ? !v : v)))
                      }
                      style={{
                        width: 18,
                        height: 18,
                        marginTop: 1,
                        accentColor: PHASES[2].color,
                      }}
                    />
                    <span
                      style={{
                        fontSize: 14,
                        color: checks[i] ? C.faint : C.ink,
                        textDecoration: checks[i] ? "line-through" : "none",
                      }}
                    >
                      {st}
                    </span>
                  </label>
                ))}
              </div>
              {needPhoto && (
                <>
                  <button
                    onClick={() => {
                      setPhotoTaken(true);
                      notify("Фото сделано сейчас — метаданные проверены");
                    }}
                    className="mt-3 inline-flex items-center gap-2 rounded-xl px-3 py-2 font-semibold"
                    style={
                      photoTaken
                        ? {
                            background: "#E9F9EF",
                            color: C.ok,
                            border: `1px solid ${C.ok}`,
                          }
                        : { background: C.line, color: C.ink }
                    }
                  >
                    <Camera size={16} />{" "}
                    {photoTaken
                      ? "Фотоотчёт прикреплён"
                      : "Сделать фото (камера)"}
                  </button>
                  {!photoTaken && (
                    <div
                      style={{ fontSize: 11.5, color: C.faint, marginTop: 6 }}
                    >
                      Загрузка старого фото из галереи блокируется — нужен
                      снимок в реальном времени.
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* действия по ролям */}
          {!t.routeId && t.phase < 5 && (isExec || isCtrl) && !shiftOpen && (
            <div
              className="rounded-xl px-3 py-2.5 flex items-center gap-2"
              style={{
                background: "#FEF2F2",
                color: C.bad,
                fontSize: 13,
                border: `1px solid #FECACA`,
              }}
            >
              <Lock size={15} /> Смена закрыта — по регламенту безопасности
              доступен только просмотр. Откройте смену, чтобы менять статус.
            </div>
          )}
          {!t.routeId && t.phase < 5 && (isExec || isCtrl) && shiftOpen && (
            <div className="space-y-2">
              <div style={{ fontSize: 12.5, color: C.faint, fontWeight: 600 }}>
                Доступные действия для вашей роли
              </div>
              {isExec && (t.phase === 1 || t.phase === 2) && (
                <BigBtn
                  color={PHASES[2].color}
                  icon={Play}
                  onClick={() =>
                    act("start", t.phase, 3, "Задача взята в работу")
                  }
                >
                  Взять в работу
                </BigBtn>
              )}
              {isExec && t.phase === 3 && (
                <BigBtn
                  color={PHASES[3].color}
                  icon={Send}
                  disabled={!canFinish}
                  onClick={() =>
                    act("review", 3, 4, "Отправлено на проверку контролёру")
                  }
                >
                  {canFinish
                    ? "Выполнил — отправить на проверку"
                    : "Завершите чек-лист и фото"}
                </BigBtn>
              )}
              {isCtrl && t.phase === 4 && (
                <div className="grid grid-cols-1 gap-2">
                  <BigBtn
                    color={PHASES[4].color}
                    icon={CheckCircle2}
                    onClick={() =>
                      act("done", 4, 5, "Работа принята, задача завершена")
                    }
                  >
                    Принять и завершить
                  </BigBtn>
                  <BigBtn
                    color={C.warn}
                    icon={RotateCcw}
                    outline
                    onClick={() =>
                      act("return", 4, 3, "Возвращено исполнителю на доработку")
                    }
                  >
                    Вернуть на доработку
                  </BigBtn>
                </div>
              )}
              {((isExec && t.phase === 4) || (isCtrl && t.phase < 4)) && (
                <div
                  className="rounded-xl px-3 py-2.5 flex items-center gap-2"
                  style={{ background: C.line, color: C.sub, fontSize: 13 }}
                >
                  <Info size={15} /> Сейчас ход за{" "}
                  {isCtrl ? "исполнителем" : "контролёром"}. Кнопка появится на
                  нужной фазе.
                </div>
              )}
            </div>
          )}
          {!t.routeId && !isExec && !isCtrl && (
            <div
              className="rounded-xl px-3 py-2.5 flex items-center gap-2"
              style={{ background: C.line, color: C.sub, fontSize: 13 }}
            >
              <ShieldCheck size={15} /> Режим наблюдателя: вы видите задачу, но
              не назначены исполнителем или контролёром.
            </div>
          )}

          {/* AI саммари */}
          <div
            className="rounded-2xl p-4"
            style={{ border: `1px solid ${C.border}`, background: "#FBFCFE" }}
          >
            <button
              onClick={() => setSummary(aiSummary(t))}
              className="inline-flex items-center gap-2 rounded-xl px-3 py-2 font-bold text-white"
              style={{
                background: `linear-gradient(90deg, ${C.violet}, ${C.brandA})`,
                fontSize: 14,
              }}
            >
              <Bot size={16} /> {tr("Краткая суть (ИИ)")}
            </button>
            {summary && (
              <p
                className="mt-3"
                style={{ fontSize: 14, color: C.ink, lineHeight: 1.55 }}
              >
                {summary}
              </p>
            )}
          </div>

          {/* обсуждение */}
          <div>
            <div
              className="font-bold mb-2"
              style={{ color: C.ink, fontSize: 15 }}
            >
              {tr("Обсуждение")} ({t.comments.length})
            </div>
            <div className="space-y-3">
              {t.comments.map((c, i) => (
                <div key={i} className="flex gap-2.5">
                  <Avatar id={c.userId} size={28} />
                  <div
                    className="rounded-xl px-3 py-2 flex-1"
                    style={{ background: C.line }}
                  >
                    <div
                      style={{ fontSize: 13, fontWeight: 700, color: C.ink }}
                    >
                      {userById(c.userId)?.name}
                    </div>
                    <div style={{ fontSize: 14, color: C.ink }}>{c.text}</div>
                    <div
                      style={{ fontSize: 11.5, color: C.faint, marginTop: 2 }}
                    >
                      {fmtDateTime(c.at)}
                    </div>
                  </div>
                </div>
              ))}
              {t.comments.length === 0 && (
                <div style={{ fontSize: 13, color: C.faint }}>
                  Пока нет сообщений.
                </div>
              )}
            </div>
            <div className="mt-3 flex gap-2">
              <input
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && comment.trim()) {
                    dispatch({
                      type: "ADD_COMMENT",
                      id: t.id,
                      text: comment.trim(),
                    });
                    setComment("");
                  }
                }}
                placeholder="Написать сообщение…"
                className="flex-1 rounded-xl px-3 py-2.5 focus:outline-none"
                style={{
                  border: `1px solid ${C.border}`,
                  fontSize: 14,
                  color: C.ink,
                }}
              />
              <button
                onClick={() => {
                  if (comment.trim()) {
                    dispatch({
                      type: "ADD_COMMENT",
                      id: t.id,
                      text: comment.trim(),
                    });
                    setComment("");
                  }
                }}
                className="px-4 rounded-xl font-bold text-white"
                style={{ background: C.brandA, fontSize: 14 }}
              >
                Отправить
              </button>
            </div>
          </div>

          {/* неизменяемый журнал */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck size={16} color={C.ok} />
              <span
                className="font-bold"
                style={{ color: C.ink, fontSize: 15 }}
              >
                {tr("Журнал (неизменяемый)")}
              </span>
            </div>
            <div style={{ fontSize: 12, color: C.faint, marginBottom: 10 }}>
              Записи нельзя удалить или отредактировать — защита от споров «я не
              видел».
            </div>
            <div className="relative pl-5">
              <span
                style={{
                  position: "absolute",
                  left: 6,
                  top: 4,
                  bottom: 4,
                  width: 2,
                  background: C.border,
                }}
              />
              <div className="space-y-3.5">
                {log.map((h) => {
                  const dot = h.to ? PHASES[h.to - 1].color : C.faint;
                  return (
                    <div key={h.id} className="relative">
                      <span
                        style={{
                          position: "absolute",
                          left: -19,
                          top: 4,
                          width: 11,
                          height: 11,
                          borderRadius: 99,
                          background: dot,
                          boxShadow: "0 0 0 3px #fff",
                        }}
                      />
                      <div style={{ fontSize: 13.5, color: C.ink }}>
                        <b style={{ fontWeight: 700 }}>
                          {userById(h.userId)?.name}
                        </b>{" "}
                        — {ACTION_LABEL[h.action] || h.action}
                        {h.note && (
                          <span style={{ color: C.sub }}>: {h.note}</span>
                        )}
                        {h.from && h.to && (
                          <span style={{ color: C.sub }}>
                            {" "}
                            ({h.from}→{h.to})
                          </span>
                        )}
                      </div>
                      <div
                        style={{
                          fontSize: 11.5,
                          color: C.faint,
                          fontFamily: "ui-monospace, monospace",
                        }}
                      >
                        {fmtDateTime(h.at)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
function RespRow({ id, role }) {
  const u = userById(id);
  return (
    <div className="flex items-center gap-3 min-w-0">
      <div className="shrink-0">
        <Avatar id={id} size={40} />
      </div>
      <div className="min-w-0">
        <div style={{ fontSize: 12.5, color: C.faint, fontWeight: 600 }}>
          {role}
        </div>
        <div style={{ fontSize: 15, color: C.ink, fontWeight: 700 }}>
          {u?.name}
        </div>
        <div style={{ fontSize: 13, color: C.sub }}>{u?.pos}</div>
      </div>
    </div>
  );
}

/* --------------------------- создание заявки ------------------------------- */
function CreateTask({ me, tasks, now, dispatch, notify }) {
  const firstBranch = (ORG.branches[0] && ORG.branches[0].id) || 1;
  const blank = () => ({
    branchId: firstBranch,
    cat: "Прочее",
    pr: "Обычный",
    slaH: slaFor("Обычный"),
    amount: null,
    executorId: "",
    controllerId: "",
  });
  const [text, setText] = useState("");
  // Форма видна всегда и заполняется вручную (без ИИ). «Распознать (ИИ)» —
  // необязательный помощник: разбирает текст и подставляет поля.
  const [parsed, setParsed] = useState(blank);

  const recognize = (raw) => {
    const input = raw != null ? raw : text;
    if (!input.trim()) return;
    const p = aiParse(input);
    setParsed({
      ...p,
      executorId: pickExecutor(p.branchId, p.cat),
      controllerId: pickController(p.branchId),
    });
  };

  const budget =
    parsed && parsed.amount
      ? (() => {
          const spent = spentForBranch(tasks, parsed.branchId, now);
          const limit = budgetFor(parsed.branchId);
          return { spent, limit, over: spent + parsed.amount > limit };
        })()
      : null;

  const create = () => {
    if (!text.trim()) {
      notify("Опишите заявку в поле «Что случилось?»");
      return;
    }
    const over = !!(budget && budget.over);
    const task = {
      id: "t" + uid().slice(0, 6),
      title: text.trim().split("\n")[0].slice(0, 70) || parsed.cat,
      description: text.trim(),
      branchId: parsed.branchId,
      executorId: parsed.executorId || "",
      controllerId: parsed.controllerId || "",
      createdBy: me.id,
      phase: 1,
      cat: parsed.cat,
      pr: parsed.pr,
      amount: parsed.amount || null,
      overBudget: over,
      departmentId: deptForCategory(parsed.cat),
      attachments: 0,
      favorite: false,
      createdAt: now,
      slaDeadline: now + parsed.slaH * H,
      comments: [],
    };
    dispatch({ type: "CREATE_TASK", task });
    notify(
      over
        ? "Заявка создана (превышение бюджета — на контроль финансисту)"
        : "Заявка создана",
    );
    setText("");
    setParsed(blank());
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div
        className="rounded-2xl bg-white p-6"
        style={{ border: `1px solid ${C.border}` }}
      >
        <div className="flex items-center gap-2 mb-1">
          <Sparkles size={20} color={C.violet} />
          <h2 className="font-extrabold" style={{ color: C.ink, fontSize: 20 }}>
            {tr("Что случилось?")}
          </h2>
        </div>
        <p style={{ fontSize: 14, color: C.sub, marginBottom: 14 }}>
          {tr(
            "Опишите простыми словами — система сама определит филиал, категорию, срочность и назначит ответственных.",
          )}
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          placeholder="Например: «На филиале Юг сломался терминал оплаты, очередь на кассе, срочно!»"
          className="w-full rounded-xl px-4 py-3 focus:outline-none resize-none"
          style={{
            border: `1px solid ${C.border}`,
            fontSize: 15,
            color: C.ink,
            lineHeight: 1.5,
          }}
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={() => recognize()}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 font-bold text-white"
            style={{
              background: `linear-gradient(90deg, ${C.violet}, ${C.brandA})`,
              fontSize: 14.5,
            }}
          >
            <Bot size={17} /> {tr("Распознать (ИИ)")}
          </button>
        </div>

        {parsed && (
          <div
            className="mt-5 rounded-2xl p-4 space-y-3"
            style={{ background: "#FBFCFE", border: `1px solid ${C.border}` }}
          >
            <div style={{ fontSize: 12.5, color: C.faint, fontWeight: 700 }}>
              Заполните поля заявки (или нажмите «Распознать (ИИ)» выше — поля
              подставятся сами):
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Филиал">
                <Select
                  value={parsed.branchId}
                  onChange={(v) =>
                    setParsed({
                      ...parsed,
                      branchId: +v,
                      executorId: pickExecutor(+v, parsed.cat),
                      controllerId: pickController(+v),
                    })
                  }
                  options={ORG.branches.map((b) => ({
                    value: b.id,
                    label: b.name,
                  }))}
                />
              </Field>
              <Field label="Категория">
                <Select
                  value={parsed.cat}
                  onChange={(v) =>
                    setParsed({
                      ...parsed,
                      cat: v,
                      executorId: pickExecutor(parsed.branchId, v),
                    })
                  }
                  options={[
                    "IT-поддержка",
                    "Ремонт оборудования",
                    "Финансы / Закупка",
                    "Прочее",
                  ].map((x) => ({ value: x, label: x }))}
                />
              </Field>
              <Field label="Приоритет">
                <Select
                  value={parsed.pr}
                  onChange={(v) =>
                    setParsed({ ...parsed, pr: v, slaH: slaFor(v) })
                  }
                  options={["Критический", "Высокий", "Обычный"].map((x) => ({
                    value: x,
                    label: tr(x),
                  }))}
                />
              </Field>
              <Field label="Срок (SLA)">
                <div
                  className="rounded-lg px-3 py-2"
                  style={{
                    background: "#fff",
                    border: `1px solid ${C.border}`,
                    fontSize: 14,
                    color: C.ink,
                  }}
                >
                  {parsed.slaH} ч
                </div>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-1">
              <Field label="Исполнитель">
                <Select
                  value={parsed.executorId || ""}
                  onChange={(v) => setParsed({ ...parsed, executorId: v })}
                  options={[
                    { value: "", label: "— не назначен —" },
                    ...ORG.users
                      .filter((u) => u.active !== false)
                      .map((u) => ({
                        value: u.id,
                        label: u.name + (u.pos ? ` · ${u.pos}` : ""),
                      })),
                  ]}
                />
              </Field>
              <Field label="Контролёр">
                <Select
                  value={parsed.controllerId || ""}
                  onChange={(v) => setParsed({ ...parsed, controllerId: v })}
                  options={[
                    { value: "", label: "— не назначен —" },
                    ...ORG.users
                      .filter((u) => u.active !== false)
                      .map((u) => ({
                        value: u.id,
                        label: u.name + (u.pos ? ` · ${u.pos}` : ""),
                      })),
                  ]}
                />
              </Field>
            </div>
            <Field label="Сумма (если есть расход), сум">
              <input
                value={parsed.amount ?? ""}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "");
                  setParsed({ ...parsed, amount: v ? Number(v) : null });
                }}
                inputMode="numeric"
                placeholder="0"
                className="w-full rounded-lg px-3 py-2"
                style={{
                  border: `1px solid ${C.border}`,
                  fontSize: 14,
                  color: C.ink,
                }}
              />
            </Field>
            <div className="flex items-center gap-2 flex-wrap pt-1">
              <span style={{ fontSize: 12.5, color: C.faint }}>Отдел:</span>
              <Badge color={C.brandA} bg="#EFF4FF">
                {deptById(deptForCategory(parsed.cat))?.name}
              </Badge>
              {deptById(deptForCategory(parsed.cat))?.restricted && (
                <Badge color={C.bad} bg="#FEECEC">
                  закрытый — видят только отдел и руководство
                </Badge>
              )}
            </div>

            {parsed.amount != null && (
              <div
                className="rounded-xl px-3 py-2.5"
                style={{
                  background: "#fff",
                  border: `1px solid ${budget.over ? "#FECACA" : C.border}`,
                }}
              >
                <div
                  className="flex items-center gap-1.5 font-bold mb-1"
                  style={{ fontSize: 13, color: budget.over ? C.bad : C.ink }}
                >
                  <Wallet size={15} /> Бюджет филиала «
                  {branchById(parsed.branchId)?.name}»
                </div>
                <div style={{ fontSize: 12.5, color: C.sub }}>
                  Лимит: {fmtMoney(budget.limit)} · Потрачено:{" "}
                  {fmtMoney(budget.spent)} · Эта заявка:{" "}
                  {fmtMoney(parsed.amount)}
                </div>
                {budget.over && (
                  <div
                    className="mt-1.5"
                    style={{ fontSize: 12.5, color: C.bad, fontWeight: 600 }}
                  >
                    ⚠ Превышение лимита — заявка уйдёт на ручное одобрение
                    финансисту.
                  </div>
                )}
              </div>
            )}

            <button
              onClick={create}
              className="w-full mt-1 rounded-xl py-3 font-bold text-white"
              style={{
                background: C.brandA,
                fontSize: 15,
                boxShadow: `0 6px 16px ${C.brandA}33`,
              }}
            >
              Создать заявку
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* --------------------------- расчёт аналитики ------------------------------ */
function computeAnalytics(tasks, history, now) {
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

/* ----------------------- кабина директора (Этап 5) ------------------------- */
function Analytics({ tasks, history, now, filters, dispatch, role, notify }) {
  const a = useMemo(
    () => computeAnalytics(tasks, history, now),
    [tasks, history, now],
  );
  const { incidents } = useMemo(
    () => detectAnomalies(tasks, history, now),
    [tasks, history, now],
  );
  const canFilter = role === "director" || role === "finance";

  const exportCsv = () => {
    const rows = [
      [
        "ФИО",
        "Должность",
        "Всего",
        "Просрочено",
        "Ср. реакция (мин)",
        "Рейтинг %",
      ],
    ];
    a.eff.forEach((e) => {
      const u = userById(e.id);
      rows.push([
        u?.name,
        u?.pos,
        e.total,
        e.overdue,
        Math.round(e.avgReact / M),
        e.rate,
      ]);
    });
    const csv = "\uFEFF" + rows.map((r) => r.join(";")).join("\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "effektivnost.csv";
    link.click();
    URL.revokeObjectURL(url);
    notify("CSV-файл выгружен");
  };

  return (
    <div className="space-y-5">
      <div
        className="rounded-2xl bg-white p-4 flex flex-wrap items-center gap-3"
        style={{ border: `1px solid ${C.border}` }}
      >
        <span
          className="inline-flex items-center gap-1.5 font-bold"
          style={{ color: C.ink, fontSize: 13.5 }}
        >
          <Filter size={16} /> Фильтр:
        </span>
        {canFilter ? (
          <>
            <Select
              value={filters.company}
              onChange={(v) =>
                dispatch({ type: "SET_FILTER", key: "company", value: v })
              }
              options={[
                { value: "all", label: "Все юр. лица" },
                ...ORG.companies.map((c) => ({ value: c.id, label: c.name })),
              ]}
            />
            <Select
              value={filters.branch}
              onChange={(v) =>
                dispatch({ type: "SET_FILTER", key: "branch", value: v })
              }
              options={[
                { value: "all", label: "Все филиалы" },
                ...ORG.branches.map((b) => ({ value: b.id, label: b.name })),
              ]}
            />
            <Select
              value={filters.period}
              onChange={(v) =>
                dispatch({ type: "SET_FILTER", key: "period", value: v })
              }
              options={[
                { value: "all", label: "Всё время" },
                { value: "30", label: "30 дней" },
                { value: "7", label: "7 дней" },
              ]}
            />
          </>
        ) : (
          <span style={{ fontSize: 13, color: C.sub }}>
            Аналитика по вашей зоне ответственности.
          </span>
        )}
        <div className="ml-auto flex gap-2">
          <button
            onClick={exportCsv}
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 font-semibold"
            style={{
              border: `1px solid ${C.border}`,
              color: C.ink,
              fontSize: 13,
            }}
          >
            <Download size={15} /> CSV
          </button>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 font-semibold"
            style={{
              border: `1px solid ${C.border}`,
              color: C.ink,
              fontSize: 13,
            }}
          >
            <Printer size={15} /> Печать
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div
          className="rounded-2xl bg-white p-4 flex items-center justify-center"
          style={{ border: `1px solid ${C.border}` }}
        >
          <Ring
            value={a.slaRate}
            label="Соблюдение SLA по сети"
            color={lightTone(a.slaRate)}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 lg:col-span-3">
          <Kpi label="Активных задач" value={a.active} tone={C.brandA} />
          <Kpi
            label="Просрочено по SLA"
            value={a.overdueAll}
            tone={a.overdueAll > 0 ? C.bad : C.ok}
          />
          <Kpi label="Завершено" value={a.done} tone={C.ok} />
        </div>
      </div>

      {/* воронка */}
      <div
        className="rounded-2xl bg-white p-5"
        style={{ border: `1px solid ${C.border}` }}
      >
        <h3 className="font-bold mb-1" style={{ color: C.ink, fontSize: 17 }}>
          Воронка процессов: где «застревают» задачи
        </h3>
        <p style={{ fontSize: 13, color: C.sub, marginBottom: 16 }}>
          Среднее время перехода между фазами по неизменяемому журналу.
        </p>
        <div className="space-y-3.5">
          {a.funnel.map((f, i) => {
            const isBottle = i === a.bottleneckIdx && f.avg > 0;
            const w = Math.max(6, (f.avg / a.maxAvg) * 100);
            const color = PHASES[f.to - 1].color;
            return (
              <div key={i}>
                <div
                  className="flex items-center justify-between mb-1"
                  style={{ fontSize: 13.5 }}
                >
                  <span style={{ color: C.ink, fontWeight: 600 }}>
                    Фаза {f.from} ({PHASES[f.from - 1].label}) → {f.to} (
                    {PHASES[f.to - 1].label})
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <b style={{ color: isBottle ? C.bad : C.ink }}>
                      {f.avg ? fmtDur(f.avg) : "—"}
                    </b>
                    {isBottle && (
                      <Badge color={C.bad} bg="#FEECEC">
                        Узкое место
                      </Badge>
                    )}
                  </span>
                </div>
                <div
                  className="rounded-full"
                  style={{ height: 12, background: C.line }}
                >
                  <div
                    className="rounded-full"
                    style={{
                      width: w + "%",
                      height: 12,
                      background: isBottle ? C.bad : color,
                      transition: "width .4s",
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* инциденты (ИИ-ревизор) */}
      {incidents.length > 0 && (
        <div
          className="rounded-2xl bg-white p-5"
          style={{ border: `1px solid ${C.border}` }}
        >
          <div className="flex items-center gap-2 mb-1">
            <Activity size={18} color={C.bad} />
            <h3 className="font-bold" style={{ color: C.ink, fontSize: 17 }}>
              Карта инцидентов (системные сбои)
            </h3>
          </div>
          <p style={{ fontSize: 13, color: C.sub, marginBottom: 12 }}>
            ИИ объединяет повторяющиеся проблемы в один инцидент — повод для
            управленческого решения.
          </p>
          <div className="space-y-2.5">
            {incidents.map((inc, i) => (
              <div
                key={i}
                className="rounded-xl px-4 py-3 flex items-center gap-3"
                style={{ background: "#FEF2F2", border: `1px solid #FECACA` }}
              >
                <AlertTriangle size={18} color={C.bad} />
                <div className="flex-1">
                  <div
                    style={{ fontSize: 14, fontWeight: 700, color: "#991B1B" }}
                  >
                    Филиал «{branchById(inc.branchId)?.name}» · {inc.cat}
                  </div>
                  <div style={{ fontSize: 12.5, color: C.sub }}>
                    {inc.count} заявок за 30 дней
                    {inc.total ? ` · затраты ${fmtMoney(inc.total)}` : ""}.
                    Рекомендация ИИ: устранить причину, а не латать.
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* эффективность */}
        <div
          className="rounded-2xl bg-white p-5"
          style={{ border: `1px solid ${C.border}` }}
        >
          <h3 className="font-bold mb-3" style={{ color: C.ink, fontSize: 17 }}>
            Эффективность исполнителей
          </h3>
          <div>
            <table className="w-full" style={{ fontSize: 13 }}>
              <thead>
                <tr style={{ color: C.faint, textAlign: "left" }}>
                  <th className="pb-2 font-semibold">Сотрудник</th>
                  <th className="pb-2 font-semibold text-center">Всего</th>
                  <th className="pb-2 font-semibold text-center">Просроч.</th>
                  <th className="pb-2 font-semibold text-center">Реакция</th>
                  <th className="pb-2 font-semibold text-right">Рейтинг</th>
                </tr>
              </thead>
              <tbody>
                {a.eff.map((e) => {
                  const u = userById(e.id);
                  return (
                    <tr key={e.id} style={{ borderTop: `1px solid ${C.line}` }}>
                      <td className="py-2.5">
                        <div className="flex items-center gap-2">
                          <Avatar id={e.id} size={26} />
                          <div>
                            <div style={{ color: C.ink, fontWeight: 600 }}>
                              {u?.name}
                            </div>
                            <div style={{ color: C.faint, fontSize: 11.5 }}>
                              {u?.pos}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="text-center" style={{ color: C.ink }}>
                        {e.total}
                      </td>
                      <td
                        className="text-center"
                        style={{
                          color: e.overdue ? C.bad : C.sub,
                          fontWeight: e.overdue ? 700 : 400,
                        }}
                      >
                        {e.overdue}
                      </td>
                      <td className="text-center" style={{ color: C.sub }}>
                        {e.avgReact ? fmtDur(e.avgReact) : "—"}
                      </td>
                      <td className="text-right">
                        <span
                          className="font-bold"
                          style={{ color: lightTone(e.rate) }}
                        >
                          {e.rate}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* финансы */}
        <div
          className="rounded-2xl bg-white p-5"
          style={{ border: `1px solid ${C.border}` }}
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold" style={{ color: C.ink, fontSize: 17 }}>
              Затраты по филиалам
            </h3>
            <div className="text-right">
              <div style={{ fontSize: 11.5, color: C.faint }}>
                К выплате (на согласовании)
              </div>
              <div
                className="font-extrabold"
                style={{ color: C.violet, fontSize: 16 }}
              >
                {fmtMoney(a.toPay)}
              </div>
            </div>
          </div>
          {a.fin.length === 0 ? (
            <div
              className="py-10 text-center"
              style={{ color: C.faint, fontSize: 13 }}
            >
              Нет финансовых данных в выборке.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart
                data={a.fin}
                margin={{ top: 10, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#EDF1F7"
                  vertical={false}
                />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 13, fill: C.sub }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v) => v / 1000 + "к"}
                  tick={{ fontSize: 12, fill: C.faint }}
                  axisLine={false}
                  tickLine={false}
                  width={42}
                />
                <Tooltip
                  formatter={(v) => fmtMoney(v)}
                  cursor={{ fill: "#F1F5F9" }}
                  contentStyle={{
                    borderRadius: 12,
                    border: `1px solid ${C.border}`,
                    fontSize: 13,
                  }}
                />
                <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                  {a.fin.map((d, i) => (
                    <Cell key={i} fill={i === 0 ? C.brandA : "#93C5FD"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}

/* ----------------- личная аналитика «Мои достижения» ----------------------- */
function PersonalAchievements({ me, tasks, history, shift, now, timesheet }) {
  const [pwOpen, setPwOpen] = useState(false);
  const enter = useMemo(() => getEnter(history), [history]);
  const own = tasks.filter((t) => t.executorId === me.id);
  const closed = own.filter((t) => t.phase >= 5).length;
  let overdue = 0;
  const reactions = [];
  const durations = [];
  own.forEach((t) => {
    const m = enter[t.id] || {};
    if (m[2] != null) reactions.push(m[2] - t.createdAt);
    if (t.phase >= 5) {
      if (m[5] && m[5] > t.slaDeadline) overdue++;
      if (m[5]) durations.push(m[5] - t.createdAt);
    } else if (now > t.slaDeadline) overdue++;
  });
  const total = own.length;
  const slaRate = total ? Math.round(((total - overdue) / total) * 100) : 100;
  const avgReact = reactions.length
    ? reactions.reduce((a, b) => a + b, 0) / reactions.length
    : 0;
  const thisWeekMin = durations.length
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length / M)
    : 0;
  const lastWeekMin = thisWeekMin ? Math.round(thisWeekMin * 1.25) : 0;
  const normMin = 60;
  const lingered = own.filter((t) => {
    const m = enter[t.id] || {};
    return m[2] && m[3] && m[3] - m[2] > 2 * H;
  }).length;
  const returns = history.filter(
    (h) => h.action === "return" && own.some((t) => t.id === h.taskId),
  ).length;
  const bonus =
    slaRate >= 95 ? 20 : slaRate >= 90 ? 15 : slaRate >= 80 ? 10 : 0;
  const toSuper = slaRate >= 95 ? null : 95 - slaRate;
  const speedData = [
    { name: "Прош. неделя", value: lastWeekMin },
    { name: "Эта неделя", value: thisWeekMin },
    { name: "Норматив", value: normMin },
  ];

  // ── Уголок сотрудника: личные данные + отработанное время ──
  const myTs = (timesheet || []).filter((t) => t.userId === me.id);
  const workedMs = myTs.reduce((a, t) => a + (t.durationMs || 0), 0);
  const workedH = Math.round(workedMs / 3600000);
  const workedDays = new Set(myTs.map((t) => new Date(t.start).toDateString()))
    .size;
  const roleLbl = (ROLE_OPTS.find(([k]) => k === me.role) || [])[1] || me.role;
  const brName = me.branchId ? branchById(me.branchId)?.name : "";
  const infoCell = (label, value) => (
    <div>
      <div style={{ fontSize: 11.5, color: C.faint, fontWeight: 600 }}>
        {label}
      </div>
      <div style={{ fontSize: 14, color: C.ink, fontWeight: 700 }}>
        {value || "—"}
      </div>
    </div>
  );
  const profileCard = (
    <div
      className="rounded-2xl bg-white p-5"
      style={{ border: `1px solid ${C.border}` }}
    >
      <div className="flex flex-wrap items-center gap-4">
        <Avatar id={me.id} size={52} />
        <div className="flex-1 min-w-0">
          <div
            className="font-extrabold"
            style={{ color: C.ink, fontSize: 20 }}
          >
            {me.name}
          </div>
          <div style={{ color: C.sub, fontSize: 14 }}>{me.pos || roleLbl}</div>
        </div>
        <span
          className="inline-flex items-center gap-2 rounded-xl px-3 py-2 font-bold"
          style={
            shift.open
              ? { background: "#E9F9EF", color: C.ok }
              : { background: "#FEECEC", color: C.bad }
          }
        >
          <Power size={16} /> {shift.open ? "На работе" : "Смена закрыта"}
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
        {infoCell("Должность", me.pos)}
        {infoCell("Роль", roleLbl)}
        {infoCell("Филиал", brName)}
        {infoCell("Отработано", `${workedH} ч · ${workedDays} дн`)}
      </div>
      <div className="flex items-center justify-between flex-wrap gap-2 mt-4">
        <span style={{ fontSize: 12, color: C.faint, maxWidth: 520 }}>
          ФИО, должность и филиал — из iiko (меняются в iiko и
          синхронизируются). Здесь можно сменить пароль для входа.
        </span>
        <button
          onClick={() => setPwOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl px-3.5 py-2 font-bold shrink-0"
          style={{
            border: `1px solid ${C.border}`,
            color: C.ink,
            fontSize: 13,
          }}
        >
          <Lock size={15} /> Сменить пароль
        </button>
      </div>
    </div>
  );

  if (total === 0) {
    return (
      <div className="space-y-5">
        {profileCard}
        <div
          className="rounded-2xl bg-white p-6"
          style={{ border: `1px solid ${C.border}` }}
        >
          <p style={{ color: C.sub, fontSize: 14 }}>
            Достижения и эффективность собираются по вашим задачам. Пока задач
            нет — здесь появятся успеваемость (SLA), скорость работы, закрытые
            задачи и премия за скорость.
          </p>
        </div>
        {pwOpen && <PasswordModal onClose={() => setPwOpen(false)} />}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {profileCard}
      {pwOpen && <PasswordModal onClose={() => setPwOpen(false)} />}

      {/* главные цифры */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div
          className="rounded-2xl bg-white p-4 flex items-center justify-center"
          style={{ border: `1px solid ${C.border}` }}
        >
          <Ring
            value={slaRate}
            label="Успеваемость (SLA)"
            color={lightTone(slaRate)}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 lg:col-span-3">
          <Kpi
            label="Среднее время реакции"
            value={avgReact ? fmtDur(avgReact) : "—"}
            tone={C.ok}
          />
          <Kpi label="Закрыто задач" value={closed} tone={C.brandA} />
        </div>
      </div>

      {/* мотивация / бонус */}
      <div
        className="rounded-2xl bg-white p-5"
        style={{ border: `1px solid ${C.border}` }}
      >
        <div className="flex items-center gap-2 mb-3">
          <Award size={18} color="#FACC15" />
          <h3 className="font-bold" style={{ color: C.ink, fontSize: 17 }}>
            Мой бонус за скорость
          </h3>
        </div>
        <div className="flex flex-wrap items-center gap-x-8 gap-y-2 mb-3">
          <div>
            <div style={{ fontSize: 12.5, color: C.faint }}>Текущая премия</div>
            <div
              className="font-extrabold"
              style={{ color: bonus ? C.ok : C.faint, fontSize: 24 }}
            >
              +{bonus}%{" "}
              <span style={{ fontSize: 14, color: C.sub, fontWeight: 600 }}>
                к окладу
              </span>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12.5, color: C.faint }}>
              До супер-бонуса (+20%)
            </div>
            <div className="font-bold" style={{ color: C.ink, fontSize: 15 }}>
              {toSuper == null
                ? "достигнут — держите планку"
                : `не хватает ${toSuper} п.п. SLA`}
            </div>
          </div>
        </div>
        <div
          className="rounded-full"
          style={{ height: 14, background: C.line }}
        >
          <div
            className="rounded-full"
            style={{
              width: Math.min(100, slaRate) + "%",
              height: 14,
              background: `linear-gradient(90deg, ${C.brandA}, ${C.brandB})`,
              transition: "width .5s",
            }}
          />
        </div>
        <div
          className="mt-2 inline-flex items-center gap-1.5"
          style={{ fontSize: 13, color: C.sub }}
        >
          <Sparkles size={14} color={C.violet} /> Подсказка: держите SLA выше
          95% — и премия будет максимальной.
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* скорость */}
        <div
          className="rounded-2xl bg-white p-5"
          style={{ border: `1px solid ${C.border}` }}
        >
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={18} color={C.brandA} />
            <h3 className="font-bold" style={{ color: C.ink, fontSize: 17 }}>
              Моя скорость работы
            </h3>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={speedData}
              margin={{ top: 10, right: 8, left: 0, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#EDF1F7"
                vertical={false}
              />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 12.5, fill: C.sub }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 12, fill: C.faint }}
                axisLine={false}
                tickLine={false}
                width={28}
              />
              <Tooltip
                formatter={(v) => v + " мин/задача"}
                cursor={{ fill: "#F1F5F9" }}
                contentStyle={{
                  borderRadius: 12,
                  border: `1px solid ${C.border}`,
                  fontSize: 13,
                }}
              />
              <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                <Cell fill="#CBD5E1" />
                <Cell fill={C.ok} />
                <Cell fill="#FCA5A5" />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div style={{ fontSize: 12.5, color: C.sub, marginTop: 4 }}>
            Сравнение с вашим прошлым результатом и нормативом компании.
          </div>
        </div>

        {/* зона роста */}
        <div
          className="rounded-2xl bg-white p-5"
          style={{ border: `1px solid #FED7AA`, background: "#FFFBF5" }}
        >
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle size={18} color={C.warn} />
            <h3 className="font-bold" style={{ color: C.ink, fontSize: 17 }}>
              Зона роста (без сюрпризов в зарплате)
            </h3>
          </div>
          <ul className="space-y-2" style={{ fontSize: 14, color: C.ink }}>
            <li>
              • Зависание на старте: <b>{lingered}</b> задач(и) висели в
              «Просмотрено» дольше 2 часов до начала работы.
            </li>
            <li>
              • Возвраты на доработку: <b>{returns}</b> (контролёр вернул из-за
              качества/отчёта).
            </li>
          </ul>
          <div
            className="mt-3 rounded-xl px-3 py-2.5"
            style={{ background: "#fff", border: `1px solid ${C.border}` }}
          >
            <div
              className="flex items-center gap-1.5 font-bold mb-1"
              style={{ fontSize: 13, color: C.violet }}
            >
              <Bot size={15} /> Совет от ИИ
            </div>
            <div style={{ fontSize: 13.5, color: C.ink, lineHeight: 1.5 }}>
              Вы быстро делаете саму работу. Нажимайте «В работу» и «Выполнено»
              сразу на месте через Telegram-бот — и KPI вырастет, а просрочки
              исчезнут.
            </div>
          </div>
        </div>
      </div>

      {/* достижения */}
      <div
        className="rounded-2xl bg-white p-5"
        style={{ border: `1px solid ${C.border}` }}
      >
        <h3 className="font-bold mb-3" style={{ color: C.ink, fontSize: 17 }}>
          Достижения месяца
        </h3>
        <div className="flex flex-wrap gap-3">
          {[
            ["🥇", "Гроза аварий", "быстрый перевод критичных задач в работу"],
            ["⏱️", "Железный SLA", "недели без просрочек"],
            ["🤝", "Мастер отчётов", "работы принимают с первого раза"],
          ].map(([emo, name, desc]) => (
            <div
              key={name}
              className="rounded-xl px-4 py-3"
              style={{
                background: "#FBFCFE",
                border: `1px solid ${C.border}`,
                minWidth: 180,
              }}
            >
              <div style={{ fontSize: 24 }}>{emo}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>
                {name}
              </div>
              <div style={{ fontSize: 12, color: C.sub }}>{desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ оргструктура ------------------------------- */
function OrgStructure() {
  return (
    <div className="space-y-5">
      {ORG.companies.map((co) => (
        <div
          key={co.id}
          className="rounded-2xl bg-white p-5"
          style={{ border: `1px solid ${C.border}` }}
        >
          <div className="flex items-center gap-2 mb-1">
            <Building2 size={18} color={C.brandA} />
            <h3
              className="font-extrabold"
              style={{ color: C.ink, fontSize: 18 }}
            >
              {co.name}
            </h3>
            <Badge>ИНН {co.inn}</Badge>
          </div>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
            {ORG.branches
              .filter((b) => b.companyId === co.id)
              .map((b) => {
                const staff = ORG.users
                  .filter((u) => u.branchId === b.id && u.active !== false)
                  .sort((a, z) => a.level - z.level);
                return (
                  <div
                    key={b.id}
                    className="rounded-xl p-4"
                    style={{
                      background: "#FBFCFE",
                      border: `1px solid ${C.border}`,
                    }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div
                        className="font-bold"
                        style={{ color: C.ink, fontSize: 15 }}
                      >
                        Филиал «{b.name}»
                      </div>
                      <Badge color={C.violet} bg="#F5F0FE">
                        Бюджет: {fmtMoney(budgetFor(b.id))}/мес
                      </Badge>
                    </div>
                    <div className="space-y-2">
                      {staff.length === 0 && (
                        <div style={{ fontSize: 13, color: C.faint }}>
                          Без сотрудников
                        </div>
                      )}
                      {staff.map((u) => (
                        <div
                          key={u.id}
                          className="flex items-center gap-2.5 min-w-0"
                          style={{ paddingLeft: (u.level - 1) * 12 }}
                        >
                          <Avatar id={u.id} size={28} />
                          <div className="min-w-0">
                            <div
                              style={{
                                fontSize: 13.5,
                                color: C.ink,
                                fontWeight: 600,
                              }}
                            >
                              {u.name}
                            </div>
                            <div style={{ fontSize: 12, color: C.sub }}>
                              {u.pos}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      ))}
      <div
        className="rounded-2xl bg-white p-5"
        style={{ border: `1px solid ${C.border}` }}
      >
        <div className="font-bold mb-2" style={{ color: C.ink, fontSize: 15 }}>
          Руководство (видит все филиалы)
        </div>
        <div className="flex flex-wrap gap-4">
          {ORG.users
            .filter((u) => u.branchId === null && u.active !== false)
            .map((u) => (
              <div key={u.id} className="flex items-center gap-2.5">
                <Avatar id={u.id} size={32} />
                <div>
                  <div style={{ fontSize: 14, color: C.ink, fontWeight: 600 }}>
                    {u.name}
                  </div>
                  <div style={{ fontSize: 12.5, color: C.sub }}>{u.pos}</div>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------- архив ------------------------------------ */
function ArchiveView({ tasks, onOpen }) {
  const done = tasks
    .filter((t) => t.phase >= 5)
    .sort((a, z) => z.createdAt - a.createdAt);
  return (
    <div
      className="rounded-2xl bg-white p-3"
      style={{ border: `1px solid ${C.border}` }}
    >
      {done.length === 0 && (
        <div className="py-10 text-center" style={{ color: C.faint }}>
          В архиве пока нет завершённых задач.
        </div>
      )}
      {done.map((t) => (
        <button
          key={t.id}
          onClick={() => onOpen(t.id)}
          className="w-full text-left flex items-start gap-3 px-3 py-3 rounded-xl"
          style={{ borderBottom: `1px solid ${C.line}` }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#F8FAFC")}
          onMouseLeave={(e) =>
            (e.currentTarget.style.background = "transparent")
          }
        >
          <CheckCircle2
            size={18}
            color={C.ok}
            className="shrink-0"
            style={{ marginTop: 2 }}
          />
          <div className="flex-1 min-w-0">
            <div
              className="font-semibold"
              style={{
                color: C.ink,
                fontSize: 14.5,
                overflowWrap: "break-word",
              }}
            >
              {t.title}
            </div>
            <div
              className="truncate"
              style={{ fontSize: 12.5, color: C.sub, marginTop: 1 }}
            >
              {branchById(t.branchId)?.name} • {t.cat}
              {t.amount ? ` • ${fmtMoney(t.amount)}` : ""}
            </div>
            <div style={{ fontSize: 11.5, color: C.faint, marginTop: 2 }}>
              {new Date(t.createdAt).toLocaleDateString("ru-RU", {
                timeZone: TZ,
              })}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

/* ------------------------------ о системе ---------------------------------- */
function AboutView() {
  const rows = [
    ["5 фаз заявок и неизменяемый журнал", true],
    ["Роли, RBAC, разграничение видимости", true],
    ["Учёт смен (открыть/закрыть)", true],
    ["SLA-таймеры и приоритеты", true],
    ["SOP-чек-листы и фото-гейт", true],
    ["ИИ-маршрутизация по тексту + голосовой ввод", true],
    ["ИИ-ревизор: аномалии и инциденты", true],
    ["Контроль бюджетов филиалов", true],
    ["Дашборд директора и личная аналитика", true],
    ["Telegram-бот (двусторонний обмен)", false],
    ["Распознавание речи (Whisper) и гео-метки фото", false],
    ["Zero Trust: RLS, шифрование AES-256, водяные знаки", false],
    ["DevOps: Sentry, CI/CD, ежечасные бэкапы, репликация", false],
  ];
  return (
    <div className="space-y-5 max-w-3xl">
      <div
        className="rounded-2xl p-6 text-white"
        style={{ background: `linear-gradient(135deg, ${C.brandA}, #5A2113)` }}
      >
        <div className="flex items-center gap-3 mb-2">
          <Logo size={40} radius={11} />
          <h2 className="font-extrabold" style={{ fontSize: 22 }}>
            Avesto Group CRM System
          </h2>
        </div>
        <p style={{ fontSize: 14.5, lineHeight: 1.55, opacity: 0.95 }}>
          Это рабочий интерактивный прототип (MVP) на основе вашего ТЗ. Логика,
          интерфейс и ИИ-сценарии работают прямо здесь; данные сохраняются между
          сессиями. Серверные модули ниже спроектированы в ТЗ и подключаются на
          этапе бэкенда.
        </p>
      </div>
      <div
        className="rounded-2xl bg-white p-5"
        style={{ border: `1px solid ${C.border}` }}
      >
        <h3 className="font-bold mb-3" style={{ color: C.ink, fontSize: 17 }}>
          Карта возможностей
        </h3>
        <div className="space-y-2">
          {rows.map(([label, ok], i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-xl px-3 py-2.5"
              style={{ background: "#FBFCFE", border: `1px solid ${C.border}` }}
            >
              <span
                className="flex items-center gap-2"
                style={{ fontSize: 14, color: C.ink }}
              >
                {ok ? (
                  <CheckCircle2 size={16} color={C.ok} />
                ) : (
                  <Server size={16} color={C.brandA} />
                )}{" "}
                {label}
              </span>
              <StatusBadge ok={ok} />
            </div>
          ))}
        </div>
      </div>
      <div
        className="rounded-2xl bg-white p-5"
        style={{ border: `1px solid ${C.border}` }}
      >
        <div className="flex items-center gap-2 mb-2">
          <Lock size={17} color={C.ink} />
          <h3 className="font-bold" style={{ color: C.ink, fontSize: 16 }}>
            Как развивать дальше
          </h3>
        </div>
        <p style={{ fontSize: 14, color: C.sub, lineHeight: 1.55 }}>
          Спринт 1 — БД (PostgreSQL) + смены. Спринт 2 — движок 5 фаз +
          Telegram-бот. Спринт 3 — ИИ (голос, ревизор аномалий, бюджеты). Спринт
          4 — кабина директора, личная аналитика, безопасность (RLS, шифрование,
          водяные знаки) и DevOps. Архитектура модульная: дизайн, функции и роли
          расширяются без переписывания ядра.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------ настройки ---------------------------------- */
function SettingsView({ dispatch, notify }) {
  return (
    <div className="max-w-xl space-y-4">
      <div
        className="rounded-2xl bg-white p-5"
        style={{ border: `1px solid ${C.border}` }}
      >
        <h3 className="font-bold mb-1" style={{ color: C.ink, fontSize: 17 }}>
          Системные настройки
        </h3>
        <p style={{ fontSize: 13.5, color: C.sub }}>
          Раздел доступен только роли «Системный администратор»: конструктор
          шаблонов заявок, интеграции (Telegram-бот, ИИ), управление доступом и
          аудит.
        </p>
      </div>
      <div
        className="rounded-2xl bg-white p-5"
        style={{ border: `1px solid ${C.border}` }}
      >
        <h3 className="font-bold mb-1" style={{ color: C.ink, fontSize: 16 }}>
          Демо-данные
        </h3>
        <p style={{ fontSize: 13.5, color: C.sub, marginBottom: 12 }}>
          Сбросить все задачи, журнал и смены к исходному демонстрационному
          состоянию.
        </p>
        <button
          onClick={() => {
            dispatch({ type: "RESET" });
            notify("Демо-данные сброшены");
          }}
          className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 font-bold text-white"
          style={{ background: C.bad, fontSize: 14 }}
        >
          <RotateCcw size={16} /> Сбросить демо-данные
        </button>
      </div>
    </div>
  );
}

/* ------------------------- навигация и шапка ------------------------------- */
const NAV = [
  { key: "inbox", label: "Входящие", icon: Inbox, roles: "all" },
  { key: "create", label: "Создать заявку", icon: PlusCircle, roles: "all" },
  { key: "me", label: "Мои достижения", icon: Award, roles: "all" },
  { key: "archive", label: "Архив задач", icon: Archive, roles: "all" },
  {
    key: "analytics",
    label: "Аналитика",
    icon: BarChart3,
    roles: ["director", "finance", "manager", "accountant", "sysadmin"],
  },
  {
    key: "time",
    label: "Учёт времени",
    icon: Clock,
    roles: ["director", "finance", "manager", "accountant", "sysadmin"],
  },
  {
    key: "cash",
    label: "Кассы",
    icon: Wallet,
    roles: ["director", "finance", "manager", "accountant", "sysadmin"],
  },
  {
    key: "money",
    label: "Учёт денег",
    icon: Banknote,
    roles: ["director", "finance", "accountant", "sysadmin"],
  },
  {
    key: "sales",
    label: "Аналитика продаж",
    icon: TrendingUp,
    roles: ["director", "finance", "manager", "accountant", "sysadmin"],
  },
  {
    key: "production",
    label: "Производство",
    icon: ListChecks,
    roles: ["director", "finance", "manager", "accountant", "sysadmin"],
  },
  { key: "checklists", label: "Чек-листы смены", icon: Check, roles: "all" },
  {
    key: "cakes",
    label: "Торты (конструктор)",
    icon: Cake,
    roles: ["director", "finance", "manager", "accountant", "sysadmin"],
  },
  {
    key: "reports",
    label: "Отчёты",
    icon: FileText,
    roles: ["director", "finance", "manager", "accountant", "sysadmin"],
  },
  {
    key: "automation",
    label: "Автоматизация",
    icon: Bot,
    roles: ["director", "sysadmin"],
  },
  { key: "org", label: "Оргструктура", icon: Building2, roles: "all" },
  { key: "about", label: "О системе", icon: Info, roles: "all" },
  { key: "admin", label: "Админ-панель", icon: Settings, roles: ["sysadmin"] },
];
const navAllowed = (item, role) =>
  item.roles === "all" || item.roles.includes(role);
const VIEW_TITLE = {
  inbox: "Входящие задачи",
  create: "Создать заявку",
  me: "Мои достижения",
  archive: "Архив задач",
  analytics: "Аналитика — кабина директора",
  time: "Учёт рабочего времени",
  cash: "Кассы филиалов",
  money: "Учёт и контроль денег",
  sales: "Аналитика продаж",
  production: "Производство · Акт приготовления",
  checklists: "Чек-листы смены",
  cakes: "Конструктор тортов",
  reports: "Отчёты",
  org: "Оргструктура и филиалы",
  about: "О системе",
  admin: "Админ-панель",
  automation: "Автоматизация процессов",
};

/* ---------------------- автоматизация процессов (экран) -------------------- */
const autoActionLabel = (ac) => {
  if (ac.type === "notify") {
    const i = NOTIFY_TARGETS.find((x) => x.key === ac.target);
    return "уведомить " + (i ? i.label : "");
  }
  if (ac.type === "priority") return "приоритет → " + ac.pr;
  if (ac.type === "followup")
    return "напоминание через " + (ac.days || 3) + " дн.";
  return ac.type;
};

function AutomationView({ rules, setRules, log, setLog, now }) {
  const [name, setName] = useState("");
  const [trigIdx, setTrigIdx] = useState(0);
  const [notifyOn, setNotifyOn] = useState(true);
  const [notifyTarget, setNotifyTarget] = useState("controller");
  const [prOn, setPrOn] = useState(false);
  const [prLevel, setPrLevel] = useState("Критический");
  const [followOn, setFollowOn] = useState(false);
  const [followDays, setFollowDays] = useState("7");
  const [followTitle, setFollowTitle] = useState("");
  const [tg, setTg] = useState(null); // null=неизвестно, {configured}
  const [tgMsg, setTgMsg] = useState("");
  const [tgBusy, setTgBusy] = useState(false);
  const [tgInfo, setTgInfo] = useState(null); // помощник подключения
  const [tgInfoBusy, setTgInfoBusy] = useState(false);

  useEffect(() => {
    apiGet("/api/telegram/status")
      .then((r) => setTg(r))
      .catch(() => setTg({ configured: false }));
  }, []);
  const sendTest = async () => {
    setTgBusy(true);
    setTgMsg("");
    try {
      await apiPost("/api/telegram/test", {});
      setTgMsg("Отправлено — проверьте Telegram.");
    } catch (e) {
      setTgMsg(e.message || "Не удалось отправить");
    } finally {
      setTgBusy(false);
    }
  };
  const loadTgInfo = async () => {
    setTgInfoBusy(true);
    setTgMsg("");
    try {
      const info = await apiGet("/api/telegram/info");
      setTgInfo(info);
    } catch (e) {
      setTgInfo({ error: e.message || "Не удалось проверить бота" });
    } finally {
      setTgInfoBusy(false);
    }
  };
  const testTopics = async () => {
    setTgBusy(true);
    setTgMsg("");
    try {
      const r = await apiPost("/api/telegram/test-topics", {});
      const sent = (r.results || []).filter((x) => x.ok).map((x) => x.label);
      const skipped = (r.results || [])
        .filter((x) => x.skipped)
        .map((x) => x.label);
      const failed = (r.results || [])
        .filter((x) => !x.ok && !x.skipped)
        .map((x) => x.label);
      let m = sent.length
        ? `Отправлено в темы: ${sent.join(", ")}.`
        : "Ни одна тема не настроена.";
      if (skipped.length) m += ` Не заданы (нет id): ${skipped.join(", ")}.`;
      if (failed.length) m += ` Ошибка: ${failed.join(", ")}.`;
      setTgMsg(m);
    } catch (e) {
      setTgMsg(e.message || "Не удалось отправить");
    } finally {
      setTgBusy(false);
    }
  };
  // Бот чек-листов: включение вебхука и статус.
  const [hookMsg, setHookMsg] = useState("");
  const [hookBusy, setHookBusy] = useState(false);
  const setupHook = async () => {
    setHookBusy(true);
    setHookMsg("");
    try {
      const r = await apiPost("/api/telegram/webhook/setup", {});
      setHookMsg(`Бот включён. Вебхук: ${r.url || "установлен"}`);
    } catch (e) {
      setHookMsg(e.message || "Не удалось включить бота");
    } finally {
      setHookBusy(false);
    }
  };
  const hookStatus = async () => {
    setHookBusy(true);
    setHookMsg("");
    try {
      const r = await apiGet("/api/telegram/webhook/info");
      setHookMsg(
        r.url
          ? `Вебхук активен: ${r.url}. В очереди: ${r.pending}.` +
              (r.lastError ? ` Последняя ошибка: ${r.lastError}` : "")
          : "Вебхук не установлен — нажмите «Включить бота».",
      );
    } catch (e) {
      setHookMsg(e.message || "Не удалось получить статус");
    } finally {
      setHookBusy(false);
    }
  };
  const copyText = (t) => {
    const s = String(t);
    // «Скопировано» показываем только при реальном успехе. Если Clipboard API
    // недоступен (не-HTTPS, webview) или запись отклонена — показываем id для
    // ручного копирования, а не ложный успех.
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(s).then(
        () => setTgMsg(`Скопировано: ${s}`),
        () => setTgMsg(`Скопируйте вручную: ${s}`),
      );
    } else {
      setTgMsg(`Скопируйте вручную: ${s}`);
    }
  };

  const inpSt = {
    border: `1px solid ${C.border}`,
    fontSize: 13.5,
    background: "#fff",
    color: C.ink,
    borderRadius: 10,
    padding: "8px 11px",
  };
  const addRule = () => {
    const trg = AUTOMATION_TRIGGERS[trigIdx];
    const actions = [];
    if (notifyOn) actions.push({ type: "notify", target: notifyTarget });
    if (prOn) actions.push({ type: "priority", pr: prLevel });
    if (followOn)
      actions.push({
        type: "followup",
        days: Number(followDays) || 3,
        title: followTitle.trim(),
      });
    if (!name.trim() || !actions.length) return;
    const rule = {
      id: "r" + uid().slice(0, 6),
      name: name.trim(),
      active: true,
      trigger: {
        type: trg.type,
        ...(trg.phase != null ? { phase: trg.phase } : {}),
      },
      actions,
    };
    setRules((rs) => [rule, ...rs]);
    setName("");
    setPrOn(false);
    setFollowOn(false);
    setFollowTitle("");
  };
  const toggle = (id) =>
    setRules((rs) =>
      rs.map((r) => (r.id === id ? { ...r, active: !r.active } : r)),
    );
  const remove = (id) => setRules((rs) => rs.filter((r) => r.id !== id));
  const ago = (at) => {
    const min = Math.round((now - at) / 60000);
    if (min < 1) return "только что";
    if (min < 60) return min + " мин назад";
    const h = Math.round(min / 60);
    if (h < 24) return h + " ч назад";
    return Math.round(h / 24) + " дн назад";
  };

  return (
    <div className="space-y-4 max-w-4xl">
      <div
        className="rounded-2xl p-4 sm:p-5"
        style={{
          background: C.brandGrad,
          color: "#fff",
          boxShadow: "0 12px 30px rgba(123,45,31,.28)",
        }}
      >
        <div className="flex items-center gap-2 mb-1">
          <Bot size={20} />
          <h2 className="font-extrabold" style={{ fontSize: 17 }}>
            Автоматизация процессов
          </h2>
        </div>
        <p style={{ fontSize: 13, opacity: 0.92 }}>
          Правила срабатывают сами при событиях по задачам: переход фазы,
          возврат на доработку, просрочка по сроку. Действие — уведомление,
          повышение приоритета или создание задачи-напоминания.
        </p>
      </div>

      {/* Telegram-уведомления */}
      <div
        className="rounded-2xl bg-white p-4 sm:p-5"
        style={{ border: `1px solid ${C.border}` }}
      >
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <Send size={16} color={C.brandA} />
              <h3 className="font-bold" style={{ color: C.ink, fontSize: 15 }}>
                Уведомления в Telegram
              </h3>
              <span
                className="rounded-full px-2 py-0.5"
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  background: tg?.configured ? "#DCFCE7" : C.line,
                  color: tg?.configured ? "#15803D" : C.faint,
                }}
              >
                {tg == null
                  ? "…"
                  : tg.configured
                    ? "подключено"
                    : "не настроено"}
              </span>
            </div>
            <p style={{ fontSize: 12.5, color: C.sub, marginTop: 4 }}>
              Заявки на согласование расходов, их одобрение/отклонение и
              уведомления автоправил дублируются в Telegram. Токен бота и id
              чата задаются в переменных окружения сервера (Render):
              <b> TELEGRAM_BOT_TOKEN</b>, <b>TELEGRAM_CHAT_ID</b>.
            </p>
          </div>
          <div className="flex flex-col gap-2 shrink-0">
            <button
              onClick={sendTest}
              disabled={tgBusy || !tg?.configured}
              className="rounded-lg px-3 py-2 font-bold text-white"
              style={{
                background: tg?.configured ? C.brandA : C.border,
                fontSize: 13,
                opacity: tgBusy ? 0.7 : 1,
              }}
            >
              {tgBusy ? "Отправка…" : "Тест-сообщение"}
            </button>
            <button
              onClick={testTopics}
              disabled={tgBusy || !tg?.configured}
              className="rounded-lg px-3 py-2 font-bold"
              style={{
                background: "#fff",
                border: `1px solid ${tg?.configured ? C.brandA : C.border}`,
                color: tg?.configured ? C.brandA : C.faint,
                fontSize: 13,
                opacity: tgBusy ? 0.7 : 1,
              }}
            >
              Проверить темы
            </button>
          </div>
        </div>
        {tgMsg && (
          <div style={{ fontSize: 12.5, color: C.sub, marginTop: 8 }}>
            {tgMsg}
          </div>
        )}

        {/* Бот чек-листов: включение вебхука (интерактивный бот для персонала) */}
        <div
          className="mt-3 rounded-xl p-3"
          style={{ background: "#FCFAF7", border: `1px solid ${C.line}` }}
        >
          <div
            className="font-bold mb-1"
            style={{ color: C.ink, fontSize: 13.5 }}
          >
            Бот чек-листов для персонала
          </div>
          <p style={{ color: C.sub, fontSize: 12, marginBottom: 8 }}>
            Сотрудник открывает бота, жмёт <b>/start</b> и входит по своему{" "}
            <b>логину и паролю</b> (как в CRM/iiko) — бот сам узнаёт сотрудника
            и привязывает Telegram, вручную ID вводить не нужно. Нужны
            переменные окружения <b>TELEGRAM_WEBHOOK_SECRET</b> и{" "}
            <b>PUBLIC_BASE_URL</b> (адрес бэкенда). Поля Telegram ID/филиал в
            «Учётных записях из iiko» — для ручной привязки при необходимости.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={setupHook}
              disabled={hookBusy}
              className="rounded-lg px-3 py-2 font-bold text-white"
              style={{
                background: C.brandA,
                fontSize: 13,
                opacity: hookBusy ? 0.7 : 1,
              }}
            >
              Включить бота
            </button>
            <button
              onClick={hookStatus}
              disabled={hookBusy}
              className="rounded-lg px-3 py-2 font-bold"
              style={{
                background: "#fff",
                border: `1px solid ${C.border}`,
                color: C.brandA,
                fontSize: 13,
                opacity: hookBusy ? 0.7 : 1,
              }}
            >
              Статус
            </button>
          </div>
          {hookMsg && (
            <div style={{ fontSize: 12.5, color: C.sub, marginTop: 8 }}>
              {hookMsg}
            </div>
          )}
        </div>

        {/* Помощник подключения: найти chat_id общего операционного чата */}
        <div
          className="mt-3 rounded-xl p-3"
          style={{ background: "#FCFAF7", border: `1px solid ${C.line}` }}
        >
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div style={{ fontSize: 12.5, color: C.sub, maxWidth: 560 }}>
              <b style={{ color: C.ink }}>Помощник подключения.</b> 1) У{" "}
              <b>@BotFather</b> создайте бота, вставьте{" "}
              <b>TELEGRAM_BOT_TOKEN</b> в Render. 2) Добавьте бота в{" "}
              <b>общий рабочий чат</b> и <b>сделайте его администратором</b>{" "}
              группы (иначе из-за privacy mode бот не видит обычные сообщения),
              затем напишите в группе любое сообщение. 3) Нажмите «Проверить
              бота», скопируйте id чата и вставьте в <b>TELEGRAM_CHAT_ID</b> в
              Render → Deploy.
            </div>
            <button
              onClick={loadTgInfo}
              disabled={tgInfoBusy}
              className="rounded-lg px-3 py-2 font-bold shrink-0"
              style={{
                border: `1px solid ${C.border}`,
                color: C.sub,
                background: "#fff",
                fontSize: 12.5,
                opacity: tgInfoBusy ? 0.7 : 1,
              }}
            >
              {tgInfoBusy ? "Проверка…" : "Проверить бота"}
            </button>
          </div>

          {tgInfo && tgInfo.error && (
            <div style={{ fontSize: 12.5, color: C.bad, marginTop: 8 }}>
              {tgInfo.error}
            </div>
          )}
          {tgInfo && !tgInfo.error && (
            <div className="mt-2" style={{ fontSize: 12.5 }}>
              {!tgInfo.tokenSet ? (
                <div style={{ color: C.bad }}>
                  TELEGRAM_BOT_TOKEN не задан в окружении сервера (Render).
                </div>
              ) : tgInfo.unreachable ? (
                <div style={{ color: C.bad }}>
                  Не удалось связаться с Telegram: {tgInfo.hint}. Проверьте
                  связь на сервере и попробуйте ещё раз (токен мог остаться
                  рабочим).
                </div>
              ) : !tgInfo.tokenValid ? (
                <div style={{ color: C.bad }}>
                  Токен недействителен: {tgInfo.hint || "проверьте BotFather"}
                </div>
              ) : (
                <>
                  <div style={{ color: C.ink }}>
                    Бот:{" "}
                    <b>
                      {tgInfo.bot?.username
                        ? `@${tgInfo.bot.username}`
                        : tgInfo.bot?.name}
                    </b>{" "}
                    — токен рабочий ✅
                    {tgInfo.currentChatId ? (
                      <span style={{ color: C.sub }}>
                        {" "}
                        · текущий чат: {tgInfo.currentChatId}
                      </span>
                    ) : null}
                  </div>
                  {tgInfo.chats && tgInfo.chats.length ? (
                    <div className="mt-2">
                      <div style={{ color: C.sub, marginBottom: 4 }}>
                        Чаты, где бот побывал (нажмите id, чтобы скопировать):
                      </div>
                      <div className="space-y-1">
                        {tgInfo.chats.map((c) => (
                          <div
                            key={c.id}
                            className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5"
                            style={{
                              background: "#fff",
                              border: `1px solid ${C.line}`,
                            }}
                          >
                            <span style={{ color: C.ink }}>
                              {c.title || "—"}{" "}
                              <span style={{ color: C.faint, fontSize: 11 }}>
                                ({c.type})
                              </span>
                              {String(c.id) ===
                                String(tgInfo.currentChatId) && (
                                <span
                                  className="rounded px-1.5 py-0.5"
                                  style={{
                                    marginLeft: 6,
                                    fontSize: 10,
                                    fontWeight: 700,
                                    background: "#DCFCE7",
                                    color: "#15803D",
                                  }}
                                >
                                  текущий
                                </span>
                              )}
                            </span>
                            <button
                              onClick={() => copyText(c.id)}
                              className="rounded-md px-2 py-1 font-mono shrink-0"
                              style={{
                                border: `1px solid ${C.border}`,
                                color: C.brandA,
                                fontSize: 12,
                                fontWeight: 700,
                              }}
                            >
                              {c.id}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div style={{ color: C.sub, marginTop: 6 }}>
                      {tgInfo.hint ||
                        "Чатов пока не видно. Напишите боту/в группу и нажмите «Проверить бота»."}
                    </div>
                  )}
                  {/* Темы супергруппы: раскладываем уведомления по темам */}
                  <div className="mt-3">
                    <div style={{ color: C.sub, marginBottom: 4 }}>
                      Темы группы — чтобы разные уведомления шли в свои темы:
                    </div>
                    {tgInfo.topics && tgInfo.topics.length ? (
                      <div className="space-y-1">
                        {tgInfo.topics.map((t) => (
                          <div
                            key={t.id}
                            className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5"
                            style={{
                              background: "#fff",
                              border: `1px solid ${C.line}`,
                            }}
                          >
                            <span style={{ color: C.ink }}>
                              {t.name || "Тема"}
                            </span>
                            <button
                              onClick={() => copyText(t.id)}
                              className="rounded-md px-2 py-1 font-mono shrink-0"
                              style={{
                                border: `1px solid ${C.border}`,
                                color: C.brandA,
                                fontSize: 12,
                                fontWeight: 700,
                              }}
                            >
                              {t.id}
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ color: C.faint, fontSize: 12 }}>
                        Темы пока не видны. Включите темы в группе (Управление
                        группой → Темы), напишите по одному сообщению в нужную
                        тему и нажмите «Проверить бота».
                      </div>
                    )}
                    <div style={{ color: C.sub, fontSize: 12, marginTop: 6 }}>
                      Скопируйте id темы и впишите в переменные окружения на
                      Render: <b>TELEGRAM_TOPIC_EXPENSES</b>{" "}
                      (расходы/согласования), <b>TELEGRAM_TOPIC_TASKS</b>{" "}
                      (задачи/заявки), <b>TELEGRAM_TOPIC_CASH</b>{" "}
                      (касса/инкассация), <b>TELEGRAM_TOPIC_STAFF</b>{" "}
                      (персонал), <b>TELEGRAM_TOPIC_REPORTS</b> (отчёты/сводки).
                      Пусто — уведомление идёт в общую ленту группы.
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Правила */}
      <div
        className="rounded-2xl bg-white p-4 sm:p-5"
        style={{ border: `1px solid ${C.border}` }}
      >
        <h3 className="font-bold mb-3" style={{ color: C.ink, fontSize: 15 }}>
          Правила ({rules.filter((r) => r.active).length} активны)
        </h3>
        <div className="space-y-2">
          {rules.length === 0 && (
            <p style={{ fontSize: 13, color: C.faint }}>
              Пока нет правил — добавьте ниже.
            </p>
          )}
          {rules.map((r) => (
            <div
              key={r.id}
              className="rounded-xl p-3 flex items-start justify-between gap-3"
              style={{
                border: `1px solid ${C.line}`,
                background: r.active ? "#fff" : "#FAFAF9",
                opacity: r.active ? 1 : 0.7,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>
                  {r.name}
                </div>
                <div style={{ fontSize: 12.5, color: C.sub, marginTop: 2 }}>
                  Когда: <b>{triggerLabel(r.trigger)}</b>
                </div>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {r.actions.map((ac, i) => (
                    <span
                      key={i}
                      className="rounded-md px-2 py-0.5"
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        background: C.brandSoft || "#FBEEE9",
                        color: C.brandA,
                      }}
                    >
                      {autoActionLabel(ac)}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => toggle(r.id)}
                  className="rounded-full"
                  title={r.active ? "Выключить" : "Включить"}
                  style={{
                    width: 40,
                    height: 22,
                    background: r.active ? C.ok : C.border,
                    position: "relative",
                    transition: "background .15s",
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      top: 2,
                      left: r.active ? 20 : 2,
                      width: 18,
                      height: 18,
                      borderRadius: 99,
                      background: "#fff",
                      transition: "left .15s",
                      boxShadow: "0 1px 3px rgba(0,0,0,.25)",
                    }}
                  />
                </button>
                <button
                  onClick={() => remove(r.id)}
                  className="p-1.5 rounded-lg"
                  style={{ color: C.bad }}
                  title="Удалить"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Добавить правило */}
        <div
          className="rounded-xl p-3 mt-4"
          style={{ background: "#FBFCFE", border: `1px dashed ${C.border}` }}
        >
          <div
            className="font-bold mb-2"
            style={{ color: C.ink, fontSize: 13.5 }}
          >
            Новое правило
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Название правила"
              style={inpSt}
            />
            <select
              value={trigIdx}
              onChange={(e) => setTrigIdx(Number(e.target.value))}
              style={inpSt}
            >
              {AUTOMATION_TRIGGERS.map((t, i) => (
                <option key={i} value={i}>
                  Когда: {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label
              className="flex items-center gap-2 flex-wrap"
              style={{ fontSize: 13, color: C.sub }}
            >
              <input
                type="checkbox"
                checked={notifyOn}
                onChange={(e) => setNotifyOn(e.target.checked)}
                style={{ width: 15, height: 15, accentColor: C.brandA }}
              />
              Уведомить
              <select
                value={notifyTarget}
                onChange={(e) => setNotifyTarget(e.target.value)}
                disabled={!notifyOn}
                style={{ ...inpSt, padding: "5px 9px" }}
              >
                {NOTIFY_TARGETS.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label
              className="flex items-center gap-2 flex-wrap"
              style={{ fontSize: 13, color: C.sub }}
            >
              <input
                type="checkbox"
                checked={prOn}
                onChange={(e) => setPrOn(e.target.checked)}
                style={{ width: 15, height: 15, accentColor: C.brandA }}
              />
              Поднять приоритет до
              <select
                value={prLevel}
                onChange={(e) => setPrLevel(e.target.value)}
                disabled={!prOn}
                style={{ ...inpSt, padding: "5px 9px" }}
              >
                <option value="Высокий">Высокий</option>
                <option value="Критический">Критический</option>
              </select>
            </label>
            <label
              className="flex items-center gap-2 flex-wrap"
              style={{ fontSize: 13, color: C.sub }}
            >
              <input
                type="checkbox"
                checked={followOn}
                onChange={(e) => setFollowOn(e.target.checked)}
                style={{ width: 15, height: 15, accentColor: C.brandA }}
              />
              Создать напоминание через
              <input
                value={followDays}
                onChange={(e) => setFollowDays(e.target.value)}
                disabled={!followOn}
                style={{ ...inpSt, padding: "5px 9px", width: 56 }}
              />
              дн.
              <input
                value={followTitle}
                onChange={(e) => setFollowTitle(e.target.value)}
                disabled={!followOn}
                placeholder="заголовок (необязательно)"
                style={{ ...inpSt, padding: "5px 9px", flex: 1, minWidth: 120 }}
              />
            </label>
          </div>
          <button
            onClick={addRule}
            className="mt-3 rounded-lg px-4 py-2 font-bold text-white"
            style={{ background: C.brandA, fontSize: 13 }}
          >
            + Добавить правило
          </button>
        </div>
      </div>

      {/* Журнал срабатываний */}
      <div
        className="rounded-2xl bg-white p-4 sm:p-5"
        style={{ border: `1px solid ${C.border}` }}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold" style={{ color: C.ink, fontSize: 15 }}>
            Журнал срабатываний
          </h3>
          {log.length > 0 && (
            <button
              onClick={() => setLog([])}
              style={{ fontSize: 12.5, color: C.faint }}
            >
              очистить
            </button>
          )}
        </div>
        {log.length === 0 ? (
          <p style={{ fontSize: 13, color: C.faint }}>
            Пока пусто. Как только сработает правило — здесь появится запись.
          </p>
        ) : (
          <div className="space-y-2">
            {log.map((e) => (
              <div
                key={e.id}
                className="rounded-xl p-2.5"
                style={{ background: "#F8FAFC", border: `1px solid ${C.line}` }}
              >
                <div
                  className="flex items-center justify-between gap-2"
                  style={{ fontSize: 12.5 }}
                >
                  <span style={{ fontWeight: 700, color: C.ink }}>
                    {e.rule}
                  </span>
                  <span style={{ color: C.faint }}>{ago(e.at)}</span>
                </div>
                <div style={{ fontSize: 12, color: C.sub, marginTop: 1 }}>
                  {e.trigger} · «{e.task}»
                </div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {e.actions.map((a, i) => (
                    <span
                      key={i}
                      className="rounded-md px-1.5 py-0.5"
                      style={{
                        fontSize: 10.5,
                        background: "#EEF2F7",
                        color: C.sub,
                      }}
                    >
                      {a}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Sidebar({ view, setView, role }) {
  const items = NAV.filter((n) => navAllowed(n, role));
  return (
    <aside
      className="hidden md:flex flex-col glass-chrome"
      style={{
        position: "fixed",
        left: 0,
        top: 0,
        width: 250,
        height: "100vh",
        overflowY: "auto",
        borderRight: `1px solid ${C.glassBorder}`,
        boxShadow: "1px 0 24px rgba(74,38,22,.05)",
        zIndex: 40,
      }}
    >
      <div
        className="shrink-0 flex items-center gap-3"
        style={{
          height: 65,
          paddingLeft: 16,
          paddingRight: 16,
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <Logo size={36} radius={10} />
        <div className="min-w-0 flex flex-col justify-center">
          <div
            className="font-extrabold truncate"
            style={{ color: C.ink, fontSize: 15.5, lineHeight: 1.25 }}
          >
            Avesto Group
          </div>
          <div
            className="truncate"
            style={{ fontSize: 11, color: C.faint, lineHeight: 1.25 }}
          >
            CRM System
          </div>
        </div>
      </div>
      <nav className="flex flex-col gap-1" style={{ padding: 12 }}>
        {items.map((n) => {
          const active = view === n.key;
          return (
            <button
              key={n.key}
              onClick={() => setView(n.key)}
              className={`nav-item flex items-center gap-3 rounded-xl px-3 py-3 text-left${active ? " nav-item-active" : ""}`}
              style={{
                background: active ? C.brandGrad : "transparent",
                color: active ? "#fff" : C.ink,
                fontWeight: active ? 700 : 600,
                fontSize: 14.5,
                boxShadow: active ? "0 6px 18px rgba(123,45,31,.30)" : "none",
              }}
            >
              <n.icon size={20} color={active ? "#fff" : C.sub} /> {tr(n.label)}
            </button>
          );
        })}
      </nav>
      <div
        className="mt-auto"
        style={{
          padding: "16px 16px 16px 24px",
          fontSize: 11.5,
          color: C.faint,
          lineHeight: 1.5,
        }}
      >
        Стандарт доступности: крупный шрифт, текстовые подписи, цветовое
        кодирование фаз.
      </div>
    </aside>
  );
}
// Короткие подписи для нижней панели (узкие экраны)
const NAV_SHORT = {
  inbox: "Входящие",
  create: "Создать",
  me: "Кабинет",
  archive: "Архив",
  analytics: "Аналитика",
  time: "Время",
  cash: "Кассы",
  money: "Деньги",
  sales: "Продажи",
  production: "Произв.",
  org: "Структура",
  about: "О системе",
  admin: "Админка",
  automation: "Авто",
};

function BottomNav({ view, setView, role, onMore }) {
  const items = NAV.filter((n) => navAllowed(n, role));
  const primary = items.slice(0, 4);
  const overflow = items.slice(4);
  const overflowActive = overflow.some((n) => n.key === view);
  const Cell = ({ active, onClick, Icon, label }) => (
    <button
      onClick={onClick}
      className="flex-1 flex flex-col items-center justify-center gap-0.5 py-1.5 px-0.5"
      style={{ minWidth: 0, color: active ? C.brandA : C.sub }}
    >
      <Icon size={20} color={active ? C.brandA : C.sub} />
      <span
        style={{
          fontSize: 9.5,
          letterSpacing: "-.01em",
          fontWeight: active ? 800 : 600,
          maxWidth: "100%",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
    </button>
  );
  return (
    <nav
      className="md:hidden fixed left-0 right-0 bottom-0 flex items-stretch glass-chrome"
      style={{
        borderTop: `1px solid ${C.glassBorder}`,
        boxShadow: "0 -6px 22px rgba(74,38,22,.09)",
        paddingBottom: "max(6px, env(safe-area-inset-bottom))",
        zIndex: 30,
      }}
    >
      {primary.map((n) => (
        <Cell
          key={n.key}
          active={view === n.key}
          onClick={() => setView(n.key)}
          Icon={n.icon}
          label={tr(NAV_SHORT[n.key] || n.label)}
        />
      ))}
      {overflow.length > 0 && (
        <Cell
          active={overflowActive}
          onClick={onMore}
          Icon={Menu}
          label={tr("Ещё")}
        />
      )}
    </nav>
  );
}

function MoreSheet({ open, onClose, items, view, setView }) {
  if (!open) return null;
  return (
    <div className="md:hidden fixed inset-0" style={{ zIndex: 60 }}>
      <div
        className="absolute inset-0"
        style={{
          background: "rgba(30,16,10,.42)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
        }}
        onClick={onClose}
      />
      <div
        className="absolute left-0 right-0 bottom-0 glass-chrome p-4 fade-up"
        style={{
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          borderTop: `1px solid ${C.glassBorder}`,
          paddingBottom: "max(16px, env(safe-area-inset-bottom))",
          boxShadow: "0 -12px 40px rgba(30,16,10,.24)",
        }}
      >
        <div
          className="mx-auto mb-3"
          style={{
            width: 40,
            height: 4,
            borderRadius: 99,
            background: "#E2E8F0",
          }}
        />
        <div className="flex items-center justify-between mb-3">
          <div
            className="font-extrabold"
            style={{ color: C.ink, fontSize: 16 }}
          >
            {tr("Все разделы")}
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl"
            style={{ background: C.line }}
          >
            <X size={18} color={C.sub} />
          </button>
        </div>
        <div className="grid grid-cols-1 gap-2">
          {items.map((n) => {
            const active = view === n.key;
            return (
              <button
                key={n.key}
                onClick={() => {
                  setView(n.key);
                  onClose();
                }}
                className="flex items-center gap-2.5 rounded-xl px-3 py-3 text-left min-w-0"
                style={{
                  background: active ? C.brandA : "#F8FAFC",
                  color: active ? "#fff" : C.ink,
                  fontWeight: 600,
                  fontSize: 13.5,
                  border: `1px solid ${active ? C.brandA : C.border}`,
                }}
              >
                <n.icon
                  size={19}
                  color={active ? "#fff" : C.sub}
                  className="shrink-0"
                />
                <span className="min-w-0" style={{ lineHeight: 1.15 }}>
                  {tr(n.label)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
// Модалка самостоятельной смены пароля (из профиля). Меняет пароль входа в CRM.
function PasswordModal({ onClose }) {
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [conf, setConf] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const submit = async () => {
    if (!cur || !next) return setErr("Заполните текущий и новый пароль");
    if (next.length < 6) return setErr("Новый пароль — минимум 6 символов");
    if (next !== conf)
      return setErr("Новый пароль и подтверждение не совпадают");
    setBusy(true);
    setErr("");
    try {
      await changePassword(cur, next);
      setDone(true);
    } catch (e) {
      setErr(e.message || "Не удалось сменить пароль");
    } finally {
      setBusy(false);
    }
  };
  const inp = {
    border: `1px solid ${C.border}`,
    borderRadius: 12,
    padding: "10px 12px",
    width: "100%",
    fontSize: 14,
  };
  // Портал в body: иначе position:fixed привязывается к шапке с backdrop-filter
  // (та создаёт containing block) и модалка съезжает в угол вместо центра.
  return createPortal(
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,.4)" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="rounded-2xl bg-white p-5 w-full max-w-sm"
        style={{ border: `1px solid ${C.border}` }}
      >
        <h3 className="font-bold mb-1" style={{ color: C.ink, fontSize: 16 }}>
          Смена пароля
        </h3>
        {done ? (
          <>
            <div
              className="rounded-xl px-3 py-2 my-2"
              style={{ background: "#DCFCE7", color: "#15803D", fontSize: 13 }}
            >
              Пароль изменён.
            </div>
            <button
              onClick={onClose}
              className="w-full rounded-xl px-4 py-2.5 font-bold text-white"
              style={{ background: C.brandA }}
            >
              Готово
            </button>
          </>
        ) : (
          <>
            <p style={{ fontSize: 12.5, color: C.sub, marginBottom: 12 }}>
              Меняется пароль для входа в CRM. У сотрудников iiko основной
              пароль — из iiko; здесь меняется локальный (запасной) пароль CRM.
            </p>
            <div className="space-y-2">
              <input
                type="password"
                placeholder="Текущий пароль"
                value={cur}
                onChange={(e) => setCur(e.target.value)}
                style={inp}
                autoComplete="current-password"
              />
              <input
                type="password"
                placeholder="Новый пароль (мин. 6 символов)"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                style={inp}
                autoComplete="new-password"
              />
              <input
                type="password"
                placeholder="Повторите новый пароль"
                value={conf}
                onChange={(e) => setConf(e.target.value)}
                style={inp}
                autoComplete="new-password"
              />
            </div>
            {err && (
              <div style={{ color: C.bad, fontSize: 12.5, marginTop: 8 }}>
                {err}
              </div>
            )}
            <div className="flex gap-2 mt-3">
              <button
                onClick={onClose}
                className="flex-1 rounded-xl px-4 py-2.5 font-bold"
                style={{
                  border: `1px solid ${C.border}`,
                  color: C.sub,
                  background: "#fff",
                }}
              >
                Отмена
              </button>
              <button
                onClick={submit}
                disabled={busy}
                className="flex-1 rounded-xl px-4 py-2.5 font-bold text-white"
                style={{ background: C.brandA, opacity: busy ? 0.7 : 1 }}
              >
                {busy ? "…" : "Сменить"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

function TopBar({ me, shift, dispatch, onToggleShift, authUser, onLogout }) {
  const [open, setOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  return (
    <header
      className="topbar-h glass-chrome px-4 md:px-6 py-2 flex flex-wrap items-center gap-3 sticky top-0"
      style={{
        minHeight: 65,
        borderBottom: `1px solid ${C.glassBorder}`,
        boxShadow: "0 4px 20px rgba(74,38,22,.05)",
        zIndex: 20,
      }}
    >
      <button
        onClick={onToggleShift}
        className="inline-flex items-center gap-2 rounded-xl px-3.5 py-2.5 font-bold transition"
        style={{
          ...(shift.open
            ? {
                background: "#E9F9EF",
                color: C.ok,
                border: `1.5px solid ${C.ok}`,
              }
            : {
                background: "#FEECEC",
                color: C.bad,
                border: `1.5px solid ${C.bad}`,
              }),
        }}
      >
        <Power size={17} className="shrink-0" />
        <span>
          {shift.open ? tr("Смена открыта") : tr("Открыть смену")}
          {shift.open && shift.openedAt
            ? ` · ${fmtDur(Date.now() - shift.openedAt)}`
            : ""}
        </span>
      </button>
      {shift.open && (
        <button
          onClick={onToggleShift}
          className="hidden sm:inline-flex rounded-xl px-3 py-2 font-semibold"
          style={{ background: C.line, color: C.sub, fontSize: 13 }}
        >
          {tr("Закрыть смену")}
        </button>
      )}
      <div className="ml-auto flex items-center gap-2 sm:gap-3 relative">
        <div
          className="flex rounded-xl overflow-hidden shrink-0"
          style={{ border: `1px solid ${C.border}` }}
        >
          {["ru", "uz"].map((lg) => (
            <button
              key={lg}
              onClick={() =>
                dispatch({ type: "SET_SETTING", key: "lang", value: lg })
              }
              className="px-2.5 py-1.5 font-bold"
              style={{
                background: LANG === lg ? C.brandA : "#fff",
                color: LANG === lg ? "#fff" : C.sub,
                fontSize: 12.5,
              }}
            >
              {lg === "ru" ? "RU" : "UZ"}
            </button>
          ))}
        </div>
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2.5 rounded-xl px-2 py-1.5"
          style={{ border: `1px solid ${C.border}` }}
        >
          <Avatar id={me.id} size={34} />
          <div className="text-left hidden sm:block">
            <div
              style={{
                fontSize: 13.5,
                fontWeight: 700,
                color: C.ink,
                lineHeight: 1.1,
              }}
            >
              {me.name}
            </div>
            <div style={{ fontSize: 12, color: C.sub }}>{me.pos}</div>
          </div>
          <Users size={16} color={C.faint} />
        </button>
        {open && (
          <div
            className="absolute right-0 top-12 z-30 rounded-2xl bg-white p-2 shadow-xl"
            style={{
              border: `1px solid ${C.border}`,
              width: "min(280px, calc(100vw - 24px))",
            }}
          >
            {authUser && (
              <div
                className="px-2.5 py-2 mb-1 rounded-xl"
                style={{ background: "#F1F5FD" }}
              >
                <div
                  style={{ fontSize: 11.5, color: C.faint, fontWeight: 700 }}
                >
                  {tr("Вход выполнен")}
                </div>
                <div
                  className="truncate"
                  style={{ fontSize: 13.5, color: C.ink, fontWeight: 700 }}
                >
                  {(() => {
                    // Имя: реальное ФИО (displayName), а не внутренний ключ
                    // «iiko-…». Должность: читаемая (position) или роль по словарю.
                    const nm =
                      authUser.displayName ||
                      (String(authUser.name || "").startsWith("iiko-")
                        ? ""
                        : authUser.name) ||
                      "Пользователь";
                    const pos =
                      authUser.position ||
                      (ROLE_OPTS.find(([k]) => k === authUser.role) || [])[1] ||
                      authUser.role ||
                      "";
                    return pos ? `${nm} · ${pos}` : nm;
                  })()}
                </div>
              </div>
            )}
            <button
              onClick={() => {
                setOpen(false);
                setPwOpen(true);
              }}
              className="w-full flex items-center gap-2 rounded-xl px-2.5 py-2.5 font-semibold"
              style={{ color: C.ink, fontSize: 13.5 }}
            >
              <Lock size={16} /> Сменить пароль
            </button>
            {onLogout && (
              <button
                onClick={() => {
                  setOpen(false);
                  onLogout();
                }}
                className="w-full flex items-center gap-2 rounded-xl px-2.5 py-2.5 mt-1 font-bold"
                style={{ color: C.bad, borderTop: `1px solid ${C.line}` }}
              >
                <Power size={16} /> {tr("Выйти")}
              </button>
            )}
          </div>
        )}
      </div>
      {pwOpen && <PasswordModal onClose={() => setPwOpen(false)} />}
    </header>
  );
}

/* ------------------------------ приложение --------------------------------- */
export default function App({ authUser, onLogout }) {
  const [s, dispatch] = useReducer(reducer, undefined, init);
  const [now, setNow] = useState(Date.now());
  const [toast, setToast] = useState(null);
  const [hint, setHint] = useState(true);
  const [moreOpen, setMoreOpen] = useState(false);
  const notify = (m) => setToast(m);

  // ── Автоматизация процессов (Digital Pipeline) ──────────────────────────
  const [autoRules, setAutoRules] = usePersisted(
    "avesto.automation.rules",
    DEFAULT_RULES,
  );
  const [autoLog, setAutoLog] = usePersisted("avesto.automation.log", []);
  const seenHistRef = React.useRef(null);
  const escalatedRef = React.useRef(new Set());
  const escInitRef = React.useRef(false);

  // Выполнить действия правила по задаче и записать в журнал.
  const runAutomation = (rule, task) => {
    const at = Date.now();
    const users = s.users || [];
    const nameOf = (id) => (users.find((u) => u.id === id) || {}).name || "—";
    const chief =
      users.find((u) => u.role === "director") ||
      users.find((u) => u.role === "manager");
    const done = [];
    rule.actions.forEach((ac) => {
      if (ac.type === "notify") {
        const info = NOTIFY_TARGETS.find((x) => x.key === ac.target);
        const who =
          ac.target === "executor"
            ? nameOf(task.executorId)
            : ac.target === "controller"
              ? nameOf(task.controllerId)
              : chief
                ? chief.name
                : "руководству";
        const msg = `Автоправило «${rule.name}»: ${info ? info.label : ""} — «${task.title}»`;
        notify(msg);
        // Дублируем в Telegram, если интеграция настроена (best-effort).
        apiPost("/api/telegram/notify", { text: msg.slice(0, 1000) }).catch(
          () => {},
        );
        done.push(`Уведомление ${info ? info.label : ""} (${who})`);
      } else if (ac.type === "priority") {
        if (task.pr !== ac.pr)
          dispatch({ type: "SET_PRIORITY", id: task.id, pr: ac.pr });
        done.push(`Приоритет → ${ac.pr}`);
      } else if (ac.type === "followup") {
        const ft = makeFollowupTask(rule, task, ac, at);
        dispatch({ type: "ADD_TASK_SILENT", task: ft });
        done.push(`Задача-напоминание «${ft.title}»`);
      }
    });
    if (done.length)
      setAutoLog((log) =>
        [
          {
            id: uid(),
            at,
            rule: rule.name,
            trigger: triggerLabel(rule.trigger),
            task: task.title,
            actions: done,
          },
          ...log,
        ].slice(0, 50),
      );
  };

  // Триггеры по событиям задач (переход фазы / возврат) — из журнала истории.
  useEffect(() => {
    if (!s.hydrated) return;
    if (!seenHistRef.current) {
      seenHistRef.current = new Set(s.history.map((h) => h.id));
      return;
    }
    const fresh = s.history.filter((h) => !seenHistRef.current.has(h.id));
    if (!fresh.length) return;
    fresh.forEach((h) => seenHistRef.current.add(h.id));
    const evts = fresh
      .map((h) => {
        if (h.action === "return") return { type: "return", task: h.taskId };
        if (["start", "review", "done", "step"].includes(h.action) && h.to)
          return { type: "phase", phase: h.to, task: h.taskId };
        return null;
      })
      .filter(Boolean);
    if (!evts.length) return;
    const active = autoRules.filter((r) => r.active);
    evts.forEach((evt) => {
      const task = s.tasks.find((t) => t.id === evt.task);
      if (!task) return;
      active.forEach((r) => {
        if (triggerMatches(r.trigger, evt)) runAutomation(r, task);
      });
    });
  }, [s.history, s.hydrated]); // eslint-disable-line

  // Триггер просрочки (SLA) — скан по таймеру. Уже просроченные на момент
  // загрузки помечаем обработанными, чтобы не сыпать эскалации при входе.
  useEffect(() => {
    if (!s.hydrated) return;
    if (!escInitRef.current) {
      s.tasks.forEach((t) => {
        if (t.phase < 5 && !t.routeId && now > t.slaDeadline)
          escalatedRef.current.add(t.id);
      });
      escInitRef.current = true;
      return;
    }
    const overdueRules = autoRules.filter(
      (r) => r.active && r.trigger.type === "overdue",
    );
    if (!overdueRules.length) return;
    s.tasks.forEach((t) => {
      if (t.phase >= 5 || t.routeId || now <= t.slaDeadline) return;
      if (escalatedRef.current.has(t.id)) return;
      escalatedRef.current.add(t.id);
      overdueRules.forEach((r) => runAutomation(r, t));
    });
  }, [now, s.hydrated]); // eslint-disable-line

  useEffect(() => {
    let live = true;
    store.load().then((data) => {
      if (!live) return;
      if (data && data.tasks) dispatch({ type: "HYDRATE", data });
      else dispatch({ type: "MARK_HYDRATED" });
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!s.hydrated) return;
    store.save({
      tasks: s.tasks,
      history: s.history,
      shifts: s.shifts,
      timesheet: s.timesheet,
      cashReports: s.cashReports,
      cashHandovers: s.cashHandovers,
      shiftChecklists: s.shiftChecklists,
      cakeConfig: s.cakeConfig,
      currentUserId: s.currentUserId,
      companies: s.companies,
      branches: s.branches,
      positions: s.positions,
      users: s.users,
      budgets: s.budgets,
      sla: s.sla,
      sops: s.sops,
      settings: s.settings,
      departments: s.departments,
      catDept: s.catDept,
      routes: s.routes,
      // Запоминаем и выбор пользователя: текущую страницу и фильтры,
      // чтобы после обновления ничего не сбрасывалось.
      view: s.view,
      filters: s.filters,
    });
  }, [
    s.hydrated,
    s.tasks,
    s.history,
    s.shifts,
    s.timesheet,
    s.cashReports,
    s.cashHandovers,
    s.shiftChecklists,
    s.cakeConfig,
    s.currentUserId,
    s.companies,
    s.branches,
    s.positions,
    s.users,
    s.budgets,
    s.sla,
    s.sops,
    s.settings,
    s.departments,
    s.catDept,
    s.routes,
    s.view,
    s.filters,
  ]);

  // Реальный вход: действующий пользователь берётся из авторизации (сервер),
  // а не из демо-списка. Роль/имя/должность приходят с /api/auth/me.
  useEffect(() => {
    if (!authUser || !s.hydrated) return;
    const id = authUser.id || "me";
    if (s.currentUserId !== id) dispatch({ type: "SET_USER", id });
  }, [authUser, s.hydrated]); // eslint-disable-line

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 20000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  syncOrg(s);
  syncLang(s);
  // Действующий пользователь — из реальной авторизации (сервер). Демо-список
  // сотрудников убран; филиальная привязка появится при синхронизации кадров.
  const me = authUser
    ? {
        id: authUser.id || "me",
        name: authUser.displayName || authUser.name || "Пользователь",
        role: authUser.role || "staff",
        pos: authUser.position || "",
        branchId: null,
        departmentId: null,
        level: 1,
      }
    : userById(s.currentUserId) || {
        id: "me",
        name: "—",
        role: "staff",
        pos: "",
        branchId: null,
        departmentId: null,
        level: 1,
      };
  const myShift = s.shifts[s.currentUserId] || { open: false };
  // Единый охват по филиалу: старший (руководство/финансы/сисадмин) выбирает любой;
  // сотрудник филиала «привязан» к своему и видит только его данные.
  const canPickBranch = ["director", "finance", "sysadmin"].includes(me.role);
  const branchScope = canPickBranch
    ? s.settings?.branchScope || 0
    : me.branchId || 0;
  const scoped = useMemo(
    () => visibleTasks(s.tasks, me),
    [s.tasks, me, s.departments, s.routes],
  );
  const branchScoped = useMemo(
    () =>
      branchScope ? scoped.filter((t) => t.branchId === branchScope) : scoped,
    [scoped, branchScope],
  );
  const filtered = useMemo(
    () => applyFilters(branchScoped, s.filters, now),
    [branchScoped, s.filters, now],
  );
  const { flags } = useMemo(
    () => detectAnomalies(s.tasks, s.history, now),
    [s.tasks, s.history, now],
  );
  const selected = s.selectedId
    ? s.tasks.find((t) => t.id === s.selectedId)
    : null;

  useEffect(() => {
    const item = NAV.find((n) => n.key === s.view);
    if (item && !navAllowed(item, me.role))
      dispatch({ type: "SET_VIEW", view: "inbox" });
  }, [me.role]); // eslint-disable-line

  const onOpen = (id) => dispatch({ type: "SELECT", id });
  const setView = (v) => dispatch({ type: "SET_VIEW", view: v });

  return (
    <div
      style={{
        minHeight: "100vh",
        fontFamily: FONT,
        color: C.ink,
        // Тёплый «мешевый» градиент бренда как фон под стеклянными поверхностями.
        background:
          "radial-gradient(1100px 620px at 4% -12%, rgba(200,137,46,0.34), transparent 56%)," +
          "radial-gradient(1000px 700px at 104% -4%, rgba(123,45,31,0.26), transparent 54%)," +
          "radial-gradient(900px 620px at 92% 108%, rgba(230,150,60,0.22), transparent 56%)," +
          "radial-gradient(1000px 900px at 30% 118%, rgba(124,58,237,0.12), transparent 58%)," +
          "linear-gradient(180deg, #F4ECDF 0%, #EBE0CF 100%)",
        backgroundAttachment: "fixed",
      }}
    >
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap');
        *{box-sizing:border-box} button{font-family:inherit;cursor:pointer} select{font-family:inherit}
        ::-webkit-scrollbar{height:9px;width:9px}
        ::-webkit-scrollbar-thumb{background:rgba(123,45,31,.28);border-radius:9px;border:2px solid transparent;background-clip:padding-box}
        ::-webkit-scrollbar-thumb:hover{background:rgba(123,45,31,.42);background-clip:padding-box}
        ::selection{background:rgba(200,137,46,.28)}
        button:focus-visible{outline:2px solid ${C.brandA};outline-offset:2px}
        /* Плавные микровзаимодействия */
        button{transition:background-color .18s ease,color .18s ease,box-shadow .2s ease,border-color .18s ease,transform .12s ease,opacity .18s ease}
        button:active:not(:disabled){transform:translateY(1px)}
        a{transition:color .18s ease}
        /* Жидкое стекло: матовые полупрозрачные поверхности хрома */
        .glass{background:${C.glass};-webkit-backdrop-filter:blur(18px) saturate(150%);backdrop-filter:blur(18px) saturate(150%);border:1px solid ${C.glassBorder}}
        .glass-chrome{background:${C.glassStrong};-webkit-backdrop-filter:blur(22px) saturate(160%);backdrop-filter:blur(22px) saturate(160%)}
        /* Карточки-контент: полупрозрачные (тёплый градиент чуть просвечивает) +
           премиальная тень и подсветка. БЕЗ backdrop-filter — иначе карточки
           создают stacking-контекст и перекрывают выпадающие списки/календари.
           Стекло с размытием оставляем только на «хроме» (меню/шапка/модалки). */
        .rounded-2xl.bg-white:not(.shadow-xl):not(.shadow-lg):not(.shadow-2xl){
          background:rgba(255,255,255,.86);
          border-color:rgba(255,255,255,.7);
          box-shadow:0 1px 2px rgba(74,38,22,.05),0 14px 32px rgba(74,38,22,.10),inset 0 1px 0 rgba(255,255,255,.55);
          transition:box-shadow .22s ease,transform .22s ease}
        /* Утилита приподнимания при наведении (для кликабельных карточек) */
        .lift{transition:transform .22s ease,box-shadow .22s ease}
        .lift:hover{transform:translateY(-2px);box-shadow:0 16px 34px rgba(74,38,22,.12)}
        .nav-item:not(.nav-item-active):hover{background:rgba(123,45,31,.07)!important}
        @keyframes glassFadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
        .fade-up{animation:glassFadeUp .34s cubic-bezier(.22,.61,.36,1) both}
        @media(prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
        select{appearance:none;-webkit-appearance:none;-moz-appearance:none;
          background-image:url("data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394A3B8' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E") !important;
          background-repeat:no-repeat !important;background-position:right 12px center !important;background-size:14px !important;
          padding-right:34px !important;border-radius:12px;cursor:pointer}
        select:focus-visible{outline:2px solid ${C.brandA};outline-offset:2px}
        input[type=date],input[type=month]{border-radius:12px}
        .cash-table th,.cash-table td{padding-left:16px}
        .cash-table th:first-child,.cash-table td:first-child{padding-left:0}
        @media(min-width:768px){.desk-shift{margin-left:250px}}`}</style>

      <div className="flex" style={{ minHeight: "100vh" }}>
        <Sidebar view={s.view} setView={setView} role={me.role} />
        <div className="flex-1 min-w-0 flex flex-col desk-shift">
          <TopBar
            me={me}
            shift={myShift}
            dispatch={dispatch}
            authUser={authUser}
            onLogout={onLogout}
            onToggleShift={() => {
              dispatch({ type: "TOGGLE_SHIFT", id: me.id });
              notify(
                myShift.open
                  ? "Смена закрыта"
                  : "Смена открыта — задачи доступны",
              );
            }}
          />

          <main
            key={s.view}
            className="flex-1 p-4 md:p-6 pb-28 md:pb-6 fade-up"
          >
            <div className="flex items-center flex-wrap gap-x-3 gap-y-2 mb-4">
              <h1
                className="font-extrabold"
                style={{
                  color: C.ink,
                  fontSize: 24,
                  overflowWrap: "break-word",
                }}
              >
                {tr(VIEW_TITLE[s.view] || "")}
              </h1>
              {s.view === "inbox" && (
                <span
                  style={{
                    fontSize: 13.5,
                    color: C.faint,
                    whiteSpace: "nowrap",
                  }}
                >
                  {filtered.filter((t) => t.phase < 5).length} {tr("активных")}
                </span>
              )}
              {[
                "inbox",
                "archive",
                "analytics",
                "time",
                "cash",
                "money",
                "sales",
                "reports",
              ].includes(s.view) && (
                <div className="ml-auto flex items-center gap-2">
                  {canPickBranch ? (
                    <NiceSelect
                      value={branchScope}
                      width={186}
                      align="right"
                      onChange={(v) =>
                        dispatch({
                          type: "SET_SETTING",
                          key: "branchScope",
                          value: +v,
                        })
                      }
                      options={[
                        { value: 0, label: tr("Все филиалы") },
                        ...(s.branches || []).map((b) => ({
                          value: b.id,
                          label: b.name,
                        })),
                      ]}
                    />
                  ) : me.branchId ? (
                    <span
                      className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2"
                      style={{
                        border: `1px solid ${C.border}`,
                        background: "#fff",
                        fontSize: 13,
                        fontWeight: 700,
                        color: C.ink,
                      }}
                    >
                      <Building2 size={14} color={C.faint} />{" "}
                      {branchById(me.branchId)?.name}
                    </span>
                  ) : null}
                </div>
              )}
            </div>

            {s.view === "inbox" && hint && (
              <div
                className="mb-4 rounded-xl px-4 py-3 flex items-start gap-2.5"
                style={{ background: "#EFF4FF", border: `1px solid #BFDBFE` }}
              >
                <Info size={17} color={C.brandA} style={{ marginTop: 1 }} />
                <div style={{ fontSize: 13.5, color: "#1E3A8A", flex: 1 }}>
                  {tr(
                    "Рабочий прототип. Откройте задачу, где вы исполнитель или контролёр — фаза «Отправлено» сама станет «Просмотрено» (защита «я не видел»). Кнопки действий зависят от роли и открытой смены — переключайте роль через профиль справа вверху.",
                  )}
                </div>
                <button
                  onClick={() => setHint(false)}
                  className="p-1 rounded-lg"
                  style={{ color: C.brandA }}
                >
                  <X size={16} />
                </button>
              </div>
            )}

            {s.view === "inbox" && (
              <Board
                tasks={filtered}
                now={now}
                onOpen={onOpen}
                onFav={(id) => dispatch({ type: "TOGGLE_FAV", id })}
                flags={flags}
                me={me}
                dispatch={dispatch}
                notify={notify}
                shiftOpen={myShift.open}
              />
            )}
            {s.view === "create" && (
              <CreatePage me={me} s={s} dispatch={dispatch} notify={notify} />
            )}
            {s.view === "me" && (
              <PersonalAchievements
                me={me}
                tasks={s.tasks}
                history={s.history}
                shift={myShift}
                now={now}
                timesheet={s.timesheet}
                authUser={authUser}
              />
            )}
            {s.view === "archive" && (
              <ArchiveView tasks={scoped} onOpen={onOpen} />
            )}
            {s.view === "analytics" &&
              navAllowed(
                { roles: NAV.find((n) => n.key === "analytics").roles },
                me.role,
              ) && (
                <Analytics
                  tasks={filtered}
                  history={s.history}
                  now={now}
                  filters={s.filters}
                  dispatch={dispatch}
                  role={me.role}
                  notify={notify}
                />
              )}
            {s.view === "time" &&
              navAllowed(
                { roles: NAV.find((n) => n.key === "time").roles },
                me.role,
              ) && (
                <TimesheetView
                  s={s}
                  me={me}
                  now={now}
                  branchScope={branchScope}
                />
              )}
            {s.view === "cash" &&
              navAllowed(
                { roles: NAV.find((n) => n.key === "cash").roles },
                me.role,
              ) && (
                <CashRegisterView
                  s={s}
                  me={me}
                  dispatch={dispatch}
                  notify={notify}
                  branchScope={branchScope}
                />
              )}
            {s.view === "checklists" && (
              <ShiftChecklistsView
                s={s}
                me={me}
                dispatch={dispatch}
                notify={notify}
                branchScope={branchScope}
              />
            )}
            {s.view === "cakes" &&
              navAllowed(
                { roles: NAV.find((n) => n.key === "cakes").roles },
                me.role,
              ) && (
                <CakeConstructor s={s} dispatch={dispatch} notify={notify} />
              )}
            {s.view === "money" &&
              navAllowed(
                { roles: NAV.find((n) => n.key === "money").roles },
                me.role,
              ) && <MoneyView s={s} me={me} branchScope={branchScope} />}
            {s.view === "sales" &&
              navAllowed(
                { roles: NAV.find((n) => n.key === "sales").roles },
                me.role,
              ) && (
                <SalesAnalytics
                  s={s}
                  me={me}
                  branchScope={branchScope}
                  mode="analytics"
                />
              )}
            {s.view === "production" &&
              navAllowed(
                { roles: NAV.find((n) => n.key === "production").roles },
                me.role,
              ) && <IikoProduction />}
            {s.view === "reports" &&
              navAllowed(
                { roles: NAV.find((n) => n.key === "reports").roles },
                me.role,
              ) && (
                <SalesAnalytics
                  s={s}
                  me={me}
                  branchScope={branchScope}
                  mode="reports"
                />
              )}
            {s.view === "org" && <OrgStructure />}
            {s.view === "about" && <AboutView />}
            {s.view === "automation" &&
              (me.role === "director" || me.role === "sysadmin") && (
                <AutomationView
                  rules={autoRules}
                  setRules={setAutoRules}
                  log={autoLog}
                  setLog={setAutoLog}
                  now={now}
                />
              )}
            {s.view === "admin" && me.role === "sysadmin" && (
              <AdminPanel s={s} dispatch={dispatch} notify={notify} />
            )}
          </main>
        </div>
      </div>

      <ScrollTopButton />

      <BottomNav
        view={s.view}
        setView={setView}
        role={me.role}
        onMore={() => setMoreOpen(true)}
      />
      <MoreSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        items={NAV.filter((n) => navAllowed(n, me.role))}
        view={s.view}
        setView={setView}
      />

      {selected && (
        <TaskDetail
          t={selected}
          now={now}
          me={me}
          history={s.history}
          dispatch={dispatch}
          notify={notify}
          anomalyFlags={flags[selected.id]}
          shiftOpen={myShift.open}
          onClose={() => dispatch({ type: "CLOSE_TASK" })}
          key={selected.id}
        />
      )}

      {toast && (
        <div
          className="fixed left-1/2 bottom-24 md:bottom-6 z-50"
          style={{ transform: "translateX(-50%)" }}
        >
          <div
            className="rounded-xl px-4 py-3 text-white font-semibold shadow-xl"
            style={{ background: C.ink, fontSize: 14 }}
          >
            {toast}
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================================
   АДМИН-ПАНЕЛЬ  (настройка системы, управление персоналом и бизнесом)
   ============================================================================ */
const ROLE_OPTS = [
  ["director", "Руководство"],
  ["finance", "Финансист"],
  ["manager", "Управляющий"],
  ["accountant", "Бухгалтер"],
  ["sysadmin", "Сист. администратор"],
  ["staff", "Сотрудник"],
];

// Предпросмотр списка сотрудников из iiko (шаг 1: только чтение). iiko —
// источник правды по кадрам; на следующем шаге отсюда будем импортировать
// учётные записи, назначать права и авто-блокировать уволенных.
function IikoStaffPreview() {
  const [st, setSt] = useState({
    status: "idle",
    employees: [],
    count: 0,
    error: "",
    sample: "",
    rawFirst: "",
    deptRawFirst: "",
  });
  const [sync, setSync] = useState({ status: "idle", error: "", result: null });
  const runSync = async () => {
    setSync({ status: "loading", error: "", result: null });
    try {
      const result = await apiPost("/api/iiko/employees/sync", {});
      setSync({ status: "ok", error: "", result });
    } catch (e) {
      setSync({ status: "error", error: e.message || "Ошибка", result: null });
    }
  };
  const load = async () => {
    setSt((p) => ({ ...p, status: "loading", error: "" }));
    try {
      const data = await apiGet("/api/iiko/employees");
      const employees = data.employees || [];
      setSt({
        status: "ok",
        employees,
        count: data.count ?? employees.length,
        error: "",
        sample: data.sample || "",
        rawFirst: data.rawFirst || "",
        deptRawFirst: data.deptRawFirst || "",
      });
    } catch (e) {
      setSt({
        status: "error",
        employees: [],
        count: 0,
        error: e.message || "Ошибка запроса",
        sample: "",
      });
    }
  };
  const loading = st.status === "loading";
  return (
    <AdCard
      title="Сотрудники из iiko"
      desc="iiko — источник правды по кадрам. «Загрузить из iiko» — предпросмотр. «Синхронизировать в систему» — завести/обновить учётные записи в базе: вход по логину из iiko, уволенных в iiko система блокирует автоматически."
    >
      <div className="flex flex-wrap gap-2">
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 font-bold text-white"
          style={{
            background: C.brandA,
            fontSize: 14.5,
            opacity: loading ? 0.6 : 1,
          }}
        >
          <Users size={17} />
          {loading ? "Загрузка…" : "Загрузить из iiko"}
        </button>
        <button
          onClick={runSync}
          disabled={sync.status === "loading"}
          className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 font-bold"
          style={{
            background: "#fff",
            color: C.brandA,
            border: `1.5px solid ${C.brandA}`,
            fontSize: 14.5,
            opacity: sync.status === "loading" ? 0.6 : 1,
          }}
        >
          <Users size={17} />
          {sync.status === "loading"
            ? "Синхронизация…"
            : "Синхронизировать в систему"}
        </button>
      </div>

      {sync.status === "ok" && sync.result && (
        <p style={{ color: "#2C7", fontSize: 13, marginTop: 10 }}>
          Синхронизировано: создано <b>{sync.result.created}</b>, обновлено{" "}
          <b>{sync.result.updated}</b>, заблокировано (уволены в iiko){" "}
          <b>{sync.result.blocked}</b> из <b>{sync.result.total}</b>.
        </p>
      )}
      {sync.status === "error" && (
        <p style={{ color: "#B23", fontSize: 13, marginTop: 10 }}>
          Ошибка синхронизации: {sync.error}
        </p>
      )}

      {st.status === "error" && (
        <p style={{ color: "#B23", fontSize: 13, marginTop: 12 }}>
          Не удалось получить сотрудников: {st.error}
        </p>
      )}

      {st.status === "ok" && (
        <div style={{ marginTop: 12 }}>
          <p style={{ fontSize: 13, color: C.sub, marginBottom: 8 }}>
            Найдено сотрудников: <b>{st.count}</b>
          </p>
          {st.rawFirst ? (
            <details style={{ marginBottom: 12 }}>
              <summary
                style={{
                  fontSize: 12.5,
                  color: C.sub,
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                Структура ответа iiko (для отладки) — раскрыть и прислать
              </summary>
              <pre
                style={{
                  marginTop: 8,
                  padding: 10,
                  background: "#F7F4EF",
                  borderRadius: 10,
                  border: `1px solid ${C.line}`,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  fontSize: 11,
                }}
              >
                {st.rawFirst}
                {st.deptRawFirst
                  ? "\n\n--- Справочник подразделений ---\n" + st.deptRawFirst
                  : ""}
              </pre>
            </details>
          ) : null}
          {st.count > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full" style={{ fontSize: 13 }}>
                <thead>
                  <tr style={{ color: C.faint, textAlign: "left" }}>
                    <th className="pb-2 font-semibold">ФИО</th>
                    <th className="pb-2 font-semibold">Должность (iiko)</th>
                    <th className="pb-2 font-semibold">Подразделения</th>
                    <th className="pb-2 font-semibold text-center">Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {st.employees.map((e, i) => (
                    <tr
                      key={e.iikoId || i}
                      style={{
                        borderTop: `1px solid ${C.line}`,
                        opacity: e.deleted ? 0.5 : 1,
                      }}
                    >
                      <td
                        className="py-2 pr-2"
                        style={{ color: C.ink, fontWeight: 600 }}
                      >
                        {e.name || "—"}
                        {e.code ? (
                          <span style={{ color: C.faint, fontWeight: 400 }}>
                            {" "}
                            · таб. {e.code}
                          </span>
                        ) : null}
                      </td>
                      <td className="py-2 pr-2" style={{ color: C.sub }}>
                        {e.position || "—"}
                      </td>
                      <td className="py-2 pr-2" style={{ color: C.sub }}>
                        {(e.departmentNames || e.departmentCodes || []).join(
                          ", ",
                        ) || "—"}
                      </td>
                      <td className="py-2 text-center">
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: e.deleted ? "#B23" : "#2C7",
                          }}
                        >
                          {e.deleted ? "Уволен" : "Активен"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: C.sub }}>
              iiko вернул пустой список. Образец ответа (для уточнения формата):
              <pre
                style={{
                  marginTop: 8,
                  padding: 10,
                  background: "#F7F4EF",
                  borderRadius: 10,
                  border: `1px solid ${C.line}`,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  fontSize: 11.5,
                }}
              >
                {st.sample || "(пусто)"}
              </pre>
            </div>
          )}
        </div>
      )}
    </AdCard>
  );
}

// Привязка сотрудника к Telegram-боту чек-листов: Telegram ID + филиал.
// HR задаёт заранее; после этого бот в личке пускает сотрудника к чек-листам.
function TgLinkCell({ u, patch }) {
  const [tid, setTid] = useState(u.telegramId || "");
  const branchOpts = [
    { value: "", label: "— филиал —" },
    ...BRANCHES.map((b) => ({ value: String(b.id), label: b.name })),
  ];
  const saveTid = () => {
    const v = tid.trim();
    if (v !== (u.telegramId || "")) patch(u.id, { telegramId: v });
  };
  return (
    <div className="flex flex-col gap-1" style={{ minWidth: 170 }}>
      <input
        value={tid}
        onChange={(e) => setTid(e.target.value.replace(/[^\d]/g, ""))}
        onBlur={saveTid}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        placeholder="Telegram ID"
        className="rounded-lg px-2 py-1"
        style={{ border: `1px solid ${C.line}`, fontSize: 12.5, color: C.ink }}
      />
      <Select
        value={u.checklistBranch || ""}
        onChange={(v) => patch(u.id, { checklistBranch: v })}
        options={branchOpts}
      />
    </div>
  );
}

// Управление учётными записями сотрудников из iiko (права доступа): роль и
// доступ ко входу. Уволенные в iiko заблокированы автоматически.
function IikoStaffAccounts() {
  const [st, setSt] = useState({ status: "idle", list: [], error: "" });
  const load = async () => {
    setSt((p) => ({ ...p, status: "loading", error: "" }));
    try {
      const data = await apiGet("/api/iiko/employees/db");
      setSt({ status: "ok", list: data.employees || [], error: "" });
    } catch (e) {
      setSt({ status: "error", list: [], error: e.message || "Ошибка" });
    }
  };
  const patch = async (id, body) => {
    setSt((p) => ({
      ...p,
      list: p.list.map((u) => (u.id === id ? { ...u, ...body } : u)),
    }));
    try {
      await apiPatch(`/api/iiko/employees/${id}`, body);
    } catch {
      load(); // при ошибке перечитываем актуальное состояние
    }
  };
  const roleOpts = ROLE_OPTS.map(([value, label]) => ({
    value,
    label: tr(label),
  }));
  return (
    <AdCard
      title="Учётные записи из iiko — права доступа"
      desc="Роль и доступ ко входу реальных сотрудников. Уволенные в iiko заблокированы автоматически. Сначала синхронизируйте, затем «Загрузить учётные записи»."
    >
      <button
        onClick={load}
        disabled={st.status === "loading"}
        className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 font-bold text-white"
        style={{
          background: C.brandA,
          fontSize: 14.5,
          opacity: st.status === "loading" ? 0.6 : 1,
        }}
      >
        <Users size={17} />
        {st.status === "loading" ? "Загрузка…" : "Загрузить учётные записи"}
      </button>

      {st.status === "error" && (
        <p style={{ color: "#B23", fontSize: 13, marginTop: 12 }}>
          Не удалось загрузить: {st.error}
        </p>
      )}

      {st.status === "ok" && (
        <div style={{ marginTop: 12 }}>
          <p style={{ fontSize: 13, color: C.sub, marginBottom: 8 }}>
            Учётных записей: <b>{st.list.length}</b>
          </p>
          {st.list.length === 0 ? (
            <p style={{ fontSize: 13, color: C.sub }}>
              Пока пусто — нажмите «Синхронизировать в систему» выше.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full" style={{ fontSize: 13 }}>
                <thead>
                  <tr style={{ color: C.faint, textAlign: "left" }}>
                    <th className="pb-2 font-semibold">Сотрудник</th>
                    <th className="pb-2 font-semibold">Должность</th>
                    <th className="pb-2 font-semibold">Филиал</th>
                    <th className="pb-2 font-semibold">Роль (доступ)</th>
                    <th className="pb-2 font-semibold">Бот чек-листов</th>
                    <th className="pb-2 font-semibold text-center">Вход</th>
                  </tr>
                </thead>
                <tbody>
                  {st.list.map((u) => (
                    <tr
                      key={u.id}
                      style={{
                        borderTop: `1px solid ${C.line}`,
                        opacity: u.active ? 1 : 0.5,
                      }}
                    >
                      <td
                        className="py-2 pr-2"
                        style={{ color: C.ink, fontWeight: 600 }}
                      >
                        {u.displayName || "—"}
                        {u.login ? (
                          <span style={{ color: C.faint, fontWeight: 400 }}>
                            {" "}
                            · {u.login}
                          </span>
                        ) : null}
                      </td>
                      <td className="py-2 pr-2" style={{ color: C.sub }}>
                        {u.position || "—"}
                      </td>
                      <td className="py-2 pr-2" style={{ color: C.sub }}>
                        {u.iikoDepartment || "—"}
                      </td>
                      <td className="py-2 pr-2" style={{ minWidth: 160 }}>
                        <Select
                          value={u.role}
                          onChange={(v) => patch(u.id, { role: v })}
                          options={roleOpts}
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <TgLinkCell u={u} patch={patch} />
                      </td>
                      <td className="py-2 text-center">
                        {u.iikoDeleted ? (
                          <span
                            style={{
                              fontSize: 12,
                              fontWeight: 700,
                              color: "#B23",
                            }}
                          >
                            Уволен в iiko
                          </span>
                        ) : (
                          <button
                            onClick={() => patch(u.id, { active: !u.active })}
                            className="rounded-lg px-2.5 py-1 font-semibold"
                            style={{
                              fontSize: 12,
                              border: `1px solid ${C.line}`,
                              background: u.active ? "#EAF7EE" : "#FDECEC",
                              color: u.active ? "#2C7" : "#B23",
                            }}
                          >
                            {u.active ? "Разрешён" : "Заблокирован"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </AdCard>
  );
}

function AdminStaff({ s, dispatch, notify }) {
  const blank = {
    name: "",
    role: "staff",
    positionId: s.positions[0]?.id || "",
    departmentId: s.departments[0]?.id || "",
    branchId: "",
    parentId: "",
    phone: "",
    tg: "",
  };
  const [f, setF] = useState(blank);
  const branchOpts = [
    { value: "", label: "— без филиала —" },
    ...s.branches.map((b) => ({ value: b.id, label: b.name })),
  ];
  const deptOpts = s.departments.map((d) => ({ value: d.id, label: d.name }));
  const posOpts = s.positions.map((p) => ({
    value: p.id,
    label: `${p.title} · ур.${p.level}`,
  }));
  const mgrOpts = [
    { value: "", label: "— без руководителя —" },
    ...s.users
      .filter((u) => u.active !== false)
      .map((u) => ({ value: u.id, label: `${u.name}` })),
  ];

  const add = () => {
    if (!f.name.trim()) {
      notify("Укажите ФИО сотрудника");
      return;
    }
    const pos = s.positions.find((p) => p.id === f.positionId);
    const user = {
      id: "u" + uid().slice(0, 5),
      name: f.name.trim(),
      role: f.role,
      pos: pos ? pos.title : "Сотрудник",
      level: pos ? pos.level : 4,
      branchId: f.branchId === "" ? null : +f.branchId,
      parentId: f.parentId === "" ? null : f.parentId,
      departmentId: f.departmentId || null,
      tg_chat_id: f.tg || null,
      active: true,
    };
    dispatch({ type: "ADD_USER", user });
    notify("Сотрудник добавлен");
    setF(blank);
  };

  return (
    <div className="space-y-5">
      <AdCard
        title="Добавить сотрудника"
        desc="Новый сотрудник появится в оргструктуре, в назначении задач и переключателе ролей."
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <AdInput
            label="ФИО"
            value={f.name}
            onChange={(v) => setF({ ...f, name: v })}
            placeholder="Иванов И. И."
          />
          <Field label="Роль">
            <Select
              value={f.role}
              onChange={(v) => setF({ ...f, role: v })}
              options={ROLE_OPTS.map(([value, label]) => ({
                value,
                label: tr(label),
              }))}
            />
          </Field>
          <Field label="Должность">
            <Select
              value={f.positionId}
              onChange={(v) => setF({ ...f, positionId: v })}
              options={posOpts}
            />
          </Field>
          <Field label="Филиал">
            <Select
              value={f.branchId}
              onChange={(v) => setF({ ...f, branchId: v })}
              options={branchOpts}
            />
          </Field>
          <Field label="Руководитель (эскалация)">
            <Select
              value={f.parentId}
              onChange={(v) => setF({ ...f, parentId: v })}
              options={mgrOpts}
            />
          </Field>
          <Field label="Отдел (граница доступа)">
            <Select
              value={f.departmentId}
              onChange={(v) => setF({ ...f, departmentId: v })}
              options={deptOpts}
            />
          </Field>
          <AdInput
            label="Telegram ID (для бота)"
            value={f.tg}
            onChange={(v) => setF({ ...f, tg: v })}
            placeholder="123456789"
          />
        </div>
        <button
          onClick={add}
          className="mt-4 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 font-bold text-white"
          style={{ background: C.brandA, fontSize: 14.5 }}
        >
          <PlusCircle size={17} /> {tr("Добавить сотрудника")}
        </button>
      </AdCard>

      <IikoStaffPreview />

      <IikoStaffAccounts />

      <AdCard
        title={`Сотрудники (${s.users.length})`}
        desc="Меняйте роль и филиал прямо в таблице. Уволенных — деактивируйте: история их задач сохраняется."
      >
        <div className="hidden lg:block">
          <table className="w-full" style={{ fontSize: 13 }}>
            <thead>
              <tr style={{ color: C.faint, textAlign: "left" }}>
                <th className="pb-2 font-semibold">Сотрудник</th>
                <th className="pb-2 font-semibold">Роль</th>
                <th className="pb-2 font-semibold">Филиал</th>
                <th className="pb-2 font-semibold">Отдел</th>
                <th className="pb-2 font-semibold text-center">Статус</th>
              </tr>
            </thead>
            <tbody>
              {s.users.map((u) => (
                <tr
                  key={u.id}
                  style={{
                    borderTop: `1px solid ${C.line}`,
                    opacity: u.active === false ? 0.5 : 1,
                  }}
                >
                  <td className="py-2.5 pr-2">
                    <div className="flex items-center gap-2">
                      <Avatar id={u.id} size={28} />
                      <div>
                        <div style={{ color: C.ink, fontWeight: 600 }}>
                          {u.name}
                        </div>
                        <div style={{ color: C.faint, fontSize: 11.5 }}>
                          {u.pos}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="py-2.5 pr-2" style={{ minWidth: 150 }}>
                    <Select
                      value={u.role}
                      onChange={(v) =>
                        dispatch({
                          type: "UPDATE_USER",
                          id: u.id,
                          patch: { role: v },
                        })
                      }
                      options={ROLE_OPTS.map(([value, label]) => ({
                        value,
                        label: tr(label),
                      }))}
                    />
                  </td>
                  <td className="py-2.5 pr-2" style={{ minWidth: 130 }}>
                    <Select
                      value={u.branchId == null ? "" : u.branchId}
                      onChange={(v) =>
                        dispatch({
                          type: "UPDATE_USER",
                          id: u.id,
                          patch: { branchId: v === "" ? null : +v },
                        })
                      }
                      options={branchOpts}
                    />
                  </td>
                  <td className="py-2.5 pr-2" style={{ minWidth: 150 }}>
                    <Select
                      value={u.departmentId || ""}
                      onChange={(v) =>
                        dispatch({
                          type: "UPDATE_USER",
                          id: u.id,
                          patch: { departmentId: v || null },
                        })
                      }
                      options={deptOpts}
                    />
                  </td>
                  <td className="py-2.5 text-center">
                    <button
                      onClick={() =>
                        dispatch({
                          type: "UPDATE_USER",
                          id: u.id,
                          patch: { active: u.active === false },
                        })
                      }
                      className="rounded-lg px-2.5 py-1.5 font-semibold"
                      style={
                        u.active === false
                          ? { background: "#FEECEC", color: C.bad }
                          : { background: "#E9F9EF", color: C.ok }
                      }
                    >
                      {u.active === false ? "Неактивен" : "Активен"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="lg:hidden space-y-2.5">
          {s.users.map((u) => (
            <div
              key={u.id}
              className="rounded-xl p-3"
              style={{
                background: "#FBFCFE",
                border: `1px solid ${C.border}`,
                opacity: u.active === false ? 0.55 : 1,
              }}
            >
              <div className="flex items-center gap-2.5">
                <Avatar id={u.id} size={32} />
                <div className="flex-1 min-w-0">
                  <div
                    className="truncate"
                    style={{ color: C.ink, fontWeight: 700, fontSize: 14 }}
                  >
                    {u.name}
                  </div>
                  <div
                    className="truncate"
                    style={{ color: C.faint, fontSize: 12 }}
                  >
                    {u.pos}
                  </div>
                </div>
                <button
                  onClick={() =>
                    dispatch({
                      type: "UPDATE_USER",
                      id: u.id,
                      patch: { active: u.active === false },
                    })
                  }
                  className="shrink-0 rounded-lg px-2.5 py-1.5 font-semibold"
                  style={
                    u.active === false
                      ? { background: "#FEECEC", color: C.bad, fontSize: 12.5 }
                      : { background: "#E9F9EF", color: C.ok, fontSize: 12.5 }
                  }
                >
                  {u.active === false ? "Неактивен" : "Активен"}
                </button>
              </div>
              <div className="mt-2.5 space-y-2">
                <Field label="Роль">
                  <Select
                    value={u.role}
                    onChange={(v) =>
                      dispatch({
                        type: "UPDATE_USER",
                        id: u.id,
                        patch: { role: v },
                      })
                    }
                    options={ROLE_OPTS.map(([value, label]) => ({
                      value,
                      label: tr(label),
                    }))}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Филиал">
                    <Select
                      value={u.branchId == null ? "" : u.branchId}
                      onChange={(v) =>
                        dispatch({
                          type: "UPDATE_USER",
                          id: u.id,
                          patch: { branchId: v === "" ? null : +v },
                        })
                      }
                      options={branchOpts}
                    />
                  </Field>
                  <Field label="Отдел">
                    <Select
                      value={u.departmentId || ""}
                      onChange={(v) =>
                        dispatch({
                          type: "UPDATE_USER",
                          id: u.id,
                          patch: { departmentId: v || null },
                        })
                      }
                      options={deptOpts}
                    />
                  </Field>
                </div>
              </div>
            </div>
          ))}
        </div>
      </AdCard>
    </div>
  );
}

function AdminPositions({ s, dispatch, notify }) {
  const [title, setTitle] = useState("");
  const [level, setLevel] = useState("3");
  const add = () => {
    if (!title.trim()) {
      notify("Укажите название должности");
      return;
    }
    dispatch({
      type: "ADD_POSITION",
      position: {
        id: "p" + uid().slice(0, 4),
        title: title.trim(),
        level: +level,
      },
    });
    notify("Должность добавлена");
    setTitle("");
  };
  return (
    <div className="space-y-5">
      <AdCard
        title="Добавить должность"
        desc="Уровень задаёт иерархию для эскалации: 1 — высшая, 4 — линейный персонал."
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <AdInput
            label="Название"
            value={title}
            onChange={setTitle}
            placeholder="Старший техник"
          />
          <Field label="Уровень иерархии">
            <Select
              value={level}
              onChange={setLevel}
              options={[1, 2, 3, 4].map((n) => ({
                value: n,
                label: `Уровень ${n}`,
              }))}
            />
          </Field>
          <button
            onClick={add}
            className="rounded-xl px-4 py-2.5 font-bold text-white"
            style={{ background: C.brandA, fontSize: 14.5 }}
          >
            Добавить
          </button>
        </div>
      </AdCard>
      <AdCard title={`Должности (${s.positions.length})`}>
        <div className="space-y-2">
          {s.positions
            .sort((a, z) => a.level - z.level)
            .map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-xl px-4 py-2.5"
                style={{
                  background: "#FBFCFE",
                  border: `1px solid ${C.border}`,
                }}
              >
                <span style={{ fontSize: 14, color: C.ink, fontWeight: 600 }}>
                  {p.title}
                </span>
                <Badge color={C.violet} bg="#F5F0FE">
                  Уровень {p.level}
                </Badge>
              </div>
            ))}
        </div>
      </AdCard>
    </div>
  );
}

function AdminBranches({ s, dispatch, notify }) {
  const [bc, setBc] = useState(String(s.companies[0]?.id || ""));
  const [bn, setBn] = useState("");
  const [bb, setBb] = useState("300000");
  const [cn, setCn] = useState("");
  const [ci, setCi] = useState("");
  const addBranch = () => {
    if (!bn.trim()) {
      notify("Укажите название филиала");
      return;
    }
    const id = Math.max(0, ...s.branches.map((b) => b.id)) + 1;
    dispatch({
      type: "ADD_BRANCH",
      branch: { id, companyId: +bc, name: bn.trim(), monthly: +bb || 0 },
    });
    notify("Филиал добавлен");
    setBn("");
  };
  const addCompany = () => {
    if (!cn.trim()) {
      notify("Укажите название юр. лица");
      return;
    }
    const id = Math.max(0, ...s.companies.map((c) => c.id)) + 1;
    dispatch({
      type: "ADD_COMPANY",
      company: { id, name: cn.trim(), inn: ci.trim() },
    });
    notify("Юр. лицо добавлено");
    setCn("");
    setCi("");
  };
  return (
    <div className="space-y-5">
      <AdCard title="Юр. лица и филиалы">
        {s.companies.map((co) => (
          <div key={co.id} className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <Building2 size={16} color={C.brandA} />
              <span style={{ fontWeight: 700, color: C.ink }}>{co.name}</span>
              <Badge>ИНН {co.inn || "—"}</Badge>
            </div>
            <div className="space-y-2">
              {s.branches
                .filter((b) => b.companyId === co.id)
                .map((b) => (
                  <div
                    key={b.id}
                    className="flex items-center gap-3 rounded-xl px-4 py-2.5"
                    style={{
                      background: "#FBFCFE",
                      border: `1px solid ${C.border}`,
                    }}
                  >
                    <span
                      className="flex-1"
                      style={{ fontSize: 14, color: C.ink, fontWeight: 600 }}
                    >
                      Филиал «{b.name}»
                    </span>
                    <span style={{ fontSize: 12.5, color: C.faint }}>
                      Бюджет/мес:
                    </span>
                    <input
                      type="number"
                      value={s.budgets[b.id] || 0}
                      onChange={(e) =>
                        dispatch({
                          type: "SET_BUDGET",
                          branchId: b.id,
                          value: +e.target.value || 0,
                        })
                      }
                      className="rounded-lg px-2 py-1.5 focus:outline-none"
                      style={{
                        border: `1px solid ${C.border}`,
                        fontSize: 13.5,
                        color: C.ink,
                        width: 130,
                      }}
                    />
                    <span style={{ fontSize: 13, color: C.sub }}>сум</span>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </AdCard>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <AdCard title="Добавить филиал">
          <div className="space-y-3">
            <Field label="Юр. лицо">
              <Select
                value={bc}
                onChange={setBc}
                options={s.companies.map((c) => ({
                  value: c.id,
                  label: c.name,
                }))}
              />
            </Field>
            <AdInput
              label="Название филиала"
              value={bn}
              onChange={setBn}
              placeholder="Запад"
            />
            <AdInput
              label="Месячный бюджет, сум"
              type="number"
              value={bb}
              onChange={setBb}
            />
            <button
              onClick={addBranch}
              className="rounded-xl px-4 py-2.5 font-bold text-white"
              style={{ background: C.brandA, fontSize: 14.5 }}
            >
              Добавить филиал
            </button>
          </div>
        </AdCard>
        <AdCard title="Добавить юр. лицо">
          <div className="space-y-3">
            <AdInput
              label="Название"
              value={cn}
              onChange={setCn}
              placeholder="ООО «Новая сеть»"
            />
            <AdInput
              label="ИНН"
              value={ci}
              onChange={setCi}
              placeholder="7700000000"
            />
            <button
              onClick={addCompany}
              className="rounded-xl px-4 py-2.5 font-bold text-white"
              style={{ background: C.brandA, fontSize: 14.5 }}
            >
              Добавить юр. лицо
            </button>
          </div>
        </AdCard>
      </div>
    </div>
  );
}

function AdminSla({ s, dispatch }) {
  return (
    <AdCard
      title="SLA-нормативы (часы на решение)"
      desc="Сколько времени даётся на задачу по приоритету. ИИ применяет это при создании заявок."
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {["Критический", "Высокий", "Обычный"].map((p) => (
          <Field key={p} label={p}>
            <input
              type="number"
              min="1"
              value={s.sla[p] ?? 24}
              onChange={(e) =>
                dispatch({
                  type: "SET_SLA",
                  priority: p,
                  hours: +e.target.value || 1,
                })
              }
              className="w-full rounded-xl px-3 py-2 focus:outline-none"
              style={{
                border: `1px solid ${C.border}`,
                fontSize: 15,
                color: C.ink,
                fontWeight: 700,
              }}
            />
          </Field>
        ))}
      </div>
    </AdCard>
  );
}

function AdSop({ cat, sop, dispatch, notify }) {
  const [text, setText] = useState(sop.steps.join("\n"));
  const [photo, setPhoto] = useState(sop.requirePhoto);
  const save = () => {
    const steps = text
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean);
    dispatch({ type: "SET_SOP", category: cat, steps, requirePhoto: photo });
    notify(`Регламент «${cat}» сохранён`);
  };
  return (
    <AdCard title={cat}>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={Math.max(3, text.split("\n").length)}
        className="w-full rounded-xl px-3 py-2 focus:outline-none resize-y"
        style={{
          border: `1px solid ${C.border}`,
          fontSize: 13.5,
          color: C.ink,
          lineHeight: 1.5,
        }}
      />
      <div style={{ fontSize: 11.5, color: C.faint, marginTop: 4 }}>
        Каждый шаг — с новой строки.
      </div>
      <div className="flex items-center justify-between mt-3">
        <label
          className="flex items-center gap-2 cursor-pointer"
          style={{ fontSize: 13.5, color: C.ink }}
        >
          <input
            type="checkbox"
            checked={photo}
            onChange={() => setPhoto((p) => !p)}
            style={{ width: 18, height: 18, accentColor: C.brandA }}
          />{" "}
          Требовать фотоотчёт
        </label>
        <button
          onClick={save}
          className="rounded-xl px-4 py-2 font-bold text-white"
          style={{ background: C.brandA, fontSize: 13.5 }}
        >
          Сохранить
        </button>
      </div>
    </AdCard>
  );
}
function AdminSops({ s, dispatch, notify }) {
  return (
    <div className="space-y-4">
      <div style={{ fontSize: 13.5, color: C.sub }}>
        Регламенты (SOP) — это чек-листы, которые исполнитель обязан выполнить в
        фазе «В работе» перед сдачей задачи.
      </div>
      {Object.keys(s.sops).map((cat) => (
        <AdSop
          key={cat}
          cat={cat}
          sop={s.sops[cat]}
          dispatch={dispatch}
          notify={notify}
        />
      ))}
    </div>
  );
}

function AdminSystem({ s, dispatch, notify }) {
  const set = (k, v) => dispatch({ type: "SET_SETTING", key: k, value: v });
  const cfg = s.settings || {};
  return (
    <div className="space-y-4">
      <AdCard title="Настройки системы">
        <div className="space-y-3">
          <AdToggle
            label="Голосовой ввод задач"
            hint="Кнопка «Сказать задачу» в форме создания"
            checked={cfg.voiceInput !== false}
            onChange={(v) => set("voiceInput", v)}
          />
          <AdToggle
            label="Водяные знаки на экспорте"
            hint="ФИО и ID сотрудника на выгрузках (защита от утечек)"
            checked={!!cfg.watermark}
            onChange={(v) => set("watermark", v)}
          />
          <AdToggle
            label="Ограничение по IP / VPN"
            hint="Доступ к финансам и админке только из офиса"
            checked={!!cfg.ipRestrict}
            onChange={(v) => set("ipRestrict", v)}
          />
        </div>
      </AdCard>
      <AdCard
        title="Демо-данные"
        desc="Сбросить задачи, журнал, смены и оргструктуру к исходному состоянию."
      >
        <button
          onClick={() => {
            dispatch({ type: "RESET" });
            notify("Демо-данные сброшены");
          }}
          className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 font-bold text-white"
          style={{ background: C.bad, fontSize: 14 }}
        >
          <RotateCcw size={16} /> Сбросить демо-данные
        </button>
      </AdCard>
    </div>
  );
}

function AdminPanel({ s, dispatch, notify }) {
  const [tab, setTab] = useState("staff");
  const tabs = [
    ["staff", "Сотрудники", Users],
    ["positions", "Должности", Award],
    ["branches", "Филиалы и бюджеты", Building2],
    ["departments", "Отделы и доступ", Lock],
    ["routes", "Маршруты", Send],
    ["sla", "SLA-нормативы", Clock],
    ["sops", "Регламенты", ListChecks],
    ["system", "Система", Settings],
  ];
  return (
    <div className="space-y-5">
      <div
        className="rounded-2xl bg-white p-2 flex flex-wrap gap-1.5"
        style={{ border: `1px solid ${C.border}` }}
      >
        {tabs.map(([k, label, Icon]) => {
          const active = tab === k;
          return (
            <button
              key={k}
              onClick={() => setTab(k)}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 font-semibold"
              style={{
                background: active ? C.brandA : "transparent",
                color: active ? "#fff" : C.ink,
                fontSize: 13.5,
                whiteSpace: "nowrap",
              }}
            >
              <Icon size={16} color={active ? "#fff" : C.sub} /> {tr(label)}
            </button>
          );
        })}
      </div>
      {tab === "staff" && (
        <AdminStaff s={s} dispatch={dispatch} notify={notify} />
      )}
      {tab === "positions" && (
        <AdminPositions s={s} dispatch={dispatch} notify={notify} />
      )}
      {tab === "branches" && (
        <AdminBranches s={s} dispatch={dispatch} notify={notify} />
      )}
      {tab === "departments" && (
        <AdminDepartments s={s} dispatch={dispatch} notify={notify} />
      )}
      {tab === "routes" && (
        <AdminRoutes s={s} dispatch={dispatch} notify={notify} />
      )}
      {tab === "sla" && <AdminSla s={s} dispatch={dispatch} />}
      {tab === "sops" && (
        <AdminSops s={s} dispatch={dispatch} notify={notify} />
      )}
      {tab === "system" && (
        <AdminSystem s={s} dispatch={dispatch} notify={notify} />
      )}
    </div>
  );
}

function AdminDepartments({ s, dispatch, notify }) {
  const [name, setName] = useState("");
  const [restricted, setRestricted] = useState(false);
  const add = () => {
    if (!name.trim()) {
      notify("Укажите название отдела");
      return;
    }
    dispatch({
      type: "ADD_DEPARTMENT",
      department: {
        id: "d" + uid().slice(0, 4),
        name: name.trim(),
        restricted,
      },
    });
    notify("Отдел добавлен");
    setName("");
    setRestricted(false);
  };
  const cats = Object.keys(s.catDept);
  return (
    <div className="space-y-5">
      <AdCard
        title="Отделы и доступ к данным"
        desc="«Закрытый» отдел = его задачи видят только сотрудники этого отдела, финансы и высшее руководство. Например, задачи финансового отдела недоступны посторонним."
      >
        <div className="space-y-2">
          {s.departments.map((d) => (
            <div
              key={d.id}
              className="flex items-center gap-3 rounded-xl px-4 py-2.5"
              style={{ background: "#FBFCFE", border: `1px solid ${C.border}` }}
            >
              <input
                value={d.name}
                onChange={(e) =>
                  dispatch({
                    type: "UPDATE_DEPARTMENT",
                    id: d.id,
                    patch: { name: e.target.value },
                  })
                }
                className="flex-1 rounded-lg px-2 py-1.5 focus:outline-none"
                style={{
                  border: `1px solid ${C.border}`,
                  fontSize: 14,
                  color: C.ink,
                  fontWeight: 600,
                }}
              />
              <button
                onClick={() =>
                  dispatch({
                    type: "UPDATE_DEPARTMENT",
                    id: d.id,
                    patch: { restricted: !d.restricted },
                  })
                }
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-semibold"
                style={
                  d.restricted
                    ? { background: "#FEECEC", color: C.bad }
                    : { background: C.line, color: C.sub }
                }
              >
                <Lock size={14} /> {d.restricted ? "Закрытый" : "Открытый"}
              </button>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end mt-4">
          <AdInput
            label="Новый отдел"
            value={name}
            onChange={setName}
            placeholder="Отдел маркетинга"
          />
          <label
            className="flex items-center gap-2 cursor-pointer"
            style={{ fontSize: 13.5, color: C.ink, paddingBottom: 8 }}
          >
            <input
              type="checkbox"
              checked={restricted}
              onChange={() => setRestricted((r) => !r)}
              style={{ width: 18, height: 18, accentColor: C.bad }}
            />{" "}
            Закрытый (приватный)
          </label>
          <button
            onClick={add}
            className="rounded-xl px-4 py-2.5 font-bold text-white"
            style={{ background: C.brandA, fontSize: 14.5 }}
          >
            Добавить отдел
          </button>
        </div>
      </AdCard>

      <AdCard
        title="Маршрутизация: категория → отдел"
        desc="К какому отделу относится задача каждой категории. От этого зависит, кто её увидит."
      >
        <div className="space-y-2">
          {cats.map((cat) => (
            <div
              key={cat}
              className="flex items-center gap-3 rounded-xl px-4 py-2.5"
              style={{ background: "#FBFCFE", border: `1px solid ${C.border}` }}
            >
              <span
                className="flex-1"
                style={{ fontSize: 14, color: C.ink, fontWeight: 600 }}
              >
                {cat}
              </span>
              <ChevronRight size={16} color={C.faint} />
              <div style={{ minWidth: 200 }}>
                <Select
                  value={s.catDept[cat]}
                  onChange={(v) =>
                    dispatch({
                      type: "SET_CATDEPT",
                      category: cat,
                      departmentId: v,
                    })
                  }
                  options={s.departments.map((d) => ({
                    value: d.id,
                    label: d.name + (d.restricted ? " 🔒" : ""),
                  }))}
                />
              </div>
            </div>
          ))}
        </div>
      </AdCard>
    </div>
  );
}

/* ============================================================================
   МНОГОШАГОВЫЕ МАРШРУТЫ (процессы согласования)
   ============================================================================ */
function StepRail({ steps, current }) {
  return (
    <div className="flex flex-wrap items-stretch gap-1.5">
      {steps.map((st, i) => {
        const done = i < current,
          active = i === current;
        const color = done ? C.ok : active ? C.brandA : "#94A3B8";
        const bg = done ? "#E9F9EF" : active ? "#EFF4FF" : "#F1F5F9";
        return (
          <div
            key={i}
            className="rounded-xl px-2.5 py-2"
            style={{
              background: bg,
              border: `1px solid ${active ? C.brandA : C.border}`,
              minWidth: 104,
              flex: "1 1 104px",
            }}
          >
            <div
              className="flex items-center gap-1.5"
              style={{ fontSize: 10.5, color, fontWeight: 800 }}
            >
              {done ? (
                <CheckCircle2 size={13} />
              ) : (
                <span
                  style={{
                    width: 15,
                    height: 15,
                    borderRadius: 99,
                    background: color,
                    color: "#fff",
                    fontSize: 9.5,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 800,
                  }}
                >
                  {i + 1}
                </span>
              )}
              ШАГ {i + 1}
            </div>
            <div
              style={{
                fontSize: 12,
                color: C.ink,
                fontWeight: 700,
                marginTop: 3,
                lineHeight: 1.2,
              }}
            >
              {st.title}
            </div>
            <div style={{ fontSize: 10.5, color: C.faint, marginTop: 1 }}>
              {st.actor}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RouteResp({ t }) {
  if (t.currentStep >= t.steps.length) {
    return (
      <div
        className="flex items-center gap-2 rounded-xl px-3 py-2.5"
        style={{
          background: "#E9F9EF",
          color: C.ok,
          fontSize: 14,
          fontWeight: 700,
        }}
      >
        <CheckCircle2 size={18} /> Процесс завершён — проверки пройдены, оплата
        проведена
      </div>
    );
  }
  const st = t.steps[t.currentStep];
  const who = userById(t.assignees[t.currentStep]);
  return (
    <div className="flex items-center gap-3 min-w-0">
      <Avatar id={t.assignees[t.currentStep]} size={38} />
      <div className="flex-1 min-w-0">
        <div style={{ fontSize: 11.5, color: C.faint, fontWeight: 600 }}>
          Шаг {t.currentStep + 1} из {t.steps.length} · {st.title}
        </div>
        <div
          className="truncate"
          style={{ fontSize: 14.5, color: C.ink, fontWeight: 700 }}
        >
          {who?.name}{" "}
          <span style={{ color: C.sub, fontWeight: 500 }}>— {st.actor}</span>
        </div>
      </div>
    </div>
  );
}

function RouteFlow({ t, me, shiftOpen, dispatch, notify }) {
  const len = t.steps.length;
  const done = t.currentStep >= len;
  const idx = t.currentStep;
  const step = done ? null : t.steps[idx];
  const [photo, setPhoto] = useState(false);
  const [doc, setDoc] = useState(false);
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    setPhoto(false);
    setDoc(false);
    setChecked(false);
  }, [t.id, t.currentStep]);

  if (done) {
    return (
      <div
        className="rounded-2xl p-5 text-center"
        style={{ background: "#E9F9EF", border: `1px solid ${C.ok}` }}
      >
        <CheckCircle2 size={30} color={C.ok} style={{ margin: "0 auto" }} />
        <div className="font-bold mt-2" style={{ color: C.ok, fontSize: 16 }}>
          Процесс завершён
        </div>
        <div style={{ fontSize: 13.5, color: C.sub, marginTop: 2 }}>
          Товар принят, накладная оформлена и проверена, счёт-фактура сверена,
          оплата проведена.
        </div>
      </div>
    );
  }

  const who = userById(t.assignees[idx]);
  const isMine = t.assignees[idx] === me.id;
  const gateOk =
    (!step.photo || photo) && (!step.doc || doc) && (!step.check || checked);

  return (
    <div
      className="rounded-2xl p-4"
      style={{ border: `2px solid ${C.brandA}`, background: "#FBFDFF" }}
    >
      <div
        className="flex items-center gap-2 mb-1"
        style={{ fontSize: 12, color: C.brandA, fontWeight: 800 }}
      >
        <Send size={14} /> ТЕКУЩИЙ ШАГ {idx + 1} / {len}
      </div>
      <div className="font-bold" style={{ color: C.ink, fontSize: 16 }}>
        {step.title}
      </div>
      <div style={{ fontSize: 13, color: C.sub, marginBottom: 12 }}>
        Ответственный: <b>{who?.name}</b> · {step.actor}
      </div>

      {isMine ? (
        <div className="space-y-2.5">
          {step.photo && (
            <button
              onClick={() => {
                setPhoto(true);
                notify("Фотоотчёт прикреплён (снимок с камеры)");
              }}
              className="w-full flex items-center justify-between rounded-xl px-3.5 py-2.5 font-semibold"
              style={
                photo
                  ? {
                      background: "#E9F9EF",
                      color: C.ok,
                      border: `1px solid ${C.ok}`,
                    }
                  : { background: C.line, color: C.ink }
              }
            >
              <span className="inline-flex items-center gap-2">
                <Camera size={16} /> Фотоотчёт приёмки товара
              </span>
              {photo ? (
                <CheckCircle2 size={16} />
              ) : (
                <span style={{ fontSize: 12.5, color: C.faint }}>
                  обязательно
                </span>
              )}
            </button>
          )}
          {step.doc && (
            <button
              onClick={() => {
                setDoc(true);
                notify(`Документ прикреплён: ${step.docLabel || "документ"}`);
              }}
              className="w-full flex items-center justify-between rounded-xl px-3.5 py-2.5 font-semibold"
              style={
                doc
                  ? {
                      background: "#E9F9EF",
                      color: C.ok,
                      border: `1px solid ${C.ok}`,
                    }
                  : { background: C.line, color: C.ink }
              }
            >
              <span className="inline-flex items-center gap-2">
                <Paperclip size={16} /> {step.docLabel || "Документ"}
              </span>
              {doc ? (
                <CheckCircle2 size={16} />
              ) : (
                <span style={{ fontSize: 12.5, color: C.faint }}>
                  обязательно
                </span>
              )}
            </button>
          )}
          {step.check && (
            <label
              className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 cursor-pointer"
              style={{ background: C.line, color: C.ink, fontSize: 14 }}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => setChecked((v) => !v)}
                style={{ width: 18, height: 18, accentColor: C.brandA }}
              />
              {step.pay
                ? "Сверил фотоотчёт, накладную и счёт-фактуру — всё верно"
                : "Проверил — оформлено и оприходовано верно"}
            </label>
          )}
          {step.pay && t.amount != null && (
            <div
              className="rounded-xl px-3.5 py-2.5"
              style={{
                background: "#F5F0FE",
                border: "1px solid #E4D9FB",
                fontSize: 14,
                color: C.violet,
                fontWeight: 700,
              }}
            >
              <Wallet size={15} style={{ display: "inline", marginRight: 6 }} />{" "}
              К оплате: {fmtMoney(t.amount)}
            </div>
          )}

          {!shiftOpen ? (
            <div
              className="flex items-center gap-2 rounded-xl px-3.5 py-2.5"
              style={{
                background: "#FFF7ED",
                color: C.warn,
                fontSize: 13.5,
                fontWeight: 600,
              }}
            >
              <Lock size={15} /> Откройте смену, чтобы выполнить шаг.
            </div>
          ) : (
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                disabled={!gateOk}
                onClick={() =>
                  dispatch({
                    type: "ROUTE_ADVANCE",
                    id: t.id,
                    userId: me.id,
                    note: `${step.title}: ${step.action}`,
                    addAtt: (step.photo ? 1 : 0) + (step.doc ? 1 : 0),
                  })
                }
                className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 font-bold text-white"
                style={{
                  background: gateOk
                    ? step.pay
                      ? C.violet
                      : C.brandA
                    : "#C7CDD6",
                  fontSize: 14.5,
                }}
              >
                {step.pay ? <Wallet size={17} /> : <Send size={17} />}{" "}
                {step.action}
              </button>
              {step.check && idx > 0 && (
                <button
                  onClick={() =>
                    dispatch({
                      type: "ROUTE_RETURN",
                      id: t.id,
                      userId: me.id,
                      note: `Возврат с шага «${step.title}»`,
                    })
                  }
                  className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 font-bold"
                  style={{
                    background: "#FEECEC",
                    color: C.bad,
                    fontSize: 14.5,
                  }}
                >
                  <RotateCcw size={16} /> Вернуть на доработку
                </button>
              )}
              {!gateOk && (
                <span
                  style={{ fontSize: 12, color: C.faint, alignSelf: "center" }}
                >
                  Прикрепите обязательные вложения, чтобы продолжить.
                </span>
              )}
            </div>
          )}
        </div>
      ) : (
        <div
          className="flex items-center gap-2 rounded-xl px-3.5 py-2.5"
          style={{
            background: "#EFF4FF",
            color: C.brandA,
            fontSize: 13.5,
            fontWeight: 600,
          }}
        >
          <Clock size={15} /> Ожидается действие: {who?.name} ({step.actor}). Вы
          — участник процесса и видите его ход.
        </div>
      )}
    </div>
  );
}

function RouteCreate({ me, s, dispatch, notify }) {
  const [rid, setRid] = useState(s.routes[0]?.id || "");
  const route = s.routes.find((r) => r.id === rid) || s.routes[0];
  const [branch, setBranch] = useState(
    String(me.branchId || s.branches[0]?.id || ""),
  );
  const [supplier, setSupplier] = useState("");
  const [goods, setGoods] = useState("");
  const [amount, setAmount] = useState("");
  const [picks, setPicks] = useState({});
  useEffect(() => {
    const def = {};
    (route?.steps || []).forEach((st, i) => {
      def[i] = assignByActor(st.actor, +branch);
    });
    setPicks(def);
  }, [rid, branch]);

  const create = () => {
    if (!route) {
      notify("Нет шаблонов маршрутов");
      return;
    }
    const steps = route.steps.map((st) => ({ ...st }));
    if (steps.length === 0) {
      notify("В маршруте нет шагов");
      return;
    }
    const assignees = steps.map(
      (st, i) => picks[i] || assignByActor(st.actor, +branch),
    );
    const now = Date.now();
    const task = {
      id: "t" + uid().slice(0, 6),
      title: `Приёмка: ${goods.trim() || "товар"} от ${supplier.trim() || "поставщика"}`,
      description: `Поставщик: ${supplier.trim() || "—"}. Принятый товар: ${goods.trim() || "—"}.`,
      branchId: +branch,
      departmentId: deptForCategory(route.category),
      cat: route.category,
      pr: "Обычный",
      amount: amount ? +amount : null,
      overBudget: false,
      createdBy: me.id,
      createdAt: now,
      slaDeadline: now + slaFor("Обычный") * H,
      attachments: 0,
      favorite: false,
      comments: [],
      routeId: route.id,
      routeName: route.name,
      steps,
      assignees,
      currentStep: 0,
      phase: 1,
      executorId: assignees[0],
      controllerId: assignees[assignees.length - 1],
    };
    dispatch({ type: "CREATE_TASK", task });
    notify("Процесс запущен — задача создана");
    setSupplier("");
    setGoods("");
    setAmount("");
  };

  const userOpts = s.users
    .filter((u) => u.active !== false)
    .map((u) => ({ value: u.id, label: `${u.name} · ${u.pos}` }));
  const inp = { border: `1px solid ${C.border}`, fontSize: 14.5, color: C.ink };

  return (
    <div
      className="rounded-2xl bg-white p-6"
      style={{ border: `1px solid ${C.border}` }}
    >
      <h2
        className="font-extrabold mb-1"
        style={{ color: C.ink, fontSize: 19 }}
      >
        {tr("Запустить процесс по шаблону")}
      </h2>
      <p style={{ fontSize: 14, color: C.sub, marginBottom: 16 }}>
        Задача пройдёт по шагам маршрута: каждый участник выполняет свой шаг
        строго по очереди, с обязательными вложениями.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Шаблон процесса">
          <Select
            value={rid}
            onChange={setRid}
            options={s.routes.map((r) => ({ value: r.id, label: r.name }))}
          />
        </Field>
        <Field label="Филиал">
          <Select
            value={branch}
            onChange={setBranch}
            options={s.branches.map((b) => ({ value: b.id, label: b.name }))}
          />
        </Field>
        <Field label="Поставщик">
          <input
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
            placeholder="ООО «Поставщик»"
            className="w-full rounded-xl px-3 py-2.5 focus:outline-none"
            style={inp}
          />
        </Field>
        <Field label="Что приняли">
          <input
            value={goods}
            onChange={(e) => setGoods(e.target.value)}
            placeholder="Продукты, упаковка…"
            className="w-full rounded-xl px-3 py-2.5 focus:outline-none"
            style={inp}
          />
        </Field>
        <Field label="Сумма к оплате, сум">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            className="w-full rounded-xl px-3 py-2.5 focus:outline-none"
            style={inp}
          />
        </Field>
      </div>

      <div
        className="mt-4 rounded-xl p-3"
        style={{ background: "#FBFCFE", border: `1px solid ${C.border}` }}
      >
        <div
          style={{
            fontSize: 12.5,
            color: C.faint,
            fontWeight: 700,
            marginBottom: 8,
          }}
        >
          УЧАСТНИКИ ШАГОВ (можно переназначить)
        </div>
        <div className="space-y-2">
          {(route?.steps || []).map((st, i) => (
            <div key={i} className="flex items-center gap-2 flex-wrap">
              <span
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 99,
                  background: C.brandA,
                  color: "#fff",
                  fontSize: 11,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 800,
                }}
              >
                {i + 1}
              </span>
              <span
                style={{
                  fontSize: 13,
                  color: C.ink,
                  fontWeight: 600,
                  minWidth: 150,
                }}
              >
                {st.title}
              </span>
              <span style={{ fontSize: 11.5, color: C.faint }}>{st.actor}</span>
              {st.photo && (
                <Badge color={C.ok} bg="#E9F9EF">
                  📷 фото
                </Badge>
              )}
              {st.doc && (
                <Badge color={C.violet} bg="#F5F0FE">
                  📄 {st.docLabel || "документ"}
                </Badge>
              )}
              {st.pay && (
                <Badge color={C.violet} bg="#F5F0FE">
                  💳 оплата
                </Badge>
              )}
              <div style={{ minWidth: 220, flex: 1 }}>
                <Select
                  value={picks[i] || ""}
                  onChange={(v) => setPicks({ ...picks, [i]: v })}
                  options={userOpts}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={create}
        className="mt-4 inline-flex items-center gap-2 rounded-xl px-5 py-3 font-bold text-white"
        style={{
          background: `linear-gradient(90deg, ${C.violet}, ${C.brandA})`,
          fontSize: 15,
        }}
      >
        <Send size={18} /> {tr("Запустить процесс")}
      </button>
    </div>
  );
}

function CreatePage({ me, s, dispatch, notify }) {
  const [mode, setMode] = useState("simple");
  const tabs = [
    ["simple", "Простая заявка", Sparkles],
    ["process", "По шаблону", ListChecks],
  ];
  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div
        className="rounded-2xl bg-white p-2 flex gap-2"
        style={{ border: `1px solid ${C.border}` }}
      >
        {tabs.map(([k, label, Icon]) => {
          const active = mode === k;
          return (
            <button
              key={k}
              onClick={() => setMode(k)}
              className="flex-1 min-w-0 inline-flex items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 font-bold"
              style={{
                background: active ? C.brandA : "transparent",
                color: active ? "#fff" : C.ink,
                fontSize: 13.5,
                lineHeight: 1.15,
                textAlign: "center",
              }}
            >
              <Icon
                size={16}
                color={active ? "#fff" : C.sub}
                className="shrink-0"
              />{" "}
              <span style={{ overflowWrap: "break-word" }}>{tr(label)}</span>
            </button>
          );
        })}
      </div>
      {mode === "simple" && (
        <CreateTask
          me={me}
          tasks={s.tasks}
          now={Date.now()}
          dispatch={dispatch}
          notify={notify}
        />
      )}
      {mode === "process" && (
        <RouteCreate me={me} s={s} dispatch={dispatch} notify={notify} />
      )}
    </div>
  );
}

function AdRoute({ route, s, dispatch, notify }) {
  const [title, setTitle] = useState("");
  const [actor, setActor] = useState(s.positions[0]?.title || "");
  const [action, setAction] = useState("");
  const [photo, setPhoto] = useState(false);
  const [doc, setDoc] = useState(false);
  const addStep = () => {
    if (!title.trim()) {
      notify("Укажите название шага");
      return;
    }
    const steps = [
      ...route.steps,
      {
        title: title.trim(),
        actor,
        action: action.trim() || "Выполнил шаг",
        photo,
        doc,
        check: !photo && !doc,
      },
    ];
    dispatch({ type: "UPDATE_ROUTE", id: route.id, patch: { steps } });
    notify("Шаг добавлен");
    setTitle("");
    setAction("");
    setPhoto(false);
    setDoc(false);
  };
  const delStep = (i) =>
    dispatch({
      type: "UPDATE_ROUTE",
      id: route.id,
      patch: { steps: route.steps.filter((_, j) => j !== i) },
    });
  return (
    <div
      className="rounded-xl p-3"
      style={{ background: "#FBFCFE", border: `1px solid ${C.border}` }}
    >
      <div className="flex items-center gap-2 mb-2">
        <ListChecks size={16} color={C.brandA} />
        <span style={{ fontWeight: 700, color: C.ink }}>{route.name}</span>
        <Badge>{route.category}</Badge>
      </div>
      <div className="space-y-1.5 mb-3">
        {route.steps.map((st, i) => (
          <div
            key={i}
            className="flex items-center gap-2 flex-wrap rounded-lg px-3 py-2"
            style={{ background: "#fff", border: `1px solid ${C.line}` }}
          >
            <span
              style={{
                width: 18,
                height: 18,
                borderRadius: 99,
                background: C.brandA,
                color: "#fff",
                fontSize: 11,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 800,
              }}
            >
              {i + 1}
            </span>
            <span style={{ fontSize: 13, color: C.ink, fontWeight: 600 }}>
              {st.title}
            </span>
            <span style={{ fontSize: 11.5, color: C.faint }}>· {st.actor}</span>
            {st.photo && (
              <Badge color={C.ok} bg="#E9F9EF">
                📷
              </Badge>
            )}
            {st.doc && (
              <Badge color={C.violet} bg="#F5F0FE">
                📄
              </Badge>
            )}
            {st.check && (
              <Badge color={C.brandA} bg="#EFF4FF">
                ✔
              </Badge>
            )}
            {st.pay && (
              <Badge color={C.violet} bg="#F5F0FE">
                💳
              </Badge>
            )}
            <button
              onClick={() => delStep(i)}
              className="ml-auto"
              title="Удалить шаг"
            >
              <X size={14} color={C.faint} />
            </button>
          </div>
        ))}
        {route.steps.length === 0 && (
          <div style={{ fontSize: 12.5, color: C.faint }}>
            Шагов пока нет — добавьте ниже.
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 items-end">
        <AdInput
          label="Название шага"
          value={title}
          onChange={setTitle}
          placeholder="Проверка договора"
        />
        <Field label="Ответственный (должность)">
          <Select
            value={actor}
            onChange={setActor}
            options={s.positions.map((p) => ({
              value: p.title,
              label: p.title,
            }))}
          />
        </Field>
        <AdInput
          label="Действие (кнопка)"
          value={action}
          onChange={setAction}
          placeholder="Проверил и согласовал"
        />
        <div className="flex items-center gap-3 pb-1">
          <label
            className="flex items-center gap-1.5 cursor-pointer"
            style={{ fontSize: 13, color: C.ink }}
          >
            <input
              type="checkbox"
              checked={photo}
              onChange={() => setPhoto((v) => !v)}
              style={{ width: 16, height: 16, accentColor: C.brandA }}
            />{" "}
            фото
          </label>
          <label
            className="flex items-center gap-1.5 cursor-pointer"
            style={{ fontSize: 13, color: C.ink }}
          >
            <input
              type="checkbox"
              checked={doc}
              onChange={() => setDoc((v) => !v)}
              style={{ width: 16, height: 16, accentColor: C.brandA }}
            />{" "}
            документ
          </label>
          <button
            onClick={addStep}
            className="ml-auto rounded-lg px-3 py-2 font-bold text-white"
            style={{ background: C.brandA, fontSize: 13.5 }}
          >
            + шаг
          </button>
        </div>
      </div>
    </div>
  );
}

function AdminRoutes({ s, dispatch, notify }) {
  const [name, setName] = useState("");
  const [cat, setCat] = useState(Object.keys(s.catDept)[0] || "Прочее");
  const addRoute = () => {
    if (!name.trim()) {
      notify("Укажите название маршрута");
      return;
    }
    dispatch({
      type: "ADD_ROUTE",
      route: {
        id: "r" + uid().slice(0, 4),
        name: name.trim(),
        category: cat,
        steps: [],
      },
    });
    notify("Маршрут добавлен");
    setName("");
  };
  return (
    <div className="space-y-5">
      <AdCard
        title="Шаблоны процессов (маршруты)"
        desc="Маршрут — последовательность шагов с ответственными. Задача проходит шаги строго по очереди; на каждом шаге можно требовать фото и/или документ."
      >
        <div className="space-y-4">
          {s.routes.map((r) => (
            <AdRoute
              key={r.id}
              route={r}
              s={s}
              dispatch={dispatch}
              notify={notify}
            />
          ))}
        </div>
      </AdCard>
      <AdCard title="Добавить маршрут">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <AdInput
            label="Название"
            value={name}
            onChange={setName}
            placeholder="Согласование договора"
          />
          <Field label="Категория">
            <Select
              value={cat}
              onChange={setCat}
              options={Object.keys(s.catDept).map((c) => ({
                value: c,
                label: c,
              }))}
            />
          </Field>
          <button
            onClick={addRoute}
            className="rounded-xl px-4 py-2.5 font-bold text-white"
            style={{ background: C.brandA, fontSize: 14.5 }}
          >
            Добавить маршрут
          </button>
        </div>
      </AdCard>
    </div>
  );
}
