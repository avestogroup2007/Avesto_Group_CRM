// ДДС — движение денежных средств по месяцам и статьям. Приток/отток и чистый
// поток за период (только согласованные операции). Данные серверные
// (/api/money/dds).
import { useState, useEffect } from "react";
import { TrendingUp, RefreshCw, Download } from "lucide-react";
import { apiGet, apiDownload } from "../api.js";
import { C } from "../lib/theme.js";
import { Kpi } from "../components/ui.jsx";

// Клиентская выгрузка ДДС в CSV (открывается в Excel). BOM — для кириллицы.
function downloadDdsCsv(data) {
  const cell = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
  const { months, income, expense, monthTotals, totals } = data;
  const head = ["Тип", "Статья", ...months.map((m) => m), "Итого"];
  const rows = [head.map(cell).join(";")];
  const push = (label, list) => {
    for (const r of list) {
      rows.push(
        [label, r.article, ...months.map((m) => r.byMonth[m] || 0), r.total]
          .map(cell)
          .join(";"),
      );
    }
  };
  push("Приток", income);
  push("Отток", expense);
  rows.push(
    [
      "",
      "Чистый поток",
      ...months.map((m) => monthTotals[m]?.net || 0),
      totals.net,
    ]
      .map(cell)
      .join(";"),
  );
  const csv = "﻿" + rows.join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = `dds_${data.from || "all"}_${data.to || "all"}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

const money = (n) => Number(n || 0).toLocaleString("ru-RU");
const monthLabel = (m) => {
  const [y, mo] = String(m).split("-");
  const names = [
    "янв",
    "фев",
    "мар",
    "апр",
    "май",
    "июн",
    "июл",
    "авг",
    "сен",
    "окт",
    "ноя",
    "дек",
  ];
  return `${names[Number(mo) - 1] || mo} ${String(y).slice(2)}`;
};

const PERIODS = [
  [3, "3 мес"],
  [6, "6 мес"],
  [12, "12 мес"],
];

export default function DdsView() {
  const [monthsBack, setMonthsBack] = useState(6);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const load = (mb) => {
    setLoading(true);
    const now = new Date();
    const to = now.toLocaleDateString("en-CA", { timeZone: "Asia/Tashkent" });
    const fromD = new Date(now.getFullYear(), now.getMonth() - (mb - 1), 1);
    const from = fromD.toLocaleDateString("en-CA");
    apiGet(`/api/money/dds?from=${from}&to=${to}`)
      .then((res) => {
        setData(res);
        setErr("");
      })
      .catch((e) => setErr(e.message || "Не удалось загрузить"))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load(monthsBack);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthsBack]);

  if (loading && !data)
    return <div style={{ color: C.sub, fontSize: 14 }}>Загрузка ДДС…</div>;
  if (err && !data)
    return <div style={{ color: C.bad, fontSize: 14 }}>{err}</div>;

  const { months, income, expense, monthTotals, totals } = data;

  const section = (title, rows, kind) => (
    <div
      className="rounded-2xl bg-white p-4 sm:p-5"
      style={{ border: `1px solid ${C.border}` }}
    >
      <h3 className="font-bold mb-2" style={{ color: C.ink, fontSize: 15 }}>
        {title}
      </h3>
      {rows.length === 0 ? (
        <div style={{ color: C.faint, fontSize: 12.5 }}>Нет операций</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full" style={{ fontSize: 12.5 }}>
            <thead>
              <tr style={{ color: C.faint, textAlign: "right" }}>
                <th
                  className="pb-2 pr-2 font-semibold"
                  style={{ textAlign: "left" }}
                >
                  Статья
                </th>
                {months.map((m) => (
                  <th key={m} className="pb-2 pr-2 font-semibold">
                    {monthLabel(m)}
                  </th>
                ))}
                <th className="pb-2 font-semibold">Итого</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.article}
                  style={{ borderTop: `1px solid ${C.line}` }}
                >
                  <td
                    className="py-1.5 pr-2"
                    style={{ color: C.ink, fontWeight: 600 }}
                  >
                    {row.article}
                  </td>
                  {months.map((m) => (
                    <td
                      key={m}
                      className="py-1.5 pr-2 text-right"
                      style={{ color: row.byMonth[m] ? C.sub : C.faint }}
                    >
                      {row.byMonth[m] ? money(row.byMonth[m]) : "—"}
                    </td>
                  ))}
                  <td
                    className="py-1.5 text-right"
                    style={{
                      color: kind === "income" ? "#15803D" : C.bad,
                      fontWeight: 700,
                    }}
                  >
                    {money(row.total)}
                  </td>
                </tr>
              ))}
              <tr style={{ borderTop: `2px solid ${C.border}` }}>
                <td
                  className="py-2 pr-2"
                  style={{ color: C.ink, fontWeight: 700 }}
                >
                  Итого {kind === "income" ? "приток" : "отток"}
                </td>
                {months.map((m) => (
                  <td
                    key={m}
                    className="py-2 pr-2 text-right"
                    style={{ color: C.ink, fontWeight: 700 }}
                  >
                    {money(monthTotals[m]?.[kind])}
                  </td>
                ))}
                <td
                  className="py-2 text-right"
                  style={{ color: C.ink, fontWeight: 800 }}
                >
                  {money(kind === "income" ? totals.income : totals.expense)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2
          className="font-bold flex items-center gap-2"
          style={{ color: C.ink, fontSize: 18 }}
        >
          <TrendingUp size={19} style={{ color: C.brandA }} /> Движение денежных
          средств
        </h2>
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {PERIODS.map(([mb, lbl]) => (
              <button
                key={mb}
                onClick={() => setMonthsBack(mb)}
                className="rounded-lg px-2.5 py-1 font-semibold"
                style={{
                  fontSize: 12,
                  border: `1px solid ${monthsBack === mb ? C.brandA : C.border}`,
                  color: monthsBack === mb ? C.brandA : C.sub,
                  background: monthsBack === mb ? "#F5F3FF" : "#fff",
                }}
              >
                {lbl}
              </button>
            ))}
          </div>
          <button
            onClick={() => downloadDdsCsv(data)}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-semibold"
            style={{
              border: `1px solid ${C.border}`,
              color: C.sub,
              fontSize: 12,
            }}
            title="Скачать ДДС в CSV (Excel)"
          >
            <Download size={13} /> ДДС
          </button>
          <button
            onClick={() => {
              const from = data.from ? `from=${data.from}&` : "";
              const to = data.to ? `to=${data.to}` : "";
              apiDownload(`/api/money/export?${from}${to}`, "money.csv").catch(
                () => {},
              );
            }}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-semibold"
            style={{
              border: `1px solid ${C.border}`,
              color: C.sub,
              fontSize: 12,
            }}
            title="Выгрузить реестр операций в CSV (Excel)"
          >
            <Download size={13} /> Операции
          </button>
          <button
            onClick={() => load(monthsBack)}
            className="p-2 rounded-lg"
            style={{ border: `1px solid ${C.border}`, color: C.sub }}
            title="Обновить"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Kpi label="Приток, сум" value={money(totals.income)} tone={C.ok} />
        <Kpi label="Отток, сум" value={money(totals.expense)} tone={C.bad} />
        <Kpi
          label="Чистый поток, сум"
          value={money(totals.net)}
          tone={totals.net >= 0 ? C.ok : C.bad}
        />
      </div>

      {months.length === 0 ? (
        <div
          className="rounded-2xl bg-white p-5"
          style={{
            border: `1px solid ${C.border}`,
            color: C.sub,
            fontSize: 13,
          }}
        >
          За период нет согласованных операций.
        </div>
      ) : (
        <>
          {section("Приток по статьям", income, "income")}
          {section("Отток по статьям", expense, "expense")}
        </>
      )}
    </div>
  );
}
