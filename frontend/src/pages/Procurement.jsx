// Раздел «Закупки и склад»: тренд цен закупки с сигналами (резкий рост цены с
// учётом сезона), остатки со статусом, движение товара и «конструктор правил».
// Данные — из iiko через /api/procurement. Универсально для любого бизнеса с
// товарным учётом.
import { useState, useEffect } from "react";
import {
  PackageSearch,
  RefreshCw,
  TrendingUp,
  Boxes,
  ArrowRightLeft,
  SlidersHorizontal,
  Save,
  AlertTriangle,
} from "lucide-react";
import { apiGet, apiPost, apiPut } from "../api.js";
import { C } from "../lib/theme.js";
import {
  PageHeader,
  Kpi,
  EmptyState,
  Spinner,
  NiceDate,
  NiceSelect,
  AdToggle,
} from "../components/ui.jsx";

const money = (n) => Number(n || 0).toLocaleString("ru-RU");
const num = (n) => (Number(n) || 0).toLocaleString("ru-RU");
const ymd = (d) => d.toISOString().slice(0, 10);
const today = () => ymd(new Date());
const monthAgo = (m) => {
  const d = new Date();
  d.setMonth(d.getMonth() - m);
  return ymd(d);
};
const firstOfMonth = () => {
  const d = new Date();
  return ymd(new Date(d.getFullYear(), d.getMonth(), 1));
};

const FLAG = {
  spike: { label: "Резкий рост", bg: "#FEE2E2", fg: "#DC2626" },
  watch: { label: "Под наблюдением", bg: "#FEF3C7", fg: "#B45309" },
  drop: { label: "Резкое падение", bg: "#DBEAFE", fg: "#2563EB" },
  normal: { label: "Норма", bg: "#F1F5F9", fg: "#64748B" },
  new: { label: "Новый", bg: "#F1F5F9", fg: "#94A3B8" },
};
const STOCK = {
  negative: { label: "Минус", bg: "#FEE2E2", fg: "#DC2626" },
  critical: { label: "Критично", bg: "#FEE2E2", fg: "#DC2626" },
  low: { label: "Мало", bg: "#FEF3C7", fg: "#B45309" },
  ok: { label: "Норма", bg: "#DCFCE7", fg: "#15803D" },
};
const MOVE = {
  impossible: { label: "Невозможно", bg: "#FEE2E2", fg: "#DC2626" },
  negativeStock: { label: "Минус остаток", bg: "#FEF3C7", fg: "#B45309" },
  ok: { label: "OK", bg: "#F1F5F9", fg: "#64748B" },
};

function Pill({ meta }) {
  return (
    <span
      className="rounded-full px-2 py-0.5"
      style={{
        fontSize: 11,
        fontWeight: 700,
        background: meta.bg,
        color: meta.fg,
        whiteSpace: "nowrap",
      }}
    >
      {meta.label}
    </span>
  );
}

const TABS = [
  { key: "trends", label: "Цены", icon: TrendingUp },
  { key: "stock", label: "Остатки", icon: Boxes },
  { key: "movement", label: "Движение", icon: ArrowRightLeft },
  { key: "config", label: "Правила", icon: SlidersHorizontal },
];

export default function Procurement({ notify, role }) {
  const canEdit = ["director", "finance", "sysadmin", "owner"].includes(role);
  const canConfig = ["director", "sysadmin", "owner"].includes(role);
  const [tab, setTab] = useState("trends");

  return (
    <div className="space-y-4">
      <PageHeader
        icon={PackageSearch}
        title="Закупки и склад"
        subtitle="Контроль цен закупки (с учётом сезона), остатков и движения товара"
      />

      {/* Вкладки */}
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => {
          const on = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 font-semibold"
              style={{
                fontSize: 13,
                background: on ? C.brandA : "#fff",
                color: on ? "#fff" : C.sub,
                border: `1px solid ${on ? C.brandA : C.border}`,
              }}
            >
              <t.icon size={15} /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === "trends" && <TrendsTab notify={notify} canEdit={canEdit} />}
      {tab === "stock" && <StockTab />}
      {tab === "movement" && <MovementTab />}
      {tab === "config" && <ConfigTab notify={notify} canConfig={canConfig} />}
    </div>
  );
}

function ErrBox({ text }) {
  return (
    <div
      className="rounded-xl px-3 py-2 flex items-center gap-2"
      style={{ background: "#FEF3C7", color: "#92400E", fontSize: 13 }}
    >
      <AlertTriangle size={16} /> {text}
    </div>
  );
}

// ── Тренд цен + синхронизация ───────────────────────────────────────────────
function TrendsTab({ notify, canEdit }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [from, setFrom] = useState(monthAgo(3));
  const [to, setTo] = useState(today());
  const [onlySignals, setOnlySignals] = useState(false);
  const [diag, setDiag] = useState(null);

  const load = () => {
    setLoading(true);
    apiGet("/api/procurement/price-trends?months=24")
      .then((d) => {
        setData(d);
        setErr("");
      })
      .catch((e) => setErr(e.message || "Не удалось загрузить"))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load();
  }, []);

  const sync = async () => {
    setSyncing(true);
    setDiag(null);
    try {
      const r = await apiPost("/api/procurement/sync", { from, to });
      if (r.error) {
        notify && notify(r.error);
        setDiag(r);
      } else if (r.itemCount > 0) {
        notify &&
          notify(
            `Синхронизировано: документов ${r.docCount}, позиций ${r.itemCount}`,
          );
        load();
      } else {
        // Ничего не сохранили — показываем диагностику (что вернул iiko).
        notify &&
          notify(
            `Накладных за период: ${r.docCount || 0}. Данных для цен нет — см. диагностику ниже.`,
          );
        setDiag(r);
      }
    } catch (e) {
      notify && notify(e.message || "Ошибка синхронизации");
    } finally {
      setSyncing(false);
    }
  };

  const rows = (data?.rows || []).filter((r) =>
    onlySignals ? r.flag === "spike" || r.flag === "watch" : true,
  );
  const s = data?.summary || {};

  return (
    <div className="space-y-3">
      {/* Синхронизация */}
      {canEdit && (
        <div
          className="rounded-2xl bg-white p-3 flex flex-wrap items-end gap-2"
          style={{ border: `1px solid ${C.border}` }}
        >
          <NiceDate label="С" value={from} onChange={setFrom} width={140} />
          <NiceDate label="По" value={to} onChange={setTo} width={140} />
          <button
            onClick={sync}
            disabled={syncing}
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 font-semibold text-white"
            style={{
              background: C.brandA,
              fontSize: 13,
              opacity: syncing ? 0.7 : 1,
            }}
          >
            <RefreshCw size={15} className={syncing ? "animate-spin" : ""} />
            {syncing ? "Синхронизация…" : "Синхронизировать из iiko"}
          </button>
          <div style={{ fontSize: 11.5, color: C.faint, alignSelf: "center" }}>
            Тянет приходные накладные за период в историю цен
          </div>
        </div>
      )}

      {diag && (
        <div
          className="rounded-2xl p-3"
          style={{ background: "#FFFBEB", border: "1px solid #FDE68A" }}
        >
          <div
            className="font-bold mb-1"
            style={{ color: "#92400E", fontSize: 13 }}
          >
            Диагностика синхронизации
          </div>
          <div style={{ fontSize: 12, color: "#78350F", lineHeight: 1.6 }}>
            {diag.error ? (
              <div>{diag.error}</div>
            ) : (
              <>
                Накладных получено: <b>{diag.docCount ?? 0}</b> · позиций
                разобрано: <b>{diag.entriesParsed ?? 0}</b>
                {diag.droppedBadDate ? (
                  <>
                    {" "}
                    · отброшено из-за даты: <b>{diag.droppedBadDate}</b>
                  </>
                ) : null}
                {typeof diag.bytes === "number" ? (
                  <>
                    {" "}
                    · ответ iiko: <b>{diag.bytes}</b> байт
                  </>
                ) : null}
              </>
            )}
          </div>
          {diag.rawFirst ? (
            <pre
              className="mt-2 overflow-x-auto"
              style={{
                fontSize: 10.5,
                background: "#Fff",
                border: "1px solid #FDE68A",
                borderRadius: 8,
                padding: 8,
                maxHeight: 220,
                whiteSpace: "pre-wrap",
                color: "#57430E",
              }}
            >
              {diag.rawFirst}
            </pre>
          ) : diag.sample ? (
            <pre
              className="mt-2 overflow-x-auto"
              style={{
                fontSize: 10.5,
                background: "#fff",
                border: "1px solid #FDE68A",
                borderRadius: 8,
                padding: 8,
                maxHeight: 220,
                whiteSpace: "pre-wrap",
                color: "#57430E",
              }}
            >
              {diag.sample}
            </pre>
          ) : null}
          <div style={{ fontSize: 11, color: "#92400E", marginTop: 6 }}>
            Пришлите этот блок разработчику — по нему настроим разбор формата
            накладных вашего iiko.
          </div>
        </div>
      )}

      {err && <ErrBox text={err} />}
      {loading ? (
        <Spinner label="Загрузка тренда цен…" />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Kpi
              label="Резкий рост"
              value={String(s.spike || 0)}
              tone={C.bad}
            />
            <Kpi
              label="Под наблюдением"
              value={String(s.watch || 0)}
              tone={C.warn}
            />
            <Kpi
              label="Товаров всего"
              value={String(s.total || 0)}
              tone={C.faint}
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setOnlySignals((v) => !v)}
              className="rounded-lg px-2.5 py-1.5 font-semibold"
              style={{
                fontSize: 12,
                border: `1px solid ${C.border}`,
                background: onlySignals ? "#FEF3C7" : "#fff",
                color: onlySignals ? "#92400E" : C.sub,
              }}
            >
              {onlySignals ? "Показаны только сигналы" : "Только сигналы"}
            </button>
          </div>

          {rows.length === 0 ? (
            <EmptyState
              icon={TrendingUp}
              title="Нет данных по ценам"
              hint="Синхронизируйте приходные накладные из iiko — появится история и сигналы о скачках цен."
            />
          ) : (
            <div
              className="rounded-2xl bg-white p-3 overflow-x-auto"
              style={{ border: `1px solid ${C.border}` }}
            >
              <table className="w-full" style={{ fontSize: 12.5 }}>
                <thead>
                  <tr style={{ color: C.faint, textAlign: "left" }}>
                    <th className="pb-2 pr-2 font-semibold">Товар</th>
                    <th className="pb-2 pr-2 font-semibold text-right">Цена</th>
                    <th className="pb-2 pr-2 font-semibold text-right">
                      Норма
                    </th>
                    <th className="pb-2 pr-2 font-semibold text-right">Δ</th>
                    <th className="pb-2 font-semibold">Сигнал</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 400).map((r) => (
                    <tr
                      key={r.productId}
                      style={{ borderTop: `1px solid ${C.line}` }}
                    >
                      <td
                        className="py-2 pr-2"
                        style={{ color: C.ink, fontWeight: 600 }}
                      >
                        {r.name}
                        {r.baselineKind === "seasonal" && (
                          <span style={{ color: C.faint, fontWeight: 500 }}>
                            {" "}
                            · сезон
                          </span>
                        )}
                      </td>
                      <td
                        className="py-2 pr-2 text-right"
                        style={{ color: C.ink }}
                      >
                        {money(r.lastPrice)}
                      </td>
                      <td
                        className="py-2 pr-2 text-right"
                        style={{ color: C.sub }}
                      >
                        {r.baseline != null ? money(r.baseline) : "—"}
                      </td>
                      <td
                        className="py-2 pr-2 text-right"
                        style={{
                          fontWeight: 700,
                          color:
                            r.deltaPct > 0
                              ? C.bad
                              : r.deltaPct < 0
                                ? "#2563EB"
                                : C.faint,
                        }}
                      >
                        {r.flag === "new"
                          ? "—"
                          : `${r.deltaPct > 0 ? "+" : ""}${r.deltaPct}%`}
                      </td>
                      <td className="py-2">
                        <Pill meta={FLAG[r.flag] || FLAG.normal} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Остатки ─────────────────────────────────────────────────────────────────
function StockTab() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState("30");

  const load = () => {
    setLoading(true);
    apiGet(`/api/procurement/stock?days=${days}`)
      .then((d) => {
        setData(d);
        setErr("");
      })
      .catch((e) => setErr(e.message || "Не удалось загрузить"))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  const rows = data?.rows || [];
  const s = data?.summary || {};

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <NiceSelect
          value={days}
          onChange={setDays}
          options={[
            { value: "14", label: "Расход за 14 дней" },
            { value: "30", label: "Расход за 30 дней" },
            { value: "60", label: "Расход за 60 дней" },
          ]}
          width={200}
        />
      </div>
      {err && <ErrBox text={err} />}
      {loading ? (
        <Spinner label="Загрузка остатков…" />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Kpi
              label="Критично"
              value={String(s.critical || 0)}
              tone={C.bad}
            />
            <Kpi label="Мало" value={String(s.low || 0)} tone={C.warn} />
            <Kpi
              label="Минус остаток"
              value={String(s.negative || 0)}
              tone={C.bad}
            />
          </div>
          {rows.length === 0 ? (
            <EmptyState
              icon={Boxes}
              title="Нет данных по остаткам"
              hint="Проверьте, что в iiko ведётся складской учёт и заданы права доступа."
            />
          ) : (
            <div
              className="rounded-2xl bg-white p-3 overflow-x-auto"
              style={{ border: `1px solid ${C.border}` }}
            >
              <table className="w-full" style={{ fontSize: 12.5 }}>
                <thead>
                  <tr style={{ color: C.faint, textAlign: "left" }}>
                    <th className="pb-2 pr-2 font-semibold">Товар</th>
                    <th className="pb-2 pr-2 font-semibold text-right">
                      Остаток
                    </th>
                    <th className="pb-2 pr-2 font-semibold text-right">
                      Хватит на
                    </th>
                    <th className="pb-2 pr-2 font-semibold text-right">
                      Заказать
                    </th>
                    <th className="pb-2 font-semibold">Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 400).map((r) => (
                    <tr
                      key={r.productId}
                      style={{ borderTop: `1px solid ${C.line}` }}
                    >
                      <td
                        className="py-2 pr-2"
                        style={{ color: C.ink, fontWeight: 600 }}
                      >
                        {r.name}
                      </td>
                      <td
                        className="py-2 pr-2 text-right"
                        style={{ color: C.ink }}
                      >
                        {num(r.stock)}
                      </td>
                      <td
                        className="py-2 pr-2 text-right"
                        style={{ color: C.sub }}
                      >
                        {r.daysCover == null ? "—" : `${r.daysCover} дн.`}
                      </td>
                      <td
                        className="py-2 pr-2 text-right"
                        style={{
                          color: r.suggestedOrder > 0 ? C.brandA : C.faint,
                          fontWeight: r.suggestedOrder > 0 ? 700 : 400,
                        }}
                      >
                        {r.suggestedOrder > 0 ? num(r.suggestedOrder) : "—"}
                      </td>
                      <td className="py-2">
                        <Pill meta={STOCK[r.status] || STOCK.ok} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Движение товара ─────────────────────────────────────────────────────────
function MovementTab() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(today());

  const load = () => {
    setLoading(true);
    apiGet(`/api/procurement/movement?from=${from}&to=${to}`)
      .then((d) => {
        setData(d);
        setErr("");
      })
      .catch((e) => setErr(e.message || "Не удалось загрузить"))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = data?.rows || [];
  const s = data?.summary || {};

  return (
    <div className="space-y-3">
      <div
        className="rounded-2xl bg-white p-3 flex flex-wrap items-end gap-2"
        style={{ border: `1px solid ${C.border}` }}
      >
        <NiceDate label="С" value={from} onChange={setFrom} width={140} />
        <NiceDate label="По" value={to} onChange={setTo} width={140} />
        <button
          onClick={load}
          className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 font-semibold"
          style={{
            border: `1px solid ${C.border}`,
            color: C.sub,
            fontSize: 13,
          }}
        >
          <RefreshCw size={14} /> Показать
        </button>
      </div>
      {err && <ErrBox text={err} />}
      {loading ? (
        <Spinner label="Загрузка движения…" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Kpi
              label="Невозможные ситуации"
              value={String(s.impossible || 0)}
              tone={C.bad}
            />
            <Kpi
              label="Минусовой остаток"
              value={String(s.negativeStock || 0)}
              tone={C.warn}
            />
          </div>
          {rows.length === 0 ? (
            <EmptyState
              icon={ArrowRightLeft}
              title="Нет движения за период"
              hint="Выберите период и нажмите «Показать»."
            />
          ) : (
            <div
              className="rounded-2xl bg-white p-3 overflow-x-auto"
              style={{ border: `1px solid ${C.border}` }}
            >
              <table className="w-full" style={{ fontSize: 12.5 }}>
                <thead>
                  <tr style={{ color: C.faint, textAlign: "left" }}>
                    <th className="pb-2 pr-2 font-semibold">Товар</th>
                    <th className="pb-2 pr-2 font-semibold text-right">
                      Начало
                    </th>
                    <th className="pb-2 pr-2 font-semibold text-right">
                      Приход
                    </th>
                    <th className="pb-2 pr-2 font-semibold text-right">
                      Расход
                    </th>
                    <th className="pb-2 pr-2 font-semibold text-right">
                      Конец
                    </th>
                    <th className="pb-2 font-semibold">Флаг</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 400).map((r) => (
                    <tr
                      key={r.productId}
                      style={{ borderTop: `1px solid ${C.line}` }}
                    >
                      <td
                        className="py-2 pr-2"
                        style={{ color: C.ink, fontWeight: 600 }}
                      >
                        {r.name}
                      </td>
                      <td
                        className="py-2 pr-2 text-right"
                        style={{ color: C.sub }}
                      >
                        {num(r.open)}
                      </td>
                      <td
                        className="py-2 pr-2 text-right"
                        style={{ color: C.ink }}
                      >
                        {num(r.income)}
                      </td>
                      <td
                        className="py-2 pr-2 text-right"
                        style={{ color: C.ink }}
                      >
                        {num(r.consumption)}
                      </td>
                      <td
                        className="py-2 pr-2 text-right"
                        style={{ color: C.sub }}
                      >
                        {num(r.close)}
                      </td>
                      <td className="py-2">
                        <Pill meta={MOVE[r.flag] || MOVE.ok} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Конструктор правил (настройки) ──────────────────────────────────────────
function ConfigTab({ notify, canConfig }) {
  const [cfg, setCfg] = useState(null);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);

  const checkNow = async () => {
    setChecking(true);
    try {
      const r = await apiPost("/api/procurement/check-now");
      if (r.skipped) {
        notify &&
          notify(
            r.reason === "notify_off"
              ? "Сигналы в Telegram выключены в правилах"
              : "Telegram не настроен на сервере",
          );
      } else {
        notify &&
          notify(
            `Проверка выполнена: отправлено ${r.sent}, повторов пропущено ${r.duplicatesSkipped}`,
          );
      }
    } catch (e) {
      notify && notify(e.message || "Ошибка проверки");
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    apiGet("/api/procurement/config")
      .then(setCfg)
      .catch((e) => setErr(e.message || "Не удалось загрузить"));
  }, []);

  const set = (k, v) => setCfg((c) => ({ ...c, [k]: v }));
  const numField = (k, label, hint) => (
    <label className="block">
      <div style={{ fontSize: 12, color: C.faint, fontWeight: 600 }}>
        {label}
      </div>
      <input
        type="number"
        value={cfg[k]}
        disabled={!canConfig}
        onChange={(e) => set(k, Number(e.target.value))}
        className="w-full rounded-xl px-3 py-2 mt-1"
        style={{
          border: `1px solid ${C.border}`,
          fontSize: 14,
          background: canConfig ? "#fff" : "#F1F5F9",
        }}
      />
      {hint && (
        <div style={{ fontSize: 11.5, color: C.faint, marginTop: 2 }}>
          {hint}
        </div>
      )}
    </label>
  );

  const save = async () => {
    setSaving(true);
    try {
      const saved = await apiPut("/api/procurement/config", cfg);
      setCfg(saved);
      notify && notify("Настройки сохранены");
    } catch (e) {
      notify && notify(e.message || "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  };

  if (err) return <ErrBox text={err} />;
  if (!cfg) return <Spinner label="Загрузка настроек…" />;

  return (
    <div
      className="rounded-2xl bg-white p-4 sm:p-5 space-y-4"
      style={{ border: `1px solid ${C.border}` }}
    >
      <div>
        <h3 className="font-bold" style={{ color: C.ink, fontSize: 15 }}>
          Конструктор правил
        </h3>
        <p style={{ fontSize: 12.5, color: C.sub }}>
          Пороги сигналов и метод контроля остатков. Всё настраивается — модуль
          универсален для любого бизнеса.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {numField(
          "spikeThresholdPct",
          "Порог «резкий рост», %",
          "Сигнал spike при росте цены к норме",
        )}
        {numField("watchThresholdPct", "Порог «наблюдение», %", "Жёлтая зона")}
        {numField(
          "baselineWindow",
          "Окно базовой цены",
          "Сколько последних закупок берём",
        )}
        {numField(
          "seasonalYears",
          "Сезон: лет истории",
          "Для нормы того же месяца прошлых лет",
        )}
        {numField(
          "stockDaysCover",
          "Запас, дней",
          "Авто-минимум = средний расход × дней",
        )}
      </div>

      <label className="block">
        <div
          style={{
            fontSize: 12,
            color: C.faint,
            fontWeight: 600,
            marginBottom: 4,
          }}
        >
          Метод минимального остатка
        </div>
        <NiceSelect
          value={cfg.stockMethod}
          onChange={(v) => set("stockMethod", v)}
          options={[
            { value: "auto", label: "Авто (по расходу)" },
            { value: "manual", label: "Вручную" },
            { value: "both", label: "Оба (авто + ручное)" },
          ]}
          width="100%"
        />
      </label>

      <AdToggle
        label="Учитывать погоду (Open-Meteo)"
        hint="Контекст сезонного роста цен, без ключа"
        checked={cfg.weatherEnabled}
        onChange={(v) => canConfig && set("weatherEnabled", v)}
      />
      <AdToggle
        label="Сигналы в Telegram"
        hint="Присылать резкий рост цен и нехватку остатков"
        checked={cfg.notifyTelegram}
        onChange={(v) => canConfig && set("notifyTelegram", v)}
      />

      {canConfig && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 font-bold text-white"
            style={{
              background: C.brandA,
              fontSize: 14,
              opacity: saving ? 0.7 : 1,
            }}
          >
            <Save size={16} /> {saving ? "Сохранение…" : "Сохранить правила"}
          </button>
          <button
            onClick={checkNow}
            disabled={checking}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 font-semibold"
            style={{
              border: `1px solid ${C.border}`,
              color: C.sub,
              fontSize: 14,
              opacity: checking ? 0.7 : 1,
            }}
          >
            <RefreshCw size={16} className={checking ? "animate-spin" : ""} />
            {checking ? "Проверка…" : "Проверить сигналы сейчас"}
          </button>
        </div>
      )}
    </div>
  );
}
