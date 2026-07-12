// Экран «Кассы»: ежедневные кассовые отчёты филиалов, инкассация,
// сверка и отправка сводки в Telegram.
import { useState, useEffect, useRef } from "react";
import {
  Clock,
  MessageSquare,
  X,
  CheckCircle2,
  Send,
  Printer,
  AlertTriangle,
  Camera,
  Lock,
  Wallet,
  Pencil,
} from "lucide-react";
import { apiPost } from "../api.js";
import { C } from "../lib/theme.js";
import { tr } from "../lib/i18n.js";
import { H, TZ, uid, fmtSum, ymdNow } from "../lib/format.js";
import { userById, branchById } from "../lib/org.js";
import { compressPhoto } from "../lib/media.js";
import {
  StatusBadge,
  NiceSelect,
  NiceDate,
  CashNumField,
} from "../components/ui.jsx";

/* ------------------------------ кассы филиалов ----------------------------- */
const cashCalc = (r) => {
  const cash = (r.fiscal || 0) + (r.nonFiscal || 0);
  const acq =
    (r.humo || 0) +
    (r.uzcard || 0) +
    (r.click || 0) +
    (r.payme || 0) +
    (r.uzumTezkor || 0) +
    (r.yandex || 0);
  const total = cash + acq + (r.transfer || 0);
  return { cash, acq, total, diff: total - (r.iiko || 0) };
};

function CashRegisterView({ s, me, dispatch, notify, branchScope }) {
  const branches = s.branches || [];
  // Кассовый отчёт сдают только филиалы с розничной кассой (cash:true) —
  // цех и кейтеринг сюда не входят. Если флаги не заданы (старые данные) —
  // берём все филиалы, чтобы не спрятать кассу целиком.
  const cashBranches = branches.some((b) => b.cash)
    ? branches.filter((b) => b.cash)
    : branches;
  const isMgr = me.role === "manager";
  const isController = ["director", "finance", "sysadmin"].includes(me.role); // контролёр / аудитор — все филиалы, подтверждение
  const canEditForm = isMgr || isController;
  const myBranch = me.branchId || (cashBranches[0] && cashBranches[0].id) || 1;
  const fBranch = isMgr ? myBranch : branchScope || 0; // 0 = все (общий охват из шапки)
  const H24 = 24 * H;
  const deadlineTs = (dateStr) => {
    const d = new Date(dateStr + "T00:00:00");
    d.setDate(d.getDate() + 1);
    d.setHours(12, 0, 0, 0);
    return d.getTime();
  };
  const pad = (n) => String(n).padStart(2, "0");
  const ymd = (d) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const dm = (s0) => s0.split("-").reverse().join(".");

  // ---------- период просмотра (как в iiko: пресеты + с/по) ----------
  const shiftD = (base, days) => {
    const d = new Date(base + "T00:00:00");
    d.setDate(d.getDate() + days);
    return ymd(d);
  };
  const monday = (base) => {
    const d = new Date(base + "T00:00:00");
    const wd = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - wd);
    return ymd(d);
  };
  const presetRange = (p) => {
    const today = ymdNow();
    const y = today.slice(0, 4);
    const m = today.slice(0, 7);
    if (p === "open") return { from: "2000-01-01", to: today };
    if (p === "today") return { from: today, to: today };
    if (p === "yesterday") {
      const d = shiftD(today, -1);
      return { from: d, to: d };
    }
    if (p === "curWeek")
      return { from: monday(today), to: shiftD(monday(today), 6) };
    if (p === "prevWeek") {
      const mo = shiftD(monday(today), -7);
      return { from: mo, to: shiftD(mo, 6) };
    }
    if (p === "curMonth") {
      const last = new Date(+y, +m.slice(5, 7), 0).getDate();
      return { from: `${m}-01`, to: `${m}-${pad(last)}` };
    }
    if (p === "prevMonth") {
      const d = new Date(+y, +m.slice(5, 7) - 2, 1);
      const mm = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
      const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      return { from: `${mm}-01`, to: `${mm}-${pad(last)}` };
    }
    if (p === "curYear") return { from: `${y}-01-01`, to: `${y}-12-31` };
    if (p === "prevYear") {
      const py = +y - 1;
      return { from: `${py}-01-01`, to: `${py}-12-31` };
    }
    return null; // custom
  };
  const PERIOD_PRESETS = [
    ["open", "Открытый период"],
    ["today", "Сегодня"],
    ["curWeek", "Текущая неделя"],
    ["curMonth", "Текущий месяц"],
    ["curYear", "Текущий год"],
    ["yesterday", "Вчера"],
    ["prevWeek", "Прошлая неделя"],
    ["prevMonth", "Прошлый месяц"],
    ["prevYear", "Прошлый год"],
    ["custom", "Другой…"],
  ];
  const [preset, setPreset] = useState("curMonth");
  const initR = presetRange("curMonth");
  const [from, setFrom] = useState(initR.from);
  const [to, setTo] = useState(initR.to);
  const pickPreset = (p) => {
    setPreset(p);
    const r = presetRange(p);
    if (r) {
      setFrom(r.from);
      setTo(r.to);
    }
  };

  const range = { from, to };

  const scope = (s.cashReports || []).filter(
    (r) =>
      r.date >= range.from &&
      r.date <= range.to &&
      (isMgr
        ? r.branchId === myBranch
        : fBranch
          ? r.branchId === fBranch
          : true),
  );
  const sorted = [...scope].sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : a.branchId - b.branchId,
  );
  const sum = (f) => scope.reduce((a, r) => a + (r[f] || 0), 0);
  const agg = scope.reduce(
    (o, r) => {
      const c = cashCalc(r);
      o.total += c.total;
      o.cash += c.cash;
      o.acq += c.acq;
      o.diff += c.diff;
      return o;
    },
    { total: 0, cash: 0, acq: 0, diff: 0 },
  );

  const periodLabel = `${tr((PERIOD_PRESETS.find(([k]) => k === preset) || [])[1] || "Период")}: ${dm(from)} — ${dm(to)}`;
  const branchLabel = isMgr
    ? branchById(myBranch)?.name || ""
    : fBranch
      ? branchById(fBranch)?.name || ""
      : tr("Все филиалы");

  // ---------- форма отчёта (управляющие) ----------
  const blank = {
    date: ymdNow(),
    branchId: myBranch,
    transfer: 0,
    transferCount: 0,
    fiscal: 0,
    nonFiscal: 0,
    humo: 0,
    uzcard: 0,
    click: 0,
    payme: 0,
    uzumTezkor: 0,
    yandex: 0,
    debt: 0,
    noPay: 0,
    expenses: 0,
    iiko: 0,
    comment: "",
    expensesNote: "",
    expensePhotos: [],
  };
  const [form, setForm] = useState({ ...blank });
  const existing = (s.cashReports || []).find(
    (r) => r.date === form.date && r.branchId === form.branchId,
  );
  useEffect(() => {
    const ex = (s.cashReports || []).find(
      (r) => r.date === form.date && r.branchId === form.branchId,
    );
    if (ex)
      setForm((f) => ({ ...blank, ...ex, date: f.date, branchId: f.branchId }));
    else setForm((f) => ({ ...blank, date: f.date, branchId: f.branchId }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.date, form.branchId, s.cashReports]);
  // при смене пользователя/роли синхронизируем филиал формы со своим
  useEffect(() => {
    if (isMgr) {
      setForm((f) =>
        f.branchId === myBranch ? f : { ...f, branchId: myBranch },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.id]);

  const dl = deadlineTs(form.date);
  const pastDeadline = Date.now() > dl;
  const isConfirmed = !!existing && existing.status === "confirmed";
  const editable = !isConfirmed && (isController || (isMgr && !pastDeadline));
  const dlStr = new Date(dl).toLocaleString("ru-RU", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const setNum = (k, v) => {
    if (!editable) return;
    setForm((f) => ({
      ...f,
      [k]: Math.max(0, parseInt(String(v).replace(/[^\d]/g, "") || "0", 10)),
    }));
  };
  const live = cashCalc(form);

  // Уведомление в Telegram по кассе/отчётам (best-effort, в свою тему).
  const tgNotify = (text, kind) =>
    apiPost("/api/telegram/notify", {
      text: String(text).slice(0, 1000),
      kind,
    }).catch(() => {});
  const fmtSum = (v) => Number(v || 0).toLocaleString("ru-RU");

  const save = () => {
    if (!editable) {
      notify(tr("Редактирование закрыто"));
      return;
    }
    if (!form.branchId) {
      notify(tr("Выберите филиал"));
      return;
    }
    if (live.diff !== 0 && !(form.comment || "").trim()) {
      notify(tr("Укажите комментарий к расхождению с iiko"));
      return;
    }
    if ((form.expenses || 0) > 0 && !(form.expensesNote || "").trim()) {
      notify(tr("Укажите, на что были расходы"));
      return;
    }
    dispatch({ type: "SAVE_CASH_REPORT", report: { ...form, userId: me.id } });
    // Дублируем отчёт на сервер (/api/cash) — его видят офис и Telegram-бот.
    apiPost("/api/cash/report", {
      branchId: String(form.branchId),
      branchName: branchById(form.branchId)?.name || "",
      date: form.date,
      fiscal: form.fiscal || 0,
      nonFiscal: form.nonFiscal || 0,
      humo: form.humo || 0,
      uzcard: form.uzcard || 0,
      click: form.click || 0,
      payme: form.payme || 0,
      uzumTezkor: form.uzumTezkor || 0,
      yandex: form.yandex || 0,
      transfer: form.transfer || 0,
      expenses: form.expenses || 0,
      iiko: form.iiko || 0,
      comment: String(form.comment || "").slice(0, 1000),
    }).catch(() => {});
    notify(tr("Отчёт сдан и ожидает подтверждения"));
    tgNotify(
      `Касса сдана: ${branchById(form.branchId)?.name || "—"}, ${form.date} — ` +
        `${fmtSum((form.fiscal || 0) + (form.nonFiscal || 0))} сум` +
        (live.diff !== 0 ? ` · расхождение ${fmtSum(live.diff)}` : ""),
      "cash",
    );
  };
  const confirmReport = (id) => {
    dispatch({ type: "CONFIRM_CASH_REPORT", id, userId: me.id });
    notify(tr("Отчёт подтверждён"));
    const rep = (s.cashReports || []).find((r) => r.id === id);
    // Подтверждение — тоже на сервер (best-effort).
    if (rep)
      apiPost("/api/cash/report/confirm", {
        branchId: String(rep.branchId),
        date: rep.date,
      }).catch(() => {});
    if (rep)
      tgNotify(
        `Отчёт по кассе подтверждён: ${branchById(rep.branchId)?.name || "—"}, ` +
          `${rep.date} — ${fmtSum((rep.fiscal || 0) + (rep.nonFiscal || 0))} сум`,
        "report",
      );
  };

  // ---------- сейф филиала и инкассация ----------
  const allHandovers = s.cashHandovers || [];
  const safeStat = (bId) => {
    const cashIn = (s.cashReports || [])
      .filter((r) => r.branchId === bId)
      .reduce((a, r) => a + (r.fiscal || 0) + (r.nonFiscal || 0), 0);
    const hs = allHandovers.filter((h) => h.branchId === bId);
    const sent = hs.reduce((a, h) => a + (h.amount || 0), 0);
    const inTransit = hs
      .filter((h) => h.status === "sent")
      .reduce((a, h) => a + (h.amount || 0), 0);
    return { cashIn, sent, inTransit, balance: cashIn - sent };
  };
  const safeBranchId = isMgr ? myBranch : fBranch || 0;
  const safe = safeBranchId ? safeStat(safeBranchId) : null;
  const hoScope = allHandovers.filter(
    (h) =>
      h.date >= range.from &&
      h.date <= range.to &&
      (isMgr
        ? h.branchId === myBranch
        : fBranch
          ? h.branchId === fBranch
          : true),
  );
  const hoSorted = [...hoScope].sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
  );
  const hoWaiting = allHandovers.filter(
    (h) => h.status === "sent" && (isMgr ? h.branchId === myBranch : true),
  ).length;
  const [ho, setHo] = useState({ amount: 0, via: "", note: "" });
  const sendHandover = () => {
    const amt = ho.amount || 0;
    if (!safeBranchId) {
      notify(tr("Выберите филиал"));
      return;
    }
    if (amt <= 0) {
      notify(tr("Укажите сумму передачи"));
      return;
    }
    if (safe && amt > safe.balance) {
      notify(tr("Сумма больше остатка в сейфе"));
      return;
    }
    if (!(ho.via || "").trim()) {
      notify(tr("Укажите, через кого переданы деньги"));
      return;
    }
    dispatch({
      type: "ADD_HANDOVER",
      handover: {
        branchId: safeBranchId,
        date: ymdNow(),
        amount: amt,
        via: ho.via.trim(),
        note: (ho.note || "").trim(),
        userId: me.id,
      },
    });
    setHo({ amount: 0, via: "", note: "" });
    notify(tr("Передача отправлена — ожидает подтверждения офиса"));
    tgNotify(
      `Инкассация: ${branchById(safeBranchId)?.name || "—"} → офис — ` +
        `${fmtSum(amt)} сум (через ${ho.via.trim()})`,
      "cash",
    );
  };
  const confirmHandover = (h) => {
    dispatch({ type: "CONFIRM_HANDOVER", id: h.id, userId: me.id });
    notify(tr("Приём денег подтверждён"));
    // Авто-приход в «Учёт денег» (казначейство). Идемпотентно по refId —
    // повторное подтверждение не создаст дубль. Ошибку (нет прав/сети) глушим,
    // чтобы не мешать подтверждению передачи.
    apiPost("/api/money/branch-income", {
      refId: `handover-${h.id}`,
      branchId: h.branchId ? String(h.branchId) : null,
      branchName: branchById(h.branchId)?.name || "",
      amount: h.amount,
      date: h.date || ymdNow(),
      comment: `Инкассация с филиала${h.via ? ` · через ${h.via}` : ""}`,
    }).catch(() => {});
  };
  const canDelHo = (h) =>
    isController
      ? true
      : isMgr && h.branchId === myBranch && h.status === "sent";

  // ---------- фото чеков к расходам ----------
  const [viewPhoto, setViewPhoto] = useState(null);
  // Просмотр расшифровки расходов (по клику на сумму «Расходы»).
  const [expenseInfo, setExpenseInfo] = useState(null);
  // Ссылка на форму отчёта — чтобы прокручивать к ней при редактировании.
  const formRef = useRef(null);
  // Редактирование отчёта: подставляем его дату+филиал (форма сама подтянет
  // данные существующего отчёта) и прокручиваем к форме.
  const editReport = (r) => {
    setForm((f) => ({ ...f, date: r.date, branchId: r.branchId }));
    setTimeout(() => {
      if (formRef.current)
        formRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
  };
  const addPhotos = async (files) => {
    if (!editable) return;
    const cur = form.expensePhotos || [];
    const room = Math.max(0, 3 - cur.length);
    const list = Array.from(files || []).slice(0, room);
    if (!list.length) {
      if (room === 0) notify(tr("Максимум 3 фото"));
      return;
    }
    try {
      const added = [];
      for (const f of list)
        added.push({ id: uid(), dataUrl: await compressPhoto(f) });
      setForm((fm) => ({
        ...fm,
        expensePhotos: [...(fm.expensePhotos || []), ...added],
      }));
      notify(tr("Фото добавлено"));
    } catch (e) {
      notify(tr("Не удалось обработать фото"));
    }
  };
  const delPhoto = (id) =>
    setForm((fm) => ({
      ...fm,
      expensePhotos: (fm.expensePhotos || []).filter((x) => x.id !== id),
    }));

  // ---------- печать ----------
  const printReport = () => {
    const nf = (n) => Math.round(n || 0).toLocaleString("ru-RU");
    const esc = (t) =>
      String(t || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    const bcol = isMgr ? "" : "<th>" + tr("Филиал") + "</th>";
    const head =
      "<tr><th>" +
      tr("Дата") +
      "</th>" +
      bcol +
      "<th class=n>" +
      tr("Выручка") +
      "</th><th class=n>" +
      tr("Наличные") +
      "</th><th class=n>" +
      tr("Эквайринг") +
      "</th><th class=n>" +
      tr("Перечисл.") +
      "</th><th class=n>" +
      tr("Долг") +
      "</th><th class=n>" +
      tr("Без оплат") +
      "</th><th class=n>" +
      tr("Расходы") +
      "</th><th class=n>" +
      tr("Разница") +
      "</th><th>" +
      tr("Примечание") +
      "</th></tr>";
    const body = sorted
      .map((r) => {
        const c = cashCalc(r);
        const bc = isMgr
          ? ""
          : "<td>" + esc(branchById(r.branchId)?.name || "") + "</td>";
        const note = [
          r.expensesNote ? tr("Расходы") + ": " + r.expensesNote : "",
          r.comment || "",
        ]
          .filter(Boolean)
          .join("; ");
        return (
          "<tr><td>" +
          dm(r.date) +
          "</td>" +
          bc +
          "<td class=n>" +
          nf(c.total) +
          "</td><td class=n>" +
          nf(c.cash) +
          "</td><td class=n>" +
          nf(c.acq) +
          "</td><td class=n>" +
          (r.transfer
            ? nf(r.transfer) +
              (r.transferCount ? " (" + r.transferCount + ")" : "")
            : "—") +
          "</td><td class=n>" +
          (r.debt ? nf(r.debt) : "—") +
          "</td><td class=n>" +
          (r.noPay ? nf(r.noPay) : "—") +
          "</td><td class=n>" +
          nf(r.expenses) +
          "</td><td class=n>" +
          (c.diff === 0 ? "0" : (c.diff > 0 ? "+" : "") + nf(c.diff)) +
          "</td><td class=note>" +
          esc(note) +
          "</td></tr>"
        );
      })
      .join("");
    const totCol = isMgr ? "" : "<td></td>";
    const tot =
      "<tr class=tot><td>" +
      tr("Итого") +
      "</td>" +
      totCol +
      "<td class=n>" +
      nf(agg.total) +
      "</td><td class=n>" +
      nf(agg.cash) +
      "</td><td class=n>" +
      nf(agg.acq) +
      "</td><td class=n>" +
      nf(sum("transfer")) +
      "</td><td class=n>" +
      nf(sum("debt")) +
      "</td><td class=n>" +
      nf(sum("noPay")) +
      "</td><td class=n>" +
      nf(sum("expenses")) +
      "</td><td class=n>" +
      nf(agg.diff) +
      "</td><td></td></tr>";
    const html =
      "<html><head><meta charset='utf-8'><title>" +
      tr("Отчёт по кассам филиалов") +
      "</title><style>body{font-family:Arial,sans-serif;padding:24px;color:#111}h1{font-size:18px;margin:0}.meta{color:#555;font-size:13px;margin:6px 0 2px}table{border-collapse:collapse;width:100%;font-size:12px;margin-top:12px}th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}td.n,th.n{text-align:right;white-space:nowrap}td.note{font-size:11px;color:#444;max-width:220px}tr.tot td{font-weight:bold;background:#f3f4f6}</style></head><body><h1>" +
      tr("Отчёт по кассам филиалов") +
      "</h1><div class=meta>" +
      periodLabel +
      " · " +
      branchLabel +
      "</div><div class=meta>" +
      tr("(суммы в сум)") +
      "</div><table><thead>" +
      head +
      "</thead><tbody>" +
      body +
      tot +
      "</tbody></table></body></html>";
    try {
      const w = window.open("", "_blank");
      if (!w) {
        notify(tr("Разрешите всплывающие окна для печати"));
        return;
      }
      w.document.write(html);
      w.document.close();
      w.focus();
      setTimeout(() => {
        try {
          w.print();
        } catch (e) {}
      }, 350);
    } catch (e) {
      notify(tr("Печать недоступна в этом окне"));
    }
  };

  // ---------- ui-хелперы ----------
  const inpCls = "w-full rounded-xl px-3 py-2 mt-1";
  const inpSt = {
    border: `1px solid ${C.border}`,
    fontSize: 14,
    background: "#fff",
    color: C.ink,
  };
  const inp = (label, k) => (
    <CashNumField
      key={k}
      label={label}
      value={form[k]}
      disabled={!editable}
      onChange={(v) => setNum(k, v)}
    />
  );
  const Box = ({ label, value, color, bg }) => (
    <div
      className="rounded-xl px-3 py-2.5"
      style={{ background: bg || "#F8FAFC", border: `1px solid ${C.border}` }}
    >
      <div style={{ fontSize: 11, color: C.faint, fontWeight: 600 }}>
        {label}
      </div>
      <div
        className="font-extrabold"
        style={{
          fontSize: 15,
          color: color || C.ink,
          overflowWrap: "break-word",
          lineHeight: 1.15,
        }}
      >
        {fmtSum(value)}
      </div>
    </div>
  );
  const KPI = ({ label, value, color }) => (
    <div
      className="rounded-2xl bg-white p-4"
      style={{ border: `1px solid ${C.border}` }}
    >
      <div style={{ fontSize: 12, color: C.faint, fontWeight: 600 }}>
        {label}
      </div>
      <div
        className="font-extrabold mt-0.5"
        style={{
          fontSize: 18,
          color: color || C.ink,
          overflowWrap: "break-word",
          lineHeight: 1.15,
        }}
      >
        {fmtSum(value)}
      </div>
    </div>
  );
  const canDelete = (r) =>
    r.status !== "confirmed" &&
    (isController ||
      (isMgr && r.branchId === myBranch && Date.now() <= deadlineTs(r.date)));
  const StatusBadge = ({ st }) => (
    <span
      className="rounded-full font-semibold"
      style={{
        fontSize: 11,
        padding: "2px 8px",
        whiteSpace: "nowrap",
        background: st === "confirmed" ? "#E9F9EF" : "#FEF3C7",
        color: st === "confirmed" ? C.ok : "#92400E",
      }}
    >
      {st === "confirmed" ? `✓ ${tr("Принято")}` : tr("Ожидает")}
    </span>
  );
  const waiting = scope.filter((r) => r.status !== "confirmed").length;

  return (
    <div className="space-y-5 max-w-5xl">
      {/* период + фильтры + печать (как в iiko) */}
      <div
        className="rounded-2xl bg-white p-3.5"
        style={{ border: `1px solid ${C.border}` }}
      >
        <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
          <NiceSelect
            label={tr("За период")}
            value={preset}
            onChange={(v) => pickPreset(v)}
            width={188}
            options={PERIOD_PRESETS.map(([k, l]) => ({
              value: k,
              label: tr(l),
            }))}
          />
          <NiceDate
            label={tr("с")}
            value={from}
            onChange={(v) => {
              setFrom(v);
              setPreset("custom");
            }}
            width={134}
          />
          <NiceDate
            label={tr("по")}
            value={to}
            onChange={(v) => {
              setTo(v);
              setPreset("custom");
            }}
            width={134}
          />
          <button
            onClick={printReport}
            className="inline-flex items-center gap-2 rounded-xl px-4 font-semibold"
            style={{
              border: `1px solid ${C.border}`,
              color: C.ink,
              fontSize: 13,
              background: "#fff",
              height: 40,
            }}
          >
            <Printer size={16} /> {tr("Печать")}
          </button>
        </div>
        {isMgr && (
          <div className="mt-2" style={{ fontSize: 12, color: C.faint }}>
            {tr("Ваш филиал")}:{" "}
            <b style={{ color: C.sub }}>{branchById(myBranch)?.name}</b>
          </div>
        )}
      </div>

      {/* итоги за период */}
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}
      >
        <KPI label={tr("Выручка за период")} value={agg.total} color={C.ink} />
        <KPI label={tr("Наличные")} value={agg.cash} color={C.brandA} />
        <KPI
          label={tr("Эквайринг (в банк)")}
          value={agg.acq}
          color={C.violet}
        />
        <KPI
          label={tr("Перечисление")}
          value={sum("transfer")}
          color={C.brandB}
        />
        <KPI label={tr("Расходы")} value={sum("expenses")} color={C.bad} />
      </div>

      {/* сейф филиала и инкассация */}
      <div
        className="rounded-2xl bg-white p-4 sm:p-5"
        style={{ border: `1px solid ${C.border}` }}
      >
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <Lock size={17} color={C.brandA} />
          <h3 className="font-bold" style={{ color: C.ink, fontSize: 16 }}>
            {tr("Сейф филиала и передача денег")}
          </h3>
          {!isMgr && !fBranch && (
            <span style={{ fontSize: 12, color: C.faint }}>
              {tr(
                "выберите филиал вверху, чтобы видеть сейф и передавать деньги",
              )}
            </span>
          )}
        </div>

        {safe && (
          <div
            className="grid gap-3 mb-4"
            style={{
              gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
            }}
          >
            <div
              className="rounded-xl px-3 py-2.5"
              style={{ background: "#EFF4FF", border: `1px solid ${C.border}` }}
            >
              <div style={{ fontSize: 11, color: C.faint, fontWeight: 600 }}>
                {tr("Остаток в сейфе")}
              </div>
              <div
                className="font-extrabold"
                style={{
                  fontSize: 16,
                  color: safe.balance >= 0 ? C.ink : C.bad,
                  overflowWrap: "break-word",
                }}
              >
                {fmtSum(safe.balance)}
              </div>
            </div>
            <div
              className="rounded-xl px-3 py-2.5"
              style={{ background: "#FEF3C7", border: `1px solid ${C.border}` }}
            >
              <div style={{ fontSize: 11, color: "#92400E", fontWeight: 600 }}>
                {tr("В пути / на подтверждении")}
              </div>
              <div
                className="font-extrabold"
                style={{
                  fontSize: 16,
                  color: "#92400E",
                  overflowWrap: "break-word",
                }}
              >
                {fmtSum(safe.inTransit)}
              </div>
            </div>
            <div
              className="rounded-xl px-3 py-2.5"
              style={{ background: "#F8FAFC", border: `1px solid ${C.border}` }}
            >
              <div style={{ fontSize: 11, color: C.faint, fontWeight: 600 }}>
                {tr("Наличных поступило (всего)")}
              </div>
              <div
                className="font-extrabold"
                style={{
                  fontSize: 16,
                  color: C.sub,
                  overflowWrap: "break-word",
                }}
              >
                {fmtSum(safe.cashIn)}
              </div>
            </div>
            <div
              className="rounded-xl px-3 py-2.5"
              style={{ background: "#E9F9EF", border: `1px solid ${C.border}` }}
            >
              <div style={{ fontSize: 11, color: "#065F46", fontWeight: 600 }}>
                {tr("Передано в офис (всего)")}
              </div>
              <div
                className="font-extrabold"
                style={{
                  fontSize: 16,
                  color: C.ok,
                  overflowWrap: "break-word",
                }}
              >
                {fmtSum(safe.sent)}
              </div>
            </div>
          </div>
        )}

        {safe && (isMgr || isController) && (
          <div
            className="rounded-xl p-3 mb-4"
            style={{ background: "#FBFCFE", border: `1px dashed ${C.border}` }}
          >
            <div
              className="font-bold mb-2"
              style={{ color: C.sub, fontSize: 13 }}
            >
              {tr("Передать в головной офис")}
            </div>
            <div className="flex flex-wrap items-end gap-2.5">
              <div style={{ width: 160 }}>
                <CashNumField
                  label={tr("Сумма")}
                  value={ho.amount}
                  disabled={false}
                  onChange={(v) =>
                    setHo((o) => ({
                      ...o,
                      amount: Math.max(
                        0,
                        parseInt(String(v).replace(/[^\d]/g, "") || "0", 10),
                      ),
                    }))
                  }
                />
              </div>
              <div style={{ flex: "1 1 180px", minWidth: 150 }}>
                <label style={{ fontSize: 12, color: C.sub, fontWeight: 600 }}>
                  {tr("Через кого")}
                </label>
                <input
                  value={ho.via}
                  onChange={(e) =>
                    setHo((o) => ({ ...o, via: e.target.value }))
                  }
                  placeholder={tr("инкассатор, водитель, директор…")}
                  className="w-full rounded-xl px-3 py-2 mt-1"
                  style={inpSt}
                />
              </div>
              <div style={{ flex: "1 1 180px", minWidth: 150 }}>
                <label style={{ fontSize: 12, color: C.sub, fontWeight: 600 }}>
                  {tr("Примечание")}
                </label>
                <input
                  value={ho.note}
                  onChange={(e) =>
                    setHo((o) => ({ ...o, note: e.target.value }))
                  }
                  placeholder="—"
                  className="w-full rounded-xl px-3 py-2 mt-1"
                  style={inpSt}
                />
              </div>
              <button
                onClick={sendHandover}
                className="inline-flex items-center gap-2 rounded-xl px-4 font-bold text-white"
                style={{ background: C.brandA, fontSize: 13.5, height: 40 }}
              >
                <Send size={15} /> {tr("Передать")}
              </button>
            </div>
            {safe && (
              <div className="mt-2" style={{ fontSize: 12, color: C.faint }}>
                {tr("Доступно к передаче")}:{" "}
                <b style={{ color: C.sub }}>{fmtSum(safe.balance)}</b>
              </div>
            )}
          </div>
        )}

        <div className="font-bold mb-2" style={{ color: C.sub, fontSize: 13 }}>
          {tr("Передачи за период")}
        </div>
        {hoSorted.length === 0 && (
          <div style={{ fontSize: 13, color: C.faint }}>
            {tr("Передач за период нет")}
          </div>
        )}
        <div className="space-y-1.5">
          {hoSorted.map((h) => (
            <div
              key={h.id}
              className="flex items-center gap-2 flex-wrap py-1.5"
              style={{ borderBottom: `1px solid ${C.line}` }}
            >
              <span
                style={{
                  fontSize: 13,
                  color: C.ink,
                  fontWeight: 700,
                  whiteSpace: "nowrap",
                }}
              >
                {dm(h.date)}
              </span>
              {!isMgr && (
                <span
                  className="truncate"
                  style={{ fontSize: 12.5, color: C.sub, maxWidth: 90 }}
                >
                  {branchById(h.branchId)?.name}
                </span>
              )}
              <span
                style={{
                  fontSize: 13.5,
                  color: C.ink,
                  fontWeight: 800,
                  whiteSpace: "nowrap",
                }}
              >
                {fmtSum(h.amount)}
              </span>
              <span
                className="min-w-0 truncate"
                style={{ fontSize: 12.5, color: C.sub, flex: "1 1 120px" }}
              >
                {tr("через")}: {h.via}
                {h.note ? ` · ${h.note}` : ""}
              </span>
              <span
                className="rounded-full font-semibold shrink-0"
                style={{
                  fontSize: 11,
                  padding: "2px 8px",
                  whiteSpace: "nowrap",
                  background: h.status === "received" ? "#E9F9EF" : "#FEF3C7",
                  color: h.status === "received" ? C.ok : "#92400E",
                }}
              >
                {h.status === "received"
                  ? `✓ ${tr("Принято офисом")}`
                  : tr("В пути")}
              </span>
              {isController && h.status === "sent" && (
                <button
                  onClick={() => confirmHandover(h)}
                  className="rounded-lg px-2 py-1 font-semibold shrink-0"
                  style={{ background: C.ok, color: "#fff", fontSize: 11 }}
                >
                  {tr("Подтвердить приём")}
                </button>
              )}
              {canDelHo(h) && (
                <button
                  onClick={() => {
                    dispatch({ type: "DELETE_HANDOVER", id: h.id });
                    notify(tr("Передача удалена"));
                  }}
                  className="p-1 rounded-lg shrink-0"
                  style={{ color: C.bad }}
                  title={tr("Удалить")}
                >
                  <X size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* форма — только управляющие */}
      {canEditForm && (
        <div
          ref={formRef}
          className="rounded-2xl bg-white p-4 sm:p-5"
          style={{ border: `1px solid ${C.border}` }}
        >
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <Wallet size={18} color={C.brandA} />
            <h3 className="font-bold" style={{ color: C.ink, fontSize: 16 }}>
              {tr("Отчёт по кассе за день")}
            </h3>
          </div>
          {isConfirmed ? (
            <div
              className="rounded-xl px-3 py-2 mb-4 flex items-start gap-2"
              style={{ background: "#E9F9EF", border: "1px solid #A7F3D0" }}
            >
              <CheckCircle2 size={15} color={C.ok} style={{ marginTop: 1 }} />
              <span style={{ fontSize: 12.5, color: "#065F46" }}>
                {tr("Отчёт принят контролёром — редактирование закрыто.")}
                {existing?.confirmedBy
                  ? ` ${tr("Принял")}: ${userById(existing.confirmedBy)?.name || ""}`
                  : ""}
              </span>
            </div>
          ) : isMgr && pastDeadline ? (
            <div
              className="rounded-xl px-3 py-2 mb-4 flex items-start gap-2"
              style={{ background: "#FEF2F2", border: "1px solid #FECACA" }}
            >
              <Lock size={15} color={C.bad} style={{ marginTop: 1 }} />
              <span style={{ fontSize: 12.5, color: "#991B1B" }}>
                {tr(
                  "Срок сдачи истёк (после 12:00 следующего дня). Изменения может внести только контролёр.",
                )}
              </span>
            </div>
          ) : (
            <div
              className="mb-4 flex items-start gap-2"
              style={{ fontSize: 12.5, color: C.faint }}
            >
              <Clock size={14} style={{ marginTop: 1 }} />
              <span>
                {existing ? tr("Отчёт сдан. ") : tr("Новый отчёт. ")}
                {isController
                  ? tr("Вы контролёр — правки без ограничения по сроку.")
                  : `${tr("Правки принимаются до")} ${dlStr}`}
              </span>
            </div>
          )}

          <div
            className="grid gap-3 mb-4"
            style={{
              gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
            }}
          >
            <NiceDate
              label={tr("Дата")}
              value={form.date}
              max={ymdNow()}
              onChange={(v) => setForm((f) => ({ ...f, date: v }))}
            />
            <div>
              <label
                style={{
                  fontSize: 12,
                  color: C.sub,
                  fontWeight: 600,
                  display: "block",
                  marginBottom: 4,
                }}
              >
                {tr("Филиал")}
              </label>
              <NiceSelect
                value={form.branchId}
                disabled={isMgr}
                onChange={(v) => setForm((f) => ({ ...f, branchId: +v }))}
                options={cashBranches.map((b) => ({
                  value: b.id,
                  label: b.name,
                }))}
              />
            </div>
          </div>

          <div
            className="font-bold mb-2"
            style={{ color: C.sub, fontSize: 13 }}
          >
            {tr("Наличные")}
          </div>
          <div
            className="grid gap-3 mb-4"
            style={{
              gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
            }}
          >
            {inp(tr("Фискальная выручка"), "fiscal")}
            {inp(tr("Нефискальная сумма"), "nonFiscal")}
          </div>

          <div
            className="font-bold mb-2"
            style={{ color: C.sub, fontSize: 13 }}
          >
            {tr("Карты и онлайн")}
          </div>
          <div
            className="grid gap-3 mb-4"
            style={{
              gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
            }}
          >
            {inp("Humo Card", "humo")}
            {inp("Uzcard", "uzcard")}
            {inp("Click", "click")}
            {inp("Payme", "payme")}
            {inp("Uzum Tezkor", "uzumTezkor")}
            {inp("Yandex Еда", "yandex")}
          </div>

          <div
            className="font-bold mb-2"
            style={{ color: C.sub, fontSize: 13 }}
          >
            {tr("Перечисление и прочее")}
          </div>
          <div
            className="grid gap-3 mb-4"
            style={{
              gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
            }}
          >
            {inp(tr("Перечисление"), "transfer")}
            {inp(tr("Чеков перечислением"), "transferCount")}
            {inp(tr("Долг"), "debt")}
            {inp(tr("Без оплат"), "noPay")}
            {inp(tr("Расходы за день"), "expenses")}
            {inp(tr("Сумма по iiko"), "iiko")}
          </div>

          {(form.expenses || 0) > 0 && (
            <div className="mb-4">
              <label style={{ fontSize: 12, color: C.sub, fontWeight: 600 }}>
                {tr("Расходы — на что потрачено")}{" "}
                <span style={{ color: C.bad }}>*</span>
              </label>
              <textarea
                value={form.expensesNote || ""}
                disabled={!editable}
                rows={2}
                onChange={(e) =>
                  setForm((f) => ({ ...f, expensesNote: e.target.value }))
                }
                placeholder={tr(
                  "Например: закупка продуктов, хозтовары, мелкий ремонт",
                )}
                className="w-full rounded-xl px-3 py-2 mt-1"
                style={{
                  ...inpSt,
                  resize: "vertical",
                  background: editable ? "#fff" : "#F1F5F9",
                  color: editable ? C.ink : C.sub,
                }}
              />
              {!(form.expensesNote || "").trim() && (
                <div style={{ fontSize: 12, color: C.bad, marginTop: 4 }}>
                  {tr("При расходах комментарий обязателен")}
                </div>
              )}
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                {(form.expensePhotos || []).map((ph) => (
                  <div key={ph.id} className="relative">
                    <img
                      src={ph.dataUrl}
                      alt=""
                      onClick={() => setViewPhoto(ph.dataUrl)}
                      style={{
                        width: 56,
                        height: 56,
                        objectFit: "cover",
                        borderRadius: 10,
                        border: `1px solid ${C.border}`,
                        cursor: "zoom-in",
                      }}
                    />
                    {editable && (
                      <button
                        onClick={() => delPhoto(ph.id)}
                        className="absolute flex items-center justify-center"
                        style={{
                          top: -6,
                          right: -6,
                          width: 18,
                          height: 18,
                          borderRadius: 99,
                          background: C.bad,
                          color: "#fff",
                          fontSize: 11,
                          lineHeight: 1,
                        }}
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
                {editable && (form.expensePhotos || []).length < 3 && (
                  <label
                    className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 font-semibold"
                    style={{
                      border: `1px dashed ${C.border}`,
                      color: C.sub,
                      fontSize: 12.5,
                      cursor: "pointer",
                    }}
                  >
                    <Camera size={15} /> {tr("Фото чека / товара")}
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      style={{ display: "none" }}
                      onChange={(e) => {
                        addPhotos(e.target.files);
                        e.target.value = "";
                      }}
                    />
                  </label>
                )}
                <span style={{ fontSize: 11.5, color: C.faint }}>
                  {tr("по желанию, до 3 фото — доказательство расхода")}
                </span>
              </div>
            </div>
          )}

          <div
            className="grid gap-3 mb-4"
            style={{
              gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
            }}
          >
            <Box
              label={tr("Наличными всего")}
              value={live.cash}
              color={C.brandA}
            />
            <Box
              label={tr("Эквайринг (в банк)")}
              value={live.acq}
              color={C.violet}
            />
            <Box
              label={tr("Итого выручка")}
              value={live.total}
              color={C.ink}
              bg="#EFF4FF"
            />
            <Box
              label={tr("Разница с iiko")}
              value={live.diff}
              color={live.diff === 0 ? C.ok : C.bad}
              bg={live.diff === 0 ? "#E9F9EF" : "#FEF2F2"}
            />
          </div>

          <div className="mb-4">
            <label style={{ fontSize: 12, color: C.sub, fontWeight: 600 }}>
              {tr("Комментарий")}{" "}
              {live.diff !== 0 && <span style={{ color: C.bad }}>*</span>}
            </label>
            <textarea
              value={form.comment || ""}
              disabled={!editable}
              rows={2}
              onChange={(e) =>
                setForm((f) => ({ ...f, comment: e.target.value }))
              }
              placeholder={tr("Причина расхождения с iiko, если есть")}
              className="w-full rounded-xl px-3 py-2 mt-1"
              style={{
                ...inpSt,
                resize: "vertical",
                background: editable ? "#fff" : "#F1F5F9",
                color: editable ? C.ink : C.sub,
              }}
            />
            {live.diff !== 0 && !(form.comment || "").trim() && (
              <div style={{ fontSize: 12, color: C.bad, marginTop: 4 }}>
                {tr("При расхождении с iiko комментарий обязателен")}
              </div>
            )}
          </div>

          <button
            onClick={save}
            disabled={!editable}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 font-bold text-white"
            style={{
              background: editable ? C.brandA : C.line,
              color: editable ? "#fff" : C.faint,
              fontSize: 14,
              cursor: editable ? "pointer" : "not-allowed",
            }}
          >
            <CheckCircle2 size={16} />{" "}
            {existing ? tr("Обновить отчёт") : tr("Сдать отчёт")}
          </button>
        </div>
      )}

      {/* отчёты за период */}
      <div
        className="rounded-2xl bg-white p-4 sm:p-5"
        style={{ border: `1px solid ${C.border}` }}
      >
        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <h3 className="font-bold" style={{ color: C.ink, fontSize: 16 }}>
            {tr("Отчёты за период")}
          </h3>
          <span style={{ fontSize: 12.5, color: C.faint }}>
            {periodLabel} · {branchLabel}
          </span>
        </div>
        {isController && (waiting > 0 || hoWaiting > 0) && (
          <div
            className="rounded-xl px-3 py-2 mb-3 flex items-center gap-2"
            style={{ background: "#FEF3C7", border: "1px solid #FDE68A" }}
          >
            <AlertTriangle size={15} color="#92400E" />
            <span style={{ fontSize: 12.5, color: "#92400E", fontWeight: 600 }}>
              {waiting} {tr("отчётов ожидают подтверждения")}
              {hoWaiting > 0
                ? ` · ${hoWaiting} ${tr("передач денег в пути")}`
                : ""}
            </span>
          </div>
        )}
        {sorted.length === 0 && (
          <div style={{ fontSize: 13, color: C.faint }}>
            {tr("Нет отчётов за выбранный период")}
          </div>
        )}

        {sorted.length > 0 && (
          <div className="hidden lg:block" style={{ overflowX: "auto" }}>
            <table
              className="w-full cash-table"
              style={{
                borderCollapse: "collapse",
                fontSize: 13,
                minWidth: 920,
              }}
            >
              <thead>
                <tr style={{ color: C.faint, textAlign: "right" }}>
                  <th className="py-2" style={{ textAlign: "left" }}>
                    {tr("Дата")}
                  </th>
                  {!isMgr && (
                    <th style={{ textAlign: "left" }}>{tr("Филиал")}</th>
                  )}
                  <th>{tr("Выручка")}</th>
                  <th>{tr("Наличные")}</th>
                  <th>{tr("Эквайринг")}</th>
                  <th>{tr("Перечисл.")}</th>
                  <th>{tr("Долг")}</th>
                  <th>{tr("Без оплат")}</th>
                  <th>{tr("Расходы")}</th>
                  <th>{tr("Разница")}</th>
                  <th style={{ textAlign: "left" }}>{tr("Статус")}</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => {
                  const c = cashCalc(r);
                  return (
                    <tr
                      key={r.id}
                      style={{
                        borderTop: `1px solid ${C.line}`,
                        textAlign: "right",
                      }}
                    >
                      <td
                        className="py-2"
                        style={{
                          textAlign: "left",
                          color: C.ink,
                          fontWeight: 600,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {dm(r.date)}
                      </td>
                      {!isMgr && (
                        <td
                          style={{
                            textAlign: "left",
                            color: C.sub,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {branchById(r.branchId)?.name}
                        </td>
                      )}
                      <td
                        style={{
                          color: C.ink,
                          fontWeight: 700,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {fmtSum(c.total)}
                      </td>
                      <td style={{ color: C.sub, whiteSpace: "nowrap" }}>
                        {fmtSum(c.cash)}
                      </td>
                      <td style={{ color: C.sub, whiteSpace: "nowrap" }}>
                        {fmtSum(c.acq)}
                      </td>
                      <td style={{ color: C.sub, whiteSpace: "nowrap" }}>
                        {r.transfer
                          ? `${fmtSum(r.transfer)}${r.transferCount ? ` (${r.transferCount})` : ""}`
                          : "—"}
                      </td>
                      <td
                        style={{
                          color: r.debt ? C.warn : C.faint,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {r.debt ? fmtSum(r.debt) : "—"}
                      </td>
                      <td
                        style={{
                          color: r.noPay ? C.warn : C.faint,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {r.noPay ? fmtSum(r.noPay) : "—"}
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <button
                          type="button"
                          onClick={() => setExpenseInfo(r)}
                          title={tr("Показать комментарий расхода")}
                          style={{
                            color: C.bad,
                            fontWeight: 600,
                            textDecoration:
                              r.expensesNote || (r.expensePhotos || []).length
                                ? "underline dotted"
                                : "none",
                            textUnderlineOffset: 3,
                            cursor: "pointer",
                            background: "none",
                            border: "none",
                            padding: 0,
                            font: "inherit",
                          }}
                        >
                          {fmtSum(r.expenses)}
                        </button>
                      </td>
                      <td
                        style={{
                          color: c.diff === 0 ? C.ok : C.bad,
                          fontWeight: 700,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {c.diff === 0
                          ? "✓ 0"
                          : (c.diff > 0 ? "+" : "") + fmtSum(c.diff)}
                      </td>
                      <td style={{ textAlign: "left", whiteSpace: "nowrap" }}>
                        <div className="flex items-center gap-1.5">
                          <StatusBadge st={r.status} />
                          {r.comment ? (
                            <span
                              title={r.comment}
                              style={{ display: "inline-flex" }}
                            >
                              <MessageSquare size={13} color={C.warn} />
                            </span>
                          ) : null}
                          {(r.expensePhotos || []).length > 0 && (
                            <button
                              onClick={() =>
                                setViewPhoto(r.expensePhotos[0].dataUrl)
                              }
                              className="inline-flex items-center gap-0.5"
                              style={{
                                color: C.brandA,
                                fontSize: 11,
                                fontWeight: 700,
                              }}
                              title={tr("Фото чека / товара")}
                            >
                              <Camera size={13} />
                              {r.expensePhotos.length}
                            </button>
                          )}
                          {isController && r.status !== "confirmed" && (
                            <button
                              onClick={() => confirmReport(r.id)}
                              className="rounded-lg px-2 py-1 font-semibold"
                              style={{
                                background: C.ok,
                                color: "#fff",
                                fontSize: 11,
                              }}
                            >
                              {tr("Принять")}
                            </button>
                          )}
                          {canDelete(r) && r.status !== "confirmed" && (
                            <button
                              onClick={() => editReport(r)}
                              className="p-1 rounded-lg"
                              style={{ color: C.brandA }}
                              title={tr("Редактировать")}
                            >
                              <Pencil size={14} />
                            </button>
                          )}
                          {canDelete(r) && (
                            <button
                              onClick={() => {
                                dispatch({
                                  type: "DELETE_CASH_REPORT",
                                  id: r.id,
                                });
                                notify(tr("Отчёт удалён"));
                              }}
                              className="p-1 rounded-lg"
                              style={{ color: C.bad }}
                              title={tr("Удалить")}
                            >
                              <X size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                <tr
                  style={{
                    borderTop: `2px solid ${C.border}`,
                    textAlign: "right",
                    background: "#F8FAFC",
                  }}
                >
                  <td
                    className="py-2"
                    style={{ textAlign: "left", color: C.ink, fontWeight: 800 }}
                  >
                    {tr("Итого")}
                  </td>
                  {!isMgr && <td></td>}
                  <td
                    style={{
                      color: C.ink,
                      fontWeight: 800,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {fmtSum(agg.total)}
                  </td>
                  <td
                    style={{
                      color: C.ink,
                      fontWeight: 700,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {fmtSum(agg.cash)}
                  </td>
                  <td
                    style={{
                      color: C.ink,
                      fontWeight: 700,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {fmtSum(agg.acq)}
                  </td>
                  <td
                    style={{
                      color: C.ink,
                      fontWeight: 700,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {fmtSum(sum("transfer"))}
                  </td>
                  <td
                    style={{
                      color: C.ink,
                      fontWeight: 700,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {fmtSum(sum("debt"))}
                  </td>
                  <td
                    style={{
                      color: C.ink,
                      fontWeight: 700,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {fmtSum(sum("noPay"))}
                  </td>
                  <td
                    style={{
                      color: C.bad,
                      fontWeight: 700,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {fmtSum(sum("expenses"))}
                  </td>
                  <td
                    style={{
                      color: agg.diff === 0 ? C.ok : C.bad,
                      fontWeight: 800,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {agg.diff === 0
                      ? "✓ 0"
                      : (agg.diff > 0 ? "+" : "") + fmtSum(agg.diff)}
                  </td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* карточки — мобильный */}
        <div className="lg:hidden space-y-2.5">
          {sorted.map((r) => {
            const c = cashCalc(r);
            const cell = (l, v, col) => (
              <div>
                <div
                  style={{ fontSize: 10.5, color: C.faint, fontWeight: 600 }}
                >
                  {l}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: col || C.ink,
                    fontWeight: 700,
                    overflowWrap: "break-word",
                  }}
                >
                  {v}
                </div>
              </div>
            );
            return (
              <div
                key={r.id}
                className="rounded-xl px-3 py-3"
                style={{
                  background: "#FBFCFE",
                  border: `1px solid ${C.border}`,
                }}
              >
                <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                  <div
                    className="font-bold"
                    style={{ color: C.ink, fontSize: 14 }}
                  >
                    {dm(r.date)} · {branchById(r.branchId)?.name}
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <StatusBadge st={r.status} />
                    <span
                      className="rounded-full font-semibold"
                      style={{
                        fontSize: 11.5,
                        padding: "2px 9px",
                        whiteSpace: "nowrap",
                        background: c.diff === 0 ? "#E9F9EF" : "#FEF2F2",
                        color: c.diff === 0 ? C.ok : C.bad,
                      }}
                    >
                      {tr("Разница")}:{" "}
                      {c.diff === 0
                        ? "0"
                        : (c.diff > 0 ? "+" : "") + fmtSum(c.diff)}
                    </span>
                    {isController && r.status !== "confirmed" && (
                      <button
                        onClick={() => confirmReport(r.id)}
                        className="rounded-lg px-2 py-1 font-semibold"
                        style={{
                          background: C.ok,
                          color: "#fff",
                          fontSize: 11,
                        }}
                      >
                        {tr("Принять")}
                      </button>
                    )}
                    {canDelete(r) && r.status !== "confirmed" && (
                      <button
                        onClick={() => editReport(r)}
                        className="p-1 rounded-lg"
                        style={{ color: C.brandA }}
                        title={tr("Редактировать")}
                      >
                        <Pencil size={15} />
                      </button>
                    )}
                    {canDelete(r) && (
                      <button
                        onClick={() => {
                          dispatch({ type: "DELETE_CASH_REPORT", id: r.id });
                          notify(tr("Отчёт удалён"));
                        }}
                        className="p-1 rounded-lg"
                        style={{ color: C.bad }}
                      >
                        <X size={15} />
                      </button>
                    )}
                  </div>
                </div>
                <div
                  className="grid gap-2"
                  style={{
                    gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))",
                  }}
                >
                  {cell(tr("Выручка"), fmtSum(c.total))}
                  {cell(tr("Наличные"), fmtSum(c.cash), C.brandA)}
                  {cell(tr("Эквайринг"), fmtSum(c.acq), C.violet)}
                  {r.transfer
                    ? cell(
                        tr("Перечисл."),
                        fmtSum(r.transfer) +
                          (r.transferCount ? ` (${r.transferCount})` : ""),
                      )
                    : null}
                  {r.debt ? cell(tr("Долг"), fmtSum(r.debt), C.warn) : null}
                  {r.noPay
                    ? cell(tr("Без оплат"), fmtSum(r.noPay), C.warn)
                    : null}
                  {cell(tr("Расходы"), fmtSum(r.expenses), C.bad)}
                </div>
                {r.expensesNote ? (
                  <div
                    className="flex items-start gap-1.5"
                    style={{ fontSize: 12, color: C.sub, marginTop: 8 }}
                  >
                    <Wallet size={13} style={{ marginTop: 1, flexShrink: 0 }} />
                    <span>
                      {tr("Расходы")}: {r.expensesNote}
                    </span>
                  </div>
                ) : null}
                {r.comment ? (
                  <div
                    className="flex items-start gap-1.5"
                    style={{
                      fontSize: 12,
                      color: C.warn,
                      marginTop: r.expensesNote ? 4 : 8,
                    }}
                  >
                    <MessageSquare
                      size={13}
                      style={{ marginTop: 1, flexShrink: 0 }}
                    />
                    <span>{r.comment}</span>
                  </div>
                ) : null}
                {(r.expensePhotos || []).length > 0 && (
                  <div
                    className="flex gap-1.5 flex-wrap"
                    style={{ marginTop: 6 }}
                  >
                    {r.expensePhotos.map((ph) => (
                      <img
                        key={ph.id}
                        src={ph.dataUrl}
                        alt=""
                        onClick={() => setViewPhoto(ph.dataUrl)}
                        style={{
                          width: 44,
                          height: 44,
                          objectFit: "cover",
                          borderRadius: 8,
                          border: `1px solid ${C.border}`,
                          cursor: "zoom-in",
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {sorted.length > 0 && (
            <div
              className="rounded-xl px-3 py-3"
              style={{ background: "#EFF4FF", border: `1px solid ${C.border}` }}
            >
              <div
                className="font-extrabold mb-2"
                style={{ color: C.ink, fontSize: 14 }}
              >
                {tr("Итого за период")}
              </div>
              <div
                className="grid gap-2"
                style={{
                  gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))",
                }}
              >
                <div>
                  <div
                    style={{ fontSize: 10.5, color: C.faint, fontWeight: 600 }}
                  >
                    {tr("Выручка")}
                  </div>
                  <div style={{ fontSize: 13, color: C.ink, fontWeight: 800 }}>
                    {fmtSum(agg.total)}
                  </div>
                </div>
                <div>
                  <div
                    style={{ fontSize: 10.5, color: C.faint, fontWeight: 600 }}
                  >
                    {tr("Наличные")}
                  </div>
                  <div style={{ fontSize: 13, color: C.ink, fontWeight: 700 }}>
                    {fmtSum(agg.cash)}
                  </div>
                </div>
                <div>
                  <div
                    style={{ fontSize: 10.5, color: C.faint, fontWeight: 600 }}
                  >
                    {tr("Эквайринг")}
                  </div>
                  <div style={{ fontSize: 13, color: C.ink, fontWeight: 700 }}>
                    {fmtSum(agg.acq)}
                  </div>
                </div>
                <div>
                  <div
                    style={{ fontSize: 10.5, color: C.faint, fontWeight: 600 }}
                  >
                    {tr("Расходы")}
                  </div>
                  <div style={{ fontSize: 13, color: C.bad, fontWeight: 700 }}>
                    {fmtSum(sum("expenses"))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <p style={{ fontSize: 12.5, color: C.faint, lineHeight: 1.5 }}>
        {tr(
          "«Наличными всего» = фискальная + нефискальная. «Эквайринг» = Humo + Uzcard + Click + Payme + Uzum Tezkor + Yandex. «Итого выручка» = наличные + эквайринг + перечисление. «Разница с iiko» = итог минус сумма по iiko.",
        )}
      </p>

      {viewPhoto && (
        <div
          onClick={() => setViewPhoto(null)}
          className="fixed inset-0 flex items-center justify-center p-4"
          style={{
            background: "rgba(15,23,42,.8)",
            zIndex: 90,
            cursor: "zoom-out",
          }}
        >
          <img
            src={viewPhoto}
            alt=""
            style={{
              maxWidth: "94vw",
              maxHeight: "88vh",
              borderRadius: 14,
              boxShadow: "0 20px 60px rgba(0,0,0,.5)",
            }}
          />
        </div>
      )}

      {/* Расшифровка расходов — по клику на сумму «Расходы». */}
      {expenseInfo && (
        <div
          onClick={() => setExpenseInfo(null)}
          className="fixed inset-0 flex items-center justify-center p-4"
          style={{
            background: "rgba(30,16,10,.5)",
            backdropFilter: "blur(4px)",
            WebkitBackdropFilter: "blur(4px)",
            zIndex: 90,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="rounded-2xl bg-white p-5 w-full fade-up"
            style={{
              maxWidth: 460,
              border: `1px solid ${C.border}`,
              boxShadow: "0 24px 60px rgba(30,16,10,.28)",
            }}
          >
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-bold" style={{ color: C.ink, fontSize: 16 }}>
                {tr("Расходы")}
              </h3>
              <button
                onClick={() => setExpenseInfo(null)}
                className="p-1.5 rounded-xl"
                style={{ background: C.line }}
              >
                <X size={16} color={C.sub} />
              </button>
            </div>
            <div style={{ fontSize: 12.5, color: C.faint, marginBottom: 10 }}>
              {dm(expenseInfo.date)} ·{" "}
              {branchById(expenseInfo.branchId)?.name || ""}
            </div>
            <div
              className="rounded-xl px-3 py-2.5 mb-3 flex items-center justify-between"
              style={{ background: "#FEF2F2", border: "1px solid #FECACA" }}
            >
              <span style={{ fontSize: 13, color: C.sub }}>Сумма расходов</span>
              <span style={{ fontSize: 16, fontWeight: 800, color: C.bad }}>
                {fmtSum(expenseInfo.expenses)}
              </span>
            </div>
            <div style={{ fontSize: 12.5, color: C.sub, marginBottom: 4 }}>
              Комментарий расхода:
            </div>
            <div
              className="rounded-xl px-3 py-2.5"
              style={{
                background: "#F8FAFC",
                border: `1px solid ${C.line}`,
                fontSize: 13.5,
                color: expenseInfo.expensesNote ? C.ink : C.faint,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                minHeight: 44,
              }}
            >
              {expenseInfo.expensesNote || "комментарий не указан"}
            </div>
            {(expenseInfo.expensePhotos || []).length > 0 && (
              <div className="flex gap-2 mt-3 flex-wrap">
                {expenseInfo.expensePhotos.map((ph) => (
                  <img
                    key={ph.id}
                    src={ph.dataUrl}
                    alt=""
                    onClick={() => {
                      setViewPhoto(ph.dataUrl);
                      setExpenseInfo(null);
                    }}
                    style={{
                      width: 72,
                      height: 72,
                      objectFit: "cover",
                      borderRadius: 10,
                      cursor: "zoom-in",
                      border: `1px solid ${C.border}`,
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default CashRegisterView;
