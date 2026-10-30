// ФОТ — зарплатная ведомость по месяцам. Ставка на сотрудника (оклад или
// почасовой) задаётся здесь (в iiko-API ставок нет); часы/бонусы/штрафы
// вводятся помесячно; итог считается автоматически. Данные серверные
// (/api/payroll). Часы для почасовых пока вводятся вручную — авто-подстановка
// из iiko-посещаемости появится позже.
import { useState, useEffect } from "react";
import { Banknote, Download, Save } from "lucide-react";
import { apiGet, apiPut } from "../api.js";
import { C } from "../lib/theme.js";
import { Kpi, PageHeader, NiceSelect } from "../components/ui.jsx";

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
  // Порядок строк: по подразделению удобно считать ФОТ по цехам и филиалам,
  // по должности — сравнивать ставки внутри одной профессии.
  const [sortBy, setSortBy] = useState("name");
  // Фильтры те же, что в табеле: подразделение и должность. Значения берутся
  // из самих строк, а не из справочника — в фильтре только то, что есть в
  // ведомости, иначе половина пунктов давала бы пустой результат.
  const [fDep, setFDep] = useState("");
  const [fPos, setFPos] = useState("");
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

  // Сотрудники без подразделения уходят вниз, иначе прочерки оказываются
  // первыми и прячут реальные группы. Внутри группы — по алфавиту.
  const cmpText = (a, b) => String(a || "").localeCompare(String(b || ""), "ru");
  // Сотрудник может числиться в нескольких подразделениях (строка через
  // запятую) — считаем совпадением, если выбранное входит в список.
  const depList = (r) =>
    String(r.department || "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  const depOptions = [...new Set(rows.flatMap(depList))].sort(cmpText);
  const posOptions = [
    ...new Set(rows.map((r) => r.position).filter(Boolean)),
  ].sort(cmpText);
  const visible = rows.filter(
    (r) =>
      (!fDep || depList(r).includes(fDep)) && (!fPos || r.position === fPos)
  );
  const sorted = [...visible].sort((a, b) => {
    if (sortBy === "department") {
      const ad = a.department || "";
      const bd = b.department || "";
      if (!ad !== !bd) return ad ? -1 : 1;
      const d = cmpText(ad, bd);
      if (d) return d;
    } else if (sortBy === "position") {
      const d = cmpText(a.position, b.position);
      if (d) return d;
    } else if (sortBy === "total") {
      const d = (b.total || 0) - (a.total || 0);
      if (d) return d;
    }
    return cmpText(a.name, b.name);
  });

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

  const totalPay = visible.reduce((s, r) => s + (r.total || 0), 0);
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
      <PageHeader icon={Banknote} title="ФОТ — зарплатная ведомость">
          <NiceSelect
            ariaLabel="Фильтр по подразделению"
            value={fDep}
            onChange={setFDep}
            width={200}
            options={[
              { value: "", label: "Все подразделения" },
              ...depOptions.map((d) => ({ value: d, label: d })),
            ]}
          />
          <NiceSelect
            ariaLabel="Фильтр по должности"
            value={fPos}
            onChange={setFPos}
            width={200}
            options={[
              { value: "", label: "Все должности" },
              ...posOptions.map((p) => ({ value: p, label: p })),
            ]}
          />
          <NiceSelect
            ariaLabel="Сортировка ведомости"
            value={sortBy}
            onChange={setSortBy}
            width={190}
            options={[
              { value: "name", label: "По алфавиту" },
              { value: "department", label: "По подразделению" },
              { value: "position", label: "По должности" },
              { value: "total", label: "По сумме к выплате" },
            ]}
          />
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
      </PageHeader>

      <div className="grid grid-cols-2 gap-2">
        <Kpi label="Сотрудников" value={String(visible.length)} tone={C.brandB} />
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
        ) : visible.length === 0 ? (
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
                  <th
                    className="pb-2 pr-2 font-semibold"
                    style={{ textAlign: "left" }}
                  >
                    Подразделение
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
                {sorted.map((r) => (
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
                    <td className="py-1.5 pr-2" style={{ color: C.sub }}>
                      {r.department || "—"}
                    </td>
                    <td className="py-1.5 pr-2 text-right">
                      {canEdit ? (
                        <select
                          id={`payroll-${r.userId}-mode`}
                          name={`payroll-${r.userId}-mode`}
                          aria-label={`Режим оплаты — ${r.name}`}
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
                          id={`payroll-${r.userId}-rate`}
                          name={`payroll-${r.userId}-rate`}
                          aria-label={`Ставка — ${r.name}`}
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
                          id={`payroll-${r.userId}-hours`}
                          name={`payroll-${r.userId}-hours`}
                          aria-label={`Часы — ${r.name}`}
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
                          id={`payroll-${r.userId}-bonus`}
                          name={`payroll-${r.userId}-bonus`}
                          aria-label={`Премия — ${r.name}`}
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
                          id={`payroll-${r.userId}-penalty`}
                          name={`payroll-${r.userId}-penalty`}
                          aria-label={`Штраф — ${r.name}`}
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
