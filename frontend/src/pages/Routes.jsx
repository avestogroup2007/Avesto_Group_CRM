// Маршруты согласования: прохождение шагов, создание и админ-настройка.
import { useState, useEffect } from "react";
import {
  Clock,
  Paperclip,
  X,
  CheckCircle2,
  RotateCcw,
  Send,
  Camera,
  ListChecks,
  Lock,
  Wallet,
} from "lucide-react";
import { C } from "../lib/theme.js";
import { tr } from "../lib/i18n.js";
import { H, uid, fmtMoney } from "../lib/format.js";
import {
  assignByActor,
  userById,
  deptForCategory,
  slaFor,
} from "../lib/org.js";
import {
  Avatar,
  Badge,
  Field,
  Select,
  AdInput,
  AdCard,
} from "../components/ui.jsx";

export function StepRail({ steps, current }) {
  return (
    <div className="flex flex-wrap items-stretch gap-1.5">
      {steps.map((st, i) => {
        const done = i < current,
          active = i === current;
        const color = done ? C.ok : active ? C.brandA : "#94A3B8";
        const bg = done ? "#E9F9EF" : active ? "#EFF4FF" : "#F1F5F9";
        return (
          <div
            key={i}
            className="rounded-xl px-2.5 py-2"
            style={{
              background: bg,
              border: `1px solid ${active ? C.brandA : C.border}`,
              minWidth: 104,
              flex: "1 1 104px",
            }}
          >
            <div
              className="flex items-center gap-1.5"
              style={{ fontSize: 10.5, color, fontWeight: 800 }}
            >
              {done ? (
                <CheckCircle2 size={13} />
              ) : (
                <span
                  style={{
                    width: 15,
                    height: 15,
                    borderRadius: 99,
                    background: color,
                    color: "#fff",
                    fontSize: 9.5,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 800,
                  }}
                >
                  {i + 1}
                </span>
              )}
              ШАГ {i + 1}
            </div>
            <div
              style={{
                fontSize: 12,
                color: C.ink,
                fontWeight: 700,
                marginTop: 3,
                lineHeight: 1.2,
              }}
            >
              {st.title}
            </div>
            <div style={{ fontSize: 10.5, color: C.faint, marginTop: 1 }}>
              {st.actor}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function RouteResp({ t }) {
  if (t.currentStep >= t.steps.length) {
    return (
      <div
        className="flex items-center gap-2 rounded-xl px-3 py-2.5"
        style={{
          background: "#E9F9EF",
          color: C.ok,
          fontSize: 14,
          fontWeight: 700,
        }}
      >
        <CheckCircle2 size={18} /> Процесс завершён — проверки пройдены, оплата
        проведена
      </div>
    );
  }
  const st = t.steps[t.currentStep];
  const who = userById(t.assignees[t.currentStep]);
  return (
    <div className="flex items-center gap-3 min-w-0">
      <Avatar id={t.assignees[t.currentStep]} size={38} />
      <div className="flex-1 min-w-0">
        <div style={{ fontSize: 11.5, color: C.faint, fontWeight: 600 }}>
          Шаг {t.currentStep + 1} из {t.steps.length} · {st.title}
        </div>
        <div
          className="truncate"
          style={{ fontSize: 14.5, color: C.ink, fontWeight: 700 }}
        >
          {who?.name}{" "}
          <span style={{ color: C.sub, fontWeight: 500 }}>— {st.actor}</span>
        </div>
      </div>
    </div>
  );
}

export function RouteFlow({ t, me, shiftOpen, dispatch, notify }) {
  const len = t.steps.length;
  const done = t.currentStep >= len;
  const idx = t.currentStep;
  const step = done ? null : t.steps[idx];
  const [photo, setPhoto] = useState(false);
  const [doc, setDoc] = useState(false);
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    setPhoto(false);
    setDoc(false);
    setChecked(false);
  }, [t.id, t.currentStep]);

  if (done) {
    return (
      <div
        className="rounded-2xl p-5 text-center"
        style={{ background: "#E9F9EF", border: `1px solid ${C.ok}` }}
      >
        <CheckCircle2 size={30} color={C.ok} style={{ margin: "0 auto" }} />
        <div className="font-bold mt-2" style={{ color: C.ok, fontSize: 16 }}>
          Процесс завершён
        </div>
        <div style={{ fontSize: 13.5, color: C.sub, marginTop: 2 }}>
          Товар принят, накладная оформлена и проверена, счёт-фактура сверена,
          оплата проведена.
        </div>
      </div>
    );
  }

  const who = userById(t.assignees[idx]);
  const isMine = t.assignees[idx] === me.id;
  const gateOk =
    (!step.photo || photo) && (!step.doc || doc) && (!step.check || checked);

  return (
    <div
      className="rounded-2xl p-4"
      style={{ border: `2px solid ${C.brandA}`, background: "#FBFDFF" }}
    >
      <div
        className="flex items-center gap-2 mb-1"
        style={{ fontSize: 12, color: C.brandA, fontWeight: 800 }}
      >
        <Send size={14} /> ТЕКУЩИЙ ШАГ {idx + 1} / {len}
      </div>
      <div className="font-bold" style={{ color: C.ink, fontSize: 16 }}>
        {step.title}
      </div>
      <div style={{ fontSize: 13, color: C.sub, marginBottom: 12 }}>
        Ответственный: <b>{who?.name}</b> · {step.actor}
      </div>

      {isMine ? (
        <div className="space-y-2.5">
          {step.photo && (
            <button
              onClick={() => {
                setPhoto(true);
                notify("Фотоотчёт прикреплён (снимок с камеры)");
              }}
              className="w-full flex items-center justify-between rounded-xl px-3.5 py-2.5 font-semibold"
              style={
                photo
                  ? {
                      background: "#E9F9EF",
                      color: C.ok,
                      border: `1px solid ${C.ok}`,
                    }
                  : { background: C.line, color: C.ink }
              }
            >
              <span className="inline-flex items-center gap-2">
                <Camera size={16} /> Фотоотчёт приёмки товара
              </span>
              {photo ? (
                <CheckCircle2 size={16} />
              ) : (
                <span style={{ fontSize: 12.5, color: C.faint }}>
                  обязательно
                </span>
              )}
            </button>
          )}
          {step.doc && (
            <button
              onClick={() => {
                setDoc(true);
                notify(`Документ прикреплён: ${step.docLabel || "документ"}`);
              }}
              className="w-full flex items-center justify-between rounded-xl px-3.5 py-2.5 font-semibold"
              style={
                doc
                  ? {
                      background: "#E9F9EF",
                      color: C.ok,
                      border: `1px solid ${C.ok}`,
                    }
                  : { background: C.line, color: C.ink }
              }
            >
              <span className="inline-flex items-center gap-2">
                <Paperclip size={16} /> {step.docLabel || "Документ"}
              </span>
              {doc ? (
                <CheckCircle2 size={16} />
              ) : (
                <span style={{ fontSize: 12.5, color: C.faint }}>
                  обязательно
                </span>
              )}
            </button>
          )}
          {step.check && (
            <label
              className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 cursor-pointer"
              style={{ background: C.line, color: C.ink, fontSize: 14 }}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => setChecked((v) => !v)}
                style={{ width: 18, height: 18, accentColor: C.brandA }}
              />
              {step.pay
                ? "Сверил фотоотчёт, накладную и счёт-фактуру — всё верно"
                : "Проверил — оформлено и оприходовано верно"}
            </label>
          )}
          {step.pay && t.amount != null && (
            <div
              className="rounded-xl px-3.5 py-2.5"
              style={{
                background: "#F5F0FE",
                border: "1px solid #E4D9FB",
                fontSize: 14,
                color: C.violet,
                fontWeight: 700,
              }}
            >
              <Wallet size={15} style={{ display: "inline", marginRight: 6 }} />{" "}
              К оплате: {fmtMoney(t.amount)}
            </div>
          )}

          {!shiftOpen ? (
            <div
              className="flex items-center gap-2 rounded-xl px-3.5 py-2.5"
              style={{
                background: "#FFF7ED",
                color: C.warn,
                fontSize: 13.5,
                fontWeight: 600,
              }}
            >
              <Lock size={15} /> Откройте смену, чтобы выполнить шаг.
            </div>
          ) : (
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                disabled={!gateOk}
                onClick={() =>
                  dispatch({
                    type: "ROUTE_ADVANCE",
                    id: t.id,
                    userId: me.id,
                    note: `${step.title}: ${step.action}`,
                    addAtt: (step.photo ? 1 : 0) + (step.doc ? 1 : 0),
                  })
                }
                className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 font-bold text-white"
                style={{
                  background: gateOk
                    ? step.pay
                      ? C.violet
                      : C.brandA
                    : "#C7CDD6",
                  fontSize: 14.5,
                }}
              >
                {step.pay ? <Wallet size={17} /> : <Send size={17} />}{" "}
                {step.action}
              </button>
              {step.check && idx > 0 && (
                <button
                  onClick={() =>
                    dispatch({
                      type: "ROUTE_RETURN",
                      id: t.id,
                      userId: me.id,
                      note: `Возврат с шага «${step.title}»`,
                    })
                  }
                  className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 font-bold"
                  style={{
                    background: "#FEECEC",
                    color: C.bad,
                    fontSize: 14.5,
                  }}
                >
                  <RotateCcw size={16} /> Вернуть на доработку
                </button>
              )}
              {!gateOk && (
                <span
                  style={{ fontSize: 12, color: C.faint, alignSelf: "center" }}
                >
                  Прикрепите обязательные вложения, чтобы продолжить.
                </span>
              )}
            </div>
          )}
        </div>
      ) : (
        <div
          className="flex items-center gap-2 rounded-xl px-3.5 py-2.5"
          style={{
            background: "#EFF4FF",
            color: C.brandA,
            fontSize: 13.5,
            fontWeight: 600,
          }}
        >
          <Clock size={15} /> Ожидается действие: {who?.name} ({step.actor}). Вы
          — участник процесса и видите его ход.
        </div>
      )}
    </div>
  );
}

export function RouteCreate({ me, s, dispatch, notify }) {
  const [rid, setRid] = useState(s.routes[0]?.id || "");
  const route = s.routes.find((r) => r.id === rid) || s.routes[0];
  const [branch, setBranch] = useState(
    String(me.branchId || s.branches[0]?.id || ""),
  );
  const [supplier, setSupplier] = useState("");
  const [goods, setGoods] = useState("");
  const [amount, setAmount] = useState("");
  const [picks, setPicks] = useState({});
  useEffect(() => {
    const def = {};
    (route?.steps || []).forEach((st, i) => {
      def[i] = assignByActor(st.actor, +branch);
    });
    setPicks(def);
  }, [rid, branch]);

  const create = () => {
    if (!route) {
      notify("Нет шаблонов маршрутов");
      return;
    }
    const steps = route.steps.map((st) => ({ ...st }));
    if (steps.length === 0) {
      notify("В маршруте нет шагов");
      return;
    }
    const assignees = steps.map(
      (st, i) => picks[i] || assignByActor(st.actor, +branch),
    );
    const now = Date.now();
    const task = {
      id: "t" + uid().slice(0, 6),
      title: `Приёмка: ${goods.trim() || "товар"} от ${supplier.trim() || "поставщика"}`,
      description: `Поставщик: ${supplier.trim() || "—"}. Принятый товар: ${goods.trim() || "—"}.`,
      branchId: +branch,
      departmentId: deptForCategory(route.category),
      cat: route.category,
      pr: "Обычный",
      amount: amount ? +amount : null,
      overBudget: false,
      createdBy: me.id,
      createdAt: now,
      slaDeadline: now + slaFor("Обычный") * H,
      attachments: 0,
      favorite: false,
      comments: [],
      routeId: route.id,
      routeName: route.name,
      steps,
      assignees,
      currentStep: 0,
      phase: 1,
      executorId: assignees[0],
      controllerId: assignees[assignees.length - 1],
    };
    dispatch({ type: "CREATE_TASK", task });
    notify("Процесс запущен — задача создана");
    setSupplier("");
    setGoods("");
    setAmount("");
  };

  const userOpts = s.users
    .filter((u) => u.active !== false)
    .map((u) => ({ value: u.id, label: `${u.name} · ${u.pos}` }));
  const inp = { border: `1px solid ${C.border}`, fontSize: 14.5, color: C.ink };

  return (
    <div
      className="rounded-2xl bg-white p-6"
      style={{ border: `1px solid ${C.border}` }}
    >
      <h2
        className="font-extrabold mb-1"
        style={{ color: C.ink, fontSize: 19 }}
      >
        {tr("Запустить процесс по шаблону")}
      </h2>
      <p style={{ fontSize: 14, color: C.sub, marginBottom: 16 }}>
        Задача пройдёт по шагам маршрута: каждый участник выполняет свой шаг
        строго по очереди, с обязательными вложениями.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Шаблон процесса">
          <Select
            value={rid}
            onChange={setRid}
            options={s.routes.map((r) => ({ value: r.id, label: r.name }))}
          />
        </Field>
        <Field label="Филиал">
          <Select
            value={branch}
            onChange={setBranch}
            options={s.branches.map((b) => ({ value: b.id, label: b.name }))}
          />
        </Field>
        <Field label="Поставщик">
          <input
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
            placeholder="ООО «Поставщик»"
            className="w-full rounded-xl px-3 py-2.5 focus:outline-none"
            style={inp}
          />
        </Field>
        <Field label="Что приняли">
          <input
            value={goods}
            onChange={(e) => setGoods(e.target.value)}
            placeholder="Продукты, упаковка…"
            className="w-full rounded-xl px-3 py-2.5 focus:outline-none"
            style={inp}
          />
        </Field>
        <Field label="Сумма к оплате, сум">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            className="w-full rounded-xl px-3 py-2.5 focus:outline-none"
            style={inp}
          />
        </Field>
      </div>

      <div
        className="mt-4 rounded-xl p-3"
        style={{ background: "#FBFCFE", border: `1px solid ${C.border}` }}
      >
        <div
          style={{
            fontSize: 12.5,
            color: C.faint,
            fontWeight: 700,
            marginBottom: 8,
          }}
        >
          УЧАСТНИКИ ШАГОВ (можно переназначить)
        </div>
        <div className="space-y-2">
          {(route?.steps || []).map((st, i) => (
            <div key={i} className="flex items-center gap-2 flex-wrap">
              <span
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 99,
                  background: C.brandA,
                  color: "#fff",
                  fontSize: 11,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 800,
                }}
              >
                {i + 1}
              </span>
              <span
                style={{
                  fontSize: 13,
                  color: C.ink,
                  fontWeight: 600,
                  minWidth: 150,
                }}
              >
                {st.title}
              </span>
              <span style={{ fontSize: 11.5, color: C.faint }}>{st.actor}</span>
              {st.photo && (
                <Badge color={C.ok} bg="#E9F9EF">
                  📷 фото
                </Badge>
              )}
              {st.doc && (
                <Badge color={C.violet} bg="#F5F0FE">
                  📄 {st.docLabel || "документ"}
                </Badge>
              )}
              {st.pay && (
                <Badge color={C.violet} bg="#F5F0FE">
                  💳 оплата
                </Badge>
              )}
              <div style={{ minWidth: 220, flex: 1 }}>
                <Select
                  value={picks[i] || ""}
                  onChange={(v) => setPicks({ ...picks, [i]: v })}
                  options={userOpts}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={create}
        className="mt-4 inline-flex items-center gap-2 rounded-xl px-5 py-3 font-bold text-white"
        style={{
          background: `linear-gradient(90deg, ${C.violet}, ${C.brandA})`,
          fontSize: 15,
        }}
      >
        <Send size={18} /> {tr("Запустить процесс")}
      </button>
    </div>
  );
}

function AdRoute({ route, s, dispatch, notify }) {
  const [title, setTitle] = useState("");
  const [actor, setActor] = useState(s.positions[0]?.title || "");
  const [action, setAction] = useState("");
  const [photo, setPhoto] = useState(false);
  const [doc, setDoc] = useState(false);
  const addStep = () => {
    if (!title.trim()) {
      notify("Укажите название шага");
      return;
    }
    const steps = [
      ...route.steps,
      {
        title: title.trim(),
        actor,
        action: action.trim() || "Выполнил шаг",
        photo,
        doc,
        check: !photo && !doc,
      },
    ];
    dispatch({ type: "UPDATE_ROUTE", id: route.id, patch: { steps } });
    notify("Шаг добавлен");
    setTitle("");
    setAction("");
    setPhoto(false);
    setDoc(false);
  };
  const delStep = (i) =>
    dispatch({
      type: "UPDATE_ROUTE",
      id: route.id,
      patch: { steps: route.steps.filter((_, j) => j !== i) },
    });
  return (
    <div
      className="rounded-xl p-3"
      style={{ background: "#FBFCFE", border: `1px solid ${C.border}` }}
    >
      <div className="flex items-center gap-2 mb-2">
        <ListChecks size={16} color={C.brandA} />
        <span style={{ fontWeight: 700, color: C.ink }}>{route.name}</span>
        <Badge>{route.category}</Badge>
      </div>
      <div className="space-y-1.5 mb-3">
        {route.steps.map((st, i) => (
          <div
            key={i}
            className="flex items-center gap-2 flex-wrap rounded-lg px-3 py-2"
            style={{ background: "#fff", border: `1px solid ${C.line}` }}
          >
            <span
              style={{
                width: 18,
                height: 18,
                borderRadius: 99,
                background: C.brandA,
                color: "#fff",
                fontSize: 11,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 800,
              }}
            >
              {i + 1}
            </span>
            <span style={{ fontSize: 13, color: C.ink, fontWeight: 600 }}>
              {st.title}
            </span>
            <span style={{ fontSize: 11.5, color: C.faint }}>· {st.actor}</span>
            {st.photo && (
              <Badge color={C.ok} bg="#E9F9EF">
                📷
              </Badge>
            )}
            {st.doc && (
              <Badge color={C.violet} bg="#F5F0FE">
                📄
              </Badge>
            )}
            {st.check && (
              <Badge color={C.brandA} bg="#EFF4FF">
                ✔
              </Badge>
            )}
            {st.pay && (
              <Badge color={C.violet} bg="#F5F0FE">
                💳
              </Badge>
            )}
            <button
              onClick={() => delStep(i)}
              className="ml-auto"
              title="Удалить шаг"
            >
              <X size={14} color={C.faint} />
            </button>
          </div>
        ))}
        {route.steps.length === 0 && (
          <div style={{ fontSize: 12.5, color: C.faint }}>
            Шагов пока нет — добавьте ниже.
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 items-end">
        <AdInput
          label="Название шага"
          value={title}
          onChange={setTitle}
          placeholder="Проверка договора"
        />
        <Field label="Ответственный (должность)">
          <Select
            value={actor}
            onChange={setActor}
            options={s.positions.map((p) => ({
              value: p.title,
              label: p.title,
            }))}
          />
        </Field>
        <AdInput
          label="Действие (кнопка)"
          value={action}
          onChange={setAction}
          placeholder="Проверил и согласовал"
        />
        <div className="flex items-center gap-3 pb-1">
          <label
            className="flex items-center gap-1.5 cursor-pointer"
            style={{ fontSize: 13, color: C.ink }}
          >
            <input
              type="checkbox"
              checked={photo}
              onChange={() => setPhoto((v) => !v)}
              style={{ width: 16, height: 16, accentColor: C.brandA }}
            />{" "}
            фото
          </label>
          <label
            className="flex items-center gap-1.5 cursor-pointer"
            style={{ fontSize: 13, color: C.ink }}
          >
            <input
              type="checkbox"
              checked={doc}
              onChange={() => setDoc((v) => !v)}
              style={{ width: 16, height: 16, accentColor: C.brandA }}
            />{" "}
            документ
          </label>
          <button
            onClick={addStep}
            className="ml-auto rounded-lg px-3 py-2 font-bold text-white"
            style={{ background: C.brandA, fontSize: 13.5 }}
          >
            + шаг
          </button>
        </div>
      </div>
    </div>
  );
}

export function AdminRoutes({ s, dispatch, notify }) {
  const [name, setName] = useState("");
  const [cat, setCat] = useState(Object.keys(s.catDept)[0] || "Прочее");
  const addRoute = () => {
    if (!name.trim()) {
      notify("Укажите название маршрута");
      return;
    }
    dispatch({
      type: "ADD_ROUTE",
      route: {
        id: "r" + uid().slice(0, 4),
        name: name.trim(),
        category: cat,
        steps: [],
      },
    });
    notify("Маршрут добавлен");
    setName("");
  };
  return (
    <div className="space-y-5">
      <AdCard
        title="Шаблоны процессов (маршруты)"
        desc="Маршрут — последовательность шагов с ответственными. Задача проходит шаги строго по очереди; на каждом шаге можно требовать фото и/или документ."
      >
        <div className="space-y-4">
          {s.routes.map((r) => (
            <AdRoute
              key={r.id}
              route={r}
              s={s}
              dispatch={dispatch}
              notify={notify}
            />
          ))}
        </div>
      </AdCard>
      <AdCard title="Добавить маршрут">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <AdInput
            label="Название"
            value={name}
            onChange={setName}
            placeholder="Согласование договора"
          />
          <Field label="Категория">
            <Select
              value={cat}
              onChange={setCat}
              options={Object.keys(s.catDept).map((c) => ({
                value: c,
                label: c,
              }))}
            />
          </Field>
          <button
            onClick={addRoute}
            className="rounded-xl px-4 py-2.5 font-bold text-white"
            style={{ background: C.brandA, fontSize: 14.5 }}
          >
            Добавить маршрут
          </button>
        </div>
      </AdCard>
    </div>
  );
}
