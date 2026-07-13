// Мастер первого запуска: пошаговая настройка организации под новую сеть —
// бренд, юрлица, филиалы (с подразделением iiko, кассой/производством и окном
// смен). Пишет в ту же конфигурацию, что и админка (/api/org), поэтому веб и
// Telegram-бот сразу видят изменения. Доступен директору/сисадмину.
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Building2,
  Store,
  Sparkles,
  Check,
  Plus,
  Trash2,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";
import { apiGet, apiPut } from "../api.js";
import { C } from "../lib/theme.js";

const nextId = (list) =>
  (list.reduce((m, x) => Math.max(m, Number(x.id) || 0), 0) || 0) + 1;

const STEPS = [
  { key: "brand", title: "Бренд", icon: Sparkles },
  { key: "companies", title: "Юрлица", icon: Building2 },
  { key: "branches", title: "Филиалы", icon: Store },
  { key: "review", title: "Готово", icon: Check },
];

export default function SetupWizard({ onClose, dispatch, notify }) {
  const [step, setStep] = useState(0);
  const [brandName, setBrandName] = useState("");
  const [companies, setCompanies] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    apiGet("/api/org")
      .then((cfg) => {
        setBrandName(cfg.brandName || "");
        setCompanies((cfg.companies || []).map((c) => ({ ...c })));
        setBranches((cfg.branches || []).map((b) => ({ ...b })));
      })
      .catch(() => setErr("Не удалось загрузить текущую настройку"))
      .finally(() => setLoading(false));
  }, []);

  const addCompany = () =>
    setCompanies((cs) => [...cs, { id: nextId(cs), name: "" }]);
  const setCompany = (id, name) =>
    setCompanies((cs) => cs.map((c) => (c.id === id ? { ...c, name } : c)));
  const delCompany = (id) => {
    setCompanies((cs) => cs.filter((c) => c.id !== id));
    setBranches((bs) => bs.filter((b) => Number(b.companyId) !== id));
  };

  const addBranch = () =>
    setBranches((bs) => [
      ...bs,
      {
        id: nextId(bs),
        name: "",
        companyId: companies[0]?.id || 1,
        iikoDept: "",
        cash: true,
        prod: false,
        hours: { from: 8, to: 20 },
      },
    ]);
  const setBranch = (id, patch) =>
    setBranches((bs) => bs.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  const delBranch = (id) => setBranches((bs) => bs.filter((b) => b.id !== id));

  // Проверка перед сохранением (зеркалит серверную валидацию — понятные
  // сообщения до отправки).
  const validate = () => {
    if (!brandName.trim()) return "Укажите название компании (бренд).";
    if (!companies.length) return "Добавьте хотя бы одно юрлицо.";
    if (companies.some((c) => !c.name.trim()))
      return "У каждого юрлица должно быть название.";
    if (!branches.length) return "Добавьте хотя бы один филиал.";
    for (const b of branches) {
      if (!b.name.trim()) return "У каждого филиала должно быть название.";
      if (!companies.some((c) => Number(c.id) === Number(b.companyId)))
        return `Филиал «${b.name || "—"}» не привязан к юрлицу.`;
      if (!(Number(b.hours.from) < Number(b.hours.to)))
        return `У филиала «${b.name}» начало окна должно быть раньше конца.`;
    }
    return "";
  };

  const save = async () => {
    const v = validate();
    if (v) {
      setErr(v);
      return;
    }
    setSaving(true);
    setErr("");
    const payload = {
      brandName: brandName.trim(),
      companies: companies.map((c) => ({ id: Number(c.id), name: c.name.trim() })),
      branches: branches.map((b) => ({
        id: Number(b.id),
        name: b.name.trim(),
        companyId: Number(b.companyId),
        iikoDept: (b.iikoDept || "").trim(),
        cash: !!b.cash,
        prod: !!b.prod,
        hours: { from: Number(b.hours.from), to: Number(b.hours.to) },
      })),
    };
    try {
      const saved = await apiPut("/api/org", payload);
      dispatch && dispatch({ type: "ORG_CONFIG", config: saved });
      try {
        localStorage.setItem("avesto.setup.done", "1");
      } catch {
        // localStorage может быть недоступен (приватный режим) — не критично.
      }
      notify && notify("Настройка сохранена");
      onClose && onClose();
    } catch (e) {
      setErr(e.message || "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  };

  const skip = () => {
    try {
      localStorage.setItem("avesto.setup.done", "1");
    } catch {
      // не критично
    }
    onClose && onClose();
  };

  const inp = {
    border: `1px solid ${C.border}`,
    borderRadius: 10,
    padding: "9px 11px",
    fontSize: 14,
    width: "100%",
    color: C.ink,
  };
  const smallInp = { ...inp, padding: "6px 8px", fontSize: 13 };

  const body = () => {
    if (loading)
      return <div style={{ color: C.sub, fontSize: 14 }}>Загрузка…</div>;
    const s = STEPS[step].key;
    if (s === "brand")
      return (
        <div className="space-y-3">
          <p style={{ color: C.sub, fontSize: 13.5 }}>
            Название компании отображается в шапке, на входе и в отчётах.
          </p>
          <label style={{ fontSize: 12.5, color: C.faint, fontWeight: 700 }}>
            Название компании / бренд
          </label>
          <input
            value={brandName}
            onChange={(e) => setBrandName(e.target.value)}
            placeholder="Например, Avesto Group"
            style={inp}
            maxLength={80}
          />
        </div>
      );
    if (s === "companies")
      return (
        <div className="space-y-2">
          <p style={{ color: C.sub, fontSize: 13.5 }}>
            Юрлица (организации), на которые оформлены филиалы.
          </p>
          {companies.map((c) => (
            <div key={c.id} className="flex items-center gap-2">
              <input
                value={c.name}
                onChange={(e) => setCompany(c.id, e.target.value)}
                placeholder="Название юрлица"
                style={inp}
                maxLength={200}
              />
              <button
                onClick={() => delCompany(c.id)}
                className="p-2 rounded-lg shrink-0"
                style={{ border: `1px solid ${C.border}`, color: C.bad }}
                title="Удалить"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <button
            onClick={addCompany}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 font-semibold"
            style={{ border: `1px dashed ${C.border}`, color: C.brandA, fontSize: 13 }}
          >
            <Plus size={15} /> Добавить юрлицо
          </button>
        </div>
      );
    if (s === "branches")
      return (
        <div className="space-y-3">
          <p style={{ color: C.sub, fontSize: 13.5 }}>
            Филиалы: название, юрлицо, подразделение в iiko (для продаж), касса/
            производство и окно смены.
          </p>
          {branches.map((b) => (
            <div
              key={b.id}
              className="rounded-xl p-3 space-y-2"
              style={{ border: `1px solid ${C.border}`, background: "#FafaFb" }}
            >
              <div className="flex items-center gap-2">
                <input
                  value={b.name}
                  onChange={(e) => setBranch(b.id, { name: e.target.value })}
                  placeholder="Название филиала"
                  style={inp}
                  maxLength={200}
                />
                <button
                  onClick={() => delBranch(b.id)}
                  className="p-2 rounded-lg shrink-0"
                  style={{ border: `1px solid ${C.border}`, color: C.bad }}
                  title="Удалить филиал"
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label style={{ fontSize: 11, color: C.faint }}>Юрлицо</label>
                  <select
                    value={b.companyId}
                    onChange={(e) =>
                      setBranch(b.id, { companyId: Number(e.target.value) })
                    }
                    style={smallInp}
                  >
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name || `Юрлицо ${c.id}`}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: C.faint }}>
                    Подразделение iiko
                  </label>
                  <input
                    value={b.iikoDept || ""}
                    onChange={(e) => setBranch(b.id, { iikoDept: e.target.value })}
                    placeholder="Имя Department"
                    style={smallInp}
                    maxLength={200}
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex items-center gap-1.5" style={{ fontSize: 13, color: C.ink }}>
                  <input
                    type="checkbox"
                    checked={!!b.cash}
                    onChange={(e) => setBranch(b.id, { cash: e.target.checked })}
                  />
                  Касса
                </label>
                <label className="inline-flex items-center gap-1.5" style={{ fontSize: 13, color: C.ink }}>
                  <input
                    type="checkbox"
                    checked={!!b.prod}
                    onChange={(e) => setBranch(b.id, { prod: e.target.checked })}
                  />
                  Производство
                </label>
                <div className="inline-flex items-center gap-1" style={{ fontSize: 12.5, color: C.sub }}>
                  Смена с
                  <input
                    type="number"
                    min={0}
                    max={23}
                    value={b.hours.from}
                    onChange={(e) =>
                      setBranch(b.id, { hours: { ...b.hours, from: Number(e.target.value) } })
                    }
                    style={{ ...smallInp, width: 56 }}
                  />
                  до
                  <input
                    type="number"
                    min={0}
                    max={23}
                    value={b.hours.to}
                    onChange={(e) =>
                      setBranch(b.id, { hours: { ...b.hours, to: Number(e.target.value) } })
                    }
                    style={{ ...smallInp, width: 56 }}
                  />
                </div>
              </div>
            </div>
          ))}
          <button
            onClick={addBranch}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 font-semibold"
            style={{ border: `1px dashed ${C.border}`, color: C.brandA, fontSize: 13 }}
          >
            <Plus size={15} /> Добавить филиал
          </button>
        </div>
      );
    // review
    const compName = (id) =>
      companies.find((c) => Number(c.id) === Number(id))?.name || "—";
    return (
      <div className="space-y-3">
        <p style={{ color: C.sub, fontSize: 13.5 }}>
          Проверьте и сохраните. Изменения сразу применятся к системе и боту.
        </p>
        <div className="rounded-xl p-3" style={{ border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 12.5, color: C.faint }}>Бренд</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>
            {brandName || "—"}
          </div>
          <div style={{ fontSize: 12.5, color: C.faint, marginTop: 8 }}>
            Юрлиц: {companies.length} · Филиалов: {branches.length}
          </div>
          <ul className="mt-2 space-y-1">
            {branches.map((b) => (
              <li key={b.id} style={{ fontSize: 13, color: C.ink }}>
                • {b.name || "—"}{" "}
                <span style={{ color: C.faint }}>
                  ({compName(b.companyId)}
                  {b.cash ? ", касса" : ""}
                  {b.prod ? ", производство" : ""})
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  };

  const isLast = step === STEPS.length - 1;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(30,16,10,.5)", backdropFilter: "blur(4px)" }}
    >
      <div
        className="rounded-2xl bg-white w-full max-w-lg flex flex-col"
        style={{ border: `1px solid ${C.border}`, maxHeight: "92vh" }}
      >
        <div
          className="flex items-center justify-between px-5 py-3"
          style={{ borderBottom: `1px solid ${C.border}` }}
        >
          <div className="font-extrabold flex items-center gap-2" style={{ color: C.ink, fontSize: 16 }}>
            <Sparkles size={18} color={C.brandA} /> Мастер настройки
          </div>
          <button onClick={skip} className="p-2 rounded-lg" style={{ background: C.line }}>
            <X size={17} color={C.sub} />
          </button>
        </div>

        {/* Шаги */}
        <div className="flex items-center gap-1 px-5 py-3" style={{ borderBottom: `1px solid ${C.line}` }}>
          {STEPS.map((st, i) => (
            <div key={st.key} className="flex items-center gap-1 flex-1">
              <div
                className="flex items-center gap-1.5 rounded-lg px-2 py-1"
                style={{
                  background: i === step ? "#F5F3FF" : "transparent",
                  color: i <= step ? C.brandA : C.faint,
                  fontSize: 12,
                  fontWeight: i === step ? 800 : 600,
                }}
              >
                <st.icon size={14} /> {st.title}
              </div>
              {i < STEPS.length - 1 && (
                <ChevronRight size={13} color={C.faint} className="shrink-0" />
              )}
            </div>
          ))}
        </div>

        <div className="px-5 py-4 overflow-y-auto">{body()}</div>

        {err && (
          <div className="px-5" style={{ color: C.bad, fontSize: 13 }}>
            {err}
          </div>
        )}

        <div
          className="flex items-center justify-between gap-2 px-5 py-3 mt-auto"
          style={{ borderTop: `1px solid ${C.border}` }}
        >
          <button
            onClick={step === 0 ? skip : () => setStep((x) => x - 1)}
            className="inline-flex items-center gap-1 rounded-lg px-3 py-2 font-semibold"
            style={{ border: `1px solid ${C.border}`, color: C.sub, fontSize: 13 }}
          >
            {step === 0 ? (
              "Пропустить"
            ) : (
              <>
                <ChevronLeft size={15} /> Назад
              </>
            )}
          </button>
          {isLast ? (
            <button
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 font-bold text-white"
              style={{ background: C.brandA, fontSize: 14, opacity: saving ? 0.6 : 1 }}
            >
              <Check size={16} /> {saving ? "Сохраняем…" : "Сохранить настройку"}
            </button>
          ) : (
            <button
              onClick={() => setStep((x) => x + 1)}
              className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 font-bold text-white"
              style={{ background: C.brandA, fontSize: 14 }}
            >
              Далее <ChevronRight size={16} />
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
