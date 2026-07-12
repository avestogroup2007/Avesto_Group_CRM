// Экран «Чек-листы смены»: почасовой санитарный обход с фотоотчётом,
// открытие и закрытие смены.
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Camera,
  ListChecks,
  Check,
  ClipboardList,
  Clock,
} from "lucide-react";
import { apiGet, apiPost } from "../api.js";
import { C } from "../lib/theme.js";
import { TZ, ymdNow } from "../lib/format.js";
import { BRANCHES, branchById } from "../lib/org.js";
import { CHECKLIST_DEFS, branchHours, hourSlots } from "../lib/checklists.js";
import { compressPhoto } from "../lib/media.js";
import { Kpi, NiceSelect } from "../components/ui.jsx";

// Чек-листы смены: почасовой санитарный обход (с фотоотчётом), открытие и
// закрытие. Рабочее окно обхода зависит от типа точки (производство 07–16,
// рестораны/магазины 08–20). Данные хранятся локально; сводка о сдаче уходит в
// Telegram-тему «Чек-лист».
function ShiftChecklistsView({ s, me, dispatch, notify, branchScope }) {
  const branches = (s.branches || []).length ? s.branches : BRANCHES;
  const fixedBranch = me.branchId || null;
  const canPickBranch = !fixedBranch;
  const [branchId, setBranchId] = useState(
    fixedBranch || branchScope || branches[0]?.id || 1,
  );
  const date = ymdNow();
  const slots = hourSlots(branchId);
  const hours = branchHours(branchId);
  const hourNow = Number(
    new Date().toLocaleString("en-GB", {
      timeZone: TZ,
      hour: "2-digit",
      hour12: false,
    }),
  );

  const runs = (s.shiftChecklists || []).filter(
    (r) => r.branchId === branchId && r.date === date,
  );
  const runFor = (kind, slot) =>
    runs.find((r) => r.kind === kind && (r.slot || null) === (slot || null));
  // Сдача конкретного шаблона (по templateId), учитывая слот для почасовых.
  const runForTemplate = (templateId, slot) =>
    runs.find(
      (r) => r.templateId === templateId && (r.slot || null) === (slot || null),
    );

  const [open, setOpen] = useState(null);

  // Шаблоны чек-листов из админки + флаги модулей (владелец включает в Back
  // Office). Пусто/выключено — секции шаблонов просто не показываются.
  const [templates, setTemplates] = useState([]);
  const [mods, setMods] = useState({
    employeeChecklists: false,
    cleaningChecklists: false,
  });
  useEffect(() => {
    apiGet("/api/checklist-templates")
      .then((res) => {
        setTemplates(Array.isArray(res.items) ? res.items : []);
        setMods(res.modules || {});
      })
      .catch(() => {});
  }, []);
  // Мои чек-листы по должности: активные role-шаблоны, чья должность совпадает
  // с должностью сотрудника (пустая должность в шаблоне = для всех).
  const myPos = String(me.pos || "")
    .trim()
    .toLowerCase();
  const roleTemplates = mods.employeeChecklists
    ? templates.filter(
        (t) =>
          t.kind === "role" &&
          t.active &&
          (!t.position || t.position.trim().toLowerCase() === myPos),
      )
    : [];
  const cleaningTemplates = mods.cleaningChecklists
    ? templates.filter((t) => t.kind === "cleaning" && t.active)
    : [];

  // Отчёт по чек-листам за период — для руководства. Роли совпадают с сервером
  // (/api/checklists/report). Период: сегодня или последние 7 дней.
  const isMgr = ["director", "manager", "finance", "sysadmin"].includes(
    me.role,
  );
  const [report, setReport] = useState(null);
  const [reportDays, setReportDays] = useState(1);
  useEffect(() => {
    if (!isMgr) return;
    const to = ymdNow();
    const d = new Date();
    d.setDate(d.getDate() - (reportDays - 1));
    const from = d.toLocaleDateString("en-CA", { timeZone: TZ });
    apiGet(`/api/checklists/report?from=${from}&to=${to}`)
      .then((res) => setReport(res))
      .catch(() => setReport(null));
  }, [isMgr, reportDays]);

  const tgNotify = (text) =>
    apiPost("/api/telegram/notify", {
      text: String(text).slice(0, 1000),
      kind: "checklist",
    }).catch(() => {});

  // Собирает черновик из состава пунктов (легаси-обход или шаблон), подставляя
  // отметки предыдущей сдачи, если она была.
  const buildDraft = (kind, slot, label, defItems, existing, templateId) => {
    const items = defItems.map((it, i) => {
      const prev = existing && existing.items && existing.items[i];
      return {
        text: it.text,
        needPhoto: !!it.needPhoto,
        done: prev ? !!prev.done : false,
        photo: prev ? prev.photo || null : null,
      };
    });
    setOpen({
      kind,
      templateId: templateId || null,
      slot: slot || null,
      label,
      items,
    });
  };
  const startRun = (kind, slot) => {
    const def = CHECKLIST_DEFS[kind];
    buildDraft(kind, slot, def.label, def.items, runFor(kind, slot), null);
  };
  const startTemplateRun = (tpl, slot) => {
    buildDraft(
      tpl.kind,
      slot,
      tpl.title,
      tpl.items || [],
      runForTemplate(tpl.id, slot),
      tpl.id,
    );
  };

  const toggle = (i) =>
    setOpen((o) => ({
      ...o,
      items: o.items.map((it, j) => (j === i ? { ...it, done: !it.done } : it)),
    }));
  const setPhoto = async (i, file) => {
    if (!file) return;
    try {
      const dataUrl = await compressPhoto(file);
      setOpen((o) => ({
        ...o,
        items: o.items.map((it, j) =>
          j === i ? { ...it, photo: dataUrl, done: true } : it,
        ),
      }));
    } catch {
      notify("Не удалось обработать фото");
    }
  };
  const clearPhoto = (i) =>
    setOpen((o) => ({
      ...o,
      items: o.items.map((it, j) => (j === i ? { ...it, photo: null } : it)),
    }));

  const save = () => {
    const badPhoto = open.items.some(
      (it) => it.done && it.needPhoto && !it.photo,
    );
    if (badPhoto) {
      notify("Прикрепите фото к отмеченным пунктам с фотоотчётом");
      return;
    }
    const total = open.items.length;
    const doneN = open.items.filter((it) => it.done).length;
    if (doneN === 0) {
      notify("Отметьте хотя бы один пункт");
      return;
    }
    const pct = Math.round((doneN / total) * 100);
    dispatch({
      type: "SAVE_CHECKLIST",
      run: {
        kind: open.kind,
        templateId: open.templateId || null,
        branchId,
        date,
        slot: open.slot || null,
        items: open.items.map((it) => ({
          text: it.text,
          needPhoto: it.needPhoto,
          done: it.done,
          photo: it.photo || null,
        })),
        userId: me.id,
        pct,
      },
    });
    // Дублируем сдачу на сервер (та же таблица, что у Telegram-бота):
    // сводки в боте видят чек-листы из веба. Фото остаются локально —
    // на сервер уходит только отметка о наличии.
    apiPost("/api/checklists/run", {
      branchId: String(branchId),
      kind: open.kind,
      templateId: open.templateId || null,
      date,
      slot: open.slot || null,
      items: open.items.map((it) => ({
        text: it.text,
        done: !!it.done,
        needPhoto: !!it.needPhoto,
        hasPhoto: !!it.photo,
      })),
    }).catch(() => {});
    const label = open.label + (open.slot ? ` ${open.slot}` : "");
    const bName = (branchById(branchId) || {}).name || "—";
    tgNotify(
      `🧾 ${label}\n${bName} · ${date}${me.pos ? " · " + me.pos : ""}\n` +
        `Выполнено ${pct}% (${doneN}/${total})`,
    );
    notify("Чек-лист сохранён");
    setOpen(null);
  };

  const slotStatus = (slot) => {
    const r = runFor("sanitary", slot);
    if (r && r.pct >= 100) return "done";
    if (r && r.pct > 0) return "partial";
    const h = Number(slot.slice(0, 2));
    if (h < hourNow) return "overdue";
    if (h === hourNow) return "now";
    return "pending";
  };
  const STATUS = {
    done: { bg: "#DCFCE7", fg: "#15803D", label: "Готово" },
    partial: { bg: "#FEF3C7", fg: "#B45309", label: "Частично" },
    overdue: { bg: "#FEE2E2", fg: "#DC2626", label: "Пропущен" },
    now: { bg: "#E0E7FF", fg: "#4338CA", label: "Сейчас" },
    pending: { bg: "#F1F5F9", fg: "#64748B", label: "Ожидает" },
  };
  const doneSlots = slots.filter((sl) => slotStatus(sl) === "done").length;
  const missedSlots = slots.filter((sl) => slotStatus(sl) === "overdue").length;

  const dayCard = (kind) => {
    const r = runFor(kind, null);
    const def = CHECKLIST_DEFS[kind];
    const pct = r ? r.pct : 0;
    return (
      <button
        key={kind}
        onClick={() => startRun(kind, null)}
        className="rounded-xl p-3 text-left w-full"
        style={{ border: `1px solid ${C.border}`, background: "#fff" }}
      >
        <div className="flex items-center justify-between">
          <span className="font-bold" style={{ color: C.ink, fontSize: 14 }}>
            {def.label}
          </span>
          <span
            className="rounded-full px-2 py-0.5"
            style={{
              fontSize: 11,
              fontWeight: 700,
              background: r ? "#DCFCE7" : "#F1F5F9",
              color: r ? "#15803D" : "#64748B",
            }}
          >
            {r ? `${pct}%` : "Не начато"}
          </span>
        </div>
        <div style={{ color: C.sub, fontSize: 12, marginTop: 4 }}>
          {def.items.length} пунктов · нажмите, чтобы заполнить
        </div>
      </button>
    );
  };

  const openDoneN = open ? open.items.filter((it) => it.done).length : 0;

  // Часы для почасового шаблона: окно fromHour..toHour шаблона, иначе — окно
  // филиала. Для daily/shift слотов нет (одна сдача за день).
  const tplSlots = (tpl) => {
    if (tpl.scheduleType !== "hourly") return [null];
    const from = Number.isFinite(tpl.fromHour) ? tpl.fromHour : hours.from;
    const to = Number.isFinite(tpl.toHour) ? tpl.toHour : hours.to;
    const out = [];
    for (let h = from; h <= to; h++)
      out.push(`${String(h).padStart(2, "0")}:00`);
    return out;
  };
  // Карточка шаблонного чек-листа: одна кнопка (daily/shift) или сетка часов.
  const templateCard = (tpl) => {
    const slotsFor = tplSlots(tpl);
    const hourly = tpl.scheduleType === "hourly";
    return (
      <div
        key={tpl.id}
        className="rounded-xl p-3"
        style={{ border: `1px solid ${C.border}`, background: "#fff" }}
      >
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="font-bold" style={{ color: C.ink, fontSize: 14 }}>
            {tpl.title}
          </span>
          {tpl.position ? (
            <span
              className="rounded-full px-2 py-0.5"
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                background: "#EEF2FF",
                color: "#4338CA",
              }}
            >
              {tpl.position}
            </span>
          ) : null}
        </div>
        {hourly ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mt-2">
            {slotsFor.map((sl) => {
              const rr = runForTemplate(tpl.id, sl);
              return (
                <button
                  key={sl}
                  onClick={() => startTemplateRun(tpl, sl)}
                  className="rounded-lg p-2 text-left"
                  style={{ border: `1px solid ${C.line}`, background: "#fff" }}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className="font-bold"
                      style={{ color: C.ink, fontSize: 13 }}
                    >
                      {sl}
                    </span>
                    <span
                      className="rounded-full px-1.5 py-0.5"
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        background: rr ? "#DCFCE7" : "#F1F5F9",
                        color: rr ? "#15803D" : "#64748B",
                      }}
                    >
                      {rr ? `${rr.pct}%` : "—"}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          (() => {
            const rr = runForTemplate(tpl.id, null);
            return (
              <button
                onClick={() => startTemplateRun(tpl, null)}
                className="rounded-lg px-3 py-2 w-full text-left flex items-center justify-between mt-1"
                style={{ border: `1px solid ${C.line}`, background: "#fff" }}
              >
                <span style={{ color: C.sub, fontSize: 12.5 }}>
                  {(tpl.items || []).length} пунктов · нажмите, чтобы заполнить
                </span>
                <span
                  className="rounded-full px-2 py-0.5"
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    background: rr ? "#DCFCE7" : "#F1F5F9",
                    color: rr ? "#15803D" : "#64748B",
                  }}
                >
                  {rr ? `${rr.pct}%` : "Не начато"}
                </span>
              </button>
            );
          })()
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Шапка: филиал и рабочее окно */}
      <div
        className="rounded-2xl bg-white p-4 sm:p-5"
        style={{ border: `1px solid ${C.border}` }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3
              className="font-bold flex items-center gap-2"
              style={{ color: C.ink, fontSize: 16 }}
            >
              <ListChecks size={18} style={{ color: C.brandA }} />
              Чек-листы смены
            </h3>
            <div style={{ color: C.sub, fontSize: 12.5, marginTop: 2 }}>
              {date} · рабочее окно обхода {String(hours.from).padStart(2, "0")}
              :00–{String(hours.to).padStart(2, "0")}:00
            </div>
          </div>
          {canPickBranch && (
            <div style={{ minWidth: 220 }}>
              <NiceSelect
                label="Филиал"
                value={String(branchId)}
                options={branches.map((b) => ({
                  value: String(b.id),
                  label: b.name,
                }))}
                onChange={(v) => setBranchId(Number(v))}
              />
            </div>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2 mt-3">
          <Kpi
            label="Часов в обходе"
            value={String(slots.length)}
            tone={C.brandB}
          />
          <Kpi
            label="Выполнено"
            value={`${doneSlots}/${slots.length}`}
            tone={C.ok}
          />
          <Kpi
            label="Пропущено"
            value={String(missedSlots)}
            tone={missedSlots ? C.bad : C.faint}
          />
        </div>
      </div>

      {/* Отчёт по чек-листам (руководство): сдачи за период по видам */}
      {isMgr && report && (
        <div
          className="rounded-2xl bg-white p-4 sm:p-5"
          style={{ border: `1px solid ${C.border}` }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <h3
              className="font-bold flex items-center gap-2"
              style={{ color: C.ink, fontSize: 15 }}
            >
              <ClipboardList size={17} style={{ color: C.brandA }} />
              Отчёт по чек-листам
            </h3>
            <div className="flex gap-1">
              {[
                [1, "Сегодня"],
                [7, "7 дней"],
              ].map(([d, lbl]) => (
                <button
                  key={d}
                  onClick={() => setReportDays(d)}
                  className="rounded-lg px-2.5 py-1 font-semibold"
                  style={{
                    fontSize: 12,
                    border: `1px solid ${reportDays === d ? C.brandA : C.border}`,
                    color: reportDays === d ? C.brandA : C.sub,
                    background: reportDays === d ? "#F5F3FF" : "#fff",
                  }}
                >
                  {lbl}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <Kpi
              label="Сдач за период"
              value={String(report.summary.total)}
              tone={C.brandB}
            />
            <Kpi
              label="Средний %"
              value={`${report.summary.avgPct}%`}
              tone={report.summary.avgPct >= 80 ? C.ok : C.brandA}
            />
            <Kpi
              label="Видов"
              value={String(Object.keys(report.summary.byKind).length)}
              tone={C.faint}
            />
          </div>
          {report.summary.total === 0 && (
            <div style={{ color: C.sub, fontSize: 12.5, marginTop: 8 }}>
              За выбранный период сдач нет.
            </div>
          )}
        </div>
      )}

      {/* Разовые за смену */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {dayCard("open")}
        {dayCard("close")}
      </div>

      {/* Почасовой санитарный обход */}
      <div
        className="rounded-2xl bg-white p-4 sm:p-5"
        style={{ border: `1px solid ${C.border}` }}
      >
        <h3 className="font-bold mb-1" style={{ color: C.ink, fontSize: 15 }}>
          Санитарный обход по часам
        </h3>
        <p style={{ color: C.sub, fontSize: 12.5, marginBottom: 10 }}>
          Каждый час — проверка туалета и зоны у раковины. Пункты с фотоотчётом
          не закрываются без фото.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {slots.map((slot) => {
            const st = slotStatus(slot);
            const meta = STATUS[st];
            const r = runFor("sanitary", slot);
            return (
              <button
                key={slot}
                onClick={() => startRun("sanitary", slot)}
                className="rounded-xl p-2.5 text-left"
                style={{
                  border: `1px solid ${st === "now" ? "#818CF8" : C.line}`,
                  background: "#fff",
                }}
              >
                <div className="flex items-center justify-between">
                  <span
                    className="font-bold"
                    style={{ color: C.ink, fontSize: 14 }}
                  >
                    {slot}
                  </span>
                  <span
                    className="rounded-full px-2 py-0.5"
                    style={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      background: meta.bg,
                      color: meta.fg,
                    }}
                  >
                    {meta.label}
                  </span>
                </div>
                <div style={{ color: C.sub, fontSize: 11, marginTop: 3 }}>
                  {r ? `${r.pct}% выполнено` : "нажмите, чтобы отметить"}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Чек-листы по должности (шаблоны из админки, модуль включает владелец) */}
      {roleTemplates.length > 0 && (
        <div
          className="rounded-2xl bg-white p-4 sm:p-5"
          style={{ border: `1px solid ${C.border}` }}
        >
          <h3
            className="font-bold mb-1 flex items-center gap-2"
            style={{ color: C.ink, fontSize: 15 }}
          >
            <ClipboardList size={17} style={{ color: C.brandA }} />
            Чек-листы по должности
          </h3>
          <p style={{ color: C.sub, fontSize: 12.5, marginBottom: 10 }}>
            Задачи для вашей должности{me.pos ? ` (${me.pos})` : ""}.
            Настраивает администратор.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {roleTemplates.map((t) => templateCard(t))}
          </div>
        </div>
      )}

      {/* Чек-листы уборки (шаблоны из админки, обычно почасовые) */}
      {cleaningTemplates.length > 0 && (
        <div
          className="rounded-2xl bg-white p-4 sm:p-5"
          style={{ border: `1px solid ${C.border}` }}
        >
          <h3
            className="font-bold mb-1 flex items-center gap-2"
            style={{ color: C.ink, fontSize: 15 }}
          >
            <Clock size={17} style={{ color: C.brandA }} />
            Чек-листы уборки
          </h3>
          <p style={{ color: C.sub, fontSize: 12.5, marginBottom: 10 }}>
            Уборка по расписанию. Настраивает администратор.
          </p>
          <div className="space-y-3">
            {cleaningTemplates.map((t) => templateCard(t))}
          </div>
        </div>
      )}

      {/* Модальное окно заполнения */}
      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
            style={{ background: "rgba(20,14,10,.45)" }}
            onClick={() => setOpen(null)}
          >
            <div
              className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl p-4 sm:p-5 max-h-[90vh] overflow-y-auto"
              style={{ border: `1px solid ${C.border}` }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-1">
                <h3
                  className="font-bold"
                  style={{ color: C.ink, fontSize: 16 }}
                >
                  {open.label}
                  {open.slot ? ` · ${open.slot}` : ""}
                </h3>
                <button onClick={() => setOpen(null)}>
                  <X size={18} style={{ color: C.sub }} />
                </button>
              </div>
              <div style={{ color: C.sub, fontSize: 12.5, marginBottom: 10 }}>
                {(branchById(branchId) || {}).name || "—"} · {date}
              </div>

              <div className="space-y-2">
                {open.items.map((it, i) => (
                  <div
                    key={i}
                    className="rounded-xl p-2.5"
                    style={{
                      border: `1px solid ${it.done ? "#BBF7D0" : C.line}`,
                      background: it.done ? "#F0FDF4" : "#fff",
                    }}
                  >
                    <div className="flex items-start gap-2">
                      <button
                        onClick={() => toggle(i)}
                        className="rounded-md shrink-0 flex items-center justify-center"
                        style={{
                          width: 22,
                          height: 22,
                          marginTop: 1,
                          border: `1.5px solid ${it.done ? "#16A34A" : C.border}`,
                          background: it.done ? "#16A34A" : "#fff",
                        }}
                      >
                        {it.done && <Check size={14} color="#fff" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div
                          onClick={() => toggle(i)}
                          style={{
                            color: C.ink,
                            fontSize: 13.5,
                            cursor: "pointer",
                          }}
                        >
                          {it.text}
                          {it.needPhoto && (
                            <span
                              className="rounded px-1.5 py-0.5 ml-1.5 align-middle"
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                background: "#FEF3C7",
                                color: "#B45309",
                              }}
                            >
                              фото
                            </span>
                          )}
                        </div>
                        <div className="mt-1.5 flex items-center gap-2">
                          {it.photo ? (
                            <>
                              <img
                                src={it.photo}
                                alt=""
                                style={{
                                  width: 44,
                                  height: 44,
                                  borderRadius: 8,
                                  objectFit: "cover",
                                  border: `1px solid ${C.border}`,
                                }}
                              />
                              <button
                                onClick={() => clearPhoto(i)}
                                style={{ color: C.bad, fontSize: 12 }}
                              >
                                Удалить фото
                              </button>
                            </>
                          ) : (
                            <label
                              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 cursor-pointer"
                              style={{
                                border: `1px solid ${C.border}`,
                                color: C.brandA,
                                fontSize: 12.5,
                                fontWeight: 600,
                              }}
                            >
                              <Camera size={14} />
                              {it.needPhoto
                                ? "Сделать фото"
                                : "Фото (по желанию)"}
                              <input
                                type="file"
                                accept="image/*"
                                capture="environment"
                                style={{ display: "none" }}
                                onChange={(e) => {
                                  setPhoto(
                                    i,
                                    e.target.files && e.target.files[0],
                                  );
                                  e.target.value = "";
                                }}
                              />
                            </label>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex items-center justify-between gap-3">
                <span style={{ color: C.sub, fontSize: 12.5 }}>
                  Отмечено {openDoneN}/{open.items.length}
                </span>
                <button
                  onClick={save}
                  className="rounded-xl px-4 py-2.5 font-bold text-white"
                  style={{ background: C.brandA, fontSize: 14 }}
                >
                  Сдать чек-лист
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

export default ShiftChecklistsView;
