// KPI сотрудников: дисциплина линейного персонала по чек-листам за период
// (сдачи, средний % выполнения, активные дни, последняя активность). Данные
// серверные (/api/staff/kpi). Управляющий видит свой филиал.
import { useState, useEffect } from "react";
import { Users, RefreshCw } from "lucide-react";
import { apiGet } from "../api.js";
import { C } from "../lib/theme.js";
import { Kpi } from "../components/ui.jsx";

const PERIODS = [
  [7, "7 дней"],
  [30, "30 дней"],
  [90, "90 дней"],
];

export default function StaffKpiView() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const load = (d) => {
    setLoading(true);
    const to = new Date().toLocaleDateString("en-CA", {
      timeZone: "Asia/Tashkent",
    });
    const fromD = new Date();
    fromD.setDate(fromD.getDate() - (d - 1));
    const from = fromD.toLocaleDateString("en-CA", {
      timeZone: "Asia/Tashkent",
    });
    apiGet(`/api/staff/kpi?from=${from}&to=${to}`)
      .then((res) => {
        setData(res);
        setErr("");
      })
      .catch((e) => setErr(e.message || "Не удалось загрузить"))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load(days);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  if (loading && !data)
    return <div style={{ color: C.sub, fontSize: 14 }}>Загрузка KPI…</div>;
  if (err && !data)
    return <div style={{ color: C.bad, fontSize: 14 }}>{err}</div>;

  const medal = (i) => (i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2
            className="font-bold flex items-center gap-2"
            style={{ color: C.ink, fontSize: 18 }}
          >
            <Users size={19} style={{ color: C.brandA }} /> KPI сотрудников
          </h2>
          <div style={{ color: C.sub, fontSize: 12.5 }}>
            Дисциплина по чек-листам · {data.from} — {data.to}
            {data.scope === "branch" ? " · ваш филиал" : ""}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {PERIODS.map(([d, lbl]) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className="rounded-lg px-2.5 py-1 font-semibold"
                style={{
                  fontSize: 12,
                  border: `1px solid ${days === d ? C.brandA : C.border}`,
                  color: days === d ? C.brandA : C.sub,
                  background: days === d ? "#F5F3FF" : "#fff",
                }}
              >
                {lbl}
              </button>
            ))}
          </div>
          <button
            onClick={() => load(days)}
            className="p-2 rounded-lg"
            style={{ border: `1px solid ${C.border}`, color: C.sub }}
            title="Обновить"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Kpi
          label="Сотрудников"
          value={String(data.totals.employees)}
          tone={C.brandB}
        />
        <Kpi
          label="Сдач чек-листов"
          value={String(data.totals.runs)}
          tone={C.brandA}
        />
        <Kpi
          label="Средний %"
          value={`${data.totals.avgPct}%`}
          tone={data.totals.avgPct >= 80 ? C.ok : C.brandA}
        />
      </div>

      <div
        className="rounded-2xl bg-white p-4 sm:p-5"
        style={{ border: `1px solid ${C.border}` }}
      >
        {data.rows.length === 0 ? (
          <div style={{ color: C.sub, fontSize: 13 }}>
            За период нет сдач чек-листов с привязкой к сотруднику. KPI
            считается по чек-листам, сданным через бот/приложение под учётной
            записью.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full" style={{ fontSize: 13 }}>
              <thead>
                <tr style={{ color: C.faint, textAlign: "left" }}>
                  <th className="pb-2 pr-2 font-semibold">#</th>
                  <th className="pb-2 pr-2 font-semibold">Сотрудник</th>
                  <th className="pb-2 pr-2 font-semibold text-right">Сдач</th>
                  <th className="pb-2 pr-2 font-semibold text-right">
                    Средний %
                  </th>
                  <th className="pb-2 pr-2 font-semibold text-right">Дней</th>
                  <th className="pb-2 font-semibold text-right">Активность</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row, i) => (
                  <tr
                    key={row.userId}
                    style={{ borderTop: `1px solid ${C.line}` }}
                  >
                    <td className="py-2 pr-2" style={{ color: C.faint }}>
                      {medal(i) || i + 1}
                    </td>
                    <td className="py-2 pr-2">
                      <div style={{ color: C.ink, fontWeight: 600 }}>
                        {row.name}
                      </div>
                      {row.position ? (
                        <div style={{ color: C.faint, fontSize: 11.5 }}>
                          {row.position}
                        </div>
                      ) : null}
                    </td>
                    <td
                      className="py-2 pr-2 text-right"
                      style={{ color: C.ink }}
                    >
                      {row.runs}
                    </td>
                    <td className="py-2 pr-2 text-right">
                      <span
                        className="rounded-full px-2 py-0.5"
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          background: row.avgPct >= 80 ? "#DCFCE7" : "#FEF3C7",
                          color: row.avgPct >= 80 ? "#15803D" : "#B45309",
                        }}
                      >
                        {row.avgPct}%
                      </span>
                    </td>
                    <td
                      className="py-2 pr-2 text-right"
                      style={{ color: C.sub }}
                    >
                      {row.activeDays}
                    </td>
                    <td
                      className="py-2 text-right"
                      style={{ color: C.faint, fontSize: 12 }}
                    >
                      {row.lastActive}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
