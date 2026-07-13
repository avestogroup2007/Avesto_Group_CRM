// Планы и цели (план-факт): месячный план выручки/расходов по филиалам против
// факта. Факт выручки — сверённая с iiko выручка касс за месяц; факт расходов
// — согласованные расходы «Учёта денег». Разбивка по дням даёт темп
// (опережение/отставание к сегодня). План правят директор/сисадмин.
import { useState, useEffect, useCallback } from "react";
import { Target, RefreshCw, Save } from "lucide-react";
import { apiGet, apiPut } from "../api.js";
import { C } from "../lib/theme.js";
import { Kpi, PageHeader } from "../components/ui.jsx";

const money = (n) => Number(n || 0).toLocaleString("ru-RU");
const onlyNum = (v) => Number(String(v).replace(/[^\d.]/g, "")) || 0;
const thisMonth = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tashkent" }).slice(0, 7);
const shiftMonth = (m, d) => {
  const [y, mo] = m.split("-").map(Number);
  const dt = new Date(y, mo - 1 + d, 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
};

export default function PlanView({ notify, role }) {
  const canEdit = role === "director" || role === "sysadmin";
  const [month, setMonth] = useState(thisMonth());
  const [data, setData] = useState(null);
  const [edits, setEdits] = useState({}); // branchId -> {revenue, expense}
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback((m) => {
    setLoading(true);
    apiGet(`/api/plan?month=${m}`)
      .then((d) => {
        setData(d);
        const e = {};
        for (const r of d.rows)
          e[r.branchId] = { revenue: r.planRevenue, expense: r.planExpense };
        setEdits(e);
        setErr("");
      })
      .catch((ex) => {
        setData(null);
        setErr(ex.message || "Не удалось загрузить");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load(month);
  }, [month, load]);

  const setEdit = (branchId, patch) =>
    setEdits((e) => ({ ...e, [branchId]: { ...e[branchId], ...patch } }));

  const save = async () => {
    setSaving(true);
    try {
      await Promise.all(
        (data.rows || []).map((r) =>
          apiPut("/api/plan/entry", {
            month,
            branchId: r.branchId,
            revenue: onlyNum(edits[r.branchId]?.revenue),
            expense: onlyNum(edits[r.branchId]?.expense),
          }),
        ),
      );
      notify && notify("План сохранён");
      load(month);
    } catch (e) {
      notify && notify(e.message || "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  };

  const paceColor = (p) => (p >= 100 ? C.ok : p >= 90 ? "#B45309" : C.bad);
  const inp = {
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    padding: "5px 7px",
    fontSize: 12.5,
    width: 118,
    textAlign: "right",
    color: C.ink,
  };

  return (
    <div className="space-y-4">
      <PageHeader icon={Target} title="Планы и цели (план-факт)">
          <button
            onClick={() => setMonth((m) => shiftMonth(m, -1))}
            className="rounded-lg px-2.5 py-1.5 font-bold"
            style={{ border: `1px solid ${C.border}`, color: C.sub }}
          >
            ‹
          </button>
          <span
            className="font-bold"
            style={{ color: C.ink, fontSize: 14, minWidth: 74, textAlign: "center" }}
          >
            {month}
          </span>
          <button
            onClick={() => setMonth((m) => shiftMonth(m, 1))}
            className="rounded-lg px-2.5 py-1.5 font-bold"
            style={{ border: `1px solid ${C.border}`, color: C.sub }}
          >
            ›
          </button>
          <button
            onClick={() => load(month)}
            className="p-2 rounded-lg"
            style={{ border: `1px solid ${C.border}`, color: C.sub }}
            title="Обновить"
          >
            <RefreshCw size={14} />
          </button>
          {canEdit && (
            <button
              onClick={save}
              disabled={saving || !data}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-bold text-white"
              style={{ background: C.brandA, fontSize: 13, opacity: saving ? 0.6 : 1 }}
            >
              <Save size={14} /> {saving ? "Сохраняем…" : "Сохранить"}
            </button>
          )}
      </PageHeader>

      {loading && !data ? (
        <div style={{ color: C.sub, fontSize: 14 }}>Загрузка…</div>
      ) : err ? (
        <div style={{ color: C.bad, fontSize: 14 }}>{err}</div>
      ) : !data ? null : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Kpi label="План выручки, сум" value={money(data.totals.planRevenue)} tone={C.brandB} />
            <Kpi label="Факт выручки, сум" value={money(data.totals.factRevenue)} tone={C.brandA} />
            <Kpi
              label="Выполнение плана"
              value={`${data.totals.revenuePct}%`}
              tone={data.totals.revenuePct >= 100 ? C.ok : "#B45309"}
            />
            <Kpi
              label="Расходы факт/план"
              value={`${money(data.totals.factExpense)} / ${money(data.totals.planExpense)}`}
              tone={C.sub}
            />
          </div>

          <div
            className="rounded-2xl bg-white p-4 sm:p-5"
            style={{ border: `1px solid ${C.border}` }}
          >
            <p style={{ color: C.faint, fontSize: 12, marginBottom: 8 }}>
              Прошло {data.daysElapsed} из {data.daysInMonth} дней месяца. Факт
              выручки — сверённая с iiko выручка касс; факт расходов —
              согласованные расходы. Темп — сравнение с ожидаемым к сегодня.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full" style={{ fontSize: 12.5 }}>
                <thead>
                  <tr style={{ color: C.faint, textAlign: "right" }}>
                    <th className="pb-2 pr-2 font-semibold" style={{ textAlign: "left" }}>
                      Филиал
                    </th>
                    <th className="pb-2 pr-2 font-semibold">План выручки</th>
                    <th className="pb-2 pr-2 font-semibold">Факт</th>
                    <th className="pb-2 pr-2 font-semibold">Вып.</th>
                    <th className="pb-2 pr-2 font-semibold">Темп</th>
                    <th className="pb-2 pr-2 font-semibold">План расходов</th>
                    <th className="pb-2 font-semibold">Факт расходов</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.branchId} style={{ borderTop: `1px solid ${C.line}` }}>
                      <td className="py-1.5 pr-2" style={{ color: C.ink, fontWeight: 600 }}>
                        {r.branch}
                      </td>
                      <td className="py-1.5 pr-2 text-right">
                        {canEdit ? (
                          <input
                            value={edits[r.branchId]?.revenue ?? ""}
                            onChange={(e) => setEdit(r.branchId, { revenue: e.target.value })}
                            style={inp}
                            inputMode="numeric"
                          />
                        ) : (
                          <span style={{ color: C.sub }}>{money(r.planRevenue)}</span>
                        )}
                      </td>
                      <td className="py-1.5 pr-2 text-right" style={{ color: C.ink, fontWeight: 600 }}>
                        {money(r.factRevenue)}
                      </td>
                      <td
                        className="py-1.5 pr-2 text-right"
                        style={{ color: r.revenuePct >= 100 ? C.ok : C.sub, fontWeight: 700 }}
                      >
                        {r.revenuePct}%
                      </td>
                      <td
                        className="py-1.5 pr-2 text-right"
                        style={{ color: paceColor(r.revenuePacePct), fontWeight: 700 }}
                        title={
                          r.revenuePace >= 0
                            ? `Опережение на ${money(r.revenuePace)} сум`
                            : `Отставание на ${money(-r.revenuePace)} сум`
                        }
                      >
                        {r.revenuePace >= 0 ? "▲" : "▼"} {r.revenuePacePct}%
                      </td>
                      <td className="py-1.5 pr-2 text-right">
                        {canEdit ? (
                          <input
                            value={edits[r.branchId]?.expense ?? ""}
                            onChange={(e) => setEdit(r.branchId, { expense: e.target.value })}
                            style={inp}
                            inputMode="numeric"
                          />
                        ) : (
                          <span style={{ color: C.sub }}>{money(r.planExpense)}</span>
                        )}
                      </td>
                      <td className="py-1.5 text-right" style={{ color: C.ink }}>
                        {money(r.factExpense)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
