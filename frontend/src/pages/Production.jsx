// Производство: автогенерация документов iiko по техкарте.
// Три режима в одном разделе (ТЗ 14.3):
//   Задания   — расчёт по изделию, предпросмотр плана и запуск (ТЗ 5.1)
//   Монитор   — план/состав/ввод факта по отделу (ТЗ 5.4)
//   Конструктор — разовый состав заказного изделия (ТЗ 5.2)
import { useState, useEffect, useCallback } from "react";
import { Factory, RefreshCw, Play, Plus, Trash2, Check } from "lucide-react";
import { apiGet, apiPost } from "../api.js";
import { C } from "../lib/theme.js";
import { Kpi, PageHeader, NiceSelect, NiceDate } from "../components/ui.jsx";

const num = (n) => Number(n || 0).toLocaleString("ru-RU");
const today = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tashkent" });

const PHASE_COLOR = {
  RAW: "#6B7280",
  CLEAN: "#0D9488",
  SEMI: "#2563EB",
  ASSEMBLY: "#7C3AED",
  COATING: "#B45309",
  CUTTING: "#DC2626",
  DECOR: "#DB2777",
  FINISHED: "#15803D",
};

function Box({ children }) {
  return (
    <div
      className="rounded-2xl bg-white p-4 sm:p-5"
      style={{ border: `1px solid ${C.border}` }}
    >
      {children}
    </div>
  );
}

function ErrBox({ text }) {
  return (
    <div
      className="rounded-2xl bg-white p-5"
      style={{ border: `1px solid ${C.border}`, color: C.sub, fontSize: 13 }}
    >
      {text}
    </div>
  );
}

export default function ProductionView({ notify, role }) {
  const canPlan = ["director", "finance", "accountant", "sysadmin"].includes(
    role,
  );
  const [tab, setTab] = useState(canPlan ? "tasks" : "monitor");
  const [health, setHealth] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const h = canPlan
        ? await apiGet("/api/production/health")
        : { issues: [] };
      setHealth(h);
      setErr("");
    } catch (e) {
      setErr(e.message || "Не удалось загрузить");
    } finally {
      setLoading(false);
    }
  }, [canPlan]);

  useEffect(() => {
    load();
  }, [load]);

  const moduleOff = err && /выключен/i.test(err);

  const header = (
    <PageHeader icon={Factory} title="Производство — задания и документы">
      <div className="flex gap-1">
        {[
          ["tasks", "Задания"],
          ["monitor", "Монитор отдела"],
          ["constructor", "Конструктор"],
        ].map(([k, lbl]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className="rounded-lg px-2.5 py-1 font-semibold"
            style={{
              fontSize: 12,
              border: `1px solid ${tab === k ? C.brandA : C.border}`,
              color: tab === k ? C.brandA : C.sub,
              background: tab === k ? "#F5F3FF" : "#fff",
            }}
          >
            {lbl}
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
  );

  if (moduleOff) {
    return (
      <div className="space-y-4">
        {header}
        <ErrBox text="Модуль «Производство» выключен. Включите его в Back Office (владелец системы) — раздел «Модули»." />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {header}
      {err && !moduleOff && <ErrBox text={err} />}
      {loading && !health ? (
        <div style={{ color: C.sub, fontSize: 14 }}>Загрузка…</div>
      ) : null}

      {/* Что мешает запуску — показываем честно, а не прячем (ТЗ 10, 12) */}
      {canPlan && health?.issues?.length > 0 && (
        <div
          className="rounded-2xl p-4"
          style={{
            border: "1px solid #FCD34D",
            background: "#FFFBEB",
            color: "#92400E",
            fontSize: 12.5,
          }}
        >
          <b>Настройка не завершена:</b>
          <ul style={{ marginTop: 6, paddingLeft: 18, listStyle: "disc" }}>
            {health.issues.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
          <div style={{ marginTop: 6, opacity: 0.85 }}>
            Техкарт загружено: {num(health.charts)} · правил «фаза → склад»:{" "}
            {num(health.phaseMaps)}
          </div>
        </div>
      )}

      {tab === "tasks" && <TasksTab notify={notify} canPlan={canPlan} />}
      {tab === "monitor" && <MonitorTab notify={notify} role={role} />}
      {tab === "constructor" && (
        <ConstructorTab notify={notify} canPlan={canPlan} />
      )}
    </div>
  );
}

// ── Задания: расчёт → предпросмотр → запуск ────────────────────────────────
function TasksTab({ notify, canPlan }) {
  const [productCode, setProductCode] = useState("");
  const [qty, setQty] = useState("1");
  const [date, setDate] = useState(today());
  const [plan, setPlan] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const loadTasks = useCallback(async () => {
    try {
      const d = await apiGet("/api/production/tasks");
      setTasks(d.tasks || []);
    } catch (e) {
      setErr(e.message || "Ошибка");
    }
  }, []);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const preview = async () => {
    if (!productCode.trim()) {
      notify && notify("Укажите код изделия из iiko");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const p = await apiPost("/api/production/preview", {
        productCode: productCode.trim(),
        qty: Number(qty) || 1,
      });
      setPlan(p);
    } catch (e) {
      setPlan(null);
      setErr(e.message || "Не удалось рассчитать");
    } finally {
      setBusy(false);
    }
  };

  const start = async () => {
    setBusy(true);
    try {
      const out = await apiPost("/api/production/tasks", {
        productCode: productCode.trim(),
        qty: Number(qty) || 1,
        deliveryDate: date,
      });
      notify &&
        notify(
          out.duplicate
            ? "Задание по этому заказу уже создано"
            : `Создано заданий: ${out.tasks.length}`,
        );
      setPlan(null);
      loadTasks();
    } catch (e) {
      notify && notify(e.message || "Не удалось создать задание");
    } finally {
      setBusy(false);
    }
  };

  const inp = {
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    padding: "5px 8px",
    fontSize: 12.5,
  };

  return (
    <div className="space-y-3">
      {canPlan && (
        <Box>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={productCode}
              onChange={(e) => setProductCode(e.target.value)}
              placeholder="Код изделия в iiko"
              style={{ ...inp, width: 260 }}
            />
            <input
              value={qty}
              onChange={(e) => setQty(e.target.value.replace(/[^\d.]/g, ""))}
              placeholder="Количество"
              inputMode="decimal"
              style={{ ...inp, width: 110, textAlign: "right" }}
            />
            <NiceDate value={date} onChange={setDate} />
            <button
              onClick={preview}
              disabled={busy}
              className="rounded-lg px-3 py-1.5 font-semibold"
              style={{
                border: `1px solid ${C.border}`,
                color: C.sub,
                fontSize: 12.5,
                opacity: busy ? 0.6 : 1,
              }}
            >
              Рассчитать
            </button>
            {plan && !plan.shipOnly && (
              <button
                onClick={start}
                disabled={busy}
                className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 font-bold text-white"
                style={{ background: C.brandA, fontSize: 12.5 }}
              >
                <Play size={13} /> Запустить в работу
              </button>
            )}
          </div>
          <div style={{ fontSize: 11.5, color: C.faint, marginTop: 8 }}>
            Расчёт показывает план ДО записи в iiko. Документы создаются позже —
            когда отдел подтвердит фактически выполненный объём.
          </div>
        </Box>
      )}

      {err && <ErrBox text={err} />}

      {plan && <PlanView plan={plan} />}

      <Box>
        <div style={{ fontWeight: 700, color: C.ink, marginBottom: 8 }}>
          Активные задания
        </div>
        {tasks.length === 0 ? (
          <div style={{ color: C.faint, fontSize: 13 }}>Заданий пока нет.</div>
        ) : (
          <TaskTable tasks={tasks} />
        )}
      </Box>
    </div>
  );
}

// Предпросмотр плана (ТЗ 5.1, FR-9).
function PlanView({ plan }) {
  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Kpi label="Заказано" value={num(plan.orderedQty)} tone={C.brandB} />
        <Kpi label="Есть на складе ГП" value={num(plan.stockGp)} tone={C.ok} />
        <Kpi
          label="К производству"
          value={num(plan.toProduceGp)}
          tone={plan.toProduceGp > 0 ? C.bad : C.ok}
        />
        <Kpi label="Актов/узлов" value={num(plan.nodes.length)} tone={C.sub} />
      </div>

      {plan.shipOnly && (
        <div
          className="rounded-2xl p-4"
          style={{
            border: "1px solid #A7F3D0",
            background: "#ECFDF5",
            color: "#065F46",
            fontSize: 13,
          }}
        >
          Остатка готовой продукции достаточно — производство не требуется,
          заказ закрывается отгрузкой.
        </div>
      )}

      {plan.issues?.length > 0 && (
        <div
          className="rounded-2xl p-4"
          style={{
            border: "1px solid #FCA5A5",
            background: "#FEF2F2",
            color: "#991B1B",
            fontSize: 12.5,
          }}
        >
          <b>Не хватает настроек:</b>
          <ul style={{ marginTop: 6, paddingLeft: 18, listStyle: "disc" }}>
            {plan.issues.slice(0, 8).map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      {plan.nodes.length > 0 && (
        <Box>
          <div style={{ fontWeight: 700, color: C.ink, marginBottom: 8 }}>
            План по узлам (в порядке производства)
          </div>
          <div className="overflow-x-auto">
            <table className="w-full" style={{ fontSize: 12.5 }}>
              <thead>
                <tr style={{ color: C.faint, textAlign: "right" }}>
                  <th
                    className="pb-2 pr-2 font-semibold"
                    style={{ textAlign: "left" }}
                  >
                    №
                  </th>
                  <th
                    className="pb-2 pr-2 font-semibold"
                    style={{ textAlign: "left" }}
                  >
                    Узел
                  </th>
                  <th
                    className="pb-2 pr-2 font-semibold"
                    style={{ textAlign: "left" }}
                  >
                    Фаза
                  </th>
                  <th className="pb-2 pr-2 font-semibold">Нужно</th>
                  <th className="pb-2 pr-2 font-semibold">На складе</th>
                  <th className="pb-2 font-semibold">Произвести</th>
                </tr>
              </thead>
              <tbody>
                {plan.nodes.map((n, i) => (
                  <tr
                    key={`${n.code}-${i}`}
                    style={{
                      borderTop: `1px solid ${C.line}`,
                      opacity: n.skipped ? 0.5 : 1,
                    }}
                  >
                    <td className="py-1.5 pr-2" style={{ color: C.faint }}>
                      {i + 1}
                    </td>
                    <td
                      className="py-1.5 pr-2"
                      style={{ fontWeight: 600, color: C.ink }}
                    >
                      {n.name}
                      {n.isRoot && (
                        <span style={{ color: C.faint, fontWeight: 400 }}>
                          {" "}
                          · изделие
                        </span>
                      )}
                    </td>
                    <td
                      className="py-1.5 pr-2"
                      style={{
                        color: PHASE_COLOR[n.phase] || C.sub,
                        fontWeight: 600,
                      }}
                    >
                      {n.phaseLabel}
                    </td>
                    <td className="py-1.5 pr-2 text-right">{num(n.needQty)}</td>
                    <td
                      className="py-1.5 pr-2 text-right"
                      style={{ color: C.faint }}
                    >
                      {num(n.stockQty)}
                    </td>
                    <td
                      className="py-1.5 text-right"
                      style={{
                        fontWeight: 700,
                        color: n.skipped ? C.faint : C.ink,
                      }}
                    >
                      {n.skipped ? "не нужно" : num(n.planQty)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Box>
      )}

      {plan.rawNeeds?.length > 0 && (
        <Box>
          <div style={{ fontWeight: 700, color: C.ink, marginBottom: 8 }}>
            Сырьё на весь заказ
          </div>
          <div className="overflow-x-auto">
            <table className="w-full" style={{ fontSize: 12.5 }}>
              <tbody>
                {plan.rawNeeds.slice(0, 50).map((rw) => (
                  <tr
                    key={rw.code}
                    style={{ borderTop: `1px solid ${C.line}` }}
                  >
                    <td className="py-1.5 pr-2" style={{ color: C.ink }}>
                      {rw.name}
                    </td>
                    <td
                      className="py-1.5 text-right"
                      style={{ fontWeight: 600 }}
                    >
                      {num(rw.qty)} {rw.unit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Box>
      )}
    </>
  );
}

function TaskTable({ tasks, onPick }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full" style={{ fontSize: 12.5 }}>
        <thead>
          <tr style={{ color: C.faint, textAlign: "right" }}>
            <th
              className="pb-2 pr-2 font-semibold"
              style={{ textAlign: "left" }}
            >
              Узел
            </th>
            <th
              className="pb-2 pr-2 font-semibold"
              style={{ textAlign: "left" }}
            >
              Фаза
            </th>
            <th className="pb-2 pr-2 font-semibold">План</th>
            <th className="pb-2 pr-2 font-semibold">Факт</th>
            <th className="pb-2 pr-2 font-semibold">Осталось</th>
            <th className="pb-2 font-semibold" style={{ textAlign: "left" }}>
              Статус
            </th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((t) => (
            <tr
              key={t.id}
              style={{
                borderTop: `1px solid ${C.line}`,
                cursor: onPick ? "pointer" : "default",
              }}
              onClick={() => onPick && onPick(t)}
            >
              <td
                className="py-1.5 pr-2"
                style={{ fontWeight: 600, color: C.ink }}
              >
                {t.nodeName}
                {t.isRetry && (
                  <span style={{ color: "#B45309", fontWeight: 400 }}>
                    {" "}
                    · до-задание
                  </span>
                )}
              </td>
              <td
                className="py-1.5 pr-2"
                style={{ color: PHASE_COLOR[t.phase] || C.sub }}
              >
                {t.phase}
              </td>
              <td className="py-1.5 pr-2 text-right">{num(t.planQty)}</td>
              <td className="py-1.5 pr-2 text-right">{num(t.factTotal)}</td>
              <td
                className="py-1.5 pr-2 text-right"
                style={{ color: t.left > 0 ? C.bad : C.ok, fontWeight: 700 }}
              >
                {num(t.left)}
              </td>
              <td
                className="py-1.5"
                style={{ color: t.status === "DONE" ? C.ok : C.sub }}
              >
                {t.status === "DONE" ? "выполнено" : "в работе"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Монитор отдела: план, состав, ввод факта (ТЗ 5.4) ──────────────────────
function MonitorTab({ notify }) {
  const [departments, setDepartments] = useState([]);
  const [dep, setDep] = useState("");
  const [tasks, setTasks] = useState([]);
  const [picked, setPicked] = useState(null);
  const [fact, setFact] = useState("");
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiGet("/api/production/departments")
      .then((d) => setDepartments(d.departments || []))
      .catch(() => {});
  }, []);

  const loadTasks = useCallback(async () => {
    try {
      const q = dep ? `?department=${encodeURIComponent(dep)}` : "";
      const d = await apiGet(`/api/production/tasks${q}`);
      setTasks((d.tasks || []).filter((t) => t.status !== "DONE"));
    } catch {
      setTasks([]);
    }
  }, [dep]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  // Шаг 1 — предпросмотр факта (защита от опечатки, ТЗ 13.2).
  const checkFact = async () => {
    if (!picked || !(Number(fact) > 0)) {
      notify && notify("Укажите фактическое количество");
      return;
    }
    setBusy(true);
    try {
      const out = await apiPost(`/api/production/tasks/${picked.id}/fact`, {
        qty: Number(fact),
        dryRun: true,
      });
      setPreview(out);
    } catch (e) {
      notify && notify(e.message || "Ошибка");
    } finally {
      setBusy(false);
    }
  };

  // Шаг 2 — подтверждение: создаются документы (перемещение → акт).
  const submit = async () => {
    setBusy(true);
    try {
      const out = await apiPost(`/api/production/tasks/${picked.id}/fact`, {
        qty: Number(fact),
      });
      notify &&
        notify(
          out.shortfall > 0
            ? `Факт принят. Не хватает ${out.shortfall} — создано до-задание`
            : `Факт принят, задание закрыто. Документов: ${out.documents.length}`,
        );
      setPicked(null);
      setFact("");
      setPreview(null);
      loadTasks();
    } catch (e) {
      notify && notify(e.message || "Ошибка");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span style={{ fontSize: 12.5, color: C.faint, fontWeight: 600 }}>
          Отдел:
        </span>
        <NiceSelect
          value={dep}
          onChange={setDep}
          options={[
            { value: "", label: "Все отделы" },
            ...departments.map((d) => ({ value: d.id, label: d.name })),
          ]}
          width={240}
        />
        <span style={{ fontSize: 11.5, color: C.faint }}>
          В очереди: {tasks.length}
        </span>
      </div>

      <Box>
        <div style={{ fontWeight: 700, color: C.ink, marginBottom: 8 }}>
          Задания отдела — выберите строку, чтобы указать факт
        </div>
        {tasks.length === 0 ? (
          <div style={{ color: C.faint, fontSize: 13 }}>
            Заданий нет — всё выполнено.
          </div>
        ) : (
          <TaskTable
            tasks={tasks}
            onPick={(t) => {
              setPicked(t);
              setPreview(null);
              setFact("");
            }}
          />
        )}
      </Box>

      {picked && (
        <Box>
          <div style={{ fontWeight: 700, color: C.ink }}>
            {picked.nodeName} · план {num(picked.planQty)} {picked.unit}
          </div>
          <div style={{ fontSize: 12, color: C.faint, marginTop: 2 }}>
            Уже сдано: {num(picked.factTotal)} · осталось {num(picked.left)}
          </div>
          <div
            className="flex flex-wrap items-center gap-2"
            style={{ marginTop: 10 }}
          >
            <input
              value={fact}
              onChange={(e) => {
                setFact(e.target.value.replace(/[^\d.]/g, ""));
                setPreview(null);
              }}
              placeholder="Сколько фактически произвели"
              inputMode="decimal"
              style={{
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                padding: "5px 8px",
                width: 200,
                textAlign: "right",
              }}
            />
            {!preview ? (
              <button
                onClick={checkFact}
                disabled={busy}
                className="rounded-lg px-3 py-1.5 font-semibold"
                style={{
                  border: `1px solid ${C.border}`,
                  color: C.sub,
                  fontSize: 12.5,
                }}
              >
                Проверить
              </button>
            ) : (
              <button
                onClick={submit}
                disabled={busy}
                className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 font-bold text-white"
                style={{ background: C.brandA, fontSize: 12.5 }}
              >
                <Check size={13} /> Подтвердить и провести
              </button>
            )}
            <button
              onClick={() => {
                setPicked(null);
                setPreview(null);
              }}
              className="rounded-lg px-3 py-1.5 font-semibold"
              style={{
                border: `1px solid ${C.border}`,
                color: C.faint,
                fontSize: 12.5,
              }}
            >
              Отмена
            </button>
          </div>

          {preview && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: C.ink }}>
                Будет создано документов: {preview.documents.length}
              </div>
              <ul style={{ marginTop: 6, fontSize: 12, color: C.sub }}>
                {preview.documents.map((d, i) => (
                  <li key={i}>
                    {d.type === "TRANSFER"
                      ? `Перемещение: ${d.name} — ${num(d.qty)}`
                      : d.type === "PRODUCTION_ACT"
                        ? `Акт приготовления: ${d.name} — ${num(d.qty)}`
                        : `Акт разбора: ${d.name}`}
                  </li>
                ))}
              </ul>
              {preview.iikoError && (
                <div style={{ marginTop: 6, fontSize: 11.5, color: "#B45309" }}>
                  iiko недоступна ({preview.iikoError}) — факт сохранится, но
                  документы придётся провести повторно.
                </div>
              )}
            </div>
          )}
        </Box>
      )}
    </div>
  );
}

// ── Конструктор заказных изделий (ТЗ 5.2) ──────────────────────────────────
function ConstructorTab({ notify, canPlan }) {
  const [name, setName] = useState("");
  const [output, setOutput] = useState("1");
  const [rows, setRows] = useState([{ code: "", name: "", qty: "" }]);
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);

  const setRow = (i, patch) =>
    setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const calc = async () => {
    const components = rows
      .filter((r) => r.code.trim() && Number(r.qty) > 0)
      .map((r) => ({
        code: r.code.trim(),
        name: r.name.trim() || r.code.trim(),
        qty: Number(r.qty),
      }));
    if (!components.length) {
      notify && notify("Добавьте хотя бы один компонент");
      return;
    }
    setBusy(true);
    try {
      const p = await apiPost("/api/production/preview", {
        productCode: `CUSTOM_${Date.now()}`,
        productName: name || "Заказное изделие",
        qty: 1,
        customChart: {
          name: name || "Заказное изделие",
          output: Number(output) || 1,
          components,
        },
      });
      setPlan(p);
    } catch (e) {
      notify && notify(e.message || "Не удалось рассчитать");
    } finally {
      setBusy(false);
    }
  };

  const inp = {
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    padding: "5px 8px",
    fontSize: 12.5,
  };

  if (!canPlan) return <ErrBox text="Конструктор доступен офисным ролям." />;

  return (
    <div className="space-y-3">
      <Box>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Название заказного изделия"
            style={{ ...inp, width: 280 }}
          />
          <input
            value={output}
            onChange={(e) => setOutput(e.target.value.replace(/[^\d.]/g, ""))}
            placeholder="Выход"
            inputMode="decimal"
            style={{ ...inp, width: 100, textAlign: "right" }}
          />
        </div>
        <div style={{ fontSize: 11.5, color: C.faint, marginTop: 6 }}>
          Состав собирается из существующих полуфабрикатов и сырья. Постоянная
          техкарта не создаётся — состав разовый.
        </div>

        <div style={{ marginTop: 10 }} className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <input
                value={r.code}
                onChange={(e) => setRow(i, { code: e.target.value })}
                placeholder="Код компонента в iiko"
                style={{ ...inp, width: 240 }}
              />
              <input
                value={r.name}
                onChange={(e) => setRow(i, { name: e.target.value })}
                placeholder="Название (для плана)"
                style={{ ...inp, width: 200 }}
              />
              <input
                value={r.qty}
                onChange={(e) =>
                  setRow(i, { qty: e.target.value.replace(/[^\d.]/g, "") })
                }
                placeholder="Кол-во"
                inputMode="decimal"
                style={{ ...inp, width: 100, textAlign: "right" }}
              />
              <button
                onClick={() => setRows((x) => x.filter((_, j) => j !== i))}
                style={{ color: C.bad }}
                title="Убрать"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>

        <div
          className="flex flex-wrap items-center gap-2"
          style={{ marginTop: 10 }}
        >
          <button
            onClick={() =>
              setRows((r) => [...r, { code: "", name: "", qty: "" }])
            }
            className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 font-semibold"
            style={{
              border: `1px solid ${C.border}`,
              color: C.sub,
              fontSize: 12.5,
            }}
          >
            <Plus size={13} /> Компонент
          </button>
          <button
            onClick={calc}
            disabled={busy}
            className="rounded-lg px-3 py-1.5 font-bold text-white"
            style={{
              background: C.brandA,
              fontSize: 12.5,
              opacity: busy ? 0.6 : 1,
            }}
          >
            Рассчитать документы
          </button>
        </div>
      </Box>

      {plan && <PlanView plan={plan} />}
    </div>
  );
}
