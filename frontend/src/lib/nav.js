// Навигация: пункты меню, доступ по ролям и заголовки экранов.
import {
  Inbox,
  PlusCircle,
  BarChart3,
  Building2,
  Settings,
  Archive,
  Clock,
  Bot,
  Info,
  Award,
  ListChecks,
  TrendingUp,
  FileText,
  Wallet,
  Banknote,
  Check,
  Cake,
  Briefcase,
  LayoutDashboard,
  Users,
  Percent,
  Target,
  ListTodo,
  PackageSearch,
} from "lucide-react";

/* ------------------------- навигация и шапка ------------------------------- */
export const NAV = [
  {
    key: "dashboard",
    label: "Сводка дня",
    icon: LayoutDashboard,
    roles: ["director", "finance", "manager", "accountant", "sysadmin"],
  },
  { key: "todos", label: "Менеджер задач", icon: ListTodo, roles: "all" },
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
    key: "dds",
    label: "ДДС (движение денег)",
    icon: TrendingUp,
    roles: ["director", "finance", "accountant", "sysadmin"],
  },
  {
    key: "payroll",
    label: "ФОТ / Зарплата",
    icon: Banknote,
    roles: ["director", "finance", "accountant", "sysadmin"],
  },
  {
    key: "foodcost",
    label: "Себестоимость (food cost)",
    icon: Percent,
    roles: ["director", "finance", "accountant", "sysadmin"],
  },
  {
    key: "procurement",
    label: "Закупки и склад",
    icon: PackageSearch,
    roles: ["director", "finance", "manager", "accountant", "sysadmin"],
  },
  {
    key: "sales",
    label: "Аналитика продаж",
    icon: TrendingUp,
    roles: ["director", "finance", "manager", "accountant", "sysadmin"],
  },
  {
    key: "plan",
    label: "Планы и цели (план-факт)",
    icon: Target,
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
    key: "staffkpi",
    label: "KPI сотрудников",
    icon: Users,
    roles: ["director", "finance", "manager", "accountant", "sysadmin"],
  },
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
  {
    key: "backoffice",
    label: "Back Office",
    icon: Briefcase,
    roles: ["owner", "vendor"],
  },
  { key: "about", label: "О системе", icon: Info, roles: "all" },
  { key: "admin", label: "Админ-панель", icon: Settings, roles: ["sysadmin"] },
];

// Оверрайды доступа по ролям (настраиваются сисадмином в админке, живут на
// сервере): { role: { sectionKey: bool } }. Обновляются из App через
// setAccessOverrides — navAllowed сохраняет прежнюю сигнатуру для всех мест
// вызова (Sidebar/BottomNav/MoreSheet/переключатель экранов).
let ACCESS_OVERRIDES = {};
export function setAccessOverrides(o) {
  ACCESS_OVERRIDES = o && typeof o === "object" ? o : {};
}

// Доступ по умолчанию — по ролям в определении пункта.
function defaultAllowed(item, role) {
  if (role === "owner") return true;
  if (role === "vendor")
    return item.key === "backoffice" || item.key === "about";
  return (
    item.roles === "all" ||
    (Array.isArray(item.roles) && item.roles.includes(role))
  );
}

export const navAllowed = (item, role) => {
  // Back Office и «О системе» — вне настройки клиента (служебные разделы
  // владельца/системы, их нельзя отобрать/выдать через клиентскую админку).
  if (item.key === "backoffice") return defaultAllowed(item, role);
  const roleOv = ACCESS_OVERRIDES[role];
  if (roleOv && Object.prototype.hasOwnProperty.call(roleOv, item.key)) {
    return Boolean(roleOv[item.key]);
  }
  return defaultAllowed(item, role);
};

// Группировка разделов в компактное меню: вместо длинного плоского списка —
// несколько крупных сворачиваемых групп. Порядок групп = порядок в меню.
// «Сводка дня» остаётся отдельным верхним пунктом, «Back Office» — отдельным
// нижним (служебный). Всё остальное распределено по группам; любой пункт NAV,
// не попавший в группу, показывается верхним уровнем (страховка при добавлении
// новых разделов).
export const NAV_GROUPS = [
  {
    key: "tasks",
    label: "Задачи",
    icon: Inbox,
    items: ["todos", "inbox", "create", "me", "archive"],
  },
  {
    key: "finance",
    label: "Финансы",
    icon: Wallet,
    items: ["cash", "money", "dds", "payroll", "foodcost", "procurement"],
  },
  {
    key: "analytics",
    label: "Аналитика",
    icon: BarChart3,
    items: ["analytics", "sales", "plan", "reports"],
  },
  {
    key: "staff",
    label: "Персонал",
    icon: Users,
    items: ["checklists", "staffkpi", "time"],
  },
  {
    key: "ops",
    label: "Производство",
    icon: ListChecks,
    items: ["production", "cakes"],
  },
  {
    key: "company",
    label: "Компания и настройки",
    icon: Settings,
    items: ["org", "automation", "admin", "about"],
  },
];

const SOLO_TOP = ["dashboard"]; // всегда верхним уровнем, перед группами
const SOLO_BOTTOM = ["backoffice"]; // служебный, после групп
const NAV_BY_KEY = Object.fromEntries(NAV.map((n) => [n.key, n]));

// Собрать меню под роль: массив секций { type:'solo', item } либо
// { type:'group', key, label, icon, items:[...] }. В группы попадают только
// доступные пользователю пункты; пустые группы опускаются.
export function navSections(role) {
  const pick = (key) => {
    const item = NAV_BY_KEY[key];
    return item && navAllowed(item, role) ? item : null;
  };
  const sections = [];
  const placed = new Set([...SOLO_TOP, ...SOLO_BOTTOM]);

  for (const key of SOLO_TOP) {
    const it = pick(key);
    if (it) sections.push({ type: "solo", item: it });
  }
  for (const g of NAV_GROUPS) {
    g.items.forEach((k) => placed.add(k));
    const items = g.items.map(pick).filter(Boolean);
    if (items.length)
      sections.push({
        type: "group",
        key: g.key,
        label: g.label,
        icon: g.icon,
        items,
      });
  }
  // Пункты, не попавшие ни в группу/соло — верхним уровнем (страховка).
  for (const n of NAV) {
    if (!placed.has(n.key) && navAllowed(n, role)) {
      placed.add(n.key);
      sections.push({ type: "solo", item: n });
    }
  }
  for (const key of SOLO_BOTTOM) {
    const it = pick(key);
    if (it) sections.push({ type: "solo", item: it });
  }
  return sections;
}

// Ключ группы, содержащей раздел view (или null, если раздел верхнего уровня).
export function groupOfView(view) {
  const g = NAV_GROUPS.find((gr) => gr.items.includes(view));
  return g ? g.key : null;
}

export const VIEW_TITLE = {
  backoffice: "Back Office · управление продуктом",
  dashboard: "Сводка дня — как идут дела",
  todos: "Менеджер задач — доска и список",
  inbox: "Входящие задачи",
  create: "Создать заявку",
  me: "Мои достижения",
  archive: "Архив задач",
  analytics: "Аналитика — кабина директора",
  time: "Учёт рабочего времени",
  cash: "Кассы филиалов",
  money: "Учёт и контроль денег",
  dds: "ДДС — движение денежных средств",
  payroll: "ФОТ — зарплатная ведомость",
  foodcost: "Себестоимость — food cost и маржа",
  procurement: "Закупки и склад — цены, остатки, движение",
  plan: "Планы и цели — план-факт по филиалам",
  sales: "Аналитика продаж",
  production: "Производство",
  checklists: "Чек-листы смены",
  staffkpi: "KPI сотрудников — дисциплина по чек-листам",
  cakes: "Конструктор тортов",
  reports: "Отчёты",
  org: "Оргструктура и филиалы",
  about: "О системе",
  admin: "Админ-панель",
  automation: "Автоматизация процессов",
};

// Короткие подписи для нижней панели (узкие экраны)
export const NAV_SHORT = {
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
