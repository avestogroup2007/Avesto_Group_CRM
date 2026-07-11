// Админ-панель: кадры (включая доступы из iiko и привязку Telegram),
// должности, филиалы, SLA, SOP, подразделения и системные настройки.
import { useState } from "react";
import {
  PlusCircle,
  Building2,
  Settings,
  Clock,
  RotateCcw,
  Send,
  ChevronRight,
  Users,
  Award,
  ListChecks,
  Lock,
} from "lucide-react";
import { apiGet, apiPost, apiPatch } from "../api.js";
import { C } from "../lib/theme.js";
import { tr } from "../lib/i18n.js";
import { uid } from "../lib/format.js";
import { BRANCHES, ROLE_OPTS } from "../lib/org.js";
import {
  Avatar,
  Badge,
  Field,
  Select,
  AdInput,
  AdToggle,
  AdCard,
} from "../components/ui.jsx";
import { AdminRoutes } from "../pages/Routes.jsx";

// Предпросмотр списка сотрудников из iiko (шаг 1: только чтение). iiko —
// источник правды по кадрам; на следующем шаге отсюда будем импортировать
// учётные записи, назначать права и авто-блокировать уволенных.
function IikoStaffPreview() {
  const [st, setSt] = useState({
    status: "idle",
    employees: [],
    count: 0,
    error: "",
    sample: "",
    rawFirst: "",
    deptRawFirst: "",
  });
  const [sync, setSync] = useState({ status: "idle", error: "", result: null });
  const runSync = async () => {
    setSync({ status: "loading", error: "", result: null });
    try {
      const result = await apiPost("/api/iiko/employees/sync", {});
      setSync({ status: "ok", error: "", result });
    } catch (e) {
      setSync({ status: "error", error: e.message || "Ошибка", result: null });
    }
  };
  const load = async () => {
    setSt((p) => ({ ...p, status: "loading", error: "" }));
    try {
      const data = await apiGet("/api/iiko/employees");
      const employees = data.employees || [];
      setSt({
        status: "ok",
        employees,
        count: data.count ?? employees.length,
        error: "",
        sample: data.sample || "",
        rawFirst: data.rawFirst || "",
        deptRawFirst: data.deptRawFirst || "",
      });
    } catch (e) {
      setSt({
        status: "error",
        employees: [],
        count: 0,
        error: e.message || "Ошибка запроса",
        sample: "",
      });
    }
  };
  const loading = st.status === "loading";
  return (
    <AdCard
      title="Сотрудники из iiko"
      desc="iiko — источник правды по кадрам. «Загрузить из iiko» — предпросмотр. «Синхронизировать в систему» — завести/обновить учётные записи в базе: вход по логину из iiko, уволенных в iiko система блокирует автоматически."
    >
      <div className="flex flex-wrap gap-2">
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 font-bold text-white"
          style={{
            background: C.brandA,
            fontSize: 14.5,
            opacity: loading ? 0.6 : 1,
          }}
        >
          <Users size={17} />
          {loading ? "Загрузка…" : "Загрузить из iiko"}
        </button>
        <button
          onClick={runSync}
          disabled={sync.status === "loading"}
          className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 font-bold"
          style={{
            background: "#fff",
            color: C.brandA,
            border: `1.5px solid ${C.brandA}`,
            fontSize: 14.5,
            opacity: sync.status === "loading" ? 0.6 : 1,
          }}
        >
          <Users size={17} />
          {sync.status === "loading"
            ? "Синхронизация…"
            : "Синхронизировать в систему"}
        </button>
      </div>

      {sync.status === "ok" && sync.result && (
        <p style={{ color: "#2C7", fontSize: 13, marginTop: 10 }}>
          Синхронизировано: создано <b>{sync.result.created}</b>, обновлено{" "}
          <b>{sync.result.updated}</b>, заблокировано (уволены в iiko){" "}
          <b>{sync.result.blocked}</b> из <b>{sync.result.total}</b>.
        </p>
      )}
      {sync.status === "error" && (
        <p style={{ color: "#B23", fontSize: 13, marginTop: 10 }}>
          Ошибка синхронизации: {sync.error}
        </p>
      )}

      {st.status === "error" && (
        <p style={{ color: "#B23", fontSize: 13, marginTop: 12 }}>
          Не удалось получить сотрудников: {st.error}
        </p>
      )}

      {st.status === "ok" && (
        <div style={{ marginTop: 12 }}>
          <p style={{ fontSize: 13, color: C.sub, marginBottom: 8 }}>
            Найдено сотрудников: <b>{st.count}</b>
          </p>
          {st.rawFirst ? (
            <details style={{ marginBottom: 12 }}>
              <summary
                style={{
                  fontSize: 12.5,
                  color: C.sub,
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                Структура ответа iiko (для отладки) — раскрыть и прислать
              </summary>
              <pre
                style={{
                  marginTop: 8,
                  padding: 10,
                  background: "#F7F4EF",
                  borderRadius: 10,
                  border: `1px solid ${C.line}`,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  fontSize: 11,
                }}
              >
                {st.rawFirst}
                {st.deptRawFirst
                  ? "\n\n--- Справочник подразделений ---\n" + st.deptRawFirst
                  : ""}
              </pre>
            </details>
          ) : null}
          {st.count > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full" style={{ fontSize: 13 }}>
                <thead>
                  <tr style={{ color: C.faint, textAlign: "left" }}>
                    <th className="pb-2 font-semibold">ФИО</th>
                    <th className="pb-2 font-semibold">Должность (iiko)</th>
                    <th className="pb-2 font-semibold">Подразделения</th>
                    <th className="pb-2 font-semibold text-center">Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {st.employees.map((e, i) => (
                    <tr
                      key={e.iikoId || i}
                      style={{
                        borderTop: `1px solid ${C.line}`,
                        opacity: e.deleted ? 0.5 : 1,
                      }}
                    >
                      <td
                        className="py-2 pr-2"
                        style={{ color: C.ink, fontWeight: 600 }}
                      >
                        {e.name || "—"}
                        {e.code ? (
                          <span style={{ color: C.faint, fontWeight: 400 }}>
                            {" "}
                            · таб. {e.code}
                          </span>
                        ) : null}
                      </td>
                      <td className="py-2 pr-2" style={{ color: C.sub }}>
                        {e.position || "—"}
                      </td>
                      <td className="py-2 pr-2" style={{ color: C.sub }}>
                        {(e.departmentNames || e.departmentCodes || []).join(
                          ", ",
                        ) || "—"}
                      </td>
                      <td className="py-2 text-center">
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: e.deleted ? "#B23" : "#2C7",
                          }}
                        >
                          {e.deleted ? "Уволен" : "Активен"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: C.sub }}>
              iiko вернул пустой список. Образец ответа (для уточнения формата):
              <pre
                style={{
                  marginTop: 8,
                  padding: 10,
                  background: "#F7F4EF",
                  borderRadius: 10,
                  border: `1px solid ${C.line}`,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  fontSize: 11.5,
                }}
              >
                {st.sample || "(пусто)"}
              </pre>
            </div>
          )}
        </div>
      )}
    </AdCard>
  );
}

// Привязка сотрудника к Telegram-боту чек-листов: Telegram ID + филиал.
// HR задаёт заранее; после этого бот в личке пускает сотрудника к чек-листам.
function TgLinkCell({ u, patch }) {
  const [tid, setTid] = useState(u.telegramId || "");
  const branchOpts = [
    { value: "", label: "— филиал —" },
    ...BRANCHES.map((b) => ({ value: String(b.id), label: b.name })),
  ];
  const saveTid = () => {
    const v = tid.trim();
    if (v !== (u.telegramId || "")) patch(u.id, { telegramId: v });
  };
  return (
    <div className="flex flex-col gap-1" style={{ minWidth: 170 }}>
      <input
        value={tid}
        onChange={(e) => setTid(e.target.value.replace(/[^\d]/g, ""))}
        onBlur={saveTid}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        placeholder="Telegram ID"
        className="rounded-lg px-2 py-1"
        style={{ border: `1px solid ${C.line}`, fontSize: 12.5, color: C.ink }}
      />
      <Select
        value={u.checklistBranch || ""}
        onChange={(v) => patch(u.id, { checklistBranch: v })}
        options={branchOpts}
      />
    </div>
  );
}

// Управление учётными записями сотрудников из iiko (права доступа): роль и
// доступ ко входу. Уволенные в iiko заблокированы автоматически.
function IikoStaffAccounts() {
  const [st, setSt] = useState({ status: "idle", list: [], error: "" });
  const load = async () => {
    setSt((p) => ({ ...p, status: "loading", error: "" }));
    try {
      const data = await apiGet("/api/iiko/employees/db");
      setSt({ status: "ok", list: data.employees || [], error: "" });
    } catch (e) {
      setSt({ status: "error", list: [], error: e.message || "Ошибка" });
    }
  };
  const patch = async (id, body) => {
    setSt((p) => ({
      ...p,
      list: p.list.map((u) => (u.id === id ? { ...u, ...body } : u)),
    }));
    try {
      await apiPatch(`/api/iiko/employees/${id}`, body);
    } catch {
      load(); // при ошибке перечитываем актуальное состояние
    }
  };
  const roleOpts = ROLE_OPTS.map(([value, label]) => ({
    value,
    label: tr(label),
  }));
  return (
    <AdCard
      title="Учётные записи из iiko — права доступа"
      desc="Роль и доступ ко входу реальных сотрудников. Уволенные в iiko заблокированы автоматически. Сначала синхронизируйте, затем «Загрузить учётные записи»."
    >
      <button
        onClick={load}
        disabled={st.status === "loading"}
        className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 font-bold text-white"
        style={{
          background: C.brandA,
          fontSize: 14.5,
          opacity: st.status === "loading" ? 0.6 : 1,
        }}
      >
        <Users size={17} />
        {st.status === "loading" ? "Загрузка…" : "Загрузить учётные записи"}
      </button>

      {st.status === "error" && (
        <p style={{ color: "#B23", fontSize: 13, marginTop: 12 }}>
          Не удалось загрузить: {st.error}
        </p>
      )}

      {st.status === "ok" && (
        <div style={{ marginTop: 12 }}>
          <p style={{ fontSize: 13, color: C.sub, marginBottom: 8 }}>
            Учётных записей: <b>{st.list.length}</b>
          </p>
          {st.list.length === 0 ? (
            <p style={{ fontSize: 13, color: C.sub }}>
              Пока пусто — нажмите «Синхронизировать в систему» выше.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full" style={{ fontSize: 13 }}>
                <thead>
                  <tr style={{ color: C.faint, textAlign: "left" }}>
                    <th className="pb-2 font-semibold">Сотрудник</th>
                    <th className="pb-2 font-semibold">Должность</th>
                    <th className="pb-2 font-semibold">Филиал</th>
                    <th className="pb-2 font-semibold">Роль (доступ)</th>
                    <th className="pb-2 font-semibold">Бот чек-листов</th>
                    <th className="pb-2 font-semibold text-center">Вход</th>
                  </tr>
                </thead>
                <tbody>
                  {st.list.map((u) => (
                    <tr
                      key={u.id}
                      style={{
                        borderTop: `1px solid ${C.line}`,
                        opacity: u.active ? 1 : 0.5,
                      }}
                    >
                      <td
                        className="py-2 pr-2"
                        style={{ color: C.ink, fontWeight: 600 }}
                      >
                        {u.displayName || "—"}
                        {u.login ? (
                          <span style={{ color: C.faint, fontWeight: 400 }}>
                            {" "}
                            · {u.login}
                          </span>
                        ) : null}
                      </td>
                      <td className="py-2 pr-2" style={{ color: C.sub }}>
                        {u.position || "—"}
                      </td>
                      <td className="py-2 pr-2" style={{ color: C.sub }}>
                        {u.iikoDepartment || "—"}
                      </td>
                      <td className="py-2 pr-2" style={{ minWidth: 160 }}>
                        <Select
                          value={u.role}
                          onChange={(v) => patch(u.id, { role: v })}
                          options={roleOpts}
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <TgLinkCell u={u} patch={patch} />
                      </td>
                      <td className="py-2 text-center">
                        {u.iikoDeleted ? (
                          <span
                            style={{
                              fontSize: 12,
                              fontWeight: 700,
                              color: "#B23",
                            }}
                          >
                            Уволен в iiko
                          </span>
                        ) : (
                          <button
                            onClick={() => patch(u.id, { active: !u.active })}
                            className="rounded-lg px-2.5 py-1 font-semibold"
                            style={{
                              fontSize: 12,
                              border: `1px solid ${C.line}`,
                              background: u.active ? "#EAF7EE" : "#FDECEC",
                              color: u.active ? "#2C7" : "#B23",
                            }}
                          >
                            {u.active ? "Разрешён" : "Заблокирован"}
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
      )}
    </AdCard>
  );
}

function AdminStaff({ s, dispatch, notify }) {
  const blank = {
    name: "",
    role: "staff",
    positionId: s.positions[0]?.id || "",
    departmentId: s.departments[0]?.id || "",
    branchId: "",
    parentId: "",
    phone: "",
    tg: "",
  };
  const [f, setF] = useState(blank);
  const branchOpts = [
    { value: "", label: "— без филиала —" },
    ...s.branches.map((b) => ({ value: b.id, label: b.name })),
  ];
  const deptOpts = s.departments.map((d) => ({ value: d.id, label: d.name }));
  const posOpts = s.positions.map((p) => ({
    value: p.id,
    label: `${p.title} · ур.${p.level}`,
  }));
  const mgrOpts = [
    { value: "", label: "— без руководителя —" },
    ...s.users
      .filter((u) => u.active !== false)
      .map((u) => ({ value: u.id, label: `${u.name}` })),
  ];

  const add = () => {
    if (!f.name.trim()) {
      notify("Укажите ФИО сотрудника");
      return;
    }
    const pos = s.positions.find((p) => p.id === f.positionId);
    const user = {
      id: "u" + uid().slice(0, 5),
      name: f.name.trim(),
      role: f.role,
      pos: pos ? pos.title : "Сотрудник",
      level: pos ? pos.level : 4,
      branchId: f.branchId === "" ? null : +f.branchId,
      parentId: f.parentId === "" ? null : f.parentId,
      departmentId: f.departmentId || null,
      tg_chat_id: f.tg || null,
      active: true,
    };
    dispatch({ type: "ADD_USER", user });
    notify("Сотрудник добавлен");
    setF(blank);
  };

  return (
    <div className="space-y-5">
      <AdCard
        title="Добавить сотрудника"
        desc="Новый сотрудник появится в оргструктуре, в назначении задач и переключателе ролей."
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <AdInput
            label="ФИО"
            value={f.name}
            onChange={(v) => setF({ ...f, name: v })}
            placeholder="Иванов И. И."
          />
          <Field label="Роль">
            <Select
              value={f.role}
              onChange={(v) => setF({ ...f, role: v })}
              options={ROLE_OPTS.map(([value, label]) => ({
                value,
                label: tr(label),
              }))}
            />
          </Field>
          <Field label="Должность">
            <Select
              value={f.positionId}
              onChange={(v) => setF({ ...f, positionId: v })}
              options={posOpts}
            />
          </Field>
          <Field label="Филиал">
            <Select
              value={f.branchId}
              onChange={(v) => setF({ ...f, branchId: v })}
              options={branchOpts}
            />
          </Field>
          <Field label="Руководитель (эскалация)">
            <Select
              value={f.parentId}
              onChange={(v) => setF({ ...f, parentId: v })}
              options={mgrOpts}
            />
          </Field>
          <Field label="Отдел (граница доступа)">
            <Select
              value={f.departmentId}
              onChange={(v) => setF({ ...f, departmentId: v })}
              options={deptOpts}
            />
          </Field>
          <AdInput
            label="Telegram ID (для бота)"
            value={f.tg}
            onChange={(v) => setF({ ...f, tg: v })}
            placeholder="123456789"
          />
        </div>
        <button
          onClick={add}
          className="mt-4 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 font-bold text-white"
          style={{ background: C.brandA, fontSize: 14.5 }}
        >
          <PlusCircle size={17} /> {tr("Добавить сотрудника")}
        </button>
      </AdCard>

      <IikoStaffPreview />

      <IikoStaffAccounts />

      <AdCard
        title={`Сотрудники (${s.users.length})`}
        desc="Меняйте роль и филиал прямо в таблице. Уволенных — деактивируйте: история их задач сохраняется."
      >
        <div className="hidden lg:block">
          <table className="w-full" style={{ fontSize: 13 }}>
            <thead>
              <tr style={{ color: C.faint, textAlign: "left" }}>
                <th className="pb-2 font-semibold">Сотрудник</th>
                <th className="pb-2 font-semibold">Роль</th>
                <th className="pb-2 font-semibold">Филиал</th>
                <th className="pb-2 font-semibold">Отдел</th>
                <th className="pb-2 font-semibold text-center">Статус</th>
              </tr>
            </thead>
            <tbody>
              {s.users.map((u) => (
                <tr
                  key={u.id}
                  style={{
                    borderTop: `1px solid ${C.line}`,
                    opacity: u.active === false ? 0.5 : 1,
                  }}
                >
                  <td className="py-2.5 pr-2">
                    <div className="flex items-center gap-2">
                      <Avatar id={u.id} size={28} />
                      <div>
                        <div style={{ color: C.ink, fontWeight: 600 }}>
                          {u.name}
                        </div>
                        <div style={{ color: C.faint, fontSize: 11.5 }}>
                          {u.pos}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="py-2.5 pr-2" style={{ minWidth: 150 }}>
                    <Select
                      value={u.role}
                      onChange={(v) =>
                        dispatch({
                          type: "UPDATE_USER",
                          id: u.id,
                          patch: { role: v },
                        })
                      }
                      options={ROLE_OPTS.map(([value, label]) => ({
                        value,
                        label: tr(label),
                      }))}
                    />
                  </td>
                  <td className="py-2.5 pr-2" style={{ minWidth: 130 }}>
                    <Select
                      value={u.branchId == null ? "" : u.branchId}
                      onChange={(v) =>
                        dispatch({
                          type: "UPDATE_USER",
                          id: u.id,
                          patch: { branchId: v === "" ? null : +v },
                        })
                      }
                      options={branchOpts}
                    />
                  </td>
                  <td className="py-2.5 pr-2" style={{ minWidth: 150 }}>
                    <Select
                      value={u.departmentId || ""}
                      onChange={(v) =>
                        dispatch({
                          type: "UPDATE_USER",
                          id: u.id,
                          patch: { departmentId: v || null },
                        })
                      }
                      options={deptOpts}
                    />
                  </td>
                  <td className="py-2.5 text-center">
                    <button
                      onClick={() =>
                        dispatch({
                          type: "UPDATE_USER",
                          id: u.id,
                          patch: { active: u.active === false },
                        })
                      }
                      className="rounded-lg px-2.5 py-1.5 font-semibold"
                      style={
                        u.active === false
                          ? { background: "#FEECEC", color: C.bad }
                          : { background: "#E9F9EF", color: C.ok }
                      }
                    >
                      {u.active === false ? "Неактивен" : "Активен"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="lg:hidden space-y-2.5">
          {s.users.map((u) => (
            <div
              key={u.id}
              className="rounded-xl p-3"
              style={{
                background: "#FBFCFE",
                border: `1px solid ${C.border}`,
                opacity: u.active === false ? 0.55 : 1,
              }}
            >
              <div className="flex items-center gap-2.5">
                <Avatar id={u.id} size={32} />
                <div className="flex-1 min-w-0">
                  <div
                    className="truncate"
                    style={{ color: C.ink, fontWeight: 700, fontSize: 14 }}
                  >
                    {u.name}
                  </div>
                  <div
                    className="truncate"
                    style={{ color: C.faint, fontSize: 12 }}
                  >
                    {u.pos}
                  </div>
                </div>
                <button
                  onClick={() =>
                    dispatch({
                      type: "UPDATE_USER",
                      id: u.id,
                      patch: { active: u.active === false },
                    })
                  }
                  className="shrink-0 rounded-lg px-2.5 py-1.5 font-semibold"
                  style={
                    u.active === false
                      ? { background: "#FEECEC", color: C.bad, fontSize: 12.5 }
                      : { background: "#E9F9EF", color: C.ok, fontSize: 12.5 }
                  }
                >
                  {u.active === false ? "Неактивен" : "Активен"}
                </button>
              </div>
              <div className="mt-2.5 space-y-2">
                <Field label="Роль">
                  <Select
                    value={u.role}
                    onChange={(v) =>
                      dispatch({
                        type: "UPDATE_USER",
                        id: u.id,
                        patch: { role: v },
                      })
                    }
                    options={ROLE_OPTS.map(([value, label]) => ({
                      value,
                      label: tr(label),
                    }))}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Филиал">
                    <Select
                      value={u.branchId == null ? "" : u.branchId}
                      onChange={(v) =>
                        dispatch({
                          type: "UPDATE_USER",
                          id: u.id,
                          patch: { branchId: v === "" ? null : +v },
                        })
                      }
                      options={branchOpts}
                    />
                  </Field>
                  <Field label="Отдел">
                    <Select
                      value={u.departmentId || ""}
                      onChange={(v) =>
                        dispatch({
                          type: "UPDATE_USER",
                          id: u.id,
                          patch: { departmentId: v || null },
                        })
                      }
                      options={deptOpts}
                    />
                  </Field>
                </div>
              </div>
            </div>
          ))}
        </div>
      </AdCard>
    </div>
  );
}

function AdminPositions({ s, dispatch, notify }) {
  const [title, setTitle] = useState("");
  const [level, setLevel] = useState("3");
  const add = () => {
    if (!title.trim()) {
      notify("Укажите название должности");
      return;
    }
    dispatch({
      type: "ADD_POSITION",
      position: {
        id: "p" + uid().slice(0, 4),
        title: title.trim(),
        level: +level,
      },
    });
    notify("Должность добавлена");
    setTitle("");
  };
  return (
    <div className="space-y-5">
      <AdCard
        title="Добавить должность"
        desc="Уровень задаёт иерархию для эскалации: 1 — высшая, 4 — линейный персонал."
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <AdInput
            label="Название"
            value={title}
            onChange={setTitle}
            placeholder="Старший техник"
          />
          <Field label="Уровень иерархии">
            <Select
              value={level}
              onChange={setLevel}
              options={[1, 2, 3, 4].map((n) => ({
                value: n,
                label: `Уровень ${n}`,
              }))}
            />
          </Field>
          <button
            onClick={add}
            className="rounded-xl px-4 py-2.5 font-bold text-white"
            style={{ background: C.brandA, fontSize: 14.5 }}
          >
            Добавить
          </button>
        </div>
      </AdCard>
      <AdCard title={`Должности (${s.positions.length})`}>
        <div className="space-y-2">
          {s.positions
            .sort((a, z) => a.level - z.level)
            .map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-xl px-4 py-2.5"
                style={{
                  background: "#FBFCFE",
                  border: `1px solid ${C.border}`,
                }}
              >
                <span style={{ fontSize: 14, color: C.ink, fontWeight: 600 }}>
                  {p.title}
                </span>
                <Badge color={C.violet} bg="#F5F0FE">
                  Уровень {p.level}
                </Badge>
              </div>
            ))}
        </div>
      </AdCard>
    </div>
  );
}

function AdminBranches({ s, dispatch, notify }) {
  const [bc, setBc] = useState(String(s.companies[0]?.id || ""));
  const [bn, setBn] = useState("");
  const [bb, setBb] = useState("300000");
  const [cn, setCn] = useState("");
  const [ci, setCi] = useState("");
  const addBranch = () => {
    if (!bn.trim()) {
      notify("Укажите название филиала");
      return;
    }
    const id = Math.max(0, ...s.branches.map((b) => b.id)) + 1;
    dispatch({
      type: "ADD_BRANCH",
      branch: { id, companyId: +bc, name: bn.trim(), monthly: +bb || 0 },
    });
    notify("Филиал добавлен");
    setBn("");
  };
  const addCompany = () => {
    if (!cn.trim()) {
      notify("Укажите название юр. лица");
      return;
    }
    const id = Math.max(0, ...s.companies.map((c) => c.id)) + 1;
    dispatch({
      type: "ADD_COMPANY",
      company: { id, name: cn.trim(), inn: ci.trim() },
    });
    notify("Юр. лицо добавлено");
    setCn("");
    setCi("");
  };
  return (
    <div className="space-y-5">
      <AdCard title="Юр. лица и филиалы">
        {s.companies.map((co) => (
          <div key={co.id} className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <Building2 size={16} color={C.brandA} />
              <span style={{ fontWeight: 700, color: C.ink }}>{co.name}</span>
              <Badge>ИНН {co.inn || "—"}</Badge>
            </div>
            <div className="space-y-2">
              {s.branches
                .filter((b) => b.companyId === co.id)
                .map((b) => (
                  <div
                    key={b.id}
                    className="flex items-center gap-3 rounded-xl px-4 py-2.5"
                    style={{
                      background: "#FBFCFE",
                      border: `1px solid ${C.border}`,
                    }}
                  >
                    <span
                      className="flex-1"
                      style={{ fontSize: 14, color: C.ink, fontWeight: 600 }}
                    >
                      Филиал «{b.name}»
                    </span>
                    <span style={{ fontSize: 12.5, color: C.faint }}>
                      Бюджет/мес:
                    </span>
                    <input
                      type="number"
                      value={s.budgets[b.id] || 0}
                      onChange={(e) =>
                        dispatch({
                          type: "SET_BUDGET",
                          branchId: b.id,
                          value: +e.target.value || 0,
                        })
                      }
                      className="rounded-lg px-2 py-1.5 focus:outline-none"
                      style={{
                        border: `1px solid ${C.border}`,
                        fontSize: 13.5,
                        color: C.ink,
                        width: 130,
                      }}
                    />
                    <span style={{ fontSize: 13, color: C.sub }}>сум</span>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </AdCard>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <AdCard title="Добавить филиал">
          <div className="space-y-3">
            <Field label="Юр. лицо">
              <Select
                value={bc}
                onChange={setBc}
                options={s.companies.map((c) => ({
                  value: c.id,
                  label: c.name,
                }))}
              />
            </Field>
            <AdInput
              label="Название филиала"
              value={bn}
              onChange={setBn}
              placeholder="Запад"
            />
            <AdInput
              label="Месячный бюджет, сум"
              type="number"
              value={bb}
              onChange={setBb}
            />
            <button
              onClick={addBranch}
              className="rounded-xl px-4 py-2.5 font-bold text-white"
              style={{ background: C.brandA, fontSize: 14.5 }}
            >
              Добавить филиал
            </button>
          </div>
        </AdCard>
        <AdCard title="Добавить юр. лицо">
          <div className="space-y-3">
            <AdInput
              label="Название"
              value={cn}
              onChange={setCn}
              placeholder="ООО «Новая сеть»"
            />
            <AdInput
              label="ИНН"
              value={ci}
              onChange={setCi}
              placeholder="7700000000"
            />
            <button
              onClick={addCompany}
              className="rounded-xl px-4 py-2.5 font-bold text-white"
              style={{ background: C.brandA, fontSize: 14.5 }}
            >
              Добавить юр. лицо
            </button>
          </div>
        </AdCard>
      </div>
    </div>
  );
}

function AdminSla({ s, dispatch }) {
  return (
    <AdCard
      title="SLA-нормативы (часы на решение)"
      desc="Сколько времени даётся на задачу по приоритету. ИИ применяет это при создании заявок."
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {["Критический", "Высокий", "Обычный"].map((p) => (
          <Field key={p} label={p}>
            <input
              type="number"
              min="1"
              value={s.sla[p] ?? 24}
              onChange={(e) =>
                dispatch({
                  type: "SET_SLA",
                  priority: p,
                  hours: +e.target.value || 1,
                })
              }
              className="w-full rounded-xl px-3 py-2 focus:outline-none"
              style={{
                border: `1px solid ${C.border}`,
                fontSize: 15,
                color: C.ink,
                fontWeight: 700,
              }}
            />
          </Field>
        ))}
      </div>
    </AdCard>
  );
}

function AdSop({ cat, sop, dispatch, notify }) {
  const [text, setText] = useState(sop.steps.join("\n"));
  const [photo, setPhoto] = useState(sop.requirePhoto);
  const save = () => {
    const steps = text
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean);
    dispatch({ type: "SET_SOP", category: cat, steps, requirePhoto: photo });
    notify(`Регламент «${cat}» сохранён`);
  };
  return (
    <AdCard title={cat}>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={Math.max(3, text.split("\n").length)}
        className="w-full rounded-xl px-3 py-2 focus:outline-none resize-y"
        style={{
          border: `1px solid ${C.border}`,
          fontSize: 13.5,
          color: C.ink,
          lineHeight: 1.5,
        }}
      />
      <div style={{ fontSize: 11.5, color: C.faint, marginTop: 4 }}>
        Каждый шаг — с новой строки.
      </div>
      <div className="flex items-center justify-between mt-3">
        <label
          className="flex items-center gap-2 cursor-pointer"
          style={{ fontSize: 13.5, color: C.ink }}
        >
          <input
            type="checkbox"
            checked={photo}
            onChange={() => setPhoto((p) => !p)}
            style={{ width: 18, height: 18, accentColor: C.brandA }}
          />{" "}
          Требовать фотоотчёт
        </label>
        <button
          onClick={save}
          className="rounded-xl px-4 py-2 font-bold text-white"
          style={{ background: C.brandA, fontSize: 13.5 }}
        >
          Сохранить
        </button>
      </div>
    </AdCard>
  );
}

function AdminSops({ s, dispatch, notify }) {
  return (
    <div className="space-y-4">
      <div style={{ fontSize: 13.5, color: C.sub }}>
        Регламенты (SOP) — это чек-листы, которые исполнитель обязан выполнить в
        фазе «В работе» перед сдачей задачи.
      </div>
      {Object.keys(s.sops).map((cat) => (
        <AdSop
          key={cat}
          cat={cat}
          sop={s.sops[cat]}
          dispatch={dispatch}
          notify={notify}
        />
      ))}
    </div>
  );
}

function AdminSystem({ s, dispatch, notify }) {
  const set = (k, v) => dispatch({ type: "SET_SETTING", key: k, value: v });
  const cfg = s.settings || {};
  return (
    <div className="space-y-4">
      <AdCard title="Настройки системы">
        <div className="space-y-3">
          <AdToggle
            label="Голосовой ввод задач"
            hint="Кнопка «Сказать задачу» в форме создания"
            checked={cfg.voiceInput !== false}
            onChange={(v) => set("voiceInput", v)}
          />
          <AdToggle
            label="Водяные знаки на экспорте"
            hint="ФИО и ID сотрудника на выгрузках (защита от утечек)"
            checked={!!cfg.watermark}
            onChange={(v) => set("watermark", v)}
          />
          <AdToggle
            label="Ограничение по IP / VPN"
            hint="Доступ к финансам и админке только из офиса"
            checked={!!cfg.ipRestrict}
            onChange={(v) => set("ipRestrict", v)}
          />
        </div>
      </AdCard>
      <AdCard
        title="Демо-данные"
        desc="Сбросить задачи, журнал, смены и оргструктуру к исходному состоянию."
      >
        <button
          onClick={() => {
            dispatch({ type: "RESET" });
            notify("Демо-данные сброшены");
          }}
          className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 font-bold text-white"
          style={{ background: C.bad, fontSize: 14 }}
        >
          <RotateCcw size={16} /> Сбросить демо-данные
        </button>
      </AdCard>
    </div>
  );
}

export function AdminPanel({ s, dispatch, notify }) {
  const [tab, setTab] = useState("staff");
  const tabs = [
    ["staff", "Сотрудники", Users],
    ["positions", "Должности", Award],
    ["branches", "Филиалы и бюджеты", Building2],
    ["departments", "Отделы и доступ", Lock],
    ["routes", "Маршруты", Send],
    ["sla", "SLA-нормативы", Clock],
    ["sops", "Регламенты", ListChecks],
    ["system", "Система", Settings],
  ];
  return (
    <div className="space-y-5">
      <div
        className="rounded-2xl bg-white p-2 flex flex-wrap gap-1.5"
        style={{ border: `1px solid ${C.border}` }}
      >
        {tabs.map(([k, label, Icon]) => {
          const active = tab === k;
          return (
            <button
              key={k}
              onClick={() => setTab(k)}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 font-semibold"
              style={{
                background: active ? C.brandA : "transparent",
                color: active ? "#fff" : C.ink,
                fontSize: 13.5,
                whiteSpace: "nowrap",
              }}
            >
              <Icon size={16} color={active ? "#fff" : C.sub} /> {tr(label)}
            </button>
          );
        })}
      </div>
      {tab === "staff" && (
        <AdminStaff s={s} dispatch={dispatch} notify={notify} />
      )}
      {tab === "positions" && (
        <AdminPositions s={s} dispatch={dispatch} notify={notify} />
      )}
      {tab === "branches" && (
        <AdminBranches s={s} dispatch={dispatch} notify={notify} />
      )}
      {tab === "departments" && (
        <AdminDepartments s={s} dispatch={dispatch} notify={notify} />
      )}
      {tab === "routes" && (
        <AdminRoutes s={s} dispatch={dispatch} notify={notify} />
      )}
      {tab === "sla" && <AdminSla s={s} dispatch={dispatch} />}
      {tab === "sops" && (
        <AdminSops s={s} dispatch={dispatch} notify={notify} />
      )}
      {tab === "system" && (
        <AdminSystem s={s} dispatch={dispatch} notify={notify} />
      )}
    </div>
  );
}

function AdminDepartments({ s, dispatch, notify }) {
  const [name, setName] = useState("");
  const [restricted, setRestricted] = useState(false);
  const add = () => {
    if (!name.trim()) {
      notify("Укажите название отдела");
      return;
    }
    dispatch({
      type: "ADD_DEPARTMENT",
      department: {
        id: "d" + uid().slice(0, 4),
        name: name.trim(),
        restricted,
      },
    });
    notify("Отдел добавлен");
    setName("");
    setRestricted(false);
  };
  const cats = Object.keys(s.catDept);
  return (
    <div className="space-y-5">
      <AdCard
        title="Отделы и доступ к данным"
        desc="«Закрытый» отдел = его задачи видят только сотрудники этого отдела, финансы и высшее руководство. Например, задачи финансового отдела недоступны посторонним."
      >
        <div className="space-y-2">
          {s.departments.map((d) => (
            <div
              key={d.id}
              className="flex items-center gap-3 rounded-xl px-4 py-2.5"
              style={{ background: "#FBFCFE", border: `1px solid ${C.border}` }}
            >
              <input
                value={d.name}
                onChange={(e) =>
                  dispatch({
                    type: "UPDATE_DEPARTMENT",
                    id: d.id,
                    patch: { name: e.target.value },
                  })
                }
                className="flex-1 rounded-lg px-2 py-1.5 focus:outline-none"
                style={{
                  border: `1px solid ${C.border}`,
                  fontSize: 14,
                  color: C.ink,
                  fontWeight: 600,
                }}
              />
              <button
                onClick={() =>
                  dispatch({
                    type: "UPDATE_DEPARTMENT",
                    id: d.id,
                    patch: { restricted: !d.restricted },
                  })
                }
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-semibold"
                style={
                  d.restricted
                    ? { background: "#FEECEC", color: C.bad }
                    : { background: C.line, color: C.sub }
                }
              >
                <Lock size={14} /> {d.restricted ? "Закрытый" : "Открытый"}
              </button>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end mt-4">
          <AdInput
            label="Новый отдел"
            value={name}
            onChange={setName}
            placeholder="Отдел маркетинга"
          />
          <label
            className="flex items-center gap-2 cursor-pointer"
            style={{ fontSize: 13.5, color: C.ink, paddingBottom: 8 }}
          >
            <input
              type="checkbox"
              checked={restricted}
              onChange={() => setRestricted((r) => !r)}
              style={{ width: 18, height: 18, accentColor: C.bad }}
            />{" "}
            Закрытый (приватный)
          </label>
          <button
            onClick={add}
            className="rounded-xl px-4 py-2.5 font-bold text-white"
            style={{ background: C.brandA, fontSize: 14.5 }}
          >
            Добавить отдел
          </button>
        </div>
      </AdCard>

      <AdCard
        title="Маршрутизация: категория → отдел"
        desc="К какому отделу относится задача каждой категории. От этого зависит, кто её увидит."
      >
        <div className="space-y-2">
          {cats.map((cat) => (
            <div
              key={cat}
              className="flex items-center gap-3 rounded-xl px-4 py-2.5"
              style={{ background: "#FBFCFE", border: `1px solid ${C.border}` }}
            >
              <span
                className="flex-1"
                style={{ fontSize: 14, color: C.ink, fontWeight: 600 }}
              >
                {cat}
              </span>
              <ChevronRight size={16} color={C.faint} />
              <div style={{ minWidth: 200 }}>
                <Select
                  value={s.catDept[cat]}
                  onChange={(v) =>
                    dispatch({
                      type: "SET_CATDEPT",
                      category: cat,
                      departmentId: v,
                    })
                  }
                  options={s.departments.map((d) => ({
                    value: d.id,
                    label: d.name + (d.restricted ? " 🔒" : ""),
                  }))}
                />
              </div>
            </div>
          ))}
        </div>
      </AdCard>
    </div>
  );
}

/* ============================================================================
   МНОГОШАГОВЫЕ МАРШРУТЫ (процессы согласования)
   ============================================================================ */

export default AdminPanel;
