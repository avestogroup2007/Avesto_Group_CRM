// Рабочие зоны: зал, кухня, бар, туалет, витрина, цех.
//
// Порядок работы, под который сделан экран: завести зону → указать, каким
// должностям она положена → назначить сотрудникам (вкладка «Сотрудники») →
// повесить на зону чек-листы (вкладка «Чек-листы»).
//
// Ведут зоны старшие должности: директор, менеджер, шеф-повар (приходит из
// iiko как manager), бухгалтер, системный администратор.
import { useState, useEffect } from "react";
import { PlusCircle, Trash2, MapPin } from "lucide-react";
import { apiGet, apiPost, apiPatch, apiDelete } from "../api.js";
import { C } from "../lib/theme.js";
import { Field, AdCard, NiceSelect } from "../components/ui.jsx";

const inp = {
  border: `1px solid ${C.border}`,
  borderRadius: 10,
  padding: "8px 11px",
  fontSize: 13.5,
  background: "#fff",
  color: C.ink,
  width: "100%",
};

export default function AdminZones({ s, notify }) {
  const [items, setItems] = useState([]);
  const [positions, setPositions] = useState([]);
  const [form, setForm] = useState({
    name: "",
    branchId: "",
    positions: [],
    comment: "",
  });
  const [saving, setSaving] = useState(false);
  const branches = s?.branches || [];

  const load = () => {
    apiGet("/api/zones")
      .then((d) => setItems(d.items || []))
      .catch(() => setItems([]));
  };
  useEffect(() => {
    load();
    // Должности берём из того же справочника, что и чек-листы, — чтобы зона и
    // чек-лист ссылались на одинаково написанную должность.
    apiGet("/api/checklist-templates/meta")
      .then((d) => setPositions(d.positions || []))
      .catch(() => setPositions([]));
  }, []);

  const save = async () => {
    if (!form.name.trim()) return notify("Укажите название зоны");
    setSaving(true);
    try {
      await apiPost("/api/zones", {
        name: form.name.trim(),
        branchId: form.branchId || null,
        positions: form.positions,
        comment: form.comment.trim(),
      });
      setForm({ name: "", branchId: "", positions: [], comment: "" });
      load();
      notify("Зона создана");
    } catch (e) {
      notify(e.message || "Не удалось создать зону");
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (z) => {
    try {
      await apiPatch(`/api/zones/${z.id}`, { active: !z.active });
      load();
    } catch (e) {
      notify(e.message || "Не удалось изменить");
    }
  };

  const remove = async (z) => {
    if (!window.confirm(`Удалить зону «${z.name}»?`)) return;
    try {
      await apiDelete(`/api/zones/${z.id}`);
      load();
      notify("Зона удалена");
    } catch (e) {
      // Сервер не даёт удалить зону с чек-листами и объясняет, почему.
      notify(e.message || "Не удалось удалить");
    }
  };

  const togglePos = (p) =>
    setForm((f) => ({
      ...f,
      positions: f.positions.includes(p)
        ? f.positions.filter((x) => x !== p)
        : [...f.positions, p],
    }));

  const branchName = (id) =>
    branches.find((b) => String(b.id) === String(id))?.name || "";

  return (
    <AdCard
      title="Рабочие зоны"
      desc="Место работы внутри филиала: зал, кухня, бар, туалет, витрина, цех. Сначала заведите зону и укажите, каким должностям она положена. Затем назначьте зоны сотрудникам во вкладке «Сотрудники» (можно несколько — свою плюс те, что человек контролирует или где подменяет) и повесьте на зону чек-листы во вкладке «Чек-листы»."
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Название зоны">
          <input
            style={inp}
            value={form.name}
            placeholder="Например: Зал"
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </Field>
        <Field label="Филиал">
          <NiceSelect
            ariaLabel="Филиал зоны"
            value={form.branchId}
            width="100%"
            onChange={(v) => setForm({ ...form, branchId: v })}
            options={[
              { value: "", label: "— общая для сети —" },
              ...branches.map((b) => ({
                value: String(b.id),
                label: b.name,
              })),
            ]}
          />
        </Field>
      </div>

      <div className="mt-3">
        <div
          style={{
            fontSize: 12,
            color: C.faint,
            fontWeight: 600,
            marginBottom: 6,
          }}
        >
          Каким должностям положена зона{" "}
          <span style={{ fontWeight: 400 }}>
            (ничего не выбрано — любой должности)
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {positions.map((p) => {
            const on = form.positions.includes(p);
            return (
              <button
                key={p}
                type="button"
                aria-pressed={on}
                onClick={() => togglePos(p)}
                className="rounded-full px-3 font-semibold"
                style={{
                  minHeight: 36,
                  fontSize: 12.5,
                  border: `1px solid ${on ? C.brandA : C.border}`,
                  background: on ? C.brandA : "#fff",
                  color: on ? "#fff" : C.sub,
                }}
              >
                {p}
              </button>
            );
          })}
          {positions.length === 0 && (
            <span style={{ fontSize: 12.5, color: C.faint }}>
              Справочник должностей пуст — синхронизируйте сотрудников из iiko.
            </span>
          )}
        </div>
      </div>

      <div className="mt-3">
        <Field label="Комментарий">
          <input
            style={inp}
            value={form.comment}
            placeholder="Например: основной зал, 12 столов"
            onChange={(e) => setForm({ ...form, comment: e.target.value })}
          />
        </Field>
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 font-bold text-white mt-3"
        style={{ background: C.brandA, fontSize: 14.5, opacity: saving ? 0.6 : 1 }}
      >
        <PlusCircle size={17} />
        {saving ? "Сохранение…" : "Создать зону"}
      </button>

      <div className="mt-4 space-y-1.5">
        {items.length === 0 ? (
          <p style={{ fontSize: 13, color: C.sub }}>
            Зон пока нет. Заведите первую — после этого её можно будет выбрать в
            чек-листах и назначить сотрудникам.
          </p>
        ) : (
          items.map((z) => (
            <div
              key={z.id}
              className="flex items-center gap-2 flex-wrap rounded-xl px-3 py-2"
              style={{ background: "#FBFCFE", border: `1px solid ${C.border}` }}
            >
              <MapPin size={15} color={C.brandA} className="shrink-0" />
              <span
                className="min-w-0"
                style={{ flex: "1 1 200px", fontSize: 14, color: C.ink }}
              >
                <b>{z.name}</b>
                <span style={{ color: C.faint }}>
                  {" · "}
                  {z.branchId ? branchName(z.branchId) : "вся сеть"}
                </span>
                {Array.isArray(z.positions) && z.positions.length > 0 && (
                  <span style={{ color: C.sub }}>
                    {" · "}
                    {z.positions.join(", ")}
                  </span>
                )}
                {z.comment ? (
                  <span style={{ color: C.faint }}>{" · " + z.comment}</span>
                ) : null}
              </span>
              <button
                onClick={() => toggle(z)}
                className="rounded-full px-2.5 py-1 font-bold"
                style={{
                  fontSize: 12,
                  minHeight: 32,
                  border: `1px solid ${z.active ? C.ok : C.border}`,
                  background: z.active ? "#E9F9EF" : "#fff",
                  color: z.active ? C.ok : C.faint,
                }}
              >
                {z.active ? "активна" : "выключена"}
              </button>
              <button
                onClick={() => remove(z)}
                aria-label={`Удалить зону ${z.name}`}
                className="inline-flex items-center justify-center rounded-lg"
                style={{ minWidth: 36, minHeight: 36, color: C.bad }}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))
        )}
      </div>
    </AdCard>
  );
}
