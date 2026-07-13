// Справочники кассы в админке: статьи прихода/расхода, статьи ДДС, типы оплат,
// юр. лица. Одно место, где администратор задаёт «настройки» модуля денег —
// операции в разделе «Деньги» лишь выбирают из них. Данные общие с разделом
// «Деньги» (одна таблица MoneyDict, эндпоинты /api/money/dict); изменения
// пишутся в журнал безопасности.
import { useState, useEffect } from "react";
import { Plus, Trash2, Check, X, Pencil } from "lucide-react";
import { apiGet, apiPost, apiPatch, apiDelete } from "../api.js";
import { C } from "../lib/theme.js";
import { AdCard } from "../components/ui.jsx";

// Настраиваемые в админке типы (контрагенты/филиалы/счета — операционные, их
// заводят по месту в разделе «Деньги», сюда не выносим).
const TYPES = [
  ["category", "Статьи прихода/расхода"],
  ["ddsArticle", "Статьи ДДС"],
  ["paymentType", "Типы оплаты"],
  ["legalEntity", "Юридические лица"],
];

export default function AdminCashDict({ notify }) {
  const [dict, setDict] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = () =>
    apiGet("/api/money/dict")
      .then(setDict)
      .catch(() => setDict({}));
  useEffect(() => {
    load();
  }, []);

  const add = async (type, name) => {
    setBusy(true);
    try {
      await apiPost("/api/money/dict", { type, name });
      await load();
      notify("Добавлено");
    } catch (e) {
      notify(e.message || "Не удалось добавить");
    } finally {
      setBusy(false);
    }
  };
  const edit = async (id, name) => {
    setBusy(true);
    try {
      await apiPatch(`/api/money/dict/${id}`, { name });
      await load();
      notify("Сохранено");
    } catch (e) {
      notify(e.message || "Не удалось сохранить");
    } finally {
      setBusy(false);
    }
  };
  const remove = async (id) => {
    setBusy(true);
    try {
      await apiDelete(`/api/money/dict/${id}`);
      await load();
      notify("Удалено");
    } catch (e) {
      notify(e.message || "Не удалось удалить");
    } finally {
      setBusy(false);
    }
  };

  if (!dict) {
    return <div style={{ color: C.sub, fontSize: 13 }}>Загрузка…</div>;
  }
  return (
    <AdCard
      title="Справочники кассы"
      desc="Настройте статьи прихода/расхода, статьи ДДС и типы оплаты. Раздел «Деньги» выбирает значения из этих списков. Базовые значения (без метки) удалять нельзя. Изменения пишутся в журнал безопасности."
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {TYPES.map(([type, label]) => (
          <DictColumn
            key={type}
            label={label}
            entries={dict[type] || []}
            busy={busy}
            onAdd={(name) => add(type, name)}
            onEdit={edit}
            onDelete={remove}
          />
        ))}
      </div>
    </AdCard>
  );
}

function DictColumn({ label, entries, busy, onAdd, onEdit, onDelete }) {
  const [name, setName] = useState("");
  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState("");
  const inp = {
    border: `1px solid ${C.border}`,
    fontSize: 13,
    background: "#fff",
    color: C.ink,
    borderRadius: 9,
    padding: "7px 10px",
    flex: 1,
    minWidth: 0,
  };
  const submitAdd = () => {
    const nm = name.trim();
    if (!nm) return;
    onAdd(nm);
    setName("");
  };
  return (
    <div
      className="rounded-xl p-3"
      style={{ border: `1px solid ${C.line}`, background: "#FAFAFA" }}
    >
      <div className="font-bold mb-2" style={{ color: C.ink, fontSize: 13.5 }}>
        {label}
      </div>
      <div
        className="space-y-1 mb-2"
        style={{ maxHeight: 240, overflowY: "auto" }}
      >
        {entries.length ? (
          entries.map((e) =>
            editId && e.id === editId ? (
              <div key={e.id} className="flex items-center gap-1.5">
                <input
                  value={editName}
                  autoFocus
                  onChange={(ev) => setEditName(ev.target.value)}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter") {
                      onEdit(editId, editName.trim());
                      setEditId(null);
                    }
                    if (ev.key === "Escape") setEditId(null);
                  }}
                  style={{ ...inp, padding: "5px 8px" }}
                />
                <button
                  onClick={() => {
                    if (editName.trim()) onEdit(editId, editName.trim());
                    setEditId(null);
                  }}
                  className="p-1 shrink-0"
                  style={{ color: C.ok }}
                  title="Сохранить"
                >
                  <Check size={15} />
                </button>
                <button
                  onClick={() => setEditId(null)}
                  className="p-1 shrink-0"
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
                style={{ fontSize: 12.5, padding: "2px 0" }}
              >
                <span style={{ color: C.ink }}>
                  {e.name}
                  {e.id ? null : (
                    <span style={{ color: C.faint }}> · базовая</span>
                  )}
                </span>
                {e.id ? (
                  <span className="flex items-center gap-0.5 shrink-0">
                    <button
                      onClick={() => {
                        setEditId(e.id);
                        setEditName(e.name);
                      }}
                      className="p-1"
                      style={{ color: C.sub }}
                      title="Переименовать"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => onDelete(e.id)}
                      disabled={busy}
                      className="p-1"
                      style={{ color: C.bad }}
                      title="Удалить"
                    >
                      <Trash2 size={13} />
                    </button>
                  </span>
                ) : null}
              </div>
            ),
          )
        ) : (
          <div style={{ color: C.faint, fontSize: 12 }}>Пусто</div>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <input
          value={name}
          placeholder="Добавить…"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submitAdd()}
          style={inp}
        />
        <button
          onClick={submitAdd}
          disabled={busy || !name.trim()}
          className="p-1.5 rounded-lg shrink-0"
          style={{
            background: C.brandA,
            color: "#fff",
            opacity: busy ? 0.6 : 1,
          }}
          title="Добавить"
        >
          <Plus size={15} />
        </button>
      </div>
    </div>
  );
}
