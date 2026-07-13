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
} from "lucide-react";

/* ------------------------- навигация и шапка ------------------------------- */
export const NAV = [
  {
    key: "dashboard",
    label: "Сводка дня",
    icon: LayoutDashboard,
    roles: ["director", "finance", "manager", "accountant", "sysadmin"],
  },
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

export const VIEW_TITLE = {
  backoffice: "Back Office · управление продуктом",
  dashboard: "Сводка дня — как идут дела",
  inbox: "Входящие задачи",
  create: "Создать заявку",
  me: "Мои достижения",
  archive: "Архив задач",
  analytics: "Аналитика — кабина директора",
  time: "Учёт рабочего времени",
  cash: "Кассы филиалов",
  money: "Учёт и контроль денег",
  sales: "Аналитика продаж",
  production: "Производство",
  checklists: "Чек-листы смены",
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
