// Настройка доступа по ролям (админка, сисадмин). Матрица «роль × раздел»:
// сисадмин включает/выключает разделы для каждой роли поверх дефолтов. Пусто =
// поведение по умолчанию. Back Office и «О системе» не настраиваются здесь.
import { useState, useEffect } from "react";
import { apiGet, apiPut } from "../api.js";
import { C } from "../lib/theme.js";
import { AdCard } from "../components/ui.jsx";
import { NAV } from "../lib/nav.js";

// Роли клиента, для которых имеет смысл настраивать доступ (owner/vendor —
// служебные, не трогаем).
const ROLES = [
  ["director", "Руководство"],
  ["finance", "Финансист"],
  ["manager", "Управляющий"],
  ["accountant", "Бухгалтер"],
  ["sysadmin", "Сист. администратор"],
  ["staff", "Сотрудник"],
];

// Разделы, доступ к которым настраивается (кроме служебных backoffice/about).
const SECTIONS = NAV.filter((n) => !["backoffice", "about"].includes(n.key));

export default function AdminAccess({ notify }) {
  const [overrides, setOverrides] = useState({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    apiGet("/api/access")
      .then((a) => setOverrides(a.overrides || {}))
      .catch(() => {});
  }, []);

  // Текущее эффективное состояние ячейки: явный оверрайд или дефолт роли.
  const effective = (role, key) => {
    const ov = overrides[role];
    if (ov && Object.prototype.hasOwnProperty.call(ov, key)) return ov[key];
    const item = SECTIONS.find((s) => s.key === key);
    return item ? navAllowedDefault(item, role) : false;
  };
  const toggle = (role, key) => {
    const cur = effective(role, key);
    setOverrides((o) => ({
      ...o,
      [role]: { ...(o[role] || {}), [key]: !cur },
    }));
  };
  const resetRole = (role) => {
    setOverrides((o) => {
      const next = { ...o };
      delete next[role];
      return next;
    });
  };
  const save = async () => {
    setSaving(true);
    try {
      const saved = await apiPut("/api/access", { overrides });
      setOverrides(saved.overrides || {});
      notify("Доступ сохранён. Изменения применятся при следующем входе.");
    } catch (e) {
      notify(e.message || "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdCard
      title="Доступ по ролям"
      desc="Отметьте, какие разделы видит каждая роль. Пустая настройка — доступ по умолчанию. Пользователь увидит изменения при следующем входе."
    >
      <div className="overflow-x-auto">
        <table className="w-full" style={{ fontSize: 12.5 }}>
          <thead>
            <tr>
              <th
                style={{
                  textAlign: "left",
                  padding: "6px 8px",
                  color: C.faint,
                  fontWeight: 700,
                  position: "sticky",
                  left: 0,
                  background: "#fff",
                }}
              >
                Раздел
              </th>
              {ROLES.map(([role, label]) => (
                <th
                  key={role}
                  style={{
                    padding: "6px 6px",
                    color: C.sub,
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                    textAlign: "center",
                  }}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SECTIONS.map((sec) => (
              <tr key={sec.key} style={{ borderTop: `1px solid ${C.line}` }}>
                <td
                  style={{
                    padding: "5px 8px",
                    color: C.ink,
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                    position: "sticky",
                    left: 0,
                    background: "#fff",
                  }}
                >
                  {sec.label}
                </td>
                {ROLES.map(([role]) => (
                  <td key={role} style={{ textAlign: "center", padding: 4 }}>
                    <input
                      type="checkbox"
                      checked={effective(role, sec.key)}
                      onChange={() => toggle(role, sec.key)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-2 mt-4">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-xl px-4 py-2.5 font-bold text-white"
          style={{
            background: C.brandA,
            fontSize: 14,
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? "Сохраняем…" : "💾 Сохранить доступ"}
        </button>
        {ROLES.map(([role, label]) =>
          overrides[role] ? (
            <button
              key={role}
              onClick={() => resetRole(role)}
              className="rounded-lg px-3 py-1.5 font-semibold"
              style={{
                border: `1px solid ${C.border}`,
                color: C.sub,
                fontSize: 12,
              }}
            >
              Сбросить: {label}
            </button>
          ) : null,
        )}
      </div>
    </AdCard>
  );
}

// Дефолт без учёта серверных оверрайдов (для отображения исходного состояния
// в матрице до правок). navAllowed уже применяет оверрайды — поэтому здесь
// временно снимаем их, спрашиваем дефолт и не мутируем глобальное состояние:
// проще воспроизвести логику ролей напрямую.
function navAllowedDefault(item, role) {
  if (role === "owner") return true;
  if (role === "vendor")
    return item.key === "backoffice" || item.key === "about";
  return (
    item.roles === "all" ||
    (Array.isArray(item.roles) && item.roles.includes(role))
  );
}
