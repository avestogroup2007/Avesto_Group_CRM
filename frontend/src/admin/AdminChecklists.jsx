// Настройка чек-листов клиентом (админка). Видна только если владелец включил
// модуль в Back Office. role — чек-листы по должностям, cleaning — уборка с
// расписанием. Само содержимое настраивает клиент; включение — владелец.
import { useState, useEffect } from "react";
import { PlusCircle, Trash2, Camera } from "lucide-react";
import { apiGet, apiPost, apiPatch, apiDelete } from "../api.js";
import { C } from "../lib/theme.js";
import { Field, AdCard } from "../components/ui.jsx";

const inp = {
  border: `1px solid ${C.border}`,
  borderRadius: 10,
  padding: "8px 11px",
  fontSize: 13.5,
  background: "#fff",
  color: C.ink,
  width: "100%",
};

function blankTemplate(kind) {
  return {
    kind,
    position: "",
    title: "",
    items: [{ text: "", needPhoto: false }],
    scheduleType: kind === "cleaning" ? "hourly" : "shift",
    fromHour: kind === "cleaning" ? 8 : null,
    toHour: kind === "cleaning" ? 20 : null,
    active: true,
  };
}

function Editor({ kind, notify, onSaved }) {
  const [t, setT] = useState(blankTemplate(kind));
  const setItem = (i, patch) =>
    setT((x) => ({
      ...x,
      items: x.items.map((it, j) => (j === i ? { ...it, ...patch } : it)),
    }));
  const save = async () => {
    if (!t.title.trim()) {
      notify("Укажите название чек-листа");
      return;
    }
    const items = t.items
      .map((it) => ({ text: it.text.trim(), needPhoto: !!it.needPhoto }))
      .filter((it) => it.text);
    if (!items.length) {
      notify("Добавьте хотя бы один пункт");
      return;
    }
    try {
      await apiPost("/api/checklist-templates", { ...t, items });
      setT(blankTemplate(kind));
      notify("Чек-лист сохранён");
      onSaved();
    } catch (e) {
      notify(e.message || "Не удалось сохранить");
    }
  };
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {kind === "role" && (
          <Field label="Должность">
            <input
              style={inp}
              value={t.position}
              placeholder="Например: Официант"
              onChange={(e) => setT({ ...t, position: e.target.value })}
            />
          </Field>
        )}
        <Field label="Название чек-листа">
          <input
            style={inp}
            value={t.title}
            placeholder={
              kind === "cleaning" ? "Санитарный обход" : "Открытие смены"
            }
            onChange={(e) => setT({ ...t, title: e.target.value })}
          />
        </Field>
        <Field label="Когда выполняется">
          <select
            style={inp}
            value={t.scheduleType}
            onChange={(e) => setT({ ...t, scheduleType: e.target.value })}
          >
            <option value="shift">В смену (один раз)</option>
            <option value="daily">Ежедневно</option>
            <option value="hourly">Каждый час (окно)</option>
          </select>
        </Field>
        {t.scheduleType === "hourly" && (
          <Field label="Окно (часы, с — до)">
            <div className="flex items-center gap-2">
              <input
                style={{ ...inp, width: 70 }}
                type="number"
                min={0}
                max={23}
                value={t.fromHour ?? 8}
                onChange={(e) => setT({ ...t, fromHour: +e.target.value || 0 })}
              />
              <span style={{ color: C.sub }}>—</span>
              <input
                style={{ ...inp, width: 70 }}
                type="number"
                min={0}
                max={23}
                value={t.toHour ?? 20}
                onChange={(e) => setT({ ...t, toHour: +e.target.value || 0 })}
              />
            </div>
          </Field>
        )}
      </div>
      <div>
        <div style={{ fontSize: 12.5, color: C.faint, fontWeight: 600 }}>
          Пункты чек-листа
        </div>
        <div className="space-y-2 mt-1">
          {t.items.map((it, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                style={inp}
                value={it.text}
                placeholder={`Пункт ${i + 1}`}
                onChange={(e) => setItem(i, { text: e.target.value })}
              />
              <button
                onClick={() => setItem(i, { needPhoto: !it.needPhoto })}
                title="Требует фотоотчёт"
                className="rounded-lg px-2.5 py-2 shrink-0"
                style={{
                  border: `1px solid ${it.needPhoto ? C.brandA : C.border}`,
                  background: it.needPhoto ? "#FDECEA" : "#fff",
                  color: it.needPhoto ? C.brandA : C.faint,
                }}
              >
                <Camera size={16} />
              </button>
              {t.items.length > 1 && (
                <button
                  onClick={() =>
                    setT((x) => ({
                      ...x,
                      items: x.items.filter((_, j) => j !== i),
                    }))
                  }
                  className="shrink-0"
                  style={{ color: C.bad }}
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
        <button
          onClick={() =>
            setT((x) => ({
              ...x,
              items: [...x.items, { text: "", needPhoto: false }],
            }))
          }
          className="mt-2 inline-flex items-center gap-1.5 font-semibold"
          style={{ color: C.brandA, fontSize: 13 }}
        >
          <PlusCircle size={15} /> Добавить пункт
        </button>
      </div>
      <button
        onClick={save}
        className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 font-bold text-white"
        style={{ background: C.brandA, fontSize: 14 }}
      >
        Сохранить чек-лист
      </button>
    </div>
  );
}

function TemplateList({ items, kind, notify, onChanged }) {
  const list = items.filter((t) => t.kind === kind);
  const remove = async (id) => {
    if (!window.confirm("Удалить чек-лист?")) return;
    await apiDelete(`/api/checklist-templates/${id}`).catch(() => {});
    onChanged();
  };
  const toggle = async (t) => {
    await apiPatch(`/api/checklist-templates/${t.id}`, {
      active: !t.active,
    }).catch(() => {});
    onChanged();
  };
  if (!list.length)
    return (
      <p style={{ color: C.sub, fontSize: 13 }}>
        Пока нет ни одного чек-листа.
      </p>
    );
  return (
    <div className="space-y-2">
      {list.map((t) => (
        <div
          key={t.id}
          className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl px-4 py-2.5"
          style={{ background: "#FBFCFE", border: `1px solid ${C.border}` }}
        >
          <span
            className="min-w-0"
            style={{ flex: "1 1 200px", fontSize: 14, color: C.ink }}
          >
            <b>{t.title}</b>
            {t.position ? (
              <span style={{ color: C.faint }}> · {t.position}</span>
            ) : null}
            <span style={{ color: C.faint }}>
              {" "}
              · {t.items.length} пунктов
              {t.scheduleType === "hourly"
                ? ` · ${t.fromHour}–${t.toHour} ч`
                : t.scheduleType === "daily"
                  ? " · ежедневно"
                  : " · в смену"}
            </span>
          </span>
          <button
            onClick={() => toggle(t)}
            className="rounded-full px-2.5 py-1 font-bold"
            style={{
              fontSize: 12,
              background: t.active ? "#E9F9EF" : C.line,
              color: t.active ? "#16A34A" : C.sub,
            }}
          >
            {t.active ? "активен" : "выключен"}
          </button>
          <button
            onClick={() => remove(t.id)}
            title="Удалить"
            style={{ color: C.bad }}
          >
            <Trash2 size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}

export default function AdminChecklists({ notify }) {
  const [data, setData] = useState({ items: [], modules: {} });
  const load = () =>
    apiGet("/api/checklist-templates")
      .then(setData)
      .catch(() => {});
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const m = data.modules || {};
  if (!m.employeeChecklists && !m.cleaningChecklists) {
    return (
      <AdCard title="Чек-листы">
        <p style={{ color: C.sub, fontSize: 14 }}>
          Модуль чек-листов выключен. Обратитесь к владельцу системы, чтобы
          включить «Чек-листы сотрудников» или «Чек-листы уборки».
        </p>
      </AdCard>
    );
  }
  return (
    <div className="space-y-5">
      {m.employeeChecklists && (
        <AdCard
          title="Чек-листы сотрудников (по должностям)"
          desc="Создайте чек-листы для управляющего, официанта, повара и других должностей."
        >
          <Editor kind="role" notify={notify} onSaved={load} />
          <div className="mt-4">
            <TemplateList
              items={data.items}
              kind="role"
              notify={notify}
              onChanged={load}
            />
          </div>
        </AdCard>
      )}
      {m.cleaningChecklists && (
        <AdCard
          title="Чек-листы уборки"
          desc="Почасовые чек-листы уборки и санитарии с окном по времени и фотоотчётом."
        >
          <Editor kind="cleaning" notify={notify} onSaved={load} />
          <div className="mt-4">
            <TemplateList
              items={data.items}
              kind="cleaning"
              notify={notify}
              onChanged={load}
            />
          </div>
        </AdCard>
      )}
    </div>
  );
}
