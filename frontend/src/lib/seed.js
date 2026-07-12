// Стартовое локальное состояние: только справочники-конфигурация (филиалы,
// юр.лица, отделы, маршруты, SLA). Рабочие данные приходят из реальной
// работы и с сервера.
import {
  COMPANIES,
  BRANCHES,
  BRANCH_BUDGET,
  POSITIONS,
  DEFAULT_SLA,
  DEFAULT_SOPS,
  DEPARTMENTS,
  CAT_DEPT,
  ROUTE_TEMPLATES,
} from "../lib/org.js";

/* ----------------------------- демо-данные -------------------------------- */
export function makeSeed() {
  // Продакшн-старт: демо-данные (сотрудники, задачи, кассы, табель) НЕ заводим —
  // они появляются из реальной работы и синхронизации кадров с iiko. Оставляем
  // только справочники-конфигурацию: филиалы, юр.лица, отделы, маршруты, SLA.
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
