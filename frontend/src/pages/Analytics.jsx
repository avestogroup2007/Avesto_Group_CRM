// Экран «Аналитика»: сводные показатели по задачам и сотрудникам.
import { useMemo } from "react";
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
  Filter,
  Download,
  Printer,
  AlertTriangle,
  Activity,
} from "lucide-react";
import { C, PHASES } from "../lib/theme.js";
import { tr } from "../lib/i18n.js";
import { M, fmtDur, fmtMoney, lightTone } from "../lib/format.js";
import { ORG, userById, branchById } from "../lib/org.js";
import { Avatar, Badge, Select, Kpi, Ring } from "../components/ui.jsx";
import { computeAnalytics, detectAnomalies } from "../lib/tasks.js";

/* ----------------------- кабина директора (Этап 5) ------------------------- */
export function Analytics({
  tasks,
  history,
  now,
  filters,
  dispatch,
  role,
  notify,
}) {
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

export default Analytics;
