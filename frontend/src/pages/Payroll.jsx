// ФОТ — зарплатная ведомость по месяцам. Ставка на сотрудника (оклад или
// почасовой) задаётся здесь (в iiko-API ставок нет); часы/бонусы/штрафы
// вводятся помесячно; итог считается автоматически. Данные серверные
// (/api/payroll). Часы для почасовых пока вводятся вручную — авто-подстановка
// из iiko-посещаемости появится позже.
import { useState, useEffect } from "react";
import { Banknote, Download, Save } from "lucide-react";
import { apiGet, apiPut } from "../api.js";
import { C } from "../lib/theme.js";
import { Kpi } from "../components/ui.jsx";

const money = (n) => Number(n || 0).toLocaleString("ru-RU");
const thisMonth = () => new Date().toISOString().slice(0, 7);
const shiftMonth = (m, d) => {
  const [y, mo] = m.split("-").map(Number);
  const dt = new Date(y, mo - 1 + d, 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
};
const onlyNum = (v) => Number(String(v).replace(/[^\d.]/g, "")) || 0;

export default function PayrollView({ notify, role }) {
  const canEdit = role === "director" || role === "sysadmin";
  const [month, setMonth] = useState(thisMonth());
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const load = (m) => {
    setLoading(true);
    apiGet(`/api/payroll?month=${m}`)
      .then((d) => setRows(d.rows || []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load(month);
  }, [month]);

  const setRow = (userId, patch) =>
    setRows((rs) =>
      rs.map((r) => {
        if (r.userId !== userId) return r;
        const next = { ...r, ...patch };
        next.base =
          next.mode === "hourly"
            ? Math.round(onlyNum(next.rate) * onlyNum(next.hours))
            : onlyNum(next.rate);
        next.total = next.base + onlyNum(next.bonus) - onlyNum(next.penalty);
        return next;
      }),
    );

  const save = async () => {
    setSaving(true);
    try {
      const rates = {};
      for (const r of rows)
        rates[r.userId] = { mode: r.mode, amount: onlyNum(r.rate) };
      await apiPut("/api/payroll/rates", { rates });
      await Promise.all(
        rows.map((r) =>
          apiPut("/api/payroll/entry", {
            month,
            userId: r.userId,
            hours: onlyNum(r.hours),
            bonus: onlyNum(r.bonus),
            penalty: onlyNum(r.penalty),
            note: r.note || "",
          }),
        ),
      );
      notify("Ведомость сохранена");
      load(month);
    } catch (e) {
      notify(e.message || "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  };

  const exportCsv = () => {
    const cell = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
    const head = [
      "Сотрудник",
      "Должность",
      "Режим",
      "Ставка",
      "Часы",
      "Оклад/начислено",
      "Бонус",
      "Штраф",
      "К выплате",
    ];
    const lines = [head.map(cell).join(";")];
    for (const r of rows) {
      lines.push(
        [
          r.name,
          r.position,
          r.mode === "hourly" ? "Почасовой" : "Оклад",
          onlyNum(r.rate),
          r.mode === "hourly" ? onlyNum(r.hours) : "",
          r.base,
          onlyNum(r.bonus),
          onlyNum(r.penalty),
          r.total,
        ]
          .map(cell)
          .join(";"),
      );
    }
    const csv = "﻿" + lines.join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `fot_${month}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  };

  const totalPay = rows.reduce((s, r) => s + (r.total || 0), 0);
  const inp = {
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    padding: "5px 7px",
    fontSize: 12.5,
    width: 92,
    textAlign: "right",
    color: C.ink,
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2
          className="font-bold flex items-center gap-2"
          style={{ color: C.ink, fontSize: 18 }}
        >
          <Banknote size={19} style={{ color: C.brandA }} /> ФОТ — зарплатная
          ведомость
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMonth((m) => shiftMonth(m, -1))}
            className="rounded-lg px-2.5 py-1.5 font-bold"
            style={{ border: `1px solid ${C.border}`, color: C.sub }}
          >
            ‹
          </button>
          <span
            className="font-bold"
            style={{
              color: C.ink,
              fontSize: 14,
              minWidth: 74,
              textAlign: "center",
            }}
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
            onClick={exportCsv}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-semibold"
            style={{
              border: `1px solid ${C.border}`,
              color: C.sub,
              fontSize: 12,
            }}
          >
            <Download size={13} /> CSV
          </button>
          {canEdit && (
            <button
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-bold text-white"
              style={{
                background: C.brandA,
                fontSize: 13,
                opacity: saving ? 0.6 : 1,
              }}
            >
              <Save size={14} /> {saving ? "Сохраняем…" : "Сохранить"}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Kpi label="Сотрудников" value={String(rows.length)} tone={C.brandB} />
        <Kpi
          label="ФОТ за месяц, сум"
          value={money(totalPay)}
          tone={C.brandA}
        />
      </div>

      <div
        className="rounded-2xl bg-white p-4 sm:p-5"
        style={{ border: `1px solid ${C.border}` }}
      >
        <p style={{ color: C.faint, fontSize: 12, marginBottom: 8 }}>
          Ставка задаётся в системе (в iiko её нет). Для почасовых введите часы
          — авто-подстановка из iiko-посещаемости появится позже.
        </p>
        {loading ? (
          <div style={{ color: C.sub, fontSize: 13 }}>Загрузка…</div>
        ) : rows.length === 0 ? (
          <div style={{ color: C.sub, fontSize: 13 }}>
            Нет активных сотрудников.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full" style={{ fontSize: 12.5 }}>
              <thead>
                <tr style={{ color: C.faint, textAlign: "right" }}>
                  <th
                    className="pb-2 pr-2 font-semibold"
                    style={{ textAlign: "left" }}
                  >
                    Сотрудник
                  </th>
                  <th className="pb-2 pr-2 font-semibold">Режим</th>
                  <th className="pb-2 pr-2 font-semibold">Ставка</th>
                  <th className="pb-2 pr-2 font-semibold">Часы</th>
                  <th className="pb-2 pr-2 font-semibold">Бонус</th>
                  <th className="pb-2 pr-2 font-semibold">Штраф</th>
                  <th className="pb-2 font-semibold">К выплате</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.userId}
                    style={{ borderTop: `1px solid ${C.line}` }}
                  >
                    <td className="py-1.5 pr-2">
                      <div style={{ color: C.ink, fontWeight: 600 }}>
                        {r.name}
                      </div>
                      {r.position ? (
                        <div style={{ color: C.faint, fontSize: 11 }}>
                          {r.position}
                        </div>
                      ) : null}
                    </td>
                    <td className="py-1.5 pr-2 text-right">
                      {canEdit ? (
                        <select
                          value={r.mode}
                          onChange={(e) =>
                            setRow(r.userId, { mode: e.target.value })
                          }
                          style={{ ...inp, width: 96, textAlign: "left" }}
                        >
                          <option value="salary">Оклад</option>
                          <option value="hourly">Почасовой</option>
                        </select>
                      ) : (
                        <span style={{ color: C.sub }}>
                          {r.mode === "hourly" ? "Почасовой" : "Оклад"}
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 pr-2 text-right">
                      {canEdit ? (
                        <input
                          value={r.rate}
                          onChange={(e) =>
                            setRow(r.userId, { rate: e.target.value })
                          }
                          style={inp}
                          inputMode="numeric"
                        />
                      ) : (
                        <span style={{ color: C.sub }}>{money(r.rate)}</span>
                      )}
                    </td>
                    <td className="py-1.5 pr-2 text-right">
                      {canEdit ? (
                        <input
                          value={r.mode === "hourly" ? r.hours : ""}
                          disabled={r.mode !== "hourly"}
                          onChange={(e) =>
                            setRow(r.userId, { hours: e.target.value })
                          }
                          style={{
                            ...inp,
                            width: 64,
                            opacity: r.mode === "hourly" ? 1 : 0.4,
                          }}
                          inputMode="numeric"
                        />
                      ) : (
                        <span style={{ color: C.sub }}>
                          {r.mode === "hourly" ? money(r.hours) : "—"}
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 pr-2 text-right">
                      {canEdit ? (
                        <input
                          value={r.bonus}
                          onChange={(e) =>
                            setRow(r.userId, { bonus: e.target.value })
                          }
                          style={inp}
                          inputMode="numeric"
                        />
                      ) : (
                        <span style={{ color: C.sub }}>{money(r.bonus)}</span>
                      )}
                    </td>
                    <td className="py-1.5 pr-2 text-right">
                      {canEdit ? (
                        <input
                          value={r.penalty}
                          onChange={(e) =>
                            setRow(r.userId, { penalty: e.target.value })
                          }
                          style={inp}
                          inputMode="numeric"
                        />
                      ) : (
                        <span style={{ color: C.sub }}>{money(r.penalty)}</span>
                      )}
                    </td>
                    <td
                      className="py-1.5 text-right"
                      style={{ color: C.ink, fontWeight: 800 }}
                    >
                      {money(r.total)}
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
