// Пороги согласования расходов (админка). Общий порог: расход не выше суммы
// проводится сразу, выше — уходит на согласование. Можно переопределить порог
// по филиалу. 0 = согласования требует любой расход. Изменения — в журнал
// безопасности; писать может директор/сисадмин.
import { useState, useEffect } from "react";
import { apiGet, apiPut } from "../api.js";
import { C } from "../lib/theme.js";
import { AdCard } from "../components/ui.jsx";
import { BRANCHES } from "../lib/org.js";

const fmt = (n) => Number(n || 0).toLocaleString("ru-RU");

export default function AdminApproval({ s, notify }) {
  const branches = (s.branches || []).length ? s.branches : BRANCHES;
  const [threshold, setThreshold] = useState(0);
  const [branchThresholds, setBranchThresholds] = useState({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    apiGet("/api/approval")
      .then((c) => {
        setThreshold(Number(c.threshold) || 0);
        setBranchThresholds(c.branchThresholds || {});
      })
      .catch(() => {});
  }, []);

  const setBranch = (id, val) => {
    setBranchThresholds((m) => {
      const next = { ...m };
      const v = String(val).replace(/[^\d]/g, "");
      if (v === "") delete next[String(id)];
      else next[String(id)] = Number(v);
      return next;
    });
  };
  const save = async () => {
    setSaving(true);
    try {
      const saved = await apiPut("/api/approval", {
        threshold: Number(threshold) || 0,
        branchThresholds,
      });
      setThreshold(Number(saved.threshold) || 0);
      setBranchThresholds(saved.branchThresholds || {});
      notify("Пороги согласования сохранены");
    } catch (e) {
      notify(e.message || "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  };

  const inp = {
    border: `1px solid ${C.border}`,
    fontSize: 14,
    background: "#fff",
    color: C.ink,
    borderRadius: 10,
    padding: "9px 12px",
    width: 200,
  };
  return (
    <AdCard
      title="Согласование расходов"
      desc="Расход на сумму не выше порога проводится сразу; выше — уходит на согласование директору/финансам. Порог 0 — согласования требует любой расход. Приходы согласования не требуют никогда."
    >
      <div className="mb-4">
        <label
          style={{
            display: "block",
            fontSize: 13,
            fontWeight: 700,
            color: C.sub,
            marginBottom: 6,
          }}
        >
          Общий порог, сум
        </label>
        <input
          value={threshold}
          onChange={(e) =>
            setThreshold(e.target.value.replace(/[^\d]/g, "") || 0)
          }
          style={inp}
          inputMode="numeric"
        />
        <div style={{ color: C.faint, fontSize: 12, marginTop: 4 }}>
          Расход ≤ {fmt(threshold)} сум проводится без согласования.
        </div>
      </div>

      <div
        className="rounded-xl p-3"
        style={{ border: `1px solid ${C.line}`, background: "#FAFAFA" }}
      >
        <div
          className="font-bold mb-2"
          style={{ color: C.ink, fontSize: 13.5 }}
        >
          Переопределение по филиалам (необязательно)
        </div>
        <div className="space-y-2">
          {branches.map((b) => {
            const key = String(b.id);
            const has = Object.prototype.hasOwnProperty.call(
              branchThresholds,
              key,
            );
            return (
              <div key={key} className="flex items-center gap-2">
                <span
                  className="truncate"
                  style={{ color: C.ink, fontSize: 13, flex: 1 }}
                >
                  {b.name}
                </span>
                <input
                  value={has ? branchThresholds[key] : ""}
                  placeholder={`общий (${fmt(threshold)})`}
                  onChange={(e) => setBranch(b.id, e.target.value)}
                  inputMode="numeric"
                  style={{ ...inp, width: 180, padding: "7px 10px" }}
                />
              </div>
            );
          })}
        </div>
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="rounded-xl px-4 py-2.5 font-bold text-white mt-4"
        style={{
          background: C.brandA,
          fontSize: 14,
          opacity: saving ? 0.6 : 1,
        }}
      >
        {saving ? "Сохраняем…" : "💾 Сохранить пороги"}
      </button>
    </AdCard>
  );
}
