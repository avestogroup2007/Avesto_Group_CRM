// Экран «Учёт денег»: казначейство — движение денег, справочники,
// повторяющиеся платежи и журнал проводок (двойная запись).
import { useState, useEffect } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { PlusCircle, X, Trash2, Pencil, Check } from "lucide-react";
import { apiGet, apiPost, apiPatch, apiDelete } from "../api.js";
import { C } from "../lib/theme.js";
import { tr } from "../lib/i18n.js";
import { fmtSum, ymdNow } from "../lib/format.js";
import { branchById } from "../lib/org.js";
import { usePersisted } from "../lib/hooks.js";
import { NiceSelect, NiceDate } from "../components/ui.jsx";

// Управление одним справочником модуля денег: список записей с удалением
// (базовые — без id — удалять нельзя) и поле добавления. Для счетов ещё
// выбирается юр. лицо-владелец.
function DictManager({
  type,
  title,
  entries,
  legalEntities,
  onAdd,
  onEdit,
  onDelete,
}) {
  const [name, setName] = useState("");
  const [parent, setParent] = useState("");
  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editParent, setEditParent] = useState("");
  const isAccount = type === "account";
  const inpSt = {
    border: `1px solid ${C.border}`,
    fontSize: 13.5,
    background: "#fff",
    color: C.ink,
    borderRadius: 10,
    padding: "8px 11px",
    flex: 1,
    minWidth: 0,
  };
  const add = () => {
    const nm = name.trim();
    if (!nm) return;
    onAdd(type, nm, isAccount ? parent : "");
    setName("");
  };
  const startEdit = (e) => {
    setEditId(e.id);
    setEditName(e.name);
    setEditParent(e.parent || "");
  };
  const cancelEdit = () => {
    setEditId(null);
    setEditName("");
    setEditParent("");
  };
  const saveEdit = () => {
    const nm = editName.trim();
    if (!nm) return;
    onEdit(editId, nm, isAccount ? editParent : "");
    cancelEdit();
  };
  return (
    <div
      className="rounded-2xl bg-white p-4 sm:p-5"
      style={{ border: `1px solid ${C.border}` }}
    >
      <h3 className="font-bold mb-3" style={{ color: C.ink, fontSize: 15 }}>
        {title}
      </h3>
      <div
        className="space-y-1 mb-3"
        style={{ maxHeight: 220, overflowY: "auto" }}
      >
        {entries.length ? (
          entries.map((e) =>
            editId && e.id === editId ? (
              <div
                key={e.id}
                className="flex items-center gap-1.5"
                style={{ padding: "3px 0" }}
              >
                {isAccount && (
                  <select
                    value={editParent}
                    onChange={(ev) => setEditParent(ev.target.value)}
                    style={{
                      ...inpSt,
                      flex: "0 0 auto",
                      maxWidth: 130,
                      padding: "6px 9px",
                    }}
                  >
                    <option value="">юр. лицо…</option>
                    {legalEntities.map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                )}
                <input
                  value={editName}
                  autoFocus
                  onChange={(ev) => setEditName(ev.target.value)}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter") saveEdit();
                    if (ev.key === "Escape") cancelEdit();
                  }}
                  style={{ ...inpSt, padding: "6px 9px" }}
                />
                <button
                  onClick={saveEdit}
                  className="p-1 rounded-lg shrink-0"
                  style={{ color: C.ok }}
                  title="Сохранить"
                >
                  <Check size={15} />
                </button>
                <button
                  onClick={cancelEdit}
                  className="p-1 rounded-lg shrink-0"
                  style={{ color: C.sub }}
                  title="Отмена"
                >
                  <X size={15} />
                </button>
              </div>
            ) : (
              <div
                key={e.id || e.name}
                className="flex items-center justify-between gap-2"
                style={{ fontSize: 13, padding: "3px 0" }}
              >
                <span style={{ color: C.ink }}>
                  {e.name}
                  {e.parent ? (
                    <span style={{ color: C.faint }}> · {e.parent}</span>
                  ) : null}
                </span>
                {e.id ? (
                  <span className="flex items-center gap-0.5 shrink-0">
                    <button
                      onClick={() => startEdit(e)}
                      className="p-1 rounded-lg"
                      style={{ color: C.sub }}
                      title="Изменить"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => onDelete(e.id)}
                      className="p-1 rounded-lg"
                      style={{ color: C.bad }}
                      title="Удалить"
                    >
                      <Trash2 size={14} />
                    </button>
                  </span>
                ) : (
                  <span style={{ fontSize: 10.5, color: C.faint }}>
                    базовый
                  </span>
                )}
              </div>
            ),
          )
        ) : (
          <p style={{ fontSize: 12.5, color: C.faint }}>
            Пусто — добавьте ниже.
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {isAccount && (
          <select
            value={parent}
            onChange={(e) => setParent(e.target.value)}
            style={{ ...inpSt, flex: "0 0 auto", maxWidth: 160 }}
          >
            <option value="">юр. лицо…</option>
            {legalEntities.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        )}
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          style={inpSt}
          placeholder="Добавить запись…"
        />
        <button
          onClick={add}
          className="rounded-lg px-3 py-2 font-bold text-white shrink-0"
          style={{ background: C.brandA, fontSize: 13 }}
        >
          + Добавить
        </button>
      </div>
    </div>
  );
}

// ── Регулярные (периодические) проводки ─────────────────────────────────────
// Шаблоны ежемесячных расходов/приходов (аренда, амортизация, зарплата…).
// Система сама заводит движение раз в месяц в назначенный день — без ручного
// ввода и без дублей.
function RecurringManager({ list, branches, dnames, onSave, onDelete }) {
  const curMonth = ymdNow().slice(0, 7);
  const empty = {
    name: "",
    direction: "expense",
    category: "",
    ddsArticle: "",
    paymentType: "Наличные",
    counterparty: "",
    amount: "",
    currency: "UZS",
    rate: "",
    branchVal: 0,
    dayOfMonth: "1",
    startMonth: curMonth,
    endMonth: "",
    autoApprove: true,
  };
  const [f, setF] = useState(empty);
  const [editId, setEditId] = useState(null);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const inpSt = {
    border: `1px solid ${C.border}`,
    fontSize: 13.5,
    background: "#fff",
    color: C.ink,
    borderRadius: 10,
    padding: "8px 11px",
    width: "100%",
  };
  const lblSt = {
    fontSize: 11.5,
    color: C.faint,
    fontWeight: 600,
    display: "block",
    marginBottom: 3,
  };
  const branchOpts = [
    { value: 0, label: "— не указан —" },
    ...(branches || []).map((b) => ({ value: b.id, label: b.name })),
    ...dnames("branch").map((nm) => ({ value: `d:${nm}`, label: nm })),
  ];
  const startEdit = (t) => {
    setEditId(t.id);
    const bv =
      t.branchId != null ? t.branchId : t.branchName ? `d:${t.branchName}` : 0;
    setF({
      name: t.name,
      direction: t.direction,
      category: t.category,
      ddsArticle: t.ddsArticle || "",
      paymentType: t.paymentType || "Наличные",
      counterparty: t.counterparty || "",
      amount: String(t.amount || ""),
      currency: t.currency || "UZS",
      rate: t.rate && t.rate !== 1 ? String(t.rate) : "",
      branchVal: bv,
      dayOfMonth: String(t.dayOfMonth || 1),
      startMonth: t.startMonth,
      endMonth: t.endMonth || "",
      autoApprove: t.autoApprove !== false,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const cancel = () => {
    setEditId(null);
    setF(empty);
  };
  const submit = () => {
    const amount = Number(String(f.amount).replace(/\s/g, ""));
    if (!f.name.trim()) return alert("Укажите название");
    if (!f.category.trim()) return alert("Укажите статью/тип");
    if (!(amount > 0)) return alert("Укажите сумму");
    if (!/^\d{4}-\d{2}$/.test(f.startMonth))
      return alert("Укажите месяц начала");
    let branchId = null;
    let branchName = "";
    if (typeof f.branchVal === "string" && f.branchVal.startsWith("d:")) {
      branchName = f.branchVal.slice(2);
    } else if (f.branchVal) {
      // branchVal может быть числом (свежий выбор) или строкой (загруженная
      // запись t.branchId) — сравниваем как строки, иначе имя филиала терялось.
      const b = (branches || []).find(
        (x) => String(x.id) === String(f.branchVal),
      );
      branchId = String(f.branchVal);
      branchName = b ? b.name : "";
    }
    const rate = f.currency === "UZS" ? 1 : Number(f.rate) || 0;
    if (f.currency !== "UZS" && !(rate > 0))
      return alert("Укажите курс к суму");
    onSave(
      {
        name: f.name.trim(),
        direction: f.direction,
        category: f.category.trim(),
        ddsArticle: f.ddsArticle,
        paymentType: f.paymentType || "Наличные",
        counterparty: f.counterparty.trim(),
        amount,
        currency: f.currency,
        rate,
        branchId,
        branchName,
        dayOfMonth: Number(f.dayOfMonth) || 1,
        startMonth: f.startMonth,
        endMonth: f.endMonth || "",
        autoApprove: !!f.autoApprove,
      },
      editId,
    );
    cancel();
  };

  return (
    <div className="space-y-4">
      <div
        className="rounded-2xl bg-white p-4 sm:p-5"
        style={{ border: `1px solid ${C.border}` }}
      >
        <h3 className="font-bold mb-1" style={{ color: C.ink, fontSize: 15 }}>
          {editId
            ? "Изменить регулярную проводку"
            : "Новая регулярная проводка"}
        </h3>
        <p style={{ fontSize: 12.5, color: C.sub, marginBottom: 12 }}>
          Система сама заведёт это движение каждый месяц в указанный день
          (аренда, амортизация и т.п.). Дубли исключены.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="col-span-2">
            <label style={lblSt}>Название</label>
            <input
              value={f.name}
              onChange={(e) => set("name", e.target.value)}
              style={inpSt}
              placeholder="напр. Аренда Микрорайон"
            />
          </div>
          <div>
            <label style={lblSt}>Тип</label>
            <select
              value={f.direction}
              onChange={(e) => set("direction", e.target.value)}
              style={inpSt}
            >
              <option value="expense">Расход</option>
              <option value="income">Приход</option>
            </select>
          </div>
          <div>
            <label style={lblSt}>Статья / тип</label>
            <input
              value={f.category}
              onChange={(e) => set("category", e.target.value)}
              style={inpSt}
              list="rec-cats"
              placeholder="напр. Аренда"
            />
            <datalist id="rec-cats">
              {dnames("category").map((nm) => (
                <option key={nm} value={nm} />
              ))}
            </datalist>
          </div>
          <div>
            <label style={lblSt}>Статья ДДС</label>
            <input
              value={f.ddsArticle}
              onChange={(e) => set("ddsArticle", e.target.value)}
              style={inpSt}
              list="rec-dds"
            />
            <datalist id="rec-dds">
              {dnames("ddsArticle").map((nm) => (
                <option key={nm} value={nm} />
              ))}
            </datalist>
          </div>
          <div>
            <label style={lblSt}>Контрагент</label>
            <input
              value={f.counterparty}
              onChange={(e) => set("counterparty", e.target.value)}
              style={inpSt}
            />
          </div>
          <div>
            <label style={lblSt}>Сумма</label>
            <input
              value={f.amount}
              onChange={(e) => set("amount", e.target.value)}
              style={inpSt}
              placeholder="0"
            />
          </div>
          <div>
            <label style={lblSt}>Валюта</label>
            <select
              value={f.currency}
              onChange={(e) => set("currency", e.target.value)}
              style={inpSt}
            >
              {["UZS", "RUB", "USD", "EUR"].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          {f.currency !== "UZS" && (
            <div>
              <label style={lblSt}>Курс к суму</label>
              <input
                value={f.rate}
                onChange={(e) => set("rate", e.target.value)}
                style={inpSt}
                placeholder="напр. 12800"
              />
            </div>
          )}
          <div>
            <label style={lblSt}>Филиал</label>
            <select
              value={f.branchVal}
              onChange={(e) => {
                const v = e.target.value;
                const num = Number(v);
                set("branchVal", v.startsWith("d:") ? v : num || 0);
              }}
              style={inpSt}
            >
              {branchOpts.map((o) => (
                <option key={String(o.value)} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={lblSt}>Число месяца</label>
            <input
              type="number"
              min="1"
              max="28"
              value={f.dayOfMonth}
              onChange={(e) => set("dayOfMonth", e.target.value)}
              style={inpSt}
            />
          </div>
          <div>
            <label style={lblSt}>С месяца</label>
            <input
              type="month"
              value={f.startMonth}
              onChange={(e) => set("startMonth", e.target.value)}
              style={inpSt}
            />
          </div>
          <div>
            <label style={lblSt}>По месяц (необязательно)</label>
            <input
              type="month"
              value={f.endMonth}
              onChange={(e) => set("endMonth", e.target.value)}
              style={inpSt}
            />
          </div>
        </div>
        <label
          className="flex items-center gap-2 mt-3"
          style={{ fontSize: 12.5, color: C.sub, cursor: "pointer" }}
        >
          <input
            type="checkbox"
            checked={f.autoApprove}
            onChange={(e) => set("autoApprove", e.target.checked)}
            style={{ width: 16, height: 16, accentColor: C.brandA }}
          />
          Проводить сразу (без согласования) — для известных расходов
        </label>
        <div className="flex gap-2 mt-3">
          <button
            onClick={submit}
            className="rounded-xl px-4 py-2.5 font-bold text-white"
            style={{ background: C.brandGrad, fontSize: 14 }}
          >
            {editId ? "Сохранить" : "Добавить шаблон"}
          </button>
          {editId && (
            <button
              onClick={cancel}
              className="rounded-xl px-4 py-2.5 font-bold"
              style={{
                background: "#fff",
                color: C.sub,
                border: `1px solid ${C.border}`,
                fontSize: 14,
              }}
            >
              Отмена
            </button>
          )}
        </div>
      </div>

      <div
        className="rounded-2xl bg-white p-4 sm:p-5"
        style={{ border: `1px solid ${C.border}` }}
      >
        <h3 className="font-bold mb-3" style={{ color: C.ink, fontSize: 15 }}>
          Шаблоны ({list.filter((t) => t.active).length} активны)
        </h3>
        {list.length === 0 ? (
          <p style={{ fontSize: 13, color: C.faint }}>
            Пока нет регулярных проводок — добавьте выше.
          </p>
        ) : (
          <div className="space-y-2">
            {list.map((t) => (
              <div
                key={t.id}
                className="rounded-xl p-3 flex items-center justify-between gap-3 flex-wrap"
                style={{
                  border: `1px solid ${C.line}`,
                  background: t.active ? "#fff" : "#FAFAF9",
                  opacity: t.active ? 1 : 0.65,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>
                    {t.name}
                    <span
                      className="rounded-md px-1.5 py-0.5"
                      style={{
                        fontSize: 10.5,
                        fontWeight: 700,
                        marginLeft: 6,
                        background:
                          t.direction === "income" ? "#DCFCE7" : "#FEE2E2",
                        color: t.direction === "income" ? "#15803D" : C.bad,
                      }}
                    >
                      {t.direction === "income" ? "приход" : "расход"}
                    </span>
                  </div>
                  <div style={{ fontSize: 12.5, color: C.sub, marginTop: 2 }}>
                    {t.category}
                    {t.branchName ? ` · ${t.branchName}` : ""} · каждое{" "}
                    {t.dayOfMonth}-е число · с {t.startMonth}
                    {t.endMonth ? ` по ${t.endMonth}` : ""}
                    {t.autoApprove === false ? " · на согласование" : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    style={{
                      fontSize: 15,
                      fontWeight: 800,
                      color: t.direction === "income" ? C.ok : C.bad,
                    }}
                  >
                    {t.direction === "income" ? "+" : "−"}
                    {fmtSum(t.amount)}
                    {t.currency !== "UZS" ? ` ${t.currency}` : ""}
                  </span>
                  <button
                    onClick={() => onSave({ active: !t.active }, t.id)}
                    className="rounded-full shrink-0"
                    title={t.active ? "Выключить" : "Включить"}
                    style={{
                      width: 40,
                      height: 22,
                      background: t.active ? C.ok : C.border,
                      position: "relative",
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        top: 2,
                        left: t.active ? 20 : 2,
                        width: 18,
                        height: 18,
                        borderRadius: 99,
                        background: "#fff",
                        transition: "left .15s",
                        boxShadow: "0 1px 3px rgba(0,0,0,.25)",
                      }}
                    />
                  </button>
                  <button
                    onClick={() => startEdit(t)}
                    className="p-1.5 rounded-lg"
                    style={{ color: C.sub }}
                    title="Изменить"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => onDelete(t.id)}
                    className="p-1.5 rounded-lg"
                    style={{ color: C.bad }}
                    title="Удалить"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Учёт и контроль денег компании (казначейство) ──────────────────────────
// Заменяет ручной Excel: ввод приходов/расходов (тип, контрагент, комментарий,
// сумма+валюта, филиал), баланс, отчёт за период и аналитика. Данные — на
// сервере (общие для офиса). Приход с филиала падает автоматически из
// принятых инкассаций (раздел «Кассы»).
// ── Бухгалтерия: проводки двойной записи (Дт/Кт) ────────────────────────────
// Журнал проводок (авто из движений денег + ручные), оборотно-сальдовая
// ведомость (ОСВ), план счетов и правила авто-проводки. Самодостаточный:
// сам тянет данные из /api/postings, наследует период/филиал от «Учёта денег».
function PostingsManager({ from, to, branchId, branches, dnames }) {
  const [sub, setSub] = usePersisted("avesto.postings.sub", "journal");
  const [accounts, setAccounts] = useState([]);
  const [rules, setRules] = useState([]);
  const [journal, setJournal] = useState({ status: "loading", items: [] });
  const [osv, setOsv] = useState(null);
  const [tick, setTick] = useState(0);
  const reload = () => setTick((t) => t + 1);
  const branchQ = branchId ? `&branch=${encodeURIComponent(branchId)}` : "";

  useEffect(() => {
    let alive = true;
    Promise.all([
      apiGet("/api/postings/accounts"),
      apiGet("/api/postings/rules"),
    ])
      .then(([a, r]) => {
        if (!alive) return;
        setAccounts(Array.isArray(a) ? a : []);
        setRules(Array.isArray(r) ? r : []);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [tick]);

  useEffect(() => {
    if (sub !== "journal") return;
    let alive = true;
    setJournal({ status: "loading", items: [] });
    apiGet(`/api/postings?from=${from}&to=${to}${branchQ}`)
      .then((d) => alive && setJournal({ status: "ok", ...d }))
      .catch((e) => alive && setJournal({ status: "error", error: e.message }));
    return () => {
      alive = false;
    };
  }, [sub, from, to, branchId, tick]);

  useEffect(() => {
    if (sub !== "osv") return;
    let alive = true;
    setOsv(null);
    apiGet(`/api/postings/trial-balance?from=${from}&to=${to}${branchQ}`)
      .then((d) => alive && setOsv(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [sub, from, to, branchId, tick]);

  const activeAccounts = accounts.filter((a) => a.active !== false);
  const acctName = (code) => {
    const a = accounts.find((x) => x.code === code);
    return a ? a.name : "";
  };
  const acctLabel = (code) =>
    code ? `${code} · ${acctName(code)}` : "— авто —";

  const inpSt = {
    border: `1px solid ${C.border}`,
    fontSize: 13.5,
    background: "#fff",
    color: C.ink,
    borderRadius: 10,
    padding: "8px 11px",
    width: "100%",
  };
  const lblSt = {
    fontSize: 11.5,
    color: C.faint,
    fontWeight: 600,
    display: "block",
    marginBottom: 3,
  };
  const th = {
    fontSize: 11,
    color: C.faint,
    fontWeight: 700,
    textAlign: "left",
    padding: "6px 8px",
    borderBottom: `1px solid ${C.border}`,
    whiteSpace: "nowrap",
  };
  const td = {
    fontSize: 13,
    color: C.ink,
    padding: "7px 8px",
    borderBottom: `1px solid ${C.line}`,
    verticalAlign: "top",
  };

  // ── Ручная проводка ──
  const emptyForm = {
    date: ymdNow(),
    debit: "",
    credit: "",
    amount: "",
    number: "",
    description: "",
  };
  const [form, setForm] = useState(emptyForm);
  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const [err, setErr] = useState("");
  const submitPosting = async () => {
    setErr("");
    const amount = Number(String(form.amount).replace(/\s/g, ""));
    if (!form.debit) return setErr("Выберите счёт дебета");
    if (!form.credit) return setErr("Выберите счёт кредита");
    if (form.debit === form.credit)
      return setErr("Дебет и кредит должны различаться");
    if (!(amount > 0)) return setErr("Укажите сумму");
    try {
      await apiPost("/api/postings", {
        date: form.date,
        debit: form.debit,
        credit: form.credit,
        amount,
        number: form.number.trim(),
        description: form.description.trim(),
      });
      setForm({ ...emptyForm, date: form.date });
      reload();
    } catch (e) {
      setErr(e.message || "Не удалось сохранить");
    }
  };
  const delPosting = async (id) => {
    if (!window.confirm("Удалить проводку?")) return;
    try {
      await apiDelete(`/api/postings/${id}`);
      reload();
    } catch (e) {
      alert(e.message || "Не удалось удалить");
    }
  };

  // ── План счетов ──
  const [acctForm, setAcctForm] = useState({
    code: "",
    name: "",
    kind: "active",
  });
  const saveAccount = async () => {
    if (!acctForm.code.trim() || !acctForm.name.trim())
      return alert("Укажите код и название счёта");
    try {
      await apiPost("/api/postings/accounts", {
        code: acctForm.code.trim(),
        name: acctForm.name.trim(),
        kind: acctForm.kind,
      });
      setAcctForm({ code: "", name: "", kind: "active" });
      reload();
    } catch (e) {
      alert(e.message || "Не удалось сохранить");
    }
  };
  const delAccount = async (id) => {
    if (!window.confirm("Удалить счёт из плана счетов?")) return;
    try {
      await apiDelete(`/api/postings/accounts/${id}`);
      reload();
    } catch (e) {
      alert(e.message || "Не удалось удалить");
    }
  };

  // ── Правила авто-проводки ──
  const saveRule = async (rule, patch) => {
    try {
      if (rule.id) await apiPatch(`/api/postings/rules/${rule.id}`, patch);
      reload();
    } catch (e) {
      alert(e.message || "Не удалось сохранить правило");
    }
  };
  const KIND_LABEL = {
    active: "Актив",
    passive: "Пассив",
    income: "Доход",
    expense: "Расход",
    contra: "Контрактив",
  };

  const SUBS = [
    ["journal", "Журнал"],
    ["osv", "ОСВ"],
    ["chart", "План счетов"],
    ["rules", "Правила"],
  ];

  const AccountSelect = ({ value, onChange, allowAuto }) => (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={inpSt}
    >
      <option value="">
        {allowAuto ? "— авто (касса/банк) —" : "— выберите —"}
      </option>
      {activeAccounts.map((a) => (
        <option key={a.code} value={a.code}>
          {a.code} · {a.name}
        </option>
      ))}
    </select>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {SUBS.map(([k, lbl]) => (
          <button
            key={k}
            onClick={() => setSub(k)}
            className="rounded-full px-3.5 py-1.5"
            style={{
              fontSize: 12.5,
              fontWeight: 700,
              border: `1px solid ${sub === k ? C.brandA : C.border}`,
              background: sub === k ? C.brandA : "#fff",
              color: sub === k ? "#fff" : C.sub,
            }}
          >
            {lbl}
          </button>
        ))}
      </div>

      {/* ── ЖУРНАЛ ПРОВОДОК ── */}
      {sub === "journal" && (
        <>
          <div
            className="rounded-2xl bg-white p-4 sm:p-5"
            style={{ border: `1px solid ${C.border}` }}
          >
            <h3
              className="font-bold mb-1"
              style={{ color: C.ink, fontSize: 15 }}
            >
              Ручная проводка
            </h3>
            <p style={{ fontSize: 12.5, color: C.sub, marginBottom: 12 }}>
              Проводки из движений денег формируются автоматически по правилам.
              Здесь можно завести проводку вручную (например, начисления).
            </p>
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
              <div>
                <label style={lblSt}>Дата</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setF("date", e.target.value)}
                  style={inpSt}
                />
              </div>
              <div className="col-span-2 md:col-span-2">
                <label style={lblSt}>Дебет (Дт)</label>
                <AccountSelect
                  value={form.debit}
                  onChange={(v) => setF("debit", v)}
                />
              </div>
              <div className="col-span-2 md:col-span-2">
                <label style={lblSt}>Кредит (Кт)</label>
                <AccountSelect
                  value={form.credit}
                  onChange={(v) => setF("credit", v)}
                />
              </div>
              <div>
                <label style={lblSt}>Сумма, сум</label>
                <input
                  value={form.amount}
                  onChange={(e) => setF("amount", e.target.value)}
                  style={inpSt}
                  inputMode="numeric"
                  placeholder="0"
                />
              </div>
              <div>
                <label style={lblSt}>№ документа</label>
                <input
                  value={form.number}
                  onChange={(e) => setF("number", e.target.value)}
                  style={inpSt}
                  placeholder="—"
                />
              </div>
              <div className="col-span-2 md:col-span-4">
                <label style={lblSt}>Описание / основание</label>
                <input
                  value={form.description}
                  onChange={(e) => setF("description", e.target.value)}
                  style={inpSt}
                  placeholder="за что проводка"
                />
              </div>
              <div className="flex items-end">
                <button
                  onClick={submitPosting}
                  className="rounded-xl px-4 py-2 w-full"
                  style={{
                    background: C.brandA,
                    color: "#fff",
                    fontWeight: 700,
                    fontSize: 13.5,
                  }}
                >
                  Провести
                </button>
              </div>
            </div>
            {err && (
              <div style={{ color: C.bad, fontSize: 12.5, marginTop: 8 }}>
                {err}
              </div>
            )}
          </div>

          <div
            className="rounded-2xl bg-white p-4 sm:p-5 overflow-x-auto"
            style={{ border: `1px solid ${C.border}` }}
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold" style={{ color: C.ink, fontSize: 15 }}>
                Журнал проводок
              </h3>
              <span style={{ fontSize: 12, color: C.faint }}>
                {journal.count || 0} шт · {fmtSum(journal.total || 0)}
              </span>
            </div>
            {journal.status === "loading" ? (
              <div style={{ color: C.faint, fontSize: 13 }}>Загрузка…</div>
            ) : !journal.items || !journal.items.length ? (
              <div style={{ color: C.faint, fontSize: 13 }}>
                Проводок за период нет.
              </div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={th}>Дата</th>
                    <th style={th}>Дт</th>
                    <th style={th}>Кт</th>
                    <th style={{ ...th, textAlign: "right" }}>Сумма</th>
                    <th style={th}>Основание</th>
                    <th style={th}></th>
                  </tr>
                </thead>
                <tbody>
                  {journal.items.map((p) => (
                    <tr key={p.id}>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>{p.date}</td>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>
                        <b>{p.debit}</b>
                        <div style={{ fontSize: 11, color: C.faint }}>
                          {acctName(p.debit)}
                        </div>
                      </td>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>
                        <b>{p.credit}</b>
                        <div style={{ fontSize: 11, color: C.faint }}>
                          {acctName(p.credit)}
                        </div>
                      </td>
                      <td
                        style={{
                          ...td,
                          textAlign: "right",
                          fontWeight: 700,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {fmtSum(p.amount)}
                      </td>
                      <td style={td}>
                        {p.number ? (
                          <span style={{ color: C.faint }}>№{p.number} </span>
                        ) : null}
                        {p.description}
                        {p.source === "money-tx" && (
                          <span
                            className="inline-flex items-center rounded-md px-1.5 py-0.5"
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              marginLeft: 6,
                              color: C.sub,
                              background: C.wash || "#F1F5F9",
                            }}
                          >
                            авто
                          </span>
                        )}
                      </td>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>
                        {p.source === "manual" && (
                          <button
                            onClick={() => delPosting(p.id)}
                            title="Удалить"
                            style={{ color: C.bad, padding: 4 }}
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* ── ОБОРОТНО-САЛЬДОВАЯ ВЕДОМОСТЬ ── */}
      {sub === "osv" && (
        <div
          className="rounded-2xl bg-white p-4 sm:p-5 overflow-x-auto"
          style={{ border: `1px solid ${C.border}` }}
        >
          <h3 className="font-bold mb-1" style={{ color: C.ink, fontSize: 15 }}>
            Оборотно-сальдовая ведомость
          </h3>
          <p style={{ fontSize: 12.5, color: C.sub, marginBottom: 12 }}>
            Обороты за период и конечное сальдо по каждому счёту. Итоговые
            обороты Дт и Кт должны совпадать — признак верной двойной записи.
          </p>
          {!osv ? (
            <div style={{ color: C.faint, fontSize: 13 }}>Загрузка…</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Счёт</th>
                  <th style={th}>Наименование</th>
                  <th style={{ ...th, textAlign: "right" }}>Оборот Дт</th>
                  <th style={{ ...th, textAlign: "right" }}>Оборот Кт</th>
                  <th style={{ ...th, textAlign: "right" }}>Сальдо</th>
                </tr>
              </thead>
              <tbody>
                {osv.rows
                  .filter((x) => x.debitTurn || x.creditTurn || x.balance)
                  .map((x) => (
                    <tr key={x.code}>
                      <td style={{ ...td, fontWeight: 700 }}>{x.code}</td>
                      <td style={td}>{x.name}</td>
                      <td style={{ ...td, textAlign: "right" }}>
                        {x.debitTurn ? fmtSum(x.debitTurn) : "—"}
                      </td>
                      <td style={{ ...td, textAlign: "right" }}>
                        {x.creditTurn ? fmtSum(x.creditTurn) : "—"}
                      </td>
                      <td
                        style={{
                          ...td,
                          textAlign: "right",
                          fontWeight: 700,
                          whiteSpace: "nowrap",
                          color: x.balance >= 0 ? C.ink : C.brandA,
                        }}
                      >
                        {x.balance
                          ? `${Math.abs(x.balance).toLocaleString("ru-RU")} ${
                              x.balance >= 0 ? "Дт" : "Кт"
                            }`
                          : "—"}
                      </td>
                    </tr>
                  ))}
              </tbody>
              <tfoot>
                <tr>
                  <td style={{ ...td, fontWeight: 800 }} colSpan={2}>
                    Итого обороты
                  </td>
                  <td style={{ ...td, textAlign: "right", fontWeight: 800 }}>
                    {fmtSum(osv.totals.debitTurn)}
                  </td>
                  <td style={{ ...td, textAlign: "right", fontWeight: 800 }}>
                    {fmtSum(osv.totals.creditTurn)}
                  </td>
                  <td
                    style={{
                      ...td,
                      textAlign: "right",
                      fontWeight: 800,
                      color:
                        osv.totals.debitTurn === osv.totals.creditTurn
                          ? C.ok
                          : C.bad,
                    }}
                  >
                    {osv.totals.debitTurn === osv.totals.creditTurn
                      ? "✓ сходится"
                      : "≠"}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      )}

      {/* ── ПЛАН СЧЕТОВ ── */}
      {sub === "chart" && (
        <div
          className="rounded-2xl bg-white p-4 sm:p-5 overflow-x-auto"
          style={{ border: `1px solid ${C.border}` }}
        >
          <h3 className="font-bold mb-3" style={{ color: C.ink, fontSize: 15 }}>
            План счетов
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
            <input
              value={acctForm.code}
              onChange={(e) =>
                setAcctForm((p) => ({ ...p, code: e.target.value }))
              }
              style={inpSt}
              placeholder="Код (напр. 5010)"
            />
            <input
              value={acctForm.name}
              onChange={(e) =>
                setAcctForm((p) => ({ ...p, name: e.target.value }))
              }
              style={{ ...inpSt, gridColumn: "span 2" }}
              className="col-span-2"
              placeholder="Наименование счёта"
            />
            <select
              value={acctForm.kind}
              onChange={(e) =>
                setAcctForm((p) => ({ ...p, kind: e.target.value }))
              }
              style={inpSt}
            >
              {Object.entries(KIND_LABEL).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
            <button
              onClick={saveAccount}
              className="rounded-xl px-4 py-2"
              style={{
                background: C.brandA,
                color: "#fff",
                fontWeight: 700,
                fontSize: 13.5,
              }}
            >
              Добавить
            </button>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Код</th>
                <th style={th}>Наименование</th>
                <th style={th}>Тип</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id}>
                  <td style={{ ...td, fontWeight: 700 }}>{a.code}</td>
                  <td style={td}>{a.name}</td>
                  <td style={{ ...td, color: C.sub }}>
                    {KIND_LABEL[a.kind] || a.kind}
                  </td>
                  <td style={{ ...td, whiteSpace: "nowrap" }}>
                    <button
                      onClick={() => delAccount(a.id)}
                      title="Удалить"
                      style={{ color: C.bad, padding: 4 }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── ПРАВИЛА АВТО-ПРОВОДКИ ── */}
      {sub === "rules" && (
        <div
          className="rounded-2xl bg-white p-4 sm:p-5 overflow-x-auto"
          style={{ border: `1px solid ${C.border}` }}
        >
          <h3 className="font-bold mb-1" style={{ color: C.ink, fontSize: 15 }}>
            Правила авто-проводки
          </h3>
          <p style={{ fontSize: 12.5, color: C.sub, marginBottom: 12 }}>
            Для каждой статьи движения денег задаётся пара счетов Дт/Кт. Пустая
            сторона = авто-подстановка кассы (5010) или банка (5110) по типу
            оплаты. Строка со статьёй «—» — правило по умолчанию.
          </p>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Направление</th>
                <th style={th}>Статья</th>
                <th style={th}>Дебет (Дт)</th>
                <th style={th}>Кредит (Кт)</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id}>
                  <td style={{ ...td, whiteSpace: "nowrap" }}>
                    {rule.direction === "expense" ? "Расход" : "Приход"}
                  </td>
                  <td style={td}>{rule.category || "— по умолчанию —"}</td>
                  <td style={{ ...td, minWidth: 180 }}>
                    <AccountSelect
                      value={rule.debit}
                      allowAuto
                      onChange={(v) => saveRule(rule, { debit: v })}
                    />
                  </td>
                  <td style={{ ...td, minWidth: 180 }}>
                    <AccountSelect
                      value={rule.credit}
                      allowAuto
                      onChange={(v) => saveRule(rule, { credit: v })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function MoneyView({ s, me, branchScope }) {
  const pad = (x) => String(x).padStart(2, "0");
  const today = ymdNow();
  const y = today.slice(0, 4);
  const m = today.slice(0, 7);
  const monthRange = (ym) => {
    const last = new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0).getDate();
    return { from: `${ym}-01`, to: `${ym}-${pad(last)}` };
  };
  const prevMonthYm = () => {
    const d = new Date(+y, +m.slice(5, 7) - 2, 1);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  };
  const rangeOf = (p) => {
    if (p === "curMonth") return monthRange(m);
    if (p === "prevMonth") return monthRange(prevMonthYm());
    if (p === "curYear") return { from: `${y}-01-01`, to: `${y}-12-31` };
    return null;
  };
  const isMgr = me.role === "manager";
  const canApprove = me.role === "director" || me.role === "finance";
  const fBranch = isMgr ? me.branchId : branchScope || 0;
  const branchObj = branchById(fBranch || 0);
  const branchQ = fBranch ? `&branch=${encodeURIComponent(fBranch)}` : "";

  const [preset, setPreset] = usePersisted("avesto.money.preset", "curMonth");
  const init = monthRange(m);
  const [from, setFrom] = usePersisted("avesto.money.from", init.from);
  const [to, setTo] = usePersisted("avesto.money.to", init.to);
  const [tab, setTab] = usePersisted("avesto.money.tab", "flow");
  const pick = (p) => {
    setPreset(p);
    const r = rangeOf(p);
    if (r) {
      setFrom(r.from);
      setTo(r.to);
    }
  };

  const [data, setData] = useState({ status: "loading" });
  const [summary, setSummary] = useState(null);
  // Справочники: по каждому типу массив {id, name, parent}. id=null — не удалить.
  const [dict, setDict] = useState({
    category: [],
    counterparty: [],
    ddsArticle: [],
    branch: [],
    legalEntity: [],
    account: [],
    paymentType: [],
    currencies: ["UZS", "RUB", "USD", "EUR"],
  });
  const dnames = (type) => (dict[type] || []).map((e) => e.name);
  const [tick, setTick] = useState(0);
  const reload = () => setTick((t) => t + 1);

  useEffect(() => {
    let alive = true;
    setData({ status: "loading" });
    Promise.all([
      apiGet(`/api/money?from=${from}&to=${to}${branchQ}`),
      apiGet(`/api/money/summary?from=${from}&to=${to}${branchQ}`),
    ])
      .then(([list, sum]) => {
        if (!alive) return;
        setData({ status: "ok", ...list });
        setSummary(sum);
      })
      .catch((e) => {
        if (alive) setData({ status: "error", error: e.message || "Ошибка" });
      });
    return () => {
      alive = false;
    };
  }, [from, to, fBranch, tick]);

  useEffect(() => {
    let alive = true;
    apiGet("/api/money/dict")
      // Мержим с дефолтами: неполный/пустой ответ не «обнулит» списки.
      .then((d) => alive && setDict((prev) => ({ ...prev, ...(d || {}) })))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [tick]);

  // Регулярные (периодические) проводки — шаблоны ежемесячных расходов.
  const [recurring, setRecurring] = useState([]);
  useEffect(() => {
    let alive = true;
    apiGet("/api/money/recurring")
      .then((d) => alive && setRecurring(Array.isArray(d) ? d : []))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [tick]);
  const saveRecurring = async (body, id) => {
    try {
      if (id) await apiPatch(`/api/money/recurring/${id}`, body);
      else await apiPost("/api/money/recurring", body);
      reload();
    } catch (e) {
      alert(e.message || "Не удалось сохранить");
    }
  };
  const delRecurring = async (id) => {
    if (!window.confirm("Удалить шаблон? Заведённые ранее проводки останутся."))
      return;
    try {
      await apiDelete(`/api/money/recurring/${id}`);
      reload();
    } catch (e) {
      alert(e.message || "Не удалось удалить");
    }
  };

  const balance = summary ? summary.balance : 0;
  const period = (summary && summary.period) || {
    income: 0,
    expense: 0,
    net: 0,
  };

  const inpSt = {
    border: `1px solid ${C.border}`,
    fontSize: 14,
    background: "#fff",
    color: C.ink,
    borderRadius: 12,
    padding: "9px 12px",
    width: "100%",
  };
  const lblSt = {
    fontSize: 11.5,
    color: C.sub,
    fontWeight: 600,
    display: "block",
    marginBottom: 4,
  };

  // ── Форма добавления движения ──
  const emptyForm = {
    direction: "expense",
    date: today,
    category: "",
    ddsArticle: "",
    paymentType: "Наличные",
    legalEntity: "",
    account: "",
    counterparty: "",
    comment: "",
    amount: "",
    currency: "UZS",
    rate: "",
    postNow: false,
  };
  const [form, setForm] = useState(emptyForm);
  const [formBranch, setFormBranch] = useState(fBranch || 0);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    setErr("");
    const amount = Number(String(form.amount).replace(/\s/g, ""));
    if (!form.category.trim()) return setErr("Укажите статью/тип");
    if (!(amount > 0)) return setErr("Укажите сумму");
    const rate = form.currency === "UZS" ? 1 : Number(form.rate) || 0;
    if (form.currency !== "UZS" && !(rate > 0))
      return setErr("Укажите курс к суму");
    if (form.paymentType === "Перечисление" && !form.legalEntity)
      return setErr("Для перечисления укажите юр. лицо");
    // Филиал: либо из оргструктуры (числовой id), либо доп. из справочника (d:Имя).
    let branchId = null;
    let branchName = "";
    if (typeof formBranch === "string" && formBranch.startsWith("d:")) {
      branchName = formBranch.slice(2);
    } else if (formBranch) {
      const b = branchById(formBranch);
      branchId = String(formBranch);
      branchName = b ? b.name : "";
    }
    setSaving(true);
    try {
      await apiPost("/api/money", {
        date: form.date,
        direction: form.direction,
        category: form.category.trim(),
        ddsArticle: form.ddsArticle,
        paymentType: form.paymentType || "Наличные",
        legalEntity:
          form.paymentType === "Перечисление" ? form.legalEntity : "",
        account: form.paymentType === "Перечисление" ? form.account : "",
        counterparty: form.counterparty.trim(),
        comment: form.comment.trim(),
        amount,
        currency: form.currency,
        rate,
        branchId,
        branchName,
        postNow:
          form.direction === "expense" && canApprove ? !!form.postNow : false,
      });
      setForm({ ...emptyForm, direction: form.direction, date: form.date });
      reload();
    } catch (e) {
      setErr(e.message || "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  };

  const del = async (id) => {
    if (!window.confirm("Удалить это движение?")) return;
    try {
      await apiDelete(`/api/money/${id}`);
      reload();
    } catch (e) {
      alert(e.message || "Не удалось удалить");
    }
  };
  // Согласовать / отклонить заявку на расход.
  const approve = async (id) => {
    try {
      await apiPost(`/api/money/${id}/approve`);
      reload();
    } catch (e) {
      alert(e.message || "Не удалось согласовать");
    }
  };
  const reject = async (id) => {
    const reason = window.prompt("Причина отклонения (необязательно):", "");
    if (reason === null) return;
    try {
      await apiPost(`/api/money/${id}/reject`, { reason });
      reload();
    } catch (e) {
      alert(e.message || "Не удалось отклонить");
    }
  };

  const curBadge = (c) => (c && c !== "UZS" ? ` ${c}` : "");
  const items = data.items || [];
  const pendingItems = items.filter((t) => t.approval === "pending");
  const pendingCount = summary ? summary.pendingCount : pendingItems.length;
  // Бейдж статуса согласования (для расходов-заявок и отклонённых).
  const ApprovalBadge = ({ t }) => {
    if (!t.approval || t.approval === "approved") return null;
    const pend = t.approval === "pending";
    return (
      <span
        className="inline-flex items-center rounded-md px-1.5 py-0.5"
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          marginLeft: 6,
          color: pend ? "#B45309" : C.bad,
          background: pend ? "#FEF3C7" : "#FEE2E2",
        }}
      >
        {pend ? "на согласовании" : "отклонено"}
      </span>
    );
  };

  // Добавить/удалить запись справочника.
  const addDict = async (type, name, parent = "") => {
    if (!name || !name.trim()) return;
    try {
      await apiPost("/api/money/dict", { type, name: name.trim(), parent });
      reload();
    } catch (e) {
      alert(e.message || "Не удалось добавить");
    }
  };
  const delDict = async (id) => {
    if (!id) return;
    try {
      await apiDelete(`/api/money/dict/${id}`);
      reload();
    } catch (e) {
      alert(e.message || "Не удалось удалить");
    }
  };
  const editDict = async (id, name, parent = "") => {
    if (!id || !name || !name.trim()) return;
    try {
      await apiPatch(`/api/money/dict/${id}`, { name: name.trim(), parent });
      reload();
    } catch (e) {
      alert(e.message || "Не удалось изменить");
    }
  };

  const TABS = [
    ["flow", "Движение"],
    ["approvals", "Заявки"],
    ["recurring", "Регулярные"],
    ["postings", "Проводки"],
    ["report", "Отчёт"],
    ["stats", "Аналитика"],
    ["dict", "Справочники"],
  ];

  const KPI = ({ label, value, tone }) => (
    <div
      className="rounded-2xl bg-white p-4"
      style={{ border: `1px solid ${C.border}` }}
    >
      <div style={{ fontSize: 12, color: C.faint, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, color: tone || C.ink }}>
        {value}
      </div>
    </div>
  );

  // Таблица «статья/контрагент → приход/расход» для отчёта.
  const GroupTable = ({ title, rows }) => (
    <div
      className="rounded-2xl bg-white p-4 sm:p-5"
      style={{ border: `1px solid ${C.border}` }}
    >
      <h3 className="font-bold mb-3" style={{ color: C.ink, fontSize: 15 }}>
        {title}
      </h3>
      {rows && rows.length ? (
        <div className="space-y-1">
          {rows.map((r) => (
            <div
              key={r.name}
              className="flex items-center justify-between gap-2"
              style={{ fontSize: 13, padding: "3px 0" }}
            >
              <span
                style={{
                  color: C.ink,
                  fontWeight: 600,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {r.name}
              </span>
              <span style={{ display: "flex", gap: 14, flexShrink: 0 }}>
                {r.income > 0 && (
                  <span style={{ color: C.ok, width: 130, textAlign: "right" }}>
                    +{fmtSum(r.income)}
                  </span>
                )}
                {r.expense > 0 && (
                  <span
                    style={{ color: C.bad, width: 130, textAlign: "right" }}
                  >
                    −{fmtSum(r.expense)}
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ fontSize: 13, color: C.faint }}>Нет данных за период.</p>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Баланс + KPI периода */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div
          className="rounded-2xl p-4 sm:p-5 col-span-2"
          style={{
            background: C.brandGrad,
            color: "#fff",
            boxShadow: "0 10px 28px rgba(123,45,31,.28)",
          }}
        >
          <div style={{ fontSize: 12.5, opacity: 0.85, marginBottom: 4 }}>
            Баланс {branchObj ? `· ${branchObj.name}` : "· вся компания"}
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.1 }}>
            {fmtSum(balance)}
          </div>
          <div style={{ fontSize: 11.5, opacity: 0.8, marginTop: 6 }}>
            приходы минус расходы за всё время
          </div>
        </div>
        <KPI
          label="Приход за период"
          value={fmtSum(period.income)}
          tone={C.ok}
        />
        <KPI
          label="Расход за период"
          value={fmtSum(period.expense)}
          tone={C.bad}
        />
      </div>

      {/* Период */}
      <div
        className="rounded-2xl bg-white p-3 sm:p-4 flex flex-wrap items-end gap-3"
        style={{ border: `1px solid ${C.border}` }}
      >
        <div style={{ width: 190 }}>
          <NiceSelect
            label="За период"
            value={preset}
            width="100%"
            onChange={pick}
            options={[
              ["curMonth", "Текущий месяц"],
              ["prevMonth", "Прошлый месяц"],
              ["curYear", "Текущий год"],
              ["custom", "Другой…"],
            ].map(([value, label]) => ({ value, label }))}
          />
        </div>
        <div style={{ width: 150 }}>
          <NiceDate
            label="с"
            value={from}
            width="100%"
            onChange={(v) => {
              setPreset("custom");
              setFrom(v);
            }}
          />
        </div>
        <div style={{ width: 150 }}>
          <NiceDate
            label="по"
            value={to}
            width="100%"
            onChange={(v) => {
              setPreset("custom");
              setTo(v);
            }}
          />
        </div>
      </div>

      {/* Вкладки */}
      <div className="flex gap-2 flex-wrap">
        {TABS.map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className="rounded-xl px-4 py-2 font-bold inline-flex items-center gap-1.5"
            style={{
              fontSize: 13.5,
              background: tab === k ? C.brandA : "#fff",
              color: tab === k ? "#fff" : C.ink,
              border: `1px solid ${tab === k ? C.brandA : C.border}`,
            }}
          >
            {label}
            {k === "approvals" && pendingCount > 0 && (
              <span
                className="inline-flex items-center justify-center rounded-full"
                style={{
                  minWidth: 18,
                  height: 18,
                  padding: "0 5px",
                  fontSize: 11,
                  fontWeight: 800,
                  background: tab === k ? "#fff" : "#F59E0B",
                  color: tab === k ? C.brandA : "#fff",
                }}
              >
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {data.status === "error" && (
        <div
          className="rounded-2xl bg-white p-4"
          style={{ border: `1px solid ${C.border}`, fontSize: 13 }}
        >
          <span style={{ color: C.bad }}>Ошибка: {data.error}</span>
        </div>
      )}

      {/* ── ВКЛАДКА «ДВИЖЕНИЕ»: форма + список ── */}
      {tab === "flow" && (
        <>
          <div
            className="rounded-2xl bg-white p-4 sm:p-5"
            style={{ border: `1px solid ${C.border}` }}
          >
            <div className="flex items-center gap-2 mb-3">
              <div
                className="flex rounded-xl overflow-hidden"
                style={{ border: `1px solid ${C.border}` }}
              >
                {[
                  ["expense", "Расход", C.bad],
                  ["income", "Приход", C.ok],
                ].map(([k, label, col]) => (
                  <button
                    key={k}
                    onClick={() => setF("direction", k)}
                    className="px-4 py-2 font-bold"
                    style={{
                      fontSize: 13.5,
                      background: form.direction === k ? col : "#fff",
                      color: form.direction === k ? "#fff" : C.sub,
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <h3 className="font-bold" style={{ color: C.ink, fontSize: 15 }}>
                Новое движение денег
              </h3>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <NiceDate
                  label="Дата"
                  value={form.date}
                  width="100%"
                  onChange={(v) => setF("date", v)}
                />
              </div>
              <div>
                <label style={lblSt}>Статья / тип</label>
                <input
                  list="money-cats"
                  value={form.category}
                  onChange={(e) => setF("category", e.target.value)}
                  style={inpSt}
                  placeholder="напр. Хоз. расходы"
                />
                <datalist id="money-cats">
                  {dnames("category").map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
              <div>
                <NiceSelect
                  label="Статья ДДС"
                  value={form.ddsArticle}
                  width="100%"
                  onChange={(v) => setF("ddsArticle", v)}
                  options={[
                    { value: "", label: "— не указана —" },
                    ...dnames("ddsArticle").map((c) => ({
                      value: c,
                      label: c,
                    })),
                  ]}
                />
              </div>
              <div>
                <label style={lblSt}>Контрагент / на что</label>
                <input
                  list="money-cp"
                  value={form.counterparty}
                  onChange={(e) => setF("counterparty", e.target.value)}
                  style={inpSt}
                  placeholder="напр. Amir aka"
                />
                <datalist id="money-cp">
                  {dnames("counterparty").map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
              <div>
                <NiceSelect
                  label="Тип оплаты"
                  value={form.paymentType}
                  width="100%"
                  onChange={(v) => setF("paymentType", v)}
                  options={dnames("paymentType").map((c) => ({
                    value: c,
                    label: c,
                  }))}
                />
              </div>
              {form.paymentType === "Перечисление" && (
                <>
                  <div>
                    <NiceSelect
                      label="Юр. лицо"
                      value={form.legalEntity}
                      width="100%"
                      onChange={(v) => {
                        setF("legalEntity", v);
                        setF("account", "");
                      }}
                      options={[
                        { value: "", label: "— выберите —" },
                        ...dnames("legalEntity").map((c) => ({
                          value: c,
                          label: c,
                        })),
                      ]}
                    />
                  </div>
                  <div>
                    <NiceSelect
                      label="Счёт"
                      value={form.account}
                      width="100%"
                      onChange={(v) => setF("account", v)}
                      options={[
                        { value: "", label: "— выберите —" },
                        ...(dict.account || [])
                          .filter(
                            (a) => !a.parent || a.parent === form.legalEntity,
                          )
                          .map((a) => ({ value: a.name, label: a.name })),
                      ]}
                    />
                  </div>
                </>
              )}
              <div>
                <label style={lblSt}>Сумма</label>
                <input
                  type="number"
                  value={form.amount}
                  onChange={(e) => setF("amount", e.target.value)}
                  style={inpSt}
                  placeholder="0"
                />
              </div>
              <div>
                <NiceSelect
                  label="Валюта"
                  value={form.currency}
                  width="100%"
                  onChange={(v) => setF("currency", v)}
                  options={dict.currencies.map((c) => ({ value: c, label: c }))}
                />
              </div>
              {form.currency !== "UZS" && (
                <div>
                  <label style={lblSt}>Курс к суму</label>
                  <input
                    type="number"
                    value={form.rate}
                    onChange={(e) => setF("rate", e.target.value)}
                    style={inpSt}
                    placeholder="напр. 12800"
                  />
                </div>
              )}
              <div>
                <NiceSelect
                  label="Филиал"
                  value={formBranch}
                  width="100%"
                  onChange={(v) => setFormBranch(v)}
                  options={[
                    { value: 0, label: "— не указан —" },
                    ...(s.branches || []).map((b) => ({
                      value: b.id,
                      label: b.name,
                    })),
                    ...dnames("branch").map((nm) => ({
                      value: `d:${nm}`,
                      label: nm,
                    })),
                  ]}
                />
              </div>
              <div className="col-span-2 md:col-span-4">
                <label style={lblSt}>Комментарий</label>
                <input
                  value={form.comment}
                  onChange={(e) => setF("comment", e.target.value)}
                  style={inpSt}
                  placeholder="описание операции"
                />
              </div>
            </div>

            {err && (
              <div style={{ color: C.bad, fontSize: 12.5, marginTop: 8 }}>
                {err}
              </div>
            )}
            {form.currency !== "UZS" &&
              Number(form.amount) > 0 &&
              Number(form.rate) > 0 && (
                <div style={{ color: C.sub, fontSize: 12.5, marginTop: 8 }}>
                  ≈ {fmtSum(Number(form.amount) * Number(form.rate))} по курсу
                </div>
              )}

            {/* Согласование расходов. */}
            {form.direction === "expense" &&
              (canApprove ? (
                <label
                  className="flex items-center gap-2 mt-3"
                  style={{ fontSize: 12.5, color: C.sub, cursor: "pointer" }}
                >
                  <input
                    type="checkbox"
                    checked={!!form.postNow}
                    onChange={(e) => setF("postNow", e.target.checked)}
                    style={{ width: 16, height: 16, accentColor: C.brandA }}
                  />
                  Провести сразу, без согласования
                </label>
              ) : (
                <div style={{ color: C.faint, fontSize: 12.5, marginTop: 8 }}>
                  Расход уйдёт на согласование директору/финансам и попадёт в
                  баланс после одобрения.
                </div>
              ))}

            <button
              onClick={submit}
              disabled={saving}
              className="mt-3 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 font-bold text-white"
              style={{
                background: C.brandGrad,
                fontSize: 14,
                opacity: saving ? 0.7 : 1,
                boxShadow: "0 8px 20px rgba(123,45,31,.28)",
              }}
            >
              <PlusCircle size={17} />
              {saving ? "Сохранение…" : "Добавить движение"}
            </button>
          </div>

          {/* Список движений */}
          <div
            className="rounded-2xl bg-white p-4 sm:p-5"
            style={{ border: `1px solid ${C.border}` }}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold" style={{ color: C.ink, fontSize: 15 }}>
                Движения за период
              </h3>
              <span style={{ fontSize: 12.5, color: C.faint }}>
                {items.length} записей · итог{" "}
                <b style={{ color: period.net >= 0 ? C.ok : C.bad }}>
                  {period.net >= 0 ? "+" : ""}
                  {fmtSum(period.net)}
                </b>
              </span>
            </div>
            {data.status === "loading" ? (
              <p style={{ fontSize: 13, color: C.faint }}>Загрузка…</p>
            ) : items.length === 0 ? (
              <p style={{ fontSize: 13, color: C.faint }}>
                Пока нет движений за выбранный период. Добавьте первое выше.
              </p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table
                  className="w-full cash-table"
                  style={{
                    borderCollapse: "collapse",
                    fontSize: 13,
                    minWidth: 720,
                  }}
                >
                  <thead>
                    <tr style={{ color: C.faint, textAlign: "left" }}>
                      <th className="py-2">Дата</th>
                      <th>Статья</th>
                      <th>Контрагент</th>
                      <th>Филиал</th>
                      <th style={{ textAlign: "right" }}>Сумма</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((t) => (
                      <tr
                        key={t.id}
                        style={{
                          borderTop: `1px solid ${C.line}`,
                        }}
                      >
                        <td
                          className="py-2"
                          style={{ color: C.sub, whiteSpace: "nowrap" }}
                        >
                          {t.date.split("-").reverse().join(".")}
                        </td>
                        <td style={{ color: C.ink, fontWeight: 600 }}>
                          {t.category}
                          <ApprovalBadge t={t} />
                          {t.comment ? (
                            <span
                              style={{
                                color: C.faint,
                                fontWeight: 400,
                                display: "block",
                                fontSize: 11.5,
                              }}
                            >
                              {t.comment}
                            </span>
                          ) : null}
                          {t.approval === "rejected" && t.rejectReason ? (
                            <span
                              style={{
                                color: C.bad,
                                fontWeight: 400,
                                display: "block",
                                fontSize: 11.5,
                              }}
                            >
                              Причина: {t.rejectReason}
                            </span>
                          ) : null}
                        </td>
                        <td style={{ color: C.sub }}>
                          {t.counterparty || "—"}
                        </td>
                        <td style={{ color: C.sub, whiteSpace: "nowrap" }}>
                          {t.branchName || "—"}
                        </td>
                        <td
                          style={{
                            textAlign: "right",
                            whiteSpace: "nowrap",
                            fontWeight: 700,
                            color:
                              t.approval && t.approval !== "approved"
                                ? C.faint
                                : t.direction === "income"
                                  ? C.ok
                                  : C.bad,
                            textDecoration:
                              t.approval === "rejected"
                                ? "line-through"
                                : "none",
                          }}
                        >
                          {t.direction === "income" ? "+" : "−"}
                          {fmtSum(t.amountUzs)}
                          {t.currency !== "UZS" ? (
                            <span
                              style={{
                                color: C.faint,
                                fontWeight: 400,
                                display: "block",
                                fontSize: 11,
                              }}
                            >
                              {t.amount.toLocaleString("ru-RU")}
                              {curBadge(t.currency)}
                            </span>
                          ) : null}
                        </td>
                        <td
                          style={{ textAlign: "right", whiteSpace: "nowrap" }}
                        >
                          {canApprove && t.approval === "pending" && (
                            <>
                              <button
                                onClick={() => approve(t.id)}
                                className="p-1.5 rounded-lg"
                                style={{ color: C.ok }}
                                title="Согласовать"
                              >
                                <Check size={16} />
                              </button>
                              <button
                                onClick={() => reject(t.id)}
                                className="p-1.5 rounded-lg"
                                style={{ color: C.bad }}
                                title="Отклонить"
                              >
                                <X size={16} />
                              </button>
                            </>
                          )}
                          {(canApprove || me.role === "sysadmin") && (
                            <button
                              onClick={() => del(t.id)}
                              className="p-1.5 rounded-lg"
                              style={{ color: C.bad }}
                              title="Удалить"
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
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

      {/* ── ВКЛАДКА «ЗАЯВКИ»: расходы на согласовании ── */}
      {tab === "approvals" && (
        <div
          className="rounded-2xl bg-white p-4 sm:p-5"
          style={{ border: `1px solid ${C.border}` }}
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold" style={{ color: C.ink, fontSize: 15 }}>
              Заявки на согласование
            </h3>
            <span style={{ fontSize: 12.5, color: C.faint }}>
              {pendingItems.length
                ? `${pendingItems.length} шт.`
                : "нет заявок"}
            </span>
          </div>
          {!canApprove && (
            <p style={{ fontSize: 12.5, color: C.faint, marginBottom: 10 }}>
              Согласовывать расходы могут директор и финансовый отдел. Здесь вы
              видите статус своих заявок.
            </p>
          )}
          {pendingItems.length === 0 ? (
            <p style={{ fontSize: 13, color: C.faint }}>
              Заявок на согласовании нет — все расходы проведены.
            </p>
          ) : (
            <div className="space-y-2">
              {pendingItems.map((t) => (
                <div
                  key={t.id}
                  className="rounded-xl p-3 flex items-center justify-between gap-3 flex-wrap"
                  style={{ background: "#FFFBEB", border: "1px solid #FDE68A" }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{ fontSize: 13.5, fontWeight: 700, color: C.ink }}
                    >
                      {t.category}
                      <span
                        style={{
                          color: C.faint,
                          fontWeight: 400,
                          marginLeft: 6,
                          fontSize: 12,
                        }}
                      >
                        {t.date.split("-").reverse().join(".")}
                        {t.branchName ? ` · ${t.branchName}` : ""}
                      </span>
                    </div>
                    <div style={{ fontSize: 12.5, color: C.sub }}>
                      {t.counterparty || "—"}
                      {t.comment ? ` · ${t.comment}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      style={{ fontSize: 15, fontWeight: 800, color: C.bad }}
                    >
                      −{fmtSum(t.amountUzs)}
                    </span>
                    {canApprove && (
                      <>
                        <button
                          onClick={() => approve(t.id)}
                          className="rounded-lg px-3 py-1.5 font-bold text-white inline-flex items-center gap-1"
                          style={{ background: C.ok, fontSize: 12.5 }}
                        >
                          <Check size={14} /> Согласовать
                        </button>
                        <button
                          onClick={() => reject(t.id)}
                          className="rounded-lg px-3 py-1.5 font-bold inline-flex items-center gap-1"
                          style={{
                            background: "#fff",
                            color: C.bad,
                            border: `1px solid ${C.bad}`,
                            fontSize: 12.5,
                          }}
                        >
                          <X size={14} /> Отклонить
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── ВКЛАДКА «РЕГУЛЯРНЫЕ»: шаблоны ежемесячных проводок ── */}
      {tab === "recurring" && (
        <RecurringManager
          list={recurring}
          branches={s.branches || []}
          dnames={dnames}
          onSave={saveRecurring}
          onDelete={delRecurring}
        />
      )}

      {/* ── ВКЛАДКА «ПРОВОДКИ»: бухгалтерия двойной записи (Дт/Кт) ── */}
      {tab === "postings" && (
        <PostingsManager
          from={from}
          to={to}
          branchId={fBranch}
          branches={s.branches || []}
          dnames={dnames}
        />
      )}

      {/* ── ВКЛАДКА «ОТЧЁТ» ── */}
      {tab === "report" && summary && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <KPI label="Приход" value={fmtSum(period.income)} tone={C.ok} />
            <KPI label="Расход" value={fmtSum(period.expense)} tone={C.bad} />
            <KPI
              label="Итого за период"
              value={`${period.net >= 0 ? "+" : ""}${fmtSum(period.net)}`}
              tone={period.net >= 0 ? C.ok : C.bad}
            />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <GroupTable title="По статьям ДДС" rows={summary.byDds} />
            <GroupTable title="По статьям / типам" rows={summary.byCategory} />
            <GroupTable title="По филиалам" rows={summary.byBranch} />
            <GroupTable title="По типам оплат" rows={summary.byPaymentType} />
            <GroupTable
              title="Топ контрагентов (расход)"
              rows={summary.byCounterparty}
            />
          </div>
        </>
      )}

      {/* ── ВКЛАДКА «СПРАВОЧНИКИ» ── */}
      {tab === "dict" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[
            ["category", "Статьи / типы расходов и приходов"],
            ["ddsArticle", "Статьи ДДС"],
            ["counterparty", "Контрагенты"],
            ["legalEntity", "Юр. лица"],
            ["account", "Счета (для перечислений)"],
            ["branch", "Филиалы / подразделения"],
            ["paymentType", "Типы оплат"],
          ].map(([type, title]) => (
            <DictManager
              key={type}
              type={type}
              title={title}
              entries={dict[type] || []}
              legalEntities={dnames("legalEntity")}
              onAdd={addDict}
              onEdit={editDict}
              onDelete={delDict}
            />
          ))}
        </div>
      )}

      {/* ── ВКЛАДКА «АНАЛИТИКА» ── */}
      {tab === "stats" && summary && (
        <>
          <div
            className="rounded-2xl bg-white p-4 sm:p-5"
            style={{ border: `1px solid ${C.border}` }}
          >
            <h3
              className="font-bold mb-3"
              style={{ color: C.ink, fontSize: 15 }}
            >
              Расходы по статьям
            </h3>
            {summary.byCategory.filter((x) => x.expense > 0).length ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart
                  data={summary.byCategory
                    .filter((x) => x.expense > 0)
                    .slice(0, 10)}
                  layout="vertical"
                  margin={{ left: 8, right: 16 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={C.line} />
                  <XAxis
                    type="number"
                    tickFormatter={(v) => (v / 1e6).toFixed(0) + "М"}
                    tick={{ fontSize: 11, fill: C.faint }}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={130}
                    tick={{ fontSize: 11, fill: C.sub }}
                  />
                  <Tooltip formatter={(v) => fmtSum(v)} />
                  <Bar
                    dataKey="expense"
                    fill={C.brandA}
                    radius={[0, 6, 6, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p style={{ fontSize: 13, color: C.faint }}>
                Нет расходов за период.
              </p>
            )}
          </div>

          <div
            className="rounded-2xl bg-white p-4 sm:p-5"
            style={{ border: `1px solid ${C.border}` }}
          >
            <h3
              className="font-bold mb-3"
              style={{ color: C.ink, fontSize: 15 }}
            >
              Приход и расход по дням
            </h3>
            {summary.byDay.length ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={summary.byDay} margin={{ left: 8, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.line} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(d) => d.slice(8)}
                    tick={{ fontSize: 10, fill: C.faint }}
                  />
                  <YAxis
                    tickFormatter={(v) => (v / 1e6).toFixed(0) + "М"}
                    tick={{ fontSize: 11, fill: C.faint }}
                  />
                  <Tooltip formatter={(v) => fmtSum(v)} />
                  <Bar
                    dataKey="income"
                    name="Приход"
                    fill={C.ok}
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="expense"
                    name="Расход"
                    fill={C.bad}
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p style={{ fontSize: 13, color: C.faint }}>
                Нет данных за период.
              </p>
            )}
          </div>
        </>
      )}

      <p style={{ fontSize: 11, color: C.faint }}>
        Данные хранятся на сервере (общие для офиса). Приход с филиалов
        добавляется автоматически из принятых инкассаций (раздел «Кассы»).
      </p>
    </div>
  );
}

export default MoneyView;
