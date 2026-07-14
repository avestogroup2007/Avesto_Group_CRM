// Дашборд руководителя: «как идут дела сегодня» одним экраном. Собирает данные
// с сервера (/api/dashboard): касса по филиалам и расхождения с iiko, расходы
// на согласовании, чек-листы, алерты. Управляющий видит свой филиал, офис —
// все. Клики по разделам ведут в соответствующие экраны.
import { useState, useEffect } from "react";
import {
  RefreshCw,
  AlertTriangle,
  Wallet,
  Banknote,
  ClipboardList,
  ArrowRight,
  Target,
  ListTodo,
} from "lucide-react";
import { apiGet } from "../api.js";
import { C } from "../lib/theme.js";
import { Kpi, CountUp, Skeleton, EmptyState } from "../components/ui.jsx";

const money = (n) => Number(n || 0).toLocaleString("ru-RU");
const curMonth = () =>
  new Date()
    .toLocaleDateString("en-CA", { timeZone: "Asia/Tashkent" })
    .slice(0, 7);

const CASH_STATUS = {
  none: { label: "Не сдана", bg: "#FEE2E2", fg: "#DC2626" },
  submitted: { label: "Сдана", bg: "#FEF3C7", fg: "#B45309" },
  confirmed: { label: "Подтверждена", bg: "#DCFCE7", fg: "#15803D" },
};
const SEV = {
  bad: { bg: "#FEE2E2", fg: "#DC2626", icon: "🔴" },
  warn: { bg: "#FEF3C7", fg: "#B45309", icon: "🟡" },
};

export default function DashboardView({ dispatch }) {
  const [data, setData] = useState(null);
  const [plan, setPlan] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const load = () => {
    setLoading(true);
    // План-факт месяца — best-effort: сбой не мешает основной сводке.
    apiGet(`/api/plan?month=${curMonth()}`)
      .then((p) => setPlan(p))
      .catch(() => setPlan(null));
    apiGet("/api/dashboard")
      .then((d) => {
        setData(d);
        setErr("");
      })
      .catch((e) => setErr(e.message || "Не удалось загрузить"))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load();
  }, []);
  const go = (view) => dispatch && dispatch({ type: "SET_VIEW", view });

  if (loading && !data) {
    // Скелетон сводки вместо голого текста — заголовок, 4 KPI и блок таблицы.
    return (
      <div className="space-y-4">
        <Skeleton height={22} width={220} />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-2xl bg-white p-4"
              style={{ border: `1px solid ${C.border}` }}
            >
              <Skeleton height={12} width={90} />
              <div className="mt-2">
                <Skeleton height={26} width={120} />
              </div>
            </div>
          ))}
        </div>
        <Skeleton height={140} radius={16} />
      </div>
    );
  }
  if (err && !data) {
    return <div style={{ color: C.bad, fontSize: 14 }}>{err}</div>;
  }
  const t = data.totals;
  const shortage = t.discrepancy < 0;

  return (
    <div className="space-y-4">
      {/* Шапка */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-bold" style={{ color: C.ink, fontSize: 18 }}>
            Сводка за {data.date}
          </h2>
          <div style={{ color: C.sub, fontSize: 12.5 }}>
            {data.scope === "branch"
              ? "Ваш филиал"
              : `Филиалов сдали кассу: ${t.branchesReported}/${t.branchesTotal}`}
          </div>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 font-semibold"
          style={{
            border: `1px solid ${C.border}`,
            color: C.sub,
            fontSize: 13,
          }}
        >
          <RefreshCw size={14} /> Обновить
        </button>
      </div>

      {/* KPI-строка */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Kpi
          label="Касса за день, сум"
          value={<CountUp to={t.declared} format={money} />}
          tone={C.brandB}
        />
        <Kpi
          label="По iiko, сум"
          value={<CountUp to={t.iiko} format={money} />}
          tone={C.brandA}
        />
        <Kpi
          label={shortage ? "Недостача, сум" : "Расхождение, сум"}
          value={<CountUp to={Math.abs(t.discrepancy)} format={money} />}
          tone={t.discrepancy !== 0 ? (shortage ? C.bad : C.ok) : C.faint}
        />
        <Kpi
          label="Расходов на согласовании"
          value={<CountUp to={data.pendingExpenses.count} />}
          tone={data.pendingExpenses.count ? C.bad : C.faint}
        />
      </div>

      {/* Задачи команды */}
      {data.todos && (
        <button
          onClick={() => go("todos")}
          className="lift w-full rounded-2xl bg-white p-4 flex items-center gap-3 text-left"
          style={{ border: `1px solid ${C.border}` }}
        >
          <div
            className="rounded-lg p-2 shrink-0"
            style={{ background: "#F5F3FF" }}
          >
            <ListTodo size={18} style={{ color: C.brandA }} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-bold" style={{ color: C.ink, fontSize: 14 }}>
              Задачи команды
            </div>
            <div style={{ fontSize: 12.5, color: C.sub }}>
              Активных: <b style={{ color: C.ink }}>{data.todos.active}</b>
              {data.todos.overdue > 0 ? (
                <>
                  {" · "}
                  <b style={{ color: C.bad }}>
                    просрочено {data.todos.overdue}
                  </b>
                </>
              ) : (
                " · просрочек нет"
              )}
            </div>
          </div>
          <ArrowRight size={15} style={{ color: C.brandA }} />
        </button>
      )}

      {/* План-факт месяца */}
      {plan && <PlanMonthBlock plan={plan} onOpen={() => go("plan")} />}

      {/* Алерты */}
      {data.alerts.length > 0 && (
        <div
          className="rounded-2xl bg-white p-4"
          style={{ border: `1px solid ${C.border}` }}
        >
          <h3
            className="font-bold mb-2 flex items-center gap-2"
            style={{ color: C.ink, fontSize: 15 }}
          >
            <AlertTriangle size={17} style={{ color: C.bad }} />
            Требует внимания ({data.alerts.length})
          </h3>
          <div className="space-y-1.5">
            {data.alerts.map((a, i) => {
              const meta = SEV[a.severity] || SEV.warn;
              return (
                <div
                  key={i}
                  className="flex items-center gap-2 rounded-lg px-3 py-2"
                  style={{ background: meta.bg }}
                >
                  <span>{meta.icon}</span>
                  <span
                    style={{ color: meta.fg, fontSize: 13, fontWeight: 600 }}
                  >
                    {a.text}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Таблица по филиалам */}
      <div
        className="rounded-2xl bg-white p-4 sm:p-5"
        style={{ border: `1px solid ${C.border}` }}
      >
        <div className="flex items-center justify-between mb-2">
          <h3
            className="font-bold flex items-center gap-2"
            style={{ color: C.ink, fontSize: 15 }}
          >
            <Wallet size={17} style={{ color: C.brandA }} /> Касса по филиалам
          </h3>
          <button
            onClick={() => go("cash")}
            className="inline-flex items-center gap-1 text-sm font-semibold"
            style={{ color: C.brandA, fontSize: 12.5 }}
          >
            Открыть кассы <ArrowRight size={13} />
          </button>
        </div>
        {data.rows.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="Пока нет данных по кассам"
            hint="Как только филиалы сдадут кассу за день, здесь появится сверка с iiko."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full" style={{ fontSize: 12.5 }}>
              <thead>
                <tr style={{ color: C.faint, textAlign: "left" }}>
                  <th className="pb-2 pr-2 font-semibold">Филиал</th>
                  <th className="pb-2 pr-2 font-semibold">Касса</th>
                  <th className="pb-2 pr-2 font-semibold text-right">
                    Заявлено
                  </th>
                  <th className="pb-2 pr-2 font-semibold text-right">iiko</th>
                  <th className="pb-2 pr-2 font-semibold text-right">
                    Расхожд.
                  </th>
                  <th className="pb-2 font-semibold text-right">Чек-листы</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => {
                  const st = CASH_STATUS[row.cashStatus] || CASH_STATUS.none;
                  const disc = row.discrepancy;
                  return (
                    <tr
                      key={row.branchId}
                      style={{ borderTop: `1px solid ${C.line}` }}
                    >
                      <td
                        className="py-2 pr-2"
                        style={{ color: C.ink, fontWeight: 600 }}
                      >
                        {row.branch}
                      </td>
                      <td className="py-2 pr-2">
                        <span
                          className="rounded-full px-2 py-0.5"
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            background: st.bg,
                            color: st.fg,
                          }}
                        >
                          {st.label}
                        </span>
                      </td>
                      <td
                        className="py-2 pr-2 text-right"
                        style={{ color: C.ink }}
                      >
                        {money(row.declared)}
                      </td>
                      <td
                        className="py-2 pr-2 text-right"
                        style={{ color: C.sub }}
                      >
                        {money(row.iiko)}
                      </td>
                      <td
                        className="py-2 pr-2 text-right"
                        style={{
                          color:
                            disc === 0 ? C.faint : disc < 0 ? C.bad : "#15803D",
                          fontWeight: 700,
                        }}
                      >
                        {disc === 0
                          ? "—"
                          : `${disc > 0 ? "+" : ""}${money(disc)}`}
                      </td>
                      <td className="py-2 text-right">
                        {row.checklistPct == null ? (
                          <span style={{ color: C.faint }}>—</span>
                        ) : (
                          <span
                            style={{
                              fontWeight: 700,
                              color:
                                row.checklistPct >= 80 ? "#15803D" : "#B45309",
                            }}
                          >
                            {row.checklistPct}%
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Быстрые переходы */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <QuickLink
          icon={Banknote}
          label="Деньги и согласование"
          sub={`${data.pendingExpenses.count} на согласовании`}
          onClick={() => go("money")}
        />
        <QuickLink
          icon={ClipboardList}
          label="Чек-листы"
          sub="Отчёт по филиалам"
          onClick={() => go("checklists")}
        />
        <QuickLink
          icon={Wallet}
          label="Кассы"
          sub="Сверка и подтверждение"
          onClick={() => go("cash")}
        />
      </div>
    </div>
  );
}

// Компактный блок «план-факт месяца»: % выполнения плана выручки, темп
// (опережение/отставание к сегодня) и прогресс-бар. Данные из /api/plan.
function PlanMonthBlock({ plan, onOpen }) {
  const t = plan.totals || {};
  const hasPlan = Number(t.planRevenue) > 0;
  const pct = Number(t.revenuePct) || 0;
  // Темп: факт vs ожидаемое к сегодня (равномерно по дням месяца).
  const expected = Number(t.expectedRevenue) || 0;
  const fact = Number(t.factRevenue) || 0;
  const ahead = fact - expected;
  const barColor = pct >= 100 ? C.ok : pct >= 60 ? "#B45309" : C.bad;
  return (
    <div
      className="rounded-2xl bg-white p-4 sm:p-5"
      style={{ border: `1px solid ${C.border}` }}
    >
      <div className="flex items-center justify-between mb-2">
        <h3
          className="font-bold flex items-center gap-2"
          style={{ color: C.ink, fontSize: 15 }}
        >
          <Target size={17} style={{ color: C.brandA }} /> План месяца
        </h3>
        <button
          onClick={onOpen}
          className="inline-flex items-center gap-1 font-semibold"
          style={{ color: C.brandA, fontSize: 12.5 }}
        >
          Открыть план-факт <ArrowRight size={13} />
        </button>
      </div>
      {!hasPlan ? (
        <div style={{ color: C.sub, fontSize: 13 }}>
          План выручки на этот месяц не задан. Задайте его в разделе «Планы и
          цели».
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-2">
            <span style={{ fontSize: 24, fontWeight: 800, color: barColor }}>
              <CountUp to={pct} />%
            </span>
            <span style={{ fontSize: 13, color: C.sub }}>
              {money(t.factRevenue)} из {money(t.planRevenue)} сум
            </span>
            {expected > 0 && (
              <span
                style={{
                  fontSize: 12.5,
                  fontWeight: 700,
                  color: ahead >= 0 ? C.ok : C.bad,
                }}
              >
                {ahead >= 0 ? "▲ опережение " : "▼ отставание "}
                {money(Math.abs(ahead))} сум к сегодня
              </span>
            )}
          </div>
          <div
            style={{
              height: 8,
              borderRadius: 99,
              background: C.line,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${Math.min(100, pct)}%`,
                height: "100%",
                background: barColor,
                borderRadius: 99,
                transition: "width .8s cubic-bezier(.22,.61,.36,1)",
              }}
            />
          </div>
          {Number(t.planExpense) > 0 && (
            <div style={{ fontSize: 12, color: C.sub, marginTop: 8 }}>
              Расходы: {money(t.factExpense)} из {money(t.planExpense)} сум (
              {t.expensePct}% плана)
            </div>
          )}
        </>
      )}
    </div>
  );
}

function QuickLink({ icon: Icon, label, sub, onClick }) {
  return (
    <button
      onClick={onClick}
      className="lift rounded-xl p-3 text-left flex items-center gap-3"
      style={{ border: `1px solid ${C.border}`, background: "#fff" }}
    >
      <div
        className="rounded-lg p-2 shrink-0"
        style={{ background: "#F5F3FF" }}
      >
        <Icon size={18} style={{ color: C.brandA }} />
      </div>
      <div className="min-w-0">
        <div
          className="font-bold truncate"
          style={{ color: C.ink, fontSize: 13.5 }}
        >
          {label}
        </div>
        <div className="truncate" style={{ color: C.sub, fontSize: 12 }}>
          {sub}
        </div>
      </div>
    </button>
  );
}
