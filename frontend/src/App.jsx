import React, {
  useState,
  useEffect,
  useMemo,
  useReducer,
  lazy,
  Suspense,
} from "react";
import { Building2, Archive, X, Info, Loader2 } from "lucide-react";
import { apiGet, apiPost } from "./api.js";
import { FONT, C } from "./lib/theme.js";
import { NiceSelect, ScrollTopButton } from "./components/ui.jsx";
import { usePersisted } from "./lib/hooks.js";
import { detectAnomalies, visibleTasks, applyFilters } from "./lib/tasks.js";
import {
  NOTIFY_TARGETS,
  DEFAULT_RULES,
  triggerLabel,
  triggerMatches,
  makeFollowupTask,
} from "./lib/automation.js";
import { init, reducer, store } from "./lib/store.js";
import { NAV, navAllowed, VIEW_TITLE, setAccessOverrides } from "./lib/nav.js";
import { Sidebar, BottomNav, MoreSheet, TopBar } from "./components/layout.jsx";
import Board, { TaskDetail, CreatePage } from "./pages/Tasks.jsx";
import { syncLang, tr } from "./lib/i18n.js";
import { uid } from "./lib/format.js";
import { syncOrg, userById, branchById } from "./lib/org.js";

// Ленивая загрузка экранов: браузер получает код раздела при первом входе в
// него, а не весь бандл сразу. Задачи (Board/TaskDetail) — стартовый экран,
// они загружаются сразу вместе с каркасом.
const TimesheetView = lazy(() => import("./pages/Timesheet.jsx"));
const ShiftChecklistsView = lazy(() => import("./pages/ShiftChecklists.jsx"));
const CashRegisterView = lazy(() => import("./pages/CashRegister.jsx"));
const MoneyView = lazy(() => import("./pages/Money.jsx"));
const SalesAnalytics = lazy(() => import("./pages/SalesAnalytics.jsx"));
const Analytics = lazy(() => import("./pages/Analytics.jsx"));
const PersonalAchievements = lazy(() => import("./pages/Achievements.jsx"));
const OrgStructure = lazy(() => import("./pages/OrgStructure.jsx"));
const ArchiveView = lazy(() => import("./pages/Archive.jsx"));
const AboutView = lazy(() => import("./pages/About.jsx"));
const AutomationView = lazy(() => import("./pages/Automation.jsx"));
const AdminPanel = lazy(() => import("./admin/Admin.jsx"));
const BackOfficeView = lazy(() => import("./pages/BackOffice.jsx"));
const DashboardView = lazy(() => import("./pages/Dashboard.jsx"));
const StaffKpiView = lazy(() => import("./pages/StaffKpi.jsx"));
const DdsView = lazy(() => import("./pages/Dds.jsx"));
const PayrollView = lazy(() => import("./pages/Payroll.jsx"));
const FoodCostView = lazy(() => import("./pages/FoodCost.jsx"));
const ProcurementView = lazy(() => import("./pages/Procurement.jsx"));
const CvmView = lazy(() => import("./pages/Cvm.jsx"));
const PlanView = lazy(() => import("./pages/Plan.jsx"));
const SetupWizard = lazy(() => import("./components/SetupWizard.jsx"));
const TodoManagerView = lazy(() => import("./pages/TodoManager.jsx"));
const CakeConstructor = lazy(() => import("./CakeConstructor.jsx"));
const IikoProduction = lazy(() => import("./IikoProduction.jsx"));

// Заглушка на время подгрузки кода раздела.
function ViewLoader() {
  return (
    <div
      className="flex flex-col items-center justify-center gap-3"
      style={{ minHeight: 240, color: C.faint }}
    >
      <Loader2 size={26} className="animate-spin" style={{ color: C.brandA }} />
      <span style={{ fontWeight: 600, fontSize: 14 }}>Загрузка раздела…</span>
    </div>
  );
}

/* ============================================================================
   Avesto Group CRM System  (интерактивный прототип, MVP)
   Реализует 5 фаз заявок, роли Исполнитель/Контролёр, неизменяемый журнал,
   SLA-таймеры, смены, SOP-чек-листы, контроль бюджетов, ИИ-маршрутизацию,
   поиск аномалий, дашборд директора и личную аналитику сотрудника.
   ============================================================================ */

/* ------------------------------ приложение --------------------------------- */
export default function App({ authUser, onLogout }) {
  const [s, dispatch] = useReducer(reducer, undefined, init);

  // Конфигурация организации с сервера (филиалы, юрлица, бренд): источник
  // правды один для веба и Telegram-бота. Ошибка сети не мешает работе —
  // остаются локальные значения.
  useEffect(() => {
    apiGet("/api/org")
      .then((config) => dispatch({ type: "ORG_CONFIG", config }))
      .catch(() => {});
    // Флаги модулей: включены владельцем в Back Office — от них зависит
    // видимость разделов клиента (например, «Чек-листы» в админке).
    apiGet("/api/modules")
      .then((m) => dispatch({ type: "MODULES", flags: m.flags || {} }))
      .catch(() => {});
    // Настройка доступа по ролям (сисадмин задаёт в админке) — применяем к
    // навигации и сохраняем в store для экрана настройки.
    apiGet("/api/access")
      .then((a) => {
        setAccessOverrides(a.overrides || {});
        dispatch({ type: "ACCESS_CONFIG", access: a || { overrides: {} } });
      })
      .catch(() => {});
    // Отделы и маршрутизация категорий (настраиваются в админке, хранятся на
    // сервере) — от них зависит видимость задач по отделам.
    apiGet("/api/departments")
      .then((d) => dispatch({ type: "DEPT_CONFIG", config: d }))
      .catch(() => {});
  }, []);
  const [now, setNow] = useState(Date.now());
  const [toast, setToast] = useState(null);
  const [hint, setHint] = useState(true);
  const [moreOpen, setMoreOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
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
        // Рабочий филиал сотрудника (id из оргконфигурации, задаётся в админке).
        // Привязанный сотрудник видит только данные своего филиала; без привязки
        // (null) — по роли. Старшие роли всё равно выбирают филиал сами.
        // Fail-closed: некорректное значение (NaN, ≤0) НЕ снимает ограничение —
        // трактуем как «без привязки», а не «все филиалы».
        branchId: (() => {
          const n = Number(authUser.branch);
          return Number.isInteger(n) && n > 0 ? n : null;
        })(),
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
  // Мастер первого запуска: показываем один раз директору/сисадмину, если ещё
  // не завершали (флаг в localStorage). Дальше — по кнопке в «Оргструктуре».
  useEffect(() => {
    if (!["director", "sysadmin"].includes(me.role)) return;
    let done = false;
    try {
      done = localStorage.getItem("avesto.setup.done") === "1";
    } catch {
      done = true; // нет доступа к localStorage — не навязываем мастер
    }
    if (!done) setWizardOpen(true);
  }, [me.role]);
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
        // Ярче и «сочнее»: светлее база, заметнее золотое свечение по краям.
        background:
          "radial-gradient(1100px 640px at 4% -12%, rgba(228,169,60,0.42), transparent 56%)," +
          "radial-gradient(1000px 700px at 104% -4%, rgba(123,45,31,0.24), transparent 54%)," +
          "radial-gradient(940px 640px at 92% 108%, rgba(230,150,60,0.30), transparent 56%)," +
          "radial-gradient(1000px 900px at 30% 118%, rgba(124,58,237,0.10), transparent 58%)," +
          "linear-gradient(180deg, #FBF6EC 0%, #F1E7D4 100%)",
        backgroundAttachment: "fixed",
      }}
    >
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Manrope:wght@400;500;600;700;800&display=swap');
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
        /* Серифный «плакатный» шрифт для крупных цифр и заголовков */
        .serif{font-family:'Fraunces','Iowan Old Style',Palatino,Georgia,serif;font-optical-sizing:auto}
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
        /* Скелетон загрузки: мягкий перелив (shimmer) вместо голого «Загрузка…» */
        @keyframes shimmer{100%{transform:translateX(100%)}}
        .skeleton{position:relative;overflow:hidden;background:#EFEAE1}
        .skeleton::after{content:"";position:absolute;inset:0;transform:translateX(-100%);background:linear-gradient(90deg,transparent,rgba(255,255,255,.6),transparent);animation:shimmer 1.4s infinite}
        /* Мягкое «парение» иконки в пустых состояниях */
        @keyframes floatSoft{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
        .float-soft{animation:floatSoft 3.2s ease-in-out infinite}
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
        <Sidebar
          view={s.view}
          setView={setView}
          role={me.role}
          brandName={s.brandName}
        />
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
            <Suspense fallback={<ViewLoader />}>
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
                    {filtered.filter((t) => t.phase < 5).length}{" "}
                    {tr("активных")}
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
              {s.view === "dashboard" &&
                navAllowed(
                  { roles: NAV.find((n) => n.key === "dashboard").roles },
                  me.role,
                ) && <DashboardView me={me} dispatch={dispatch} />}
              {s.view === "staffkpi" &&
                navAllowed(
                  { roles: NAV.find((n) => n.key === "staffkpi").roles },
                  me.role,
                ) && <StaffKpiView />}
              {s.view === "dds" &&
                navAllowed(
                  { roles: NAV.find((n) => n.key === "dds").roles },
                  me.role,
                ) && <DdsView />}
              {s.view === "payroll" &&
                navAllowed(
                  { roles: NAV.find((n) => n.key === "payroll").roles },
                  me.role,
                ) && <PayrollView notify={notify} role={me.role} />}
              {s.view === "foodcost" &&
                navAllowed(
                  { roles: NAV.find((n) => n.key === "foodcost").roles },
                  me.role,
                ) && <FoodCostView notify={notify} role={me.role} />}
              {s.view === "plan" &&
                navAllowed(
                  { roles: NAV.find((n) => n.key === "plan").roles },
                  me.role,
                ) && <PlanView notify={notify} role={me.role} />}
              {s.view === "procurement" &&
                navAllowed(
                  { roles: NAV.find((n) => n.key === "procurement").roles },
                  me.role,
                ) && <ProcurementView notify={notify} role={me.role} />}
              {s.view === "cvm" &&
                navAllowed(
                  { roles: NAV.find((n) => n.key === "cvm").roles },
                  me.role,
                ) && <CvmView notify={notify} role={me.role} />}
              {s.view === "todos" && <TodoManagerView notify={notify} />}
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
              {s.view === "org" && (
                <div className="space-y-4">
                  {["director", "sysadmin"].includes(me.role) && (
                    <button
                      onClick={() => setWizardOpen(true)}
                      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 font-bold text-white"
                      style={{ background: "#7B2D1F", fontSize: 13 }}
                    >
                      ✨ Мастер настройки
                    </button>
                  )}
                  <OrgStructure />
                </div>
              )}
              {s.view === "about" && <AboutView />}
              {s.view === "backoffice" &&
                ["owner", "vendor"].includes(me.role) && (
                  <BackOfficeView me={me} notify={notify} />
                )}
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
            </Suspense>
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
        role={me.role}
        view={s.view}
        setView={setView}
      />
      {wizardOpen && (
        <Suspense fallback={null}>
          <SetupWizard
            onClose={() => setWizardOpen(false)}
            dispatch={dispatch}
            notify={notify}
          />
        </Suspense>
      )}

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
