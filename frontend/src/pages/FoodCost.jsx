// Себестоимость (food cost): продажи по блюдам из iiko × себестоимость. По
// каждому блюду — выручка, себестоимость, ФК% и маржа; сверху итоги. Гибрид:
// где в iiko есть тех.карта, её себестоимость подставится автоматически
// (следующий шаг), а пока директор/сисадмин задаёт цену за единицу вручную —
// прямо в строке отчёта; где не задано, применяется ФК% по умолчанию.
import { useState, useEffect, useCallback } from "react";
import { Percent, RefreshCw, Download, Save } from "lucide-react";
import { apiGet, apiPost, apiPut } from "../api.js";
import { C } from "../lib/theme.js";
import { Kpi } from "../components/ui.jsx";

const money = (n) => Number(n || 0).toLocaleString("ru-RU");
const onlyNum = (v) => Number(String(v).replace(/[^\d.]/g, "")) || 0;
const ymd = (d) => d.toLocaleDateString("en-CA");
const today = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tashkent" });

// Быстрые периоды → {from, to}.
function periodRange(kind) {
  const now = new Date();
  if (kind === "prev") {
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const to = new Date(now.getFullYear(), now.getMonth(), 0);
    return { from: ymd(from), to: ymd(to) };
  }
  if (kind === "30") {
    const from = new Date(now);
    from.setDate(from.getDate() - 29);
    return { from: ymd(from), to: today() };
  }
  // текущий месяц
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: ymd(from), to: today() };
}

const PERIODS = [
  ["month", "Тек. месяц"],
  ["30", "30 дней"],
  ["prev", "Пред. месяц"],
];

export default function FoodCostView({ notify, role }) {
  const canEdit = role === "director" || role === "sysadmin";
  const [period, setPeriod] = useState("month");
  const [data, setData] = useState(null);
  const [cfg, setCfg] = useState({ defaultPct: 30, groupPct: {}, dishCost: {} });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback((kind) => {
    setLoading(true);
    const { from, to } = periodRange(kind);
    Promise.all([
      apiPost("/api/iiko/food-cost", { from, to }),
      apiGet("/api/food-cost/config").catch(() => null),
    ])
      .then(([rep, conf]) => {
        setData(rep);
        if (conf) setCfg(conf);
        setErr("");
      })
      .catch((e) => {
        setData(null);
        setErr(e.message || "Не удалось загрузить");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load(period);
  }, [period, load]);

  const setDishCost = (name, v) =>
    setCfg((c) => ({ ...c, dishCost: { ...c.dishCost, [name]: onlyNum(v) } }));

  const save = async () => {
    setSaving(true);
    try {
      // Пустые цены (0) убираем — иначе они переопределяют ФК% по умолчанию.
      const dishCost = {};
      for (const [k, v] of Object.entries(cfg.dishCost || {}))
        if (onlyNum(v) > 0) dishCost[k] = onlyNum(v);
      const saved = await apiPut("/api/food-cost/config", {
        defaultPct: onlyNum(cfg.defaultPct),
        groupPct: cfg.groupPct || {},
        dishCost,
      });
      setCfg(saved);
      notify && notify("Себестоимость сохранена");
      load(period);
    } catch (e) {
      notify && notify(e.message || "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  };

  const exportCsv = () => {
    if (!data) return;
    const cell = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
    const head = [
      "Блюдо",
      "Группа",
      "Продано",
      "Выручка",
      "Себестоимость",
      "ФК %",
      "Маржа",
    ];
    const lines = [head.map(cell).join(";")];
    for (const r of data.rows)
      lines.push(
        [r.name, r.group, r.qty, r.revenue, r.cost, r.foodCostPct, r.margin]
          .map(cell)
          .join(";"),
      );
    const csv = "﻿" + lines.join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `foodcost_${data.from || ""}_${data.to || ""}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  };

  const pctColor = (p) => (p > 35 ? C.bad : p > 30 ? "#B45309" : C.ok);
  const inp = {
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    padding: "4px 7px",
    fontSize: 12.5,
    width: 96,
    textAlign: "right",
    color: C.ink,
  };

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2
        className="font-bold flex items-center gap-2"
        style={{ color: C.ink, fontSize: 18 }}
      >
        <Percent size={19} style={{ color: C.brandA }} /> Себестоимость (food
        cost)
      </h2>
      <div className="flex items-center gap-2">
        <div className="flex gap-1">
          {PERIODS.map(([k, lbl]) => (
            <button
              key={k}
              onClick={() => setPeriod(k)}
              className="rounded-lg px-2.5 py-1 font-semibold"
              style={{
                fontSize: 12,
                border: `1px solid ${period === k ? C.brandA : C.border}`,
                color: period === k ? C.brandA : C.sub,
                background: period === k ? "#F5F3FF" : "#fff",
              }}
            >
              {lbl}
            </button>
          ))}
        </div>
        <button
          onClick={exportCsv}
          disabled={!data || !data.rows?.length}
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-semibold"
          style={{
            border: `1px solid ${C.border}`,
            color: C.sub,
            fontSize: 12,
            opacity: data && data.rows?.length ? 1 : 0.5,
          }}
        >
          <Download size={13} /> CSV
        </button>
        <button
          onClick={() => load(period)}
          className="p-2 rounded-lg"
          style={{ border: `1px solid ${C.border}`, color: C.sub }}
          title="Обновить"
        >
          <RefreshCw size={14} />
        </button>
        {canEdit && (
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-bold text-white"
            style={{ background: C.brandA, fontSize: 13, opacity: saving ? 0.6 : 1 }}
          >
            <Save size={14} /> {saving ? "Сохраняем…" : "Сохранить"}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {header}

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span style={{ fontSize: 12.5, color: C.sub }}>
            ФК% по умолчанию
          </span>
          {canEdit ? (
            <input
              value={cfg.defaultPct}
              onChange={(e) =>
                setCfg((c) => ({ ...c, defaultPct: e.target.value }))
              }
              style={{ ...inp, width: 62 }}
              inputMode="numeric"
              title="Применяется к блюдам без заданной цены и без % по группе"
            />
          ) : (
            <b style={{ color: C.ink }}>{onlyNum(cfg.defaultPct)}%</b>
          )}
        </div>
        <span style={{ fontSize: 11.5, color: C.faint }}>
          Себестоимость с тех.картой iiko подставится автоматически позже; пока
          цена за единицу задаётся вручную в строке.
        </span>
      </div>

      {loading && !data ? (
        <div style={{ color: C.sub, fontSize: 14 }}>Загрузка…</div>
      ) : err ? (
        <div
          className="rounded-2xl bg-white p-5"
          style={{ border: `1px solid ${C.border}`, color: C.sub, fontSize: 13 }}
        >
          {/iiko/i.test(err)
            ? "Интеграция iiko не настроена. Себестоимость считается по продажам из iiko — подключите интеграцию в админке."
            : err}
        </div>
      ) : !data ? null : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Kpi label="Выручка, сум" value={money(data.totals.revenue)} tone={C.brandB} />
            <Kpi label="Себестоимость, сум" value={money(data.totals.cost)} tone={C.bad} />
            <Kpi label="Маржа, сум" value={money(data.totals.margin)} tone={C.ok} />
            <Kpi
              label="Food cost, %"
              value={`${data.totals.foodCostPct}%`}
              tone={pctColor(data.totals.foodCostPct)}
            />
          </div>

          <div
            className="rounded-2xl bg-white p-4 sm:p-5"
            style={{ border: `1px solid ${C.border}` }}
          >
            {data.rows.length === 0 ? (
              <div style={{ color: C.faint, fontSize: 13 }}>
                За период нет продаж по блюдам.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full" style={{ fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ color: C.faint, textAlign: "right" }}>
                      <th className="pb-2 pr-2 font-semibold" style={{ textAlign: "left" }}>
                        Блюдо
                      </th>
                      <th className="pb-2 pr-2 font-semibold" style={{ textAlign: "left" }}>
                        Группа
                      </th>
                      <th className="pb-2 pr-2 font-semibold">Продано</th>
                      <th className="pb-2 pr-2 font-semibold">Выручка</th>
                      <th className="pb-2 pr-2 font-semibold">Цена/ед</th>
                      <th className="pb-2 pr-2 font-semibold">Себест.</th>
                      <th className="pb-2 pr-2 font-semibold">ФК%</th>
                      <th className="pb-2 font-semibold">Маржа</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((r) => (
                      <tr key={r.name} style={{ borderTop: `1px solid ${C.line}` }}>
                        <td className="py-1.5 pr-2" style={{ color: C.ink, fontWeight: 600 }}>
                          {r.name}
                        </td>
                        <td className="py-1.5 pr-2" style={{ color: C.faint }}>
                          {r.group || "—"}
                        </td>
                        <td className="py-1.5 pr-2 text-right" style={{ color: C.sub }}>
                          {money(r.qty)}
                        </td>
                        <td className="py-1.5 pr-2 text-right" style={{ color: C.sub }}>
                          {money(r.revenue)}
                        </td>
                        <td className="py-1.5 pr-2 text-right">
                          {canEdit ? (
                            <input
                              value={cfg.dishCost?.[r.name] ?? ""}
                              placeholder={r.source === "dish" ? "" : "—"}
                              onChange={(e) => setDishCost(r.name, e.target.value)}
                              style={inp}
                              inputMode="numeric"
                              title="Себестоимость единицы блюда; пусто — считается по ФК%"
                            />
                          ) : (
                            <span style={{ color: C.faint }}>
                              {r.source === "dish"
                                ? money(cfg.dishCost?.[r.name])
                                : r.source === "group"
                                  ? "% группы"
                                  : "по умолч."}
                            </span>
                          )}
                        </td>
                        <td className="py-1.5 pr-2 text-right" style={{ color: C.ink }}>
                          {money(r.cost)}
                        </td>
                        <td
                          className="py-1.5 pr-2 text-right"
                          style={{ color: pctColor(r.foodCostPct), fontWeight: 700 }}
                        >
                          {r.foodCostPct}%
                        </td>
                        <td
                          className="py-1.5 text-right"
                          style={{ color: C.ink, fontWeight: 700 }}
                        >
                          {money(r.margin)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
