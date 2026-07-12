// Оргструктура группы: юрлица, филиалы, должности, сотрудники, маршруты.
// ORG — живой реестр (правится в Админ-панели через syncOrg), хелперы
// *_ById читают его в момент вызова.
/* ----------------------------- оргструктура ------------------------------- */
// Реальные юрлица группы Avesto (из iiko / реквизитов).
export const COMPANIES = [
  {
    id: 1,
    name: "«AVESTO CAFE» OK",
    inn: "309235475",
    address: "г. Самарканд, ул. Узбекистанский 37",
    bank: "ЧАКБ «Orient Finans»",
    bik: "01071",
    account: "20208000205484120001",
  },
  {
    id: 2,
    name: "«AVESTO SWEETS» OK",
    inn: "302553964",
    address: "г. Самарканд, ул. Наврузи 15",
    bank: "ЧАКБ «Orient Finans»",
    bik: "01071",
    account: "20208000900208609001",
  },
  {
    id: 3,
    name: "«INTERNATIONAL CATERING GROUP» MChJ",
    inn: "311869139",
    description: "Кейтеринг и выездное обслуживание мероприятий",
    address: "г. Самарканд, МФИ Бунёдкор, ул. Наврузи 15",
    bank: "ЧАКБ «Orient Finans»",
    bik: "01071",
    account: "20208000107192681001",
  },
];
// iikoDept — имя торгового предприятия (Department) в iikoServer,
// нужно для фильтра реальных продаж по конкретному филиалу.
// cash:true — филиал сдаёт ежедневный кассовый отчёт (есть касса/розница).
// Цех и кейтеринг кассу не сдают (нет розничных чеков), поэтому без флага.
export const BRANCHES = [
  {
    id: 1,
    companyId: 1,
    name: "Avesto Cafe — Микрорайон",
    iikoDept: "Микрорайон",
    cash: true,
  },
  {
    id: 2,
    companyId: 1,
    name: "Avesto Cafe — Узбекистанская",
    iikoDept: "Uzbekistanskaya",
    cash: true,
  },
  {
    id: 3,
    companyId: 2,
    name: "Avesto Sweets — Аэропорт",
    iikoDept: "Aeroport",
    cash: true,
  },
  {
    id: 4,
    companyId: 2,
    name: "Avesto Sweets — Наврузий цех",
    iikoDept: "Navruzi Цех",
  },
  {
    id: 5,
    companyId: 2,
    name: "Avesto Sweets — Наврузий Магазин",
    iikoDept: "Наврузи Магазин",
    cash: true,
  },
  {
    id: 6,
    companyId: 3,
    name: "ICG — Кейтеринг (основной)",
    iikoDept: "Кейтеринг (основной)",
  },
];
// Месячные бюджетные лимиты по филиалам (Этап улучшений: контроль перерасхода)
export const BRANCH_BUDGET = {
  1: 500000,
  2: 300000,
  3: 400000,
  4: 250000,
  5: 300000,
  6: 300000,
};

export const USERS = [
  {
    id: "u1",
    name: "Соколов Д. А.",
    role: "director",
    pos: "Генеральный директор",
    level: 1,
    branchId: null,
    parentId: null,
  },
  {
    id: "u2",
    name: "Орлова Е. В.",
    role: "director",
    pos: "Операционный директор",
    level: 1,
    branchId: null,
    parentId: "u1",
  },
  {
    id: "u3",
    name: "Иванова М. П.",
    role: "finance",
    pos: "Финансист",
    level: 2,
    branchId: null,
    parentId: "u1",
  },
  {
    id: "u4",
    name: "Ахмедов И. О.",
    role: "manager",
    pos: "Управляющий филиалом",
    level: 2,
    branchId: 3,
    parentId: "u2",
  },
  {
    id: "u5",
    name: "Кузнецов П. С.",
    role: "manager",
    pos: "Управляющий филиалом",
    level: 2,
    branchId: 2,
    parentId: "u2",
  },
  {
    id: "u6",
    name: "Петров А. И.",
    role: "sysadmin",
    pos: "Системный администратор",
    level: 3,
    branchId: 3,
    parentId: "u4",
  },
  {
    id: "u7",
    name: "Смирнов В. Н.",
    role: "staff",
    pos: "Техник",
    level: 3,
    branchId: 2,
    parentId: "u5",
  },
  {
    id: "u8",
    name: "Васильева О. К.",
    role: "accountant",
    pos: "Бухгалтер",
    level: 3,
    branchId: 1,
    parentId: "u3",
  },
  {
    id: "u9",
    name: "Новиков Р. Т.",
    role: "staff",
    pos: "Линейный сотрудник",
    level: 4,
    branchId: 3,
    parentId: "u4",
  },
  {
    id: "u10",
    name: "Морозов А. Л.",
    role: "manager",
    pos: "Управляющий филиалом",
    level: 2,
    branchId: 4,
    parentId: "u2",
  },
  {
    id: "u11",
    name: "Зайцев К. В.",
    role: "staff",
    pos: "Техник",
    level: 3,
    branchId: 4,
    parentId: "u10",
  },
  {
    id: "u12",
    name: "Тошматов Ж. Б.",
    role: "staff",
    pos: "Заведующий складом",
    level: 3,
    branchId: 3,
    parentId: "u4",
  },
  {
    id: "u13",
    name: "Каримова Д. А.",
    role: "staff",
    pos: "Оператор iiko",
    level: 3,
    branchId: 3,
    parentId: "u4",
  },
  {
    id: "u14",
    name: "Сидорова Л. И.",
    role: "accountant",
    pos: "Старший бухгалтер",
    level: 2,
    branchId: 1,
    parentId: "u3",
  },
  {
    id: "u15",
    name: "Юсупова Г. М.",
    role: "finance",
    pos: "Главный бухгалтер",
    level: 2,
    branchId: null,
    parentId: "u3",
  },
];
export const POSITIONS = [
  { id: "p1", title: "Генеральный директор", level: 1 },
  { id: "p2", title: "Операционный директор", level: 1 },
  { id: "p3", title: "Финансист", level: 2 },
  { id: "p4", title: "Управляющий филиалом", level: 2 },
  { id: "p5", title: "Бухгалтер", level: 3 },
  { id: "p6", title: "Системный администратор", level: 3 },
  { id: "p7", title: "Техник", level: 3 },
  { id: "p8", title: "Линейный сотрудник", level: 4 },
  { id: "p9", title: "Заведующий складом", level: 3 },
  { id: "p10", title: "Оператор iiko", level: 3 },
  { id: "p11", title: "Старший бухгалтер", level: 2 },
  { id: "p12", title: "Главный бухгалтер", level: 2 },
];
export const DEFAULT_SLA = { Критический: 2, Высокий: 8, Обычный: 24 };
export const SOP_STEPS = {
  "IT-поддержка": [
    "Диагностировать проблему",
    "Проверить питание и подключение",
    "Устранить сбой или заменить узел",
    "Проверить работу вместе с пользователем",
    "Прикрепить фото/скрин результата",
  ],
  "Ремонт оборудования": [
    "Осмотреть оборудование, зафиксировать неисправность",
    "Устранить неисправность",
    "Проверить работу после ремонта",
    "Прикрепить фотоотчёт (через камеру)",
  ],
  "Финансы / Закупка": [
    "Сверить сумму со счётом",
    "Проверить бюджетный лимит филиала",
    "Приложить скан счёта",
    "Дождаться согласования",
  ],
  Прочее: [
    "Выполнить задачу",
    "Зафиксировать результат",
    "Прикрепить подтверждение",
  ],
};
export const DEFAULT_SOPS = Object.fromEntries(
  Object.entries(SOP_STEPS).map(([k, v]) => [
    k,
    { steps: v, requirePhoto: true },
  ]),
);

// Отделы (границы доступа). restricted = закрытый отдел: его задачи видны
// только сотрудникам этого отдела, финансам и высшему руководству.
export const DEPARTMENTS = [
  { id: "d1", name: "Финансовый отдел", restricted: true },
  { id: "d2", name: "IT-отдел", restricted: false },
  { id: "d3", name: "Эксплуатация", restricted: false },
  { id: "d4", name: "Снабжение", restricted: false },
  { id: "d5", name: "Управление", restricted: false },
];
// Какой отдел отвечает за категорию задачи (используется при создании заявки)
export const CAT_DEPT = {
  "IT-поддержка": "d2",
  "Ремонт оборудования": "d3",
  "Финансы / Закупка": "d1",
  Прочее: "d4",
};
// Привязка демо-сотрудников к отделам

// Шаблоны процессов (маршруты согласования) — упорядоченные шаги с ответственными.
export const ROUTE_TEMPLATES = [
  {
    id: "r1",
    name: "Приёмка товара и оплата",
    category: "Финансы / Закупка",
    steps: [
      {
        title: "Приёмка товара",
        actor: "Заведующий складом",
        action: "Принял товар",
        photo: true,
        doc: false,
      },
      {
        title: "Приходная накладная",
        actor: "Оператор iiko",
        action: "Оформил приходную накладную",
        photo: false,
        doc: true,
        docLabel: "Приходная накладная",
      },
      {
        title: "Проверка оприходования",
        actor: "Старший бухгалтер",
        action: "Проверил оприходование",
        photo: false,
        doc: false,
        check: true,
      },
      {
        title: "Проверка и оплата",
        actor: "Главный бухгалтер",
        action: "Проверил всё и провёл оплату",
        photo: false,
        doc: true,
        docLabel: "Счёт-фактура",
        check: true,
        pay: true,
      },
    ],
  },
];
export function assignByActor(actor, branchId) {
  const cands = ORG.users.filter((u) => u.pos === actor && u.active !== false);
  return (
    cands.find((u) => u.branchId === branchId) ||
    cands[0] ||
    ORG.users[0]
  )?.id;
}

// Живой реестр оргструктуры: редактируется в Админ-панели, читается хелперами.
export let ORG = {
  companies: COMPANIES,
  branches: BRANCHES,
  positions: POSITIONS,
  users: USERS,
  departments: DEPARTMENTS,
  catDept: CAT_DEPT,
  routes: ROUTE_TEMPLATES,
  budgets: BRANCH_BUDGET,
  sla: DEFAULT_SLA,
  sops: DEFAULT_SOPS,
};
export function syncOrg(s) {
  if (!s) return;
  ORG = {
    companies: s.companies || COMPANIES,
    branches: s.branches || BRANCHES,
    positions: s.positions || POSITIONS,
    users: s.users || USERS,
    departments: s.departments || DEPARTMENTS,
    catDept: s.catDept || CAT_DEPT,
    routes: s.routes || ROUTE_TEMPLATES,
    budgets: s.budgets || BRANCH_BUDGET,
    sla: s.sla || DEFAULT_SLA,
    sops: s.sops || DEFAULT_SOPS,
  };
}
export const userById = (id) => ORG.users.find((u) => u.id === id);
export const branchById = (id) => ORG.branches.find((b) => b.id === id);
export const companyOfBranch = (id) => {
  const b = branchById(id);
  return b ? ORG.companies.find((c) => c.id === b.companyId) : null;
};
export const deptById = (id) => ORG.departments.find((d) => d.id === id);
export const deptForCategory = (cat) => ORG.catDept[cat] || "d4";
export const budgetFor = (id) => ORG.budgets[id] || 0;
export const slaFor = (pr) => (ORG.sla[pr] != null ? ORG.sla[pr] : 24);
export const sopFor = (cat) =>
  ORG.sops[cat] || ORG.sops["Прочее"] || { steps: [], requirePhoto: false };

// Роли CRM для выпадающих списков (профиль, кадры, доступы).
export const ROLE_OPTS = [
  ["owner", "Владелец системы"],
  ["vendor", "Команда продаж (Back Office)"],
  ["director", "Руководство"],
  ["finance", "Финансист"],
  ["manager", "Управляющий"],
  ["accountant", "Бухгалтер"],
  ["sysadmin", "Сист. администратор"],
  ["staff", "Сотрудник"],
];
