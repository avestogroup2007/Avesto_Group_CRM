// Реальный табель: отработанное время из явок iiko.
//
// Источник — /resto/api/employees/attendance (через /api/iiko/attendance):
// там есть начало и конец смены и подразделение, в котором смена открыта.
// Другого источника отработанного времени у iiko нет: в OLAP-отчётах такого
// среза не существует, поэтому раньше раздел жил на локальных отметках в
// браузере и для отчётности был непригоден.
import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { C } from "../lib/theme.js";
import { tr } from "../lib/i18n.js";
import { apiGet } from "../api.js";
import { NiceSelect, EmptyState, Spinner } from "./ui.jsx";

const PERIODS = [
  ["curMonth", "Текущий месяц"],
  ["prevMonth", "Прошлый месяц"],
  ["week", "Последние 7 дней"],
];

const ymd = (d) => d.toISOString().slice(0, 10);

function rangeOf(preset) {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  if (preset === "prevMonth") {
    return {
      from: ymd(new Date(Date.UTC(y, m - 1, 1))),
      to: ymd(new Date(Date.UTC(y, m, 0))),
    };
  }
  if (preset === "week") {
    const to = new Date(Date.UTC(y, m, now.getUTCDate()));
    return { from: ymd(new Date(to.getTime() - 6 * 86400000)), to: ymd(to) };
  }
  return {
    from: ymd(new Date(Date.UTC(y, m, 1))),
    to: ymd(new Date(Date.UTC(y, m, now.getUTCDate()))),
  };
}

const hours = (min) => Math.round(min / 60).toLocaleString("ru-RU");
const hhmm = (min) =>
  Math.floor(min / 60) + " ч " + String(min % 60).padStart(2, "0") + " мин";

export default function IikoAttendance() {
  const [preset, setPreset] = useState("curMonth");
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { from, to } = rangeOf(preset);
    setLoading(true);
    setErr("");
    apiGet("/api/iiko/attendance?from=" + from + "&to=" + to)
      .then(setData)
      .catch((e) => setErr(e.message || "Не удалось загрузить явки"))
      .finally(() => setLoading(false));
  }, [preset]);

  const card = { background: C.surface, border: "1px solid " + C.border };

  const tiles = data
    ? [
        [tr("Часов всего"), hours(data.totals.minutes), C.brandA],
        [tr("Смен"), data.totals.shifts.toLocaleString("ru-RU"), C.gold],
        [tr("Сотрудников"), String(data.totals.employees), C.ok],
        [
          tr("Смен открыто"),
          String(data.totals.open),
          data.totals.open ? C.warn : C.faint,
        ],
      ]
    : [];

  return (
    <div className="rounded-2xl p-4 sm:p-5" style={card}>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <div className="flex items-center gap-2">
          <Clock size={17} color={C.brandA} className="shrink-0" />
          <h3 className="font-bold" style={{ color: C.ink, fontSize: 16 }}>
            {tr("Отработанное время из iiko")}
          </h3>
        </div>
        <NiceSelect
          ariaLabel={tr("Период табеля")}
          value={preset}
          onChange={setPreset}
          width={190}
          options={PERIODS.map(([v, l]) => ({ value: v, label: tr(l) }))}
        />
      </div>

      {loading ? (
        <Spinner label={tr("Загружаем явки из iiko…")} />
      ) : err ? (
        <div style={{ color: C.bad, fontSize: 13 }}>{err}</div>
      ) : !data || !data.totals.shifts ? (
        <EmptyState
          icon={Clock}
          title={tr("Явок за период нет")}
          hint={tr("Проверьте период или отметки смен в iiko.")}
        />
      ) : (
        <>
          <div
            className="grid gap-3 mb-4"
            style={{
              gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
            }}
          >
            {tiles.map(([label, value, tone]) => (
              <div key={label} className="rounded-xl p-3" style={card}>
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="shrink-0"
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 99,
                      background: tone,
                    }}
                  />
                  <span
                    className="min-w-0 truncate"
                    style={{ fontSize: 12, color: C.faint, fontWeight: 600 }}
                  >
                    {label}
                  </span>
                </div>
                <div
                  className="font-extrabold mt-0.5 tnum"
                  style={{ fontSize: 18, color: C.ink }}
                >
                  {value}
                </div>
              </div>
            ))}
          </div>

          <div
            className="font-bold mb-2"
            style={{ color: C.sub, fontSize: 13 }}
          >
            {tr("По подразделениям")}
          </div>
          <div className="overflow-x-auto mb-4">
            <table className="w-full" style={{ fontSize: 12.5 }}>
              <tbody>
                {data.byDepartment.map((d) => (
                  <tr
                    key={d.name}
                    style={{ borderTop: "1px solid " + C.line }}
                  >
                    <td
                      className="py-1.5 pr-2"
                      style={{ color: C.ink, fontWeight: 600 }}
                    >
                      {d.name}
                    </td>
                    <td
                      className="py-1.5 text-right"
                      style={{ color: C.sub }}
                    >
                      {Math.round(d.hours).toLocaleString("ru-RU")} ч
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div
            className="font-bold mb-2"
            style={{ color: C.sub, fontSize: 13 }}
          >
            {tr("По сотрудникам")}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full" style={{ fontSize: 12.5 }}>
              <thead>
                <tr style={{ color: C.faint, textAlign: "right" }}>
                  <th
                    className="pb-2 pr-2 font-semibold"
                    style={{ textAlign: "left" }}
                  >
                    {tr("Сотрудник")}
                  </th>
                  <th
                    className="pb-2 pr-2 font-semibold"
                    style={{ textAlign: "left" }}
                  >
                    {tr("Подразделение")}
                  </th>
                  <th className="pb-2 pr-2 font-semibold">{tr("Смен")}</th>
                  <th className="pb-2 font-semibold">{tr("Отработано")}</th>
                </tr>
              </thead>
              <tbody>
                {data.employees.map((e) => (
                  <tr
                    key={e.employeeId}
                    style={{ borderTop: "1px solid " + C.line }}
                  >
                    <td
                      className="py-1.5 pr-2"
                      style={{ color: C.ink, fontWeight: 600 }}
                    >
                      {e.name}
                    </td>
                    <td className="py-1.5 pr-2" style={{ color: C.sub }}>
                      {e.departments.join(", ") || "—"}
                    </td>
                    <td
                      className="py-1.5 pr-2 text-right"
                      style={{ color: C.sub }}
                    >
                      {e.shifts}
                    </td>
                    <td
                      className="py-1.5 text-right"
                      style={{ color: C.ink, fontWeight: 700 }}
                    >
                      {hhmm(e.minutes)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
