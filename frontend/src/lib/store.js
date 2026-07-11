// Локальное состояние приложения: init/reducer + сохранение в localStorage.
// Источник правды по деньгам/кадрам — бэкенд и iiko; здесь UI-состояние.
import { uid } from "../lib/format.js";
import { makeSeed } from "../lib/seed.js";
import { hist, routePhase } from "../lib/tasks.js";

export const STORAGE_KEY = "avesto.crm.v11"; // продакшн-старт без демо-данных — старые локальные данные (демо) игнорируются

export function init() {
  return {
    ...makeSeed(),
    view: "inbox",
    selectedId: null,
    filters: { company: "all", branch: "all", period: "all" },
    hydrated: false,
  };
}

export function reducer(s, a) {
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

/* ----------------------------- персистентность ----------------------------- */
export const store = {
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
