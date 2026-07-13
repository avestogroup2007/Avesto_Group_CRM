// Менеджер задач: удобная доска дел в стиле Google Tasks. Быстрый ввод, чистый
// список с чекбоксами/сроками/исполнителями/звёздочкой, канбан-доска
// (перетаскивание между статусами), фильтры и поиск. Данные серверные
// (/api/todos) — задачи общие для команды, с охватом по ролям/филиалу.
import { useState, useEffect, useCallback } from "react";
import {
  ListTodo,
  LayoutGrid,
  List as ListIcon,
  Star,
  Circle,
  CheckCircle2,
  Plus,
  Search,
  X,
  Trash2,
  RefreshCw,
  CalendarClock,
} from "lucide-react";
import { apiGet, apiPost, apiPatch, apiDelete } from "../api.js";
import { C } from "../lib/theme.js";
import { PageHeader } from "../components/ui.jsx";

const STATUS = {
  todo: { label: "К выполнению", tone: C.sub },
  in_progress: { label: "В работе", tone: "#B45309" },
  done: { label: "Готово", tone: C.ok },
};
const COLUMNS = ["todo", "in_progress", "done"];
const PRIO = {
  high: { label: "Высокий", color: C.bad },
  normal: { label: "Обычный", color: C.sub },
  low: { label: "Низкий", color: C.faint },
};
const MONTHS = ["янв","фев","мар","апр","май","июн","июл","авг","сен","окт","ноя","дек"];

function fmtDue(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
const isOverdue = (t) =>
  t.dueDate && t.status !== "done" && new Date(t.dueDate) < new Date();
const toDateInput = (iso) => (iso ? new Date(iso).toISOString().slice(0, 10) : "");

export default function TodoManagerView({ notify }) {
  const [view, setView] = useState("list"); // list | board
  const [todos, setTodos] = useState([]);
  const [meta, setMeta] = useState({ users: [], branches: [] });
  const [loading, setLoading] = useState(true);
  const [quick, setQuick] = useState("");
  const [editing, setEditing] = useState(null);
  // Фильтры
  const [q, setQ] = useState("");
  const [assignee, setAssignee] = useState("");
  const [branch, setBranch] = useState("");
  const [tab, setTab] = useState("active"); // active | done | all
  const [starred, setStarred] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (assignee) p.set("assignee", assignee);
    if (branch) p.set("branch", branch);
    if (tab === "done") p.set("status", "done");
    if (starred) p.set("important", "1");
    apiGet(`/api/todos?${p.toString()}`)
      .then((rows) => {
        // «Активные» = не done; фильтр статуса done уже на сервере.
        setTodos(tab === "active" ? rows.filter((t) => t.status !== "done") : rows);
      })
      .catch(() => setTodos([]))
      .finally(() => setLoading(false));
  }, [q, assignee, branch, tab, starred]);

  useEffect(() => {
    apiGet("/api/todos/meta")
      .then(setMeta)
      .catch(() => {});
  }, []);
  useEffect(() => {
    const id = setTimeout(load, q ? 250 : 0); // дебаунс поиска
    return () => clearTimeout(id);
  }, [load, q]);

  const patch = async (id, body) => {
    try {
      const upd = await apiPatch(`/api/todos/${id}`, body);
      setTodos((ts) => ts.map((t) => (t.id === id ? { ...t, ...upd } : t)));
      return upd;
    } catch (e) {
      notify && notify(e.message || "Не удалось сохранить");
    }
  };
  const toggleDone = (t) =>
    patch(t.id, { status: t.status === "done" ? "todo" : "done" });
  const toggleStar = (t) => patch(t.id, { important: !t.important });

  const addQuick = async () => {
    const title = quick.trim();
    if (!title) return;
    setQuick("");
    try {
      const created = await apiPost("/api/todos", { title });
      setTodos((ts) => [created, ...ts]);
    } catch (e) {
      notify && notify(e.message || "Не удалось создать");
    }
  };

  const removeTodo = async (id) => {
    try {
      await apiDelete(`/api/todos/${id}`);
      setTodos((ts) => ts.filter((t) => t.id !== id));
      setEditing(null);
      notify && notify("Задача удалена");
    } catch (e) {
      notify && notify(e.message || "Не удалось удалить");
    }
  };

  const chip = (bg, fg, children, key) => (
    <span
      key={key}
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5"
      style={{ background: bg, color: fg, fontSize: 11, fontWeight: 600 }}
    >
      {children}
    </span>
  );

  // Карточка задачи (общая для списка и доски).
  const Card = ({ t, draggable }) => (
    <div
      draggable={draggable}
      onDragStart={(e) => e.dataTransfer.setData("text/todo", t.id)}
      onClick={() => setEditing(t)}
      className="flex items-start gap-2.5 rounded-xl bg-white p-3 cursor-pointer"
      style={{ border: `1px solid ${C.border}` }}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          toggleDone(t);
        }}
        className="shrink-0 mt-0.5"
        title={t.status === "done" ? "Вернуть в работу" : "Отметить готовым"}
      >
        {t.status === "done" ? (
          <CheckCircle2 size={20} color={C.ok} />
        ) : (
          <Circle size={20} color={C.faint} />
        )}
      </button>
      <div className="min-w-0 flex-1">
        <div
          style={{
            color: t.status === "done" ? C.faint : C.ink,
            fontWeight: 600,
            fontSize: 13.5,
            textDecoration: t.status === "done" ? "line-through" : "none",
          }}
        >
          {t.title}
        </div>
        {t.description ? (
          <div className="truncate" style={{ color: C.faint, fontSize: 12 }}>
            {t.description}
          </div>
        ) : null}
        <div className="flex flex-wrap gap-1 mt-1">
          {t.dueDate
            ? chip(
                isOverdue(t) ? "#FEE2E2" : "#EEF2FF",
                isOverdue(t) ? C.bad : C.brandA,
                <>
                  <CalendarClock size={11} /> {fmtDue(t.dueDate)}
                </>,
                "due",
              )
            : null}
          {t.assigneeName
            ? chip("#F1F5F9", C.sub, t.assigneeName, "asg")
            : null}
          {t.priority === "high"
            ? chip("#FEF2F2", C.bad, PRIO.high.label, "prio")
            : null}
          {view === "list" && t.status !== "done"
            ? chip("#F8FAFC", STATUS[t.status].tone, STATUS[t.status].label, "st")
            : null}
        </div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          toggleStar(t);
        }}
        className="shrink-0"
        title="Важное"
      >
        <Star
          size={18}
          color={t.important ? "#F59E0B" : C.faint}
          fill={t.important ? "#F59E0B" : "none"}
        />
      </button>
    </div>
  );

  const sel = {
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    padding: "6px 8px",
    fontSize: 12.5,
    color: C.ink,
    background: "#fff",
  };

  return (
    <div className="space-y-4">
      <PageHeader icon={ListTodo} title="Менеджер задач">
        <div
          className="flex rounded-lg overflow-hidden"
          style={{ border: `1px solid ${C.border}` }}
        >
          {[
            ["list", ListIcon, "Список"],
            ["board", LayoutGrid, "Доска"],
          ].map(([v, Icon, lbl]) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 font-semibold"
              style={{
                background: view === v ? C.brandA : "#fff",
                color: view === v ? "#fff" : C.sub,
                fontSize: 12,
              }}
            >
              <Icon size={13} /> {lbl}
            </button>
          ))}
        </div>
        <button
          onClick={load}
          className="p-2 rounded-lg"
          style={{ border: `1px solid ${C.border}`, color: C.sub }}
          title="Обновить"
        >
          <RefreshCw size={14} />
        </button>
      </PageHeader>

      {/* Быстрый ввод */}
      <div
        className="flex items-center gap-2 rounded-xl bg-white px-3 py-2"
        style={{ border: `1px solid ${C.border}` }}
      >
        <Plus size={18} color={C.brandA} className="shrink-0" />
        <input
          value={quick}
          onChange={(e) => setQuick(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addQuick()}
          placeholder="Новая задача — введите и нажмите Enter"
          style={{ flex: 1, fontSize: 14, color: C.ink, outline: "none" }}
        />
        <button
          onClick={addQuick}
          disabled={!quick.trim()}
          className="rounded-lg px-3 py-1.5 font-bold text-white"
          style={{ background: C.brandA, fontSize: 13, opacity: quick.trim() ? 1 : 0.5 }}
        >
          Добавить
        </button>
      </div>

      {/* Фильтры */}
      <div className="flex flex-wrap items-center gap-2">
        <div
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5"
          style={{ border: `1px solid ${C.border}`, background: "#fff" }}
        >
          <Search size={14} color={C.faint} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Поиск"
            style={{ fontSize: 12.5, color: C.ink, outline: "none", width: 130 }}
          />
        </div>
        {view === "list" && (
          <div
            className="flex rounded-lg overflow-hidden"
            style={{ border: `1px solid ${C.border}` }}
          >
            {[
              ["active", "Активные"],
              ["done", "Готовые"],
              ["all", "Все"],
            ].map(([v, lbl]) => (
              <button
                key={v}
                onClick={() => setTab(v)}
                className="px-2.5 py-1.5 font-semibold"
                style={{
                  background: tab === v ? "#F5F3FF" : "#fff",
                  color: tab === v ? C.brandA : C.sub,
                  fontSize: 12,
                }}
              >
                {lbl}
              </button>
            ))}
          </div>
        )}
        <select value={assignee} onChange={(e) => setAssignee(e.target.value)} style={sel}>
          <option value="">Все исполнители</option>
          {meta.users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        {meta.branches.length > 0 && (
          <select value={branch} onChange={(e) => setBranch(e.target.value)} style={sel}>
            <option value="">Все филиалы</option>
            {meta.branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        )}
        <button
          onClick={() => setStarred((s) => !s)}
          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 font-semibold"
          style={{
            border: `1px solid ${starred ? "#F59E0B" : C.border}`,
            color: starred ? "#B45309" : C.sub,
            background: starred ? "#FFFBEB" : "#fff",
            fontSize: 12,
          }}
        >
          <Star size={13} fill={starred ? "#F59E0B" : "none"} color={starred ? "#F59E0B" : C.sub} />
          Важные
        </button>
      </div>

      {loading ? (
        <div style={{ color: C.sub, fontSize: 14 }}>Загрузка…</div>
      ) : view === "list" ? (
        todos.length === 0 ? (
          <div
            className="rounded-2xl bg-white p-6 text-center"
            style={{ border: `1px solid ${C.border}`, color: C.sub, fontSize: 13 }}
          >
            Задач нет. Добавьте первую сверху.
          </div>
        ) : (
          <div className="space-y-2">
            {todos.map((t) => (
              <Card key={t.id} t={t} draggable={false} />
            ))}
          </div>
        )
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {COLUMNS.map((col) => {
            const items = todos.filter((t) => t.status === col);
            return (
              <div
                key={col}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  const id = e.dataTransfer.getData("text/todo");
                  const t = todos.find((x) => x.id === id);
                  if (t && t.status !== col) patch(id, { status: col });
                }}
                className="rounded-2xl p-3"
                style={{ background: "#F8FAFC", border: `1px solid ${C.border}`, minHeight: 120 }}
              >
                <div className="flex items-center justify-between mb-2 px-1">
                  <span style={{ fontWeight: 700, color: STATUS[col].tone, fontSize: 13 }}>
                    {STATUS[col].label}
                  </span>
                  <span style={{ color: C.faint, fontSize: 12 }}>{items.length}</span>
                </div>
                <div className="space-y-2">
                  {items.map((t) => (
                    <Card key={t.id} t={t} draggable />
                  ))}
                  {items.length === 0 && (
                    <div style={{ color: C.faint, fontSize: 12, padding: "8px 4px" }}>
                      Перетащите сюда задачу
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <EditModal
          todo={editing}
          meta={meta}
          onClose={() => setEditing(null)}
          onSave={async (body) => {
            await patch(editing.id, body);
            setEditing(null);
          }}
          onDelete={() => removeTodo(editing.id)}
        />
      )}
    </div>
  );
}

function EditModal({ todo, meta, onClose, onSave, onDelete }) {
  const [f, setF] = useState({
    title: todo.title,
    description: todo.description || "",
    status: todo.status,
    priority: todo.priority,
    important: todo.important,
    assigneeId: todo.assigneeId || "",
    branchId: todo.branchId || "",
    dueDate: toDateInput(todo.dueDate),
  });
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const inp = {
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    padding: "8px 10px",
    fontSize: 13.5,
    width: "100%",
    color: C.ink,
  };
  const save = () =>
    onSave({
      title: f.title,
      description: f.description,
      status: f.status,
      priority: f.priority,
      important: f.important,
      assigneeId: f.assigneeId || null,
      branchId: f.branchId || null,
      dueDate: f.dueDate ? new Date(f.dueDate).toISOString() : null,
    });
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(30,16,10,.5)" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="rounded-2xl bg-white w-full max-w-md"
        style={{ border: `1px solid ${C.border}`, maxHeight: "92vh", overflowY: "auto" }}
      >
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${C.border}` }}>
          <span className="font-bold" style={{ color: C.ink, fontSize: 15 }}>
            Задача
          </span>
          <button onClick={onClose} className="p-1.5 rounded-lg" style={{ background: C.line }}>
            <X size={16} color={C.sub} />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <input value={f.title} onChange={(e) => set("title", e.target.value)} style={{ ...inp, fontWeight: 600 }} placeholder="Название" />
          <textarea value={f.description} onChange={(e) => set("description", e.target.value)} style={{ ...inp, minHeight: 64, resize: "vertical" }} placeholder="Описание" />
          <div className="grid grid-cols-2 gap-2">
            <label style={{ fontSize: 11.5, color: C.faint }}>
              Статус
              <select value={f.status} onChange={(e) => set("status", e.target.value)} style={inp}>
                <option value="todo">К выполнению</option>
                <option value="in_progress">В работе</option>
                <option value="done">Готово</option>
              </select>
            </label>
            <label style={{ fontSize: 11.5, color: C.faint }}>
              Приоритет
              <select value={f.priority} onChange={(e) => set("priority", e.target.value)} style={inp}>
                <option value="low">Низкий</option>
                <option value="normal">Обычный</option>
                <option value="high">Высокий</option>
              </select>
            </label>
            <label style={{ fontSize: 11.5, color: C.faint }}>
              Исполнитель
              <select value={f.assigneeId} onChange={(e) => set("assigneeId", e.target.value)} style={inp}>
                <option value="">— не назначен —</option>
                {meta.users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ fontSize: 11.5, color: C.faint }}>
              Срок
              <input type="date" value={f.dueDate} onChange={(e) => set("dueDate", e.target.value)} style={inp} />
            </label>
          </div>
          {meta.branches.length > 0 && (
            <label style={{ fontSize: 11.5, color: C.faint }}>
              Филиал
              <select value={f.branchId} onChange={(e) => set("branchId", e.target.value)} style={inp}>
                <option value="">— без филиала —</option>
                {meta.branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="inline-flex items-center gap-2" style={{ fontSize: 13, color: C.ink }}>
            <input type="checkbox" checked={f.important} onChange={(e) => set("important", e.target.checked)} />
            <Star size={15} color="#F59E0B" fill={f.important ? "#F59E0B" : "none"} /> Важное
          </label>
        </div>
        <div className="flex items-center justify-between gap-2 px-4 py-3" style={{ borderTop: `1px solid ${C.border}` }}>
          <button onClick={onDelete} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 font-semibold" style={{ border: `1px solid ${C.border}`, color: C.bad, fontSize: 13 }}>
            <Trash2 size={14} /> Удалить
          </button>
          <button onClick={save} disabled={!f.title.trim()} className="rounded-lg px-4 py-2 font-bold text-white" style={{ background: C.brandA, fontSize: 14, opacity: f.title.trim() ? 1 : 0.5 }}>
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );
}
