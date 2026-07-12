// Back Office владельца системы: реестр клиентов (кто покупает систему,
// тарифы, MRR) и доска развития продукта. Виден только ролям owner/vendor —
// в клиентских установках таких ролей нет, раздел им недоступен.
import { useState, useEffect } from "react";
import { Briefcase, PlusCircle, Trash2 } from "lucide-react";
import { apiGet, apiPost, apiPatch, apiDelete } from "../api.js";
import { C } from "../lib/theme.js";
import { Field, Badge, AdCard } from "../components/ui.jsx";

const STATUS = [
  ["lead", "Лид", "#7C3AED"],
  ["demo", "Демо", "#D97706"],
  ["active", "Активен", "#16A34A"],
  ["paused", "Пауза", "#64748B"],
  ["churned", "Ушёл", "#DC2626"],
];
const FEATURE_STATUS = [
  ["idea", "Идея"],
  ["planned", "Запланировано"],
  ["in_progress", "В работе"],
  ["done", "Готово"],
];
const money = (n) => Number(n || 0).toLocaleString("ru-RU") + " сум";

const inp = {
  border: `1px solid ${C.border}`,
  borderRadius: 10,
  padding: "8px 11px",
  fontSize: 13.5,
  background: "#fff",
  color: C.ink,
  width: "100%",
};

function ClientsTab({ me, notify }) {
  const [data, setData] = useState({ items: [], summary: null });
  const [form, setForm] = useState({
    name: "",
    contact: "",
    phone: "",
    tariff: "",
    monthlyFee: "",
    deployUrl: "",
    notes: "",
  });
  const load = () =>
    apiGet("/api/vendor/clients")
      .then(setData)
      .catch(() => {});
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const add = async () => {
    if (!form.name.trim()) {
      notify("Укажите название клиента");
      return;
    }
    try {
      await apiPost("/api/vendor/clients", {
        ...form,
        monthlyFee: Number(form.monthlyFee) || 0,
      });
      setForm({
        name: "",
        contact: "",
        phone: "",
        tariff: "",
        monthlyFee: "",
        deployUrl: "",
        notes: "",
      });
      notify("Клиент добавлен");
      load();
    } catch (e) {
      notify(e.message || "Не удалось добавить");
    }
  };
  const setStatus = async (id, status) => {
    await apiPatch(`/api/vendor/clients/${id}`, { status }).catch(() => {});
    load();
  };
  const remove = async (id) => {
    if (!window.confirm("Удалить клиента из реестра?")) return;
    try {
      await apiDelete(`/api/vendor/clients/${id}`);
      load();
    } catch (e) {
      notify(e.message || "Удаление — только владельцу");
    }
  };

  const s = data.summary;
  return (
    <div className="space-y-4">
      {s && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            ["Клиентов всего", s.total],
            ["Активных", s.active],
            ["Лиды и демо", s.leads],
            ["MRR (в месяц)", money(s.mrr)],
          ].map(([label, value]) => (
            <div
              key={label}
              className="rounded-2xl bg-white p-4"
              style={{ border: `1px solid ${C.border}` }}
            >
              <div style={{ fontSize: 12.5, color: C.sub, fontWeight: 600 }}>
                {label}
              </div>
              <div
                className="font-extrabold"
                style={{ color: C.ink, fontSize: 22 }}
              >
                {value}
              </div>
            </div>
          ))}
        </div>
      )}

      <AdCard
        title="Добавить клиента"
        desc="Компания, которая покупает или пробует систему."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Field label="Название компании">
            <input
              style={inp}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label="Контактное лицо">
            <input
              style={inp}
              value={form.contact}
              onChange={(e) => setForm({ ...form, contact: e.target.value })}
            />
          </Field>
          <Field label="Телефон">
            <input
              style={inp}
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </Field>
          <Field label="Тариф">
            <input
              style={inp}
              value={form.tariff}
              placeholder="Например: Базовый"
              onChange={(e) => setForm({ ...form, tariff: e.target.value })}
            />
          </Field>
          <Field label="Плата в месяц, сум">
            <input
              style={inp}
              type="number"
              value={form.monthlyFee}
              onChange={(e) => setForm({ ...form, monthlyFee: e.target.value })}
            />
          </Field>
          <Field label="Адрес установки (URL)">
            <input
              style={inp}
              value={form.deployUrl}
              onChange={(e) => setForm({ ...form, deployUrl: e.target.value })}
            />
          </Field>
        </div>
        <div className="mt-3">
          <Field label="Заметки">
            <input
              style={inp}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </Field>
        </div>
        <button
          onClick={add}
          className="mt-3 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 font-bold text-white"
          style={{ background: C.brandA, fontSize: 14 }}
        >
          <PlusCircle size={16} /> Добавить клиента
        </button>
      </AdCard>

      <AdCard title="Клиенты">
        {data.items.length === 0 && (
          <p style={{ color: C.sub, fontSize: 13.5 }}>
            Пока пусто. Добавьте первого клиента выше.
          </p>
        )}
        <div className="space-y-2">
          {data.items.map((c) => {
            const st = STATUS.find(([k]) => k === c.status) || STATUS[0];
            return (
              <div
                key={c.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl px-4 py-3"
                style={{
                  background: "#FBFCFE",
                  border: `1px solid ${C.border}`,
                }}
              >
                <div className="min-w-0" style={{ flex: "1 1 200px" }}>
                  <div
                    style={{ fontWeight: 700, color: C.ink, fontSize: 14.5 }}
                  >
                    {c.name}
                    {c.tariff ? (
                      <span style={{ color: C.faint, fontWeight: 500 }}>
                        {" "}
                        · {c.tariff}
                      </span>
                    ) : null}
                  </div>
                  <div style={{ fontSize: 12.5, color: C.sub }}>
                    {[c.contact, c.phone, c.deployUrl]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                    {c.notes ? ` · ${c.notes}` : ""}
                  </div>
                </div>
                <span style={{ fontSize: 13, color: C.ink, fontWeight: 700 }}>
                  {c.monthlyFee ? money(c.monthlyFee) : ""}
                </span>
                <select
                  value={c.status}
                  onChange={(e) => setStatus(c.id, e.target.value)}
                  style={{
                    ...inp,
                    width: 130,
                    color: st[2],
                    fontWeight: 700,
                  }}
                >
                  {STATUS.map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
                {me.role === "owner" && (
                  <button
                    onClick={() => remove(c.id)}
                    title="Удалить"
                    style={{ color: C.bad }}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </AdCard>
    </div>
  );
}

function FeaturesTab({ me, notify }) {
  const [items, setItems] = useState([]);
  const [title, setTitle] = useState("");
  const [clientName, setClientName] = useState("");
  const [priority, setPriority] = useState("normal");
  const load = () =>
    apiGet("/api/vendor/features")
      .then((d) => setItems(d.items || []))
      .catch(() => {});
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const add = async () => {
    if (!title.trim()) {
      notify("Опишите идею/запрос");
      return;
    }
    await apiPost("/api/vendor/features", {
      title: title.trim(),
      clientName: clientName.trim(),
      priority,
    }).catch(() => {});
    setTitle("");
    setClientName("");
    load();
  };
  const setStatus = async (id, status) => {
    await apiPatch(`/api/vendor/features/${id}`, { status }).catch(() => {});
    load();
  };
  const remove = async (id) => {
    try {
      await apiDelete(`/api/vendor/features/${id}`);
      load();
    } catch (e) {
      notify(e.message || "Удаление — только владельцу");
    }
  };

  return (
    <div className="space-y-4">
      <AdCard
        title="Развитие продукта"
        desc="Идеи и запросы функций — в том числе от клиентов. Статусы двигаются по мере работы."
      >
        <div className="flex flex-wrap gap-2 mb-4">
          <input
            style={{ ...inp, flex: "2 1 260px" }}
            value={title}
            placeholder="Что нужно сделать / что просит клиент"
            onChange={(e) => setTitle(e.target.value)}
          />
          <input
            style={{ ...inp, flex: "1 1 160px" }}
            value={clientName}
            placeholder="От какого клиента (необязательно)"
            onChange={(e) => setClientName(e.target.value)}
          />
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            style={{ ...inp, width: 130 }}
          >
            <option value="low">Низкий</option>
            <option value="normal">Обычный</option>
            <option value="high">Высокий</option>
          </select>
          <button
            onClick={add}
            className="rounded-xl px-4 py-2 font-bold text-white"
            style={{ background: C.brandA, fontSize: 13.5 }}
          >
            Добавить
          </button>
        </div>
        {items.length === 0 && (
          <p style={{ color: C.sub, fontSize: 13.5 }}>Пока пусто.</p>
        )}
        <div className="space-y-2">
          {items.map((f) => (
            <div
              key={f.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl px-4 py-2.5"
              style={{ background: "#FBFCFE", border: `1px solid ${C.border}` }}
            >
              <span
                className="min-w-0"
                style={{
                  flex: "1 1 220px",
                  fontSize: 14,
                  color: C.ink,
                  fontWeight: 600,
                  textDecoration: f.status === "done" ? "line-through" : "none",
                }}
              >
                {f.title}
              </span>
              {f.clientName && <Badge>{f.clientName}</Badge>}
              {f.priority === "high" && (
                <Badge color="#DC2626" bg="#FEECEC">
                  срочно
                </Badge>
              )}
              <select
                value={f.status}
                onChange={(e) => setStatus(f.id, e.target.value)}
                style={{ ...inp, width: 160 }}
              >
                {FEATURE_STATUS.map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
              {me.role === "owner" && (
                <button
                  onClick={() => remove(f.id)}
                  title="Удалить"
                  style={{ color: C.bad }}
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
      </AdCard>
    </div>
  );
}

export function BackOfficeView({ me, notify }) {
  const [tab, setTab] = useState("clients");
  const tabBtn = (key, label) => (
    <button
      onClick={() => setTab(key)}
      className="rounded-xl px-4 py-2 font-bold"
      style={{
        border: `1px solid ${tab === key ? C.brandA : C.border}`,
        background: tab === key ? C.brandA : "#fff",
        color: tab === key ? "#fff" : C.sub,
        fontSize: 13.5,
      }}
    >
      {label}
    </button>
  );
  return (
    <div className="space-y-4 max-w-5xl">
      <div
        className="rounded-2xl p-5 text-white"
        style={{ background: `linear-gradient(135deg, #1E293B, #0F172A)` }}
      >
        <div className="flex items-center gap-2 mb-1">
          <Briefcase size={20} />
          <h2 className="font-extrabold" style={{ fontSize: 18 }}>
            Back Office — управление продуктом
          </h2>
        </div>
        <p style={{ fontSize: 13.5, opacity: 0.9 }}>
          Раздел владельца системы: клиенты и продажи, развитие продукта.
          Бизнес-разделы клиента находятся в обычной админ-панели.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {tabBtn("clients", "Клиенты и продажи")}
        {tabBtn("features", "Развитие продукта")}
      </div>
      {tab === "clients" ? (
        <ClientsTab me={me} notify={notify} />
      ) : (
        <FeaturesTab me={me} notify={notify} />
      )}
    </div>
  );
}

export default BackOfficeView;
