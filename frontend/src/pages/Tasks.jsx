// Задачи: доска (Входящие), карточка, детальная модалка и создание заявки.
import { useState } from "react";
import {
  Clock,
  Paperclip,
  MessageSquare,
  Star,
  X,
  CheckCircle2,
  RotateCcw,
  Play,
  Send,
  Bot,
  ChevronRight,
  ShieldCheck,
  AlertTriangle,
  Sparkles,
  Info,
  Camera,
  ListChecks,
  Lock,
  Wallet,
  GripVertical,
} from "lucide-react";
import { C, PHASES } from "../lib/theme.js";
import { tr } from "../lib/i18n.js";
import { H, D, uid, fmtMoney, fmtDateTime } from "../lib/format.js";
import {
  ORG,
  userById,
  branchById,
  companyOfBranch,
  deptById,
  deptForCategory,
  budgetFor,
  slaFor,
  sopFor,
} from "../lib/org.js";
import {
  Avatar,
  PhasePill,
  MiniRail,
  PhaseRail,
  Badge,
  BigBtn,
  Meta,
  Field,
  Select,
} from "../components/ui.jsx";
import {
  ACTION_LABEL,
  aiParse,
  aiSummary,
  pickController,
  pickExecutor,
  slaInfo,
  spentForBranch,
} from "../lib/tasks.js";
import {
  RouteCreate,
  RouteFlow,
  RouteResp,
  StepRail,
} from "../pages/Routes.jsx";

/* ------------------------------ карточка задачи ---------------------------- */
function TaskCard({ t, now, onOpen, onFav, anomaly }) {
  const p = PHASES[t.phase - 1];
  const sla = slaInfo(t, now);
  const b = branchById(t.branchId);
  return (
    <button
      onClick={() => onOpen(t.id)}
      className="relative w-full text-left rounded-2xl bg-white overflow-hidden transition focus:outline-none"
      style={{
        border: `1px solid ${C.border}`,
        boxShadow: "0 1px 2px rgba(15,23,42,.04)",
      }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.boxShadow = "0 8px 24px rgba(15,23,42,.10)")
      }
      onMouseLeave={(e) =>
        (e.currentTarget.style.boxShadow = "0 1px 2px rgba(15,23,42,.04)")
      }
    >
      <span
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 5,
          background: p.color,
        }}
      />
      <div className="p-3 pl-4">
        <div className="flex items-start justify-between gap-2">
          <h4
            className="font-bold leading-snug"
            style={{
              color: C.ink,
              fontSize: 15,
              overflowWrap: "break-word",
              minWidth: 0,
            }}
          >
            {t.title}
          </h4>
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onFav(t.id);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.stopPropagation();
                onFav(t.id);
              }
            }}
            className="shrink-0 -mr-1 -mt-1 p-1 rounded-lg"
            title="В избранное"
          >
            <Star
              size={18}
              fill={t.favorite ? "#FACC15" : "none"}
              color={t.favorite ? "#FACC15" : C.faint}
            />
          </span>
        </div>
        <div className="mt-1" style={{ fontSize: 13, color: C.sub }}>
          {b?.name} • {t.cat}
        </div>

        {anomaly && (
          <div
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg"
            style={{
              background: "#FEF2F2",
              color: C.bad,
              padding: "3px 8px",
              fontSize: 11.5,
              fontWeight: 600,
            }}
          >
            <AlertTriangle size={13} /> ИИ-ревизор: аномалия
          </div>
        )}

        <div className="mt-2.5 space-y-1.5" style={{ fontSize: 13 }}>
          <div
            className="flex items-center gap-2 min-w-0"
            style={{ color: C.sub }}
          >
            <Avatar id={t.executorId} size={22} />
            <span className="flex-1 min-w-0 truncate">
              <b style={{ color: C.ink, fontWeight: 600 }}>
                {tr("Исполнитель:")}
              </b>{" "}
              {userById(t.executorId)?.name}
            </span>
          </div>
          <div
            className="flex items-center gap-2 min-w-0"
            style={{ color: C.sub }}
          >
            <Avatar id={t.controllerId} size={22} />
            <span className="flex-1 min-w-0 truncate">
              <b style={{ color: C.ink, fontWeight: 600 }}>
                {tr("Контролёр:")}
              </b>{" "}
              {userById(t.controllerId)?.name}
            </span>
          </div>
        </div>

        <div className="mt-2.5">
          <MiniRail phase={t.phase} />
        </div>

        <div className="mt-2.5 flex items-center justify-between">
          <span
            className="inline-flex items-center gap-1.5 rounded-lg font-semibold"
            style={{
              fontSize: 12.5,
              color: sla.color,
              background: t.phase >= 5 ? C.line : sla.color + "14",
              padding: "3px 9px",
            }}
          >
            <Clock size={13} /> {sla.text}
          </span>
          <div
            className="flex items-center gap-3"
            style={{ color: C.faint, fontSize: 13 }}
          >
            <span className="inline-flex items-center gap-1">
              <MessageSquare size={14} /> {t.comments.length}
            </span>
            <span className="inline-flex items-center gap-1">
              <Paperclip size={14} /> {t.attachments}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}

/* ---------------------------- доска (Канбан) ------------------------------- */
export function Board({
  tasks,
  now,
  onOpen,
  onFav,
  flags,
  me,
  dispatch,
  notify,
  shiftOpen,
}) {
  const counts = PHASES.map((p) => tasks.filter((t) => t.phase === p.n).length);
  const firstNonEmpty = (PHASES.find((p, i) => counts[i] > 0) || PHASES[0]).n;
  const [active, setActive] = useState(firstNonEmpty);
  const [dragId, setDragId] = useState(null);
  const [overPhase, setOverPhase] = useState(null);
  const colCards = (n) => tasks.filter((t) => t.phase === n);

  // Кого текущий пользователь может тащить (исполнитель/контролёр, смена
  // открыта, не регламентная задача, не завершено).
  const canDrag = (t) =>
    !!shiftOpen &&
    !t.routeId &&
    t.phase < 5 &&
    !!me &&
    (t.executorId === me.id || t.controllerId === me.id);

  // План перехода при переносе задачи в фазу target — те же правила, что и
  // кнопки в карточке. null = такой перенос недоступен.
  const planMove = (t, target) => {
    if (!t || t.routeId || t.phase >= 5 || !me) return null;
    const isExec = t.executorId === me.id;
    const isCtrl = t.controllerId === me.id;
    if (isExec && (t.phase === 1 || t.phase === 2) && target === 3)
      return {
        action: "start",
        from: t.phase,
        to: 3,
        msg: "Задача взята в работу",
      };
    if (isExec && t.phase === 3 && target === 4)
      return { action: "review", from: 3, to: 4, needFinish: true };
    if (isCtrl && t.phase === 4 && target === 5)
      return {
        action: "done",
        from: 4,
        to: 5,
        msg: "Работа принята, задача завершена",
      };
    if (isCtrl && t.phase === 4 && target === 3)
      return {
        action: "return",
        from: 4,
        to: 3,
        msg: "Возвращено исполнителю на доработку",
      };
    return null;
  };

  const drop = (target, id) => {
    const t = tasks.find((x) => x.id === (id || dragId));
    setDragId(null);
    setOverPhase(null);
    if (!t || t.phase === target) return;
    if (!shiftOpen)
      return notify && notify("Откройте смену, чтобы менять статус");
    const plan = planMove(t, target);
    if (!plan)
      return notify && notify("Такой переход недоступен для вашей роли");
    // Переход «на проверку» требует чек-листа и фото — открываем карточку.
    if (plan.needFinish) {
      onOpen(t.id);
      return notify && notify("Завершите чек-лист и фото в карточке задачи");
    }
    dispatch({
      type: "ADVANCE",
      id: t.id,
      action: plan.action,
      from: plan.from,
      to: plan.to,
    });
    notify && notify(plan.msg);
  };

  // Плоская render-функция (не компонент) — чтобы при перерисовке доски во
  // время перетаскивания карточки не перемонтировались (иначе «призрак» drag
  // застревает). Реконсиляция идёт по key={t.id}.
  const renderCards = (n) => {
    const col = colCards(n);
    if (col.length === 0)
      return (
        <div
          className="text-center py-6"
          style={{ color: C.faint, fontSize: 13 }}
        >
          {tr("Нет задач")}
        </div>
      );
    return (
      <>
        {col.map((t) => {
          const drg = canDrag(t);
          return (
            <div
              key={t.id}
              draggable={drg}
              onDragStart={(e) => {
                if (!drg) return;
                setDragId(t.id);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", t.id);
              }}
              onDragEnd={() => {
                setDragId(null);
                setOverPhase(null);
              }}
              style={{
                cursor: drg ? "grab" : "default",
                opacity: dragId === t.id ? 0.4 : 1,
              }}
            >
              <TaskCard
                t={t}
                now={now}
                onOpen={onOpen}
                onFav={onFav}
                anomaly={!!(flags && flags[t.id])}
              />
            </div>
          );
        })}
      </>
    );
  };
  return (
    <>
      {/* Телефон/планшет: переключатель фаз + одна колонка (всё помещается, без горизонтальной прокрутки) */}
      <div className="xl:hidden">
        <div className="flex flex-wrap gap-1.5 pb-1">
          {PHASES.map((p, i) => {
            const on = active === p.n;
            return (
              <button
                key={p.n}
                onClick={() => setActive(p.n)}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-bold"
                style={{
                  background: on ? p.color : "#fff",
                  color: on ? "#fff" : C.ink,
                  border: `1px solid ${on ? p.color : C.border}`,
                  fontSize: 12.5,
                  whiteSpace: "nowrap",
                }}
              >
                <span
                  style={{
                    background: on ? "#fff" : p.color,
                    width: 8,
                    height: 8,
                    borderRadius: 99,
                  }}
                />
                {tr(p.label)}
                <span
                  className="rounded-full font-bold"
                  style={{
                    background: on ? "rgba(255,255,255,.25)" : p.soft,
                    color: on ? "#fff" : p.color,
                    fontSize: 11,
                    padding: "0 7px",
                  }}
                >
                  {counts[i]}
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-col gap-2.5 mt-1">{renderCards(active)}</div>
      </div>

      {/* Десктоп (xl+): 5 равных колонок во всю ширину — без горизонтального ползунка */}
      <div
        className="hidden xl:flex items-center gap-1.5 mb-2"
        style={{ fontSize: 12, color: C.faint }}
      >
        <GripVertical size={13} />
        Перетащите карточку в соседнюю колонку, чтобы сменить статус задачи.
      </div>
      <div
        className="hidden xl:grid gap-3"
        style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))" }}
      >
        {PHASES.map((p, i) => (
          <div key={p.n} className="min-w-0">
            <div className="flex items-center gap-2 px-1 pb-2.5">
              <span
                className="shrink-0"
                style={{
                  background: p.color,
                  width: 10,
                  height: 10,
                  borderRadius: 99,
                }}
              />
              <span
                className="font-bold uppercase truncate"
                style={{ color: C.ink, fontSize: 11.5, letterSpacing: ".03em" }}
              >
                {tr(p.label)}
              </span>
              <span
                className="ml-auto shrink-0 rounded-full font-bold"
                style={{
                  background: p.soft,
                  color: p.color,
                  fontSize: 11.5,
                  padding: "1px 8px",
                }}
              >
                {counts[i]}
              </span>
            </div>
            <div
              className="flex flex-col gap-2.5 rounded-2xl p-2 transition-colors"
              onDragOver={(e) => {
                if (!dragId) return;
                e.preventDefault();
                if (overPhase !== p.n) setOverPhase(p.n);
              }}
              onDragLeave={() =>
                setOverPhase((cur) => (cur === p.n ? null : cur))
              }
              onDrop={(e) => {
                e.preventDefault();
                drop(p.n, e.dataTransfer.getData("text/plain"));
              }}
              style={{
                background: overPhase === p.n ? p.soft : "#FBFCFE",
                border: `1px dashed ${overPhase === p.n ? p.color : C.border}`,
                minHeight: 120,
              }}
            >
              {renderCards(p.n)}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/* ----------------------------- деталь задачи ------------------------------- */
export function TaskDetail({
  t,
  now,
  me,
  history,
  dispatch,
  notify,
  anomalyFlags,
  shiftOpen,
  onClose,
}) {
  const [comment, setComment] = useState("");
  const [summary, setSummary] = useState(null);
  const sop = sopFor(t.cat);
  const steps = sop.steps;
  const needPhoto = sop.requirePhoto;
  const [checks, setChecks] = useState(() => steps.map(() => false));
  const [photoTaken, setPhotoTaken] = useState(false);

  const isExec = t.executorId === me.id;
  const isCtrl = t.controllerId === me.id;
  const sla = slaInfo(t, now);
  const b = branchById(t.branchId);
  const co = companyOfBranch(t.branchId);
  const log = history
    .filter((h) => h.taskId === t.id)
    .sort((a, z) => a.at - z.at);
  const allChecked = checks.every(Boolean);
  const canFinish = allChecked && (!needPhoto || photoTaken);

  const act = (action, from, to, msg) => {
    dispatch({ type: "ADVANCE", id: t.id, action, from, to });
    notify(msg);
  };

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end"
      style={{
        background: "rgba(30,16,10,.42)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
      }}
      onClick={onClose}
    >
      <div
        className="h-full w-full bg-white overflow-y-auto fade-up"
        style={{ maxWidth: 560, boxShadow: "-24px 0 60px rgba(30,16,10,.22)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="sticky top-0 z-10 bg-white px-5 py-4 flex items-start justify-between gap-3"
          style={{ borderBottom: `1px solid ${C.border}` }}
        >
          <div className="min-w-0">
            <div
              className="flex items-center gap-2 mb-1"
              style={{ fontSize: 12.5, color: C.faint }}
            >
              <span>Заявка #{t.id.replace("t", "")}</span>
              <ChevronRight size={13} />
              <span className="truncate">{b?.name}</span>
            </div>
            <h2
              className="font-extrabold leading-tight"
              style={{ color: C.ink, fontSize: 18, overflowWrap: "break-word" }}
            >
              {t.title}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl shrink-0"
            style={{ background: C.line }}
            title="Закрыть"
          >
            <X size={18} color={C.sub} />
          </button>
        </div>

        <div className="px-5 py-5 space-y-5">
          <div
            className="rounded-2xl p-4"
            style={{ background: "#FBFCFE", border: `1px solid ${C.border}` }}
          >
            {t.routeId ? (
              <StepRail steps={t.steps} current={t.currentStep} />
            ) : (
              <PhaseRail phase={t.phase} />
            )}
          </div>

          {anomalyFlags && anomalyFlags.length > 0 && (
            <div
              className="rounded-2xl p-4"
              style={{ background: "#FEF2F2", border: `1px solid #FECACA` }}
            >
              <div
                className="flex items-center gap-2 font-bold mb-1.5"
                style={{ color: C.bad, fontSize: 14 }}
              >
                <AlertTriangle size={16} /> ИИ-ревизор обнаружил аномалии
              </div>
              <ul
                className="space-y-1"
                style={{ fontSize: 13, color: "#991B1B" }}
              >
                {anomalyFlags.map((f, i) => (
                  <li key={i}>• {f}</li>
                ))}
              </ul>
            </div>
          )}

          {/* блок ответственности */}
          <div
            className="rounded-2xl p-4 space-y-3"
            style={{ border: `1px solid ${C.border}` }}
          >
            {t.routeId ? (
              <RouteResp t={t} />
            ) : (
              <>
                <RespRow
                  id={t.executorId}
                  role={tr("Исполнитель — кто делает")}
                />
                <RespRow
                  id={t.controllerId}
                  role={tr("Контролёр — кто следит")}
                />
              </>
            )}
            <div
              className="flex items-center gap-2 rounded-xl px-3 py-2"
              style={{
                background: t.phase >= 5 ? C.line : sla.color + "14",
                color: sla.color,
                fontSize: 14,
                fontWeight: 700,
              }}
            >
              <Clock size={16} /> Срок (SLA): {sla.text}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3" style={{ fontSize: 13.5 }}>
            <Meta label={tr("Юр. лицо")} value={co?.name} />
            <Meta label={tr("Филиал")} value={b?.name} />
            <Meta label={tr("Категория")} value={t.cat} />
            <Meta
              label={tr("Отдел")}
              value={
                <span className="inline-flex items-center gap-1.5">
                  {deptById(t.departmentId)?.name || "—"}
                  {deptById(t.departmentId)?.restricted && (
                    <Lock size={12} color={C.bad} />
                  )}
                </span>
              }
            />
            <Meta label={tr("Приоритет")} value={tr(t.pr)} />
            <Meta label={tr("Создана")} value={fmtDateTime(t.createdAt)} />
            <Meta
              label={tr("Текущая фаза")}
              value={<PhasePill phase={t.phase} small />}
            />
          </div>

          <div>
            <div
              style={{
                fontSize: 12.5,
                color: C.faint,
                fontWeight: 600,
                marginBottom: 4,
              }}
            >
              {tr("Описание")}
            </div>
            <p style={{ fontSize: 14.5, color: C.ink, lineHeight: 1.55 }}>
              {t.description}
            </p>
          </div>

          {t.amount != null && (
            <div
              className="rounded-xl px-4 py-3"
              style={{ background: "#FBFCFE", border: `1px solid ${C.border}` }}
            >
              <div style={{ fontSize: 12.5, color: C.faint, fontWeight: 600 }}>
                Доп. поля (JSONB)
              </div>
              <div style={{ fontSize: 16, color: C.ink, fontWeight: 700 }}>
                {tr("Сумма")}: {fmtMoney(t.amount)}
              </div>
              {t.overBudget && (
                <div
                  className="mt-1 inline-flex items-center gap-1.5"
                  style={{ fontSize: 12.5, color: C.bad, fontWeight: 600 }}
                >
                  <Wallet size={14} /> Превышен бюджет филиала — требуется
                  одобрение финансиста
                </div>
              )}
            </div>
          )}

          {t.routeId && (
            <RouteFlow
              t={t}
              me={me}
              shiftOpen={shiftOpen}
              dispatch={dispatch}
              notify={notify}
            />
          )}

          {/* SOP чек-лист в фазе «В работе» для исполнителя */}
          {!t.routeId && isExec && t.phase === 3 && (
            <div
              className="rounded-2xl p-4"
              style={{ border: `1px solid ${C.border}` }}
            >
              <div
                className="flex items-center gap-2 font-bold mb-1"
                style={{ color: C.ink, fontSize: 15 }}
              >
                <ListChecks size={17} color={PHASES[2].color} /> Регламент
                (SOP): отметьте все шаги
              </div>
              <div style={{ fontSize: 12.5, color: C.sub, marginBottom: 10 }}>
                Кнопка «Выполнил» разблокируется только после всех шагов и фото.
              </div>
              <div className="space-y-2">
                {steps.map((st, i) => (
                  <label
                    key={i}
                    className="flex items-start gap-2.5 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={checks[i]}
                      onChange={() =>
                        setChecks((c) => c.map((v, k) => (k === i ? !v : v)))
                      }
                      style={{
                        width: 18,
                        height: 18,
                        marginTop: 1,
                        accentColor: PHASES[2].color,
                      }}
                    />
                    <span
                      style={{
                        fontSize: 14,
                        color: checks[i] ? C.faint : C.ink,
                        textDecoration: checks[i] ? "line-through" : "none",
                      }}
                    >
                      {st}
                    </span>
                  </label>
                ))}
              </div>
              {needPhoto && (
                <>
                  <button
                    onClick={() => {
                      setPhotoTaken(true);
                      notify("Фото сделано сейчас — метаданные проверены");
                    }}
                    className="mt-3 inline-flex items-center gap-2 rounded-xl px-3 py-2 font-semibold"
                    style={
                      photoTaken
                        ? {
                            background: "#E9F9EF",
                            color: C.ok,
                            border: `1px solid ${C.ok}`,
                          }
                        : { background: C.line, color: C.ink }
                    }
                  >
                    <Camera size={16} />{" "}
                    {photoTaken
                      ? "Фотоотчёт прикреплён"
                      : "Сделать фото (камера)"}
                  </button>
                  {!photoTaken && (
                    <div
                      style={{ fontSize: 11.5, color: C.faint, marginTop: 6 }}
                    >
                      Загрузка старого фото из галереи блокируется — нужен
                      снимок в реальном времени.
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* действия по ролям */}
          {!t.routeId && t.phase < 5 && (isExec || isCtrl) && !shiftOpen && (
            <div
              className="rounded-xl px-3 py-2.5 flex items-center gap-2"
              style={{
                background: "#FEF2F2",
                color: C.bad,
                fontSize: 13,
                border: `1px solid #FECACA`,
              }}
            >
              <Lock size={15} /> Смена закрыта — по регламенту безопасности
              доступен только просмотр. Откройте смену, чтобы менять статус.
            </div>
          )}
          {!t.routeId && t.phase < 5 && (isExec || isCtrl) && shiftOpen && (
            <div className="space-y-2">
              <div style={{ fontSize: 12.5, color: C.faint, fontWeight: 600 }}>
                Доступные действия для вашей роли
              </div>
              {isExec && (t.phase === 1 || t.phase === 2) && (
                <BigBtn
                  color={PHASES[2].color}
                  icon={Play}
                  onClick={() =>
                    act("start", t.phase, 3, "Задача взята в работу")
                  }
                >
                  Взять в работу
                </BigBtn>
              )}
              {isExec && t.phase === 3 && (
                <BigBtn
                  color={PHASES[3].color}
                  icon={Send}
                  disabled={!canFinish}
                  onClick={() =>
                    act("review", 3, 4, "Отправлено на проверку контролёру")
                  }
                >
                  {canFinish
                    ? "Выполнил — отправить на проверку"
                    : "Завершите чек-лист и фото"}
                </BigBtn>
              )}
              {isCtrl && t.phase === 4 && (
                <div className="grid grid-cols-1 gap-2">
                  <BigBtn
                    color={PHASES[4].color}
                    icon={CheckCircle2}
                    onClick={() =>
                      act("done", 4, 5, "Работа принята, задача завершена")
                    }
                  >
                    Принять и завершить
                  </BigBtn>
                  <BigBtn
                    color={C.warn}
                    icon={RotateCcw}
                    outline
                    onClick={() =>
                      act("return", 4, 3, "Возвращено исполнителю на доработку")
                    }
                  >
                    Вернуть на доработку
                  </BigBtn>
                </div>
              )}
              {((isExec && t.phase === 4) || (isCtrl && t.phase < 4)) && (
                <div
                  className="rounded-xl px-3 py-2.5 flex items-center gap-2"
                  style={{ background: C.line, color: C.sub, fontSize: 13 }}
                >
                  <Info size={15} /> Сейчас ход за{" "}
                  {isCtrl ? "исполнителем" : "контролёром"}. Кнопка появится на
                  нужной фазе.
                </div>
              )}
            </div>
          )}
          {!t.routeId && !isExec && !isCtrl && (
            <div
              className="rounded-xl px-3 py-2.5 flex items-center gap-2"
              style={{ background: C.line, color: C.sub, fontSize: 13 }}
            >
              <ShieldCheck size={15} /> Режим наблюдателя: вы видите задачу, но
              не назначены исполнителем или контролёром.
            </div>
          )}

          {/* AI саммари */}
          <div
            className="rounded-2xl p-4"
            style={{ border: `1px solid ${C.border}`, background: "#FBFCFE" }}
          >
            <button
              onClick={() => setSummary(aiSummary(t))}
              className="inline-flex items-center gap-2 rounded-xl px-3 py-2 font-bold text-white"
              style={{
                background: `linear-gradient(90deg, ${C.violet}, ${C.brandA})`,
                fontSize: 14,
              }}
            >
              <Bot size={16} /> {tr("Краткая суть (ИИ)")}
            </button>
            {summary && (
              <p
                className="mt-3"
                style={{ fontSize: 14, color: C.ink, lineHeight: 1.55 }}
              >
                {summary}
              </p>
            )}
          </div>

          {/* обсуждение */}
          <div>
            <div
              className="font-bold mb-2"
              style={{ color: C.ink, fontSize: 15 }}
            >
              {tr("Обсуждение")} ({t.comments.length})
            </div>
            <div className="space-y-3">
              {t.comments.map((c, i) => (
                <div key={i} className="flex gap-2.5">
                  <Avatar id={c.userId} size={28} />
                  <div
                    className="rounded-xl px-3 py-2 flex-1"
                    style={{ background: C.line }}
                  >
                    <div
                      style={{ fontSize: 13, fontWeight: 700, color: C.ink }}
                    >
                      {userById(c.userId)?.name}
                    </div>
                    <div style={{ fontSize: 14, color: C.ink }}>{c.text}</div>
                    <div
                      style={{ fontSize: 11.5, color: C.faint, marginTop: 2 }}
                    >
                      {fmtDateTime(c.at)}
                    </div>
                  </div>
                </div>
              ))}
              {t.comments.length === 0 && (
                <div style={{ fontSize: 13, color: C.faint }}>
                  Пока нет сообщений.
                </div>
              )}
            </div>
            <div className="mt-3 flex gap-2">
              <input
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && comment.trim()) {
                    dispatch({
                      type: "ADD_COMMENT",
                      id: t.id,
                      text: comment.trim(),
                    });
                    setComment("");
                  }
                }}
                placeholder="Написать сообщение…"
                className="flex-1 rounded-xl px-3 py-2.5 focus:outline-none"
                style={{
                  border: `1px solid ${C.border}`,
                  fontSize: 14,
                  color: C.ink,
                }}
              />
              <button
                onClick={() => {
                  if (comment.trim()) {
                    dispatch({
                      type: "ADD_COMMENT",
                      id: t.id,
                      text: comment.trim(),
                    });
                    setComment("");
                  }
                }}
                className="px-4 rounded-xl font-bold text-white"
                style={{ background: C.brandA, fontSize: 14 }}
              >
                Отправить
              </button>
            </div>
          </div>

          {/* неизменяемый журнал */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck size={16} color={C.ok} />
              <span
                className="font-bold"
                style={{ color: C.ink, fontSize: 15 }}
              >
                {tr("Журнал (неизменяемый)")}
              </span>
            </div>
            <div style={{ fontSize: 12, color: C.faint, marginBottom: 10 }}>
              Записи нельзя удалить или отредактировать — защита от споров «я не
              видел».
            </div>
            <div className="relative pl-5">
              <span
                style={{
                  position: "absolute",
                  left: 6,
                  top: 4,
                  bottom: 4,
                  width: 2,
                  background: C.border,
                }}
              />
              <div className="space-y-3.5">
                {log.map((h) => {
                  const dot = h.to ? PHASES[h.to - 1].color : C.faint;
                  return (
                    <div key={h.id} className="relative">
                      <span
                        style={{
                          position: "absolute",
                          left: -19,
                          top: 4,
                          width: 11,
                          height: 11,
                          borderRadius: 99,
                          background: dot,
                          boxShadow: "0 0 0 3px #fff",
                        }}
                      />
                      <div style={{ fontSize: 13.5, color: C.ink }}>
                        <b style={{ fontWeight: 700 }}>
                          {userById(h.userId)?.name}
                        </b>{" "}
                        — {ACTION_LABEL[h.action] || h.action}
                        {h.note && (
                          <span style={{ color: C.sub }}>: {h.note}</span>
                        )}
                        {h.from && h.to && (
                          <span style={{ color: C.sub }}>
                            {" "}
                            ({h.from}→{h.to})
                          </span>
                        )}
                      </div>
                      <div
                        style={{
                          fontSize: 11.5,
                          color: C.faint,
                          fontFamily: "ui-monospace, monospace",
                        }}
                      >
                        {fmtDateTime(h.at)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function RespRow({ id, role }) {
  const u = userById(id);
  return (
    <div className="flex items-center gap-3 min-w-0">
      <div className="shrink-0">
        <Avatar id={id} size={40} />
      </div>
      <div className="min-w-0">
        <div style={{ fontSize: 12.5, color: C.faint, fontWeight: 600 }}>
          {role}
        </div>
        <div style={{ fontSize: 15, color: C.ink, fontWeight: 700 }}>
          {u?.name}
        </div>
        <div style={{ fontSize: 13, color: C.sub }}>{u?.pos}</div>
      </div>
    </div>
  );
}

/* --------------------------- создание заявки ------------------------------- */
function CreateTask({ me, tasks, now, dispatch, notify }) {
  const firstBranch = (ORG.branches[0] && ORG.branches[0].id) || 1;
  const blank = () => ({
    branchId: firstBranch,
    cat: "Прочее",
    pr: "Обычный",
    slaH: slaFor("Обычный"),
    amount: null,
    executorId: "",
    controllerId: "",
  });
  const [text, setText] = useState("");
  // Форма видна всегда и заполняется вручную (без ИИ). «Распознать (ИИ)» —
  // необязательный помощник: разбирает текст и подставляет поля.
  const [parsed, setParsed] = useState(blank);

  const recognize = (raw) => {
    const input = raw != null ? raw : text;
    if (!input.trim()) return;
    const p = aiParse(input);
    setParsed({
      ...p,
      executorId: pickExecutor(p.branchId, p.cat),
      controllerId: pickController(p.branchId),
    });
  };

  const budget =
    parsed && parsed.amount
      ? (() => {
          const spent = spentForBranch(tasks, parsed.branchId, now);
          const limit = budgetFor(parsed.branchId);
          return { spent, limit, over: spent + parsed.amount > limit };
        })()
      : null;

  const create = () => {
    if (!text.trim()) {
      notify("Опишите заявку в поле «Что случилось?»");
      return;
    }
    const over = !!(budget && budget.over);
    const task = {
      id: "t" + uid().slice(0, 6),
      title: text.trim().split("\n")[0].slice(0, 70) || parsed.cat,
      description: text.trim(),
      branchId: parsed.branchId,
      executorId: parsed.executorId || "",
      controllerId: parsed.controllerId || "",
      createdBy: me.id,
      phase: 1,
      cat: parsed.cat,
      pr: parsed.pr,
      amount: parsed.amount || null,
      overBudget: over,
      departmentId: deptForCategory(parsed.cat),
      attachments: 0,
      favorite: false,
      createdAt: now,
      slaDeadline: now + parsed.slaH * H,
      comments: [],
    };
    dispatch({ type: "CREATE_TASK", task });
    notify(
      over
        ? "Заявка создана (превышение бюджета — на контроль финансисту)"
        : "Заявка создана",
    );
    setText("");
    setParsed(blank());
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div
        className="rounded-2xl bg-white p-6"
        style={{ border: `1px solid ${C.border}` }}
      >
        <div className="flex items-center gap-2 mb-1">
          <Sparkles size={20} color={C.violet} />
          <h2 className="font-extrabold" style={{ color: C.ink, fontSize: 20 }}>
            {tr("Что случилось?")}
          </h2>
        </div>
        <p style={{ fontSize: 14, color: C.sub, marginBottom: 14 }}>
          {tr(
            "Опишите простыми словами — система сама определит филиал, категорию, срочность и назначит ответственных.",
          )}
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          placeholder="Например: «На филиале Юг сломался терминал оплаты, очередь на кассе, срочно!»"
          className="w-full rounded-xl px-4 py-3 focus:outline-none resize-none"
          style={{
            border: `1px solid ${C.border}`,
            fontSize: 15,
            color: C.ink,
            lineHeight: 1.5,
          }}
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={() => recognize()}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 font-bold text-white"
            style={{
              background: `linear-gradient(90deg, ${C.violet}, ${C.brandA})`,
              fontSize: 14.5,
            }}
          >
            <Bot size={17} /> {tr("Распознать (ИИ)")}
          </button>
        </div>

        {parsed && (
          <div
            className="mt-5 rounded-2xl p-4 space-y-3"
            style={{ background: "#FBFCFE", border: `1px solid ${C.border}` }}
          >
            <div style={{ fontSize: 12.5, color: C.faint, fontWeight: 700 }}>
              Заполните поля заявки (или нажмите «Распознать (ИИ)» выше — поля
              подставятся сами):
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Филиал">
                <Select
                  value={parsed.branchId}
                  onChange={(v) =>
                    setParsed({
                      ...parsed,
                      branchId: +v,
                      executorId: pickExecutor(+v, parsed.cat),
                      controllerId: pickController(+v),
                    })
                  }
                  options={ORG.branches.map((b) => ({
                    value: b.id,
                    label: b.name,
                  }))}
                />
              </Field>
              <Field label="Категория">
                <Select
                  value={parsed.cat}
                  onChange={(v) =>
                    setParsed({
                      ...parsed,
                      cat: v,
                      executorId: pickExecutor(parsed.branchId, v),
                    })
                  }
                  options={[
                    "IT-поддержка",
                    "Ремонт оборудования",
                    "Финансы / Закупка",
                    "Прочее",
                  ].map((x) => ({ value: x, label: x }))}
                />
              </Field>
              <Field label="Приоритет">
                <Select
                  value={parsed.pr}
                  onChange={(v) =>
                    setParsed({ ...parsed, pr: v, slaH: slaFor(v) })
                  }
                  options={["Критический", "Высокий", "Обычный"].map((x) => ({
                    value: x,
                    label: tr(x),
                  }))}
                />
              </Field>
              <Field label="Срок (SLA)">
                <div
                  className="rounded-lg px-3 py-2"
                  style={{
                    background: "#fff",
                    border: `1px solid ${C.border}`,
                    fontSize: 14,
                    color: C.ink,
                  }}
                >
                  {parsed.slaH} ч
                </div>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-1">
              <Field label="Исполнитель">
                <Select
                  value={parsed.executorId || ""}
                  onChange={(v) => setParsed({ ...parsed, executorId: v })}
                  options={[
                    { value: "", label: "— не назначен —" },
                    ...ORG.users
                      .filter((u) => u.active !== false)
                      .map((u) => ({
                        value: u.id,
                        label: u.name + (u.pos ? ` · ${u.pos}` : ""),
                      })),
                  ]}
                />
              </Field>
              <Field label="Контролёр">
                <Select
                  value={parsed.controllerId || ""}
                  onChange={(v) => setParsed({ ...parsed, controllerId: v })}
                  options={[
                    { value: "", label: "— не назначен —" },
                    ...ORG.users
                      .filter((u) => u.active !== false)
                      .map((u) => ({
                        value: u.id,
                        label: u.name + (u.pos ? ` · ${u.pos}` : ""),
                      })),
                  ]}
                />
              </Field>
            </div>
            <Field label="Сумма (если есть расход), сум">
              <input
                value={parsed.amount ?? ""}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "");
                  setParsed({ ...parsed, amount: v ? Number(v) : null });
                }}
                inputMode="numeric"
                placeholder="0"
                className="w-full rounded-lg px-3 py-2"
                style={{
                  border: `1px solid ${C.border}`,
                  fontSize: 14,
                  color: C.ink,
                }}
              />
            </Field>
            <div className="flex items-center gap-2 flex-wrap pt-1">
              <span style={{ fontSize: 12.5, color: C.faint }}>Отдел:</span>
              <Badge color={C.brandA} bg="#EFF4FF">
                {deptById(deptForCategory(parsed.cat))?.name}
              </Badge>
              {deptById(deptForCategory(parsed.cat))?.restricted && (
                <Badge color={C.bad} bg="#FEECEC">
                  закрытый — видят только отдел и руководство
                </Badge>
              )}
            </div>

            {budget && (
              <div
                className="rounded-xl px-3 py-2.5"
                style={{
                  background: "#fff",
                  border: `1px solid ${budget.over ? "#FECACA" : C.border}`,
                }}
              >
                <div
                  className="flex items-center gap-1.5 font-bold mb-1"
                  style={{ fontSize: 13, color: budget.over ? C.bad : C.ink }}
                >
                  <Wallet size={15} /> Бюджет филиала «
                  {branchById(parsed.branchId)?.name}»
                </div>
                <div style={{ fontSize: 12.5, color: C.sub }}>
                  Лимит: {fmtMoney(budget.limit)} · Потрачено:{" "}
                  {fmtMoney(budget.spent)} · Эта заявка:{" "}
                  {fmtMoney(parsed.amount)}
                </div>
                {budget.over && (
                  <div
                    className="mt-1.5"
                    style={{ fontSize: 12.5, color: C.bad, fontWeight: 600 }}
                  >
                    ⚠ Превышение лимита — заявка уйдёт на ручное одобрение
                    финансисту.
                  </div>
                )}
              </div>
            )}

            <button
              onClick={create}
              className="w-full mt-1 rounded-xl py-3 font-bold text-white"
              style={{
                background: C.brandA,
                fontSize: 15,
                boxShadow: `0 6px 16px ${C.brandA}33`,
              }}
            >
              Создать заявку
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function CreatePage({ me, s, dispatch, notify }) {
  const [mode, setMode] = useState("simple");
  const tabs = [
    ["simple", "Простая заявка", Sparkles],
    ["process", "По шаблону", ListChecks],
  ];
  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div
        className="rounded-2xl bg-white p-2 flex gap-2"
        style={{ border: `1px solid ${C.border}` }}
      >
        {tabs.map(([k, label, Icon]) => {
          const active = mode === k;
          return (
            <button
              key={k}
              onClick={() => setMode(k)}
              className="flex-1 min-w-0 inline-flex items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 font-bold"
              style={{
                background: active ? C.brandA : "transparent",
                color: active ? "#fff" : C.ink,
                fontSize: 13.5,
                lineHeight: 1.15,
                textAlign: "center",
              }}
            >
              <Icon
                size={16}
                color={active ? "#fff" : C.sub}
                className="shrink-0"
              />{" "}
              <span style={{ overflowWrap: "break-word" }}>{tr(label)}</span>
            </button>
          );
        })}
      </div>
      {mode === "simple" && (
        <CreateTask
          me={me}
          tasks={s.tasks}
          now={Date.now()}
          dispatch={dispatch}
          notify={notify}
        />
      )}
      {mode === "process" && (
        <RouteCreate me={me} s={s} dispatch={dispatch} notify={notify} />
      )}
    </div>
  );
}

export default Board;
