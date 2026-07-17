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
  Receipt,
  Upload,
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
  CountUp,
} from "../components/ui.jsx";

const money = (n) => Number(n || 0).toLocaleString("ru-RU");
// Дата/время загрузки отчёта — в часовом поясе ресторана (Ташкент).
const fmtImported = (v) => {
  const d = new Date(v);
  if (isNaN(d)) return "";
  return d.toLocaleString("ru-RU", {
    timeZone: "Asia/Tashkent",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};
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
  { key: "debts", label: "Долги", icon: Receipt },
  { key: "config", label: "Правила", icon: SlidersHorizontal },
];

export default function Procurement({ notify, role }) {
  const canEdit = ["director", "finance", "sysadmin", "owner"].includes(role);
  const canConfig = ["director", "sysadmin", "owner"].includes(role);
  const [tab, setTab] = useState("trends");
  // Список складов iiko (филиалы) и выбранный склад — общий фильтр «по филиалам»
  // для вкладок Цены/Остатки/Движение. Пустая строка — все филиалы.
  const [stores, setStores] = useState([]);
  const [store, setStore] = useState("");

  useEffect(() => {
    apiGet("/api/procurement/stores")
      .then((d) => setStores(d.stores || []))
      .catch(() => setStores([]));
  }, []);

  // Селектор филиала показываем только там, где он влияет на данные.
  const showFilial = ["trends", "stock", "movement"].includes(tab);
  const storeOptions = [
    { value: "", label: "Все филиалы" },
    ...stores.map((s) => ({ value: s.id, label: s.name || s.code || s.id })),
  ];

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

      {/* Фильтр по филиалу (складу) — общий для Цены/Остатки/Движение */}
      {showFilial && stores.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span style={{ fontSize: 12.5, color: C.faint, fontWeight: 600 }}>
            Филиал:
          </span>
          <NiceSelect
            value={store}
            onChange={setStore}
            options={storeOptions}
            width={240}
          />
          {store && (
            <span style={{ fontSize: 11.5, color: C.faint }}>
              Показаны данные выбранного филиала
            </span>
          )}
        </div>
      )}

      {tab === "trends" && (
        <TrendsTab notify={notify} canEdit={canEdit} store={store} />
      )}
      {tab === "stock" && <StockTab store={store} />}
      {tab === "movement" && <MovementTab store={store} />}
      {tab === "debts" && <DebtsTab notify={notify} />}
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
function TrendsTab({ notify, canEdit, store = "" }) {
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
    const q = store ? `&store=${encodeURIComponent(store)}` : "";
    apiGet(`/api/procurement/price-trends?months=24${q}`)
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
  }, [store]);

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
function StockTab({ store = "" }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState("30");

  const load = () => {
    setLoading(true);
    const q = store ? `&store=${encodeURIComponent(store)}` : "";
    apiGet(`/api/procurement/stock?days=${days}${q}`)
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
  }, [days, store]);

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
function MovementTab({ store = "" }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(today());

  const load = () => {
    setLoading(true);
    const q = store ? `&store=${encodeURIComponent(store)}` : "";
    apiGet(`/api/procurement/movement?from=${from}&to=${to}${q}`)
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
  }, [store]);

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
          onClick={() => load()}
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

// ── Долги поставщикам ───────────────────────────────────────────────────────
function DebtsTab({ notify }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [iikoDiag, setIikoDiag] = useState(null);
  // Фильтр по складу (филиалу) — по названию из отчёта. Пусто — все филиалы.
  const [wh, setWh] = useState("");
  // Фильтр по торговому предприятию (для тяги из iiko). Пусто — вся сеть.
  const [dept, setDept] = useState("");
  // Исключённые поставщики (гибкий отчёт) — не учитываются в итоге.
  const [excluded, setExcluded] = useState(() => new Set());

  // Долг напрямую из iiko (OLAP-отчёт по проводкам). fresh — принудительно
  // мимо кэша (кнопка «Тянуть из iiko»); notify — показывать уведомления.
  const pullIiko = async (
    fresh = true,
    withNotify = true,
    department = dept,
  ) => {
    setPulling(true);
    try {
      const params = new URLSearchParams();
      if (fresh) params.set("fresh", "1");
      if (department) params.set("department", department);
      const qs = params.toString();
      const r = await apiGet(
        `/api/procurement/debts-iiko${qs ? `?${qs}` : ""}`,
      );
      if (r.error) {
        if (withNotify) notify && notify(r.error);
        return false;
      }
      setData(r);
      setErr("");
      setWh("");
      if (withNotify)
        notify &&
          notify(
            r.count > 0
              ? `Из iiko: поставщиков с долгом ${r.count}`
              : "Из iiko: долг по поставщикам не распознан — см. диагностику ниже",
          );
      // Диагностику показываем только если долг не распознан (для настройки).
      setIikoDiag(r.count > 0 ? null : r);
      return r.count > 0;
    } catch (e) {
      if (withNotify) notify && notify(e.message || "Ошибка запроса к iiko");
      return false;
    } finally {
      setPulling(false);
    }
  };

  // Импорт/баланс из БД (запасной источник, если тяга из iiko не удалась).
  const load = (warehouse = wh) => {
    setLoading(true);
    const q = warehouse ? `?warehouse=${encodeURIComponent(warehouse)}` : "";
    return apiGet(`/api/procurement/debts${q}`)
      .then((d) => {
        setData(d);
        setErr("");
      })
      .catch((e) => setErr(e.message || "Не удалось загрузить"))
      .finally(() => setLoading(false));
  };

  // При открытии сразу тянем свежие данные из iiko (из кэша — быстро). Если
  // iiko недоступен/пусто — показываем импорт или баланс из БД.
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const ok = await pullIiko(false, false);
      if (alive && !ok) await load();
      if (alive) setLoading(false);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Смена филиала — только для импортированного отчёта (у iiko-тяги фильтра нет).
  useEffect(() => {
    if (data?.source === "import") load(wh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wh]);

  // Загрузка отчёта iiko «Задолженность перед контрагентами» (Excel) →
  // реальный долг по каждому поставщику. Файл читаем как base64 и шлём на сервер.
  const onFile = (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!f) return;
    setImporting(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const r = await apiPost("/api/procurement/debts-import", {
          file: String(reader.result),
        });
        if (r.error) notify && notify(r.error);
        else
          notify &&
            notify(
              `Загружено: документов ${r.imported}, поставщиков ${r.suppliers}`,
            );
        load();
      } catch (er) {
        notify && notify(er.message || "Ошибка импорта");
      } finally {
        setImporting(false);
      }
    };
    reader.onerror = () => setImporting(false);
    reader.readAsDataURL(f);
  };

  const allRows = (data?.rows || []).filter((r) => r.debt > 0);
  // «Гибкий отчёт»: исключённые поставщики видны, но не входят в итог.
  const rows = allRows.filter((r) => !excluded.has(r.name));
  const shownTotal = rows.reduce((s, r) => s + (r.debt || 0), 0);
  const isOlap = data?.source === "iiko-olap";
  const toggleExcluded = (name) =>
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() =>
            data?.source === "import" ? load() : pullIiko(true, false)
          }
          className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 font-semibold"
          style={{
            border: `1px solid ${C.border}`,
            color: C.sub,
            fontSize: 13,
          }}
        >
          <RefreshCw size={14} /> Обновить
        </button>
        <button
          onClick={() => pullIiko(true, true)}
          disabled={pulling}
          className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 font-semibold text-white"
          style={{
            background: C.brandA,
            fontSize: 13,
            opacity: pulling ? 0.7 : 1,
          }}
        >
          <RefreshCw size={14} className={pulling ? "animate-spin" : ""} />
          {pulling ? "Тянем из iiko…" : "Тянуть из iiko"}
        </button>
        <label
          className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 font-semibold cursor-pointer"
          style={{
            border: `1px solid ${importing ? C.border : C.brandA}`,
            color: importing ? C.faint : "#fff",
            background: importing ? "#F1F5F9" : C.brandA,
            fontSize: 13,
          }}
        >
          <Upload size={14} />
          {importing ? "Загрузка…" : "Загрузить отчёт (Excel)"}
          <input
            type="file"
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={onFile}
            disabled={importing}
            style={{ display: "none" }}
          />
        </label>
        <div style={{ fontSize: 11.5, color: C.faint }}>
          {data?.source === "import" && data?.importedAt ? (
            <>
              Отчёт iiko «Задолженность перед контрагентами», загружен{" "}
              {fmtImported(data.importedAt)}
            </>
          ) : data?.source === "iiko-olap" ? (
            <>Долг по поставщикам из iiko (проводки) за текущий месяц</>
          ) : (
            <>
              Загрузите отчёт iiko «Задолженность перед контрагентами» (Excel) —
              покажем долг по каждому поставщику и просрочку
            </>
          )}
        </div>
      </div>

      {/* Диагностика тяги из iiko (OLAP-проводки): показываем, если долг не
          распознан — чтобы настроить разбор под конкретный сервер. */}
      {iikoDiag && (
        <div
          className="rounded-2xl p-3"
          style={{ background: "#FFFBEB", border: "1px solid #FDE68A" }}
        >
          <div
            className="font-bold mb-1"
            style={{ color: "#92400E", fontSize: 13 }}
          >
            Диагностика «Тянуть из iiko» (OLAP-проводки)
          </div>
          <pre
            className="overflow-x-auto"
            style={{
              fontSize: 10.5,
              background: "#fff",
              border: "1px solid #FDE68A",
              borderRadius: 8,
              padding: 8,
              maxHeight: 280,
              whiteSpace: "pre-wrap",
              color: "#57430E",
            }}
          >
            {`Выбранные поля: ${JSON.stringify(iikoDiag.fields || {})}
Строк в ответе: ${iikoDiag.rawCount ?? "—"}, распознано долгов: ${iikoDiag.count ?? 0}
Типы контрагентов в ответе: ${(iikoDiag.typesSeen || []).join(", ") || "—"}

Пример строки:
${iikoDiag.sampleRow || "—"}

Поля (код = название):
${(iikoDiag.columnsDetail || iikoDiag.columnsSample || []).join("\n") || "—"}`}
          </pre>
          <div style={{ fontSize: 11, color: "#92400E", marginTop: 6 }}>
            Пришлите этот блок разработчику — по нему настроим точный разбор
            долга по поставщикам из iiko.
          </div>
        </div>
      )}

      {/* Фильтр по филиалу (складу) — из отчёта, по названию склада */}
      {data?.source === "import" && (data?.byWarehouse || []).length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span style={{ fontSize: 12.5, color: C.faint, fontWeight: 600 }}>
            Филиал:
          </span>
          <NiceSelect
            value={wh}
            onChange={setWh}
            options={[
              { value: "", label: "Все филиалы" },
              ...(data?.byWarehouse || []).map((w) => ({
                value: w.warehouse,
                label: `${w.warehouse} · ${money(w.debt)} сум`,
              })),
            ]}
            width={300}
          />
        </div>
      )}

      {/* Фильтр по торговому предприятию (филиалу) — для тяги из iiko */}
      {isOlap && (data?.enterprises || []).length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span style={{ fontSize: 12.5, color: C.faint, fontWeight: 600 }}>
            Филиал:
          </span>
          <NiceSelect
            value={dept}
            onChange={(v) => {
              setDept(v);
              pullIiko(false, false, v);
            }}
            options={[
              { value: "", label: "Вся сеть" },
              ...(data?.byEnterprise || []).map((e) => ({
                value: e.name,
                label: `${e.name} · ${money(e.debt)} сум`,
              })),
            ]}
            width={320}
          />
          {excluded.size > 0 && (
            <button
              onClick={() => setExcluded(new Set())}
              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 font-semibold"
              style={{
                border: `1px solid ${C.border}`,
                color: C.sub,
                fontSize: 12,
              }}
            >
              Скрыто поставщиков: {excluded.size} · показать всех
            </button>
          )}
        </div>
      )}

      {data?.error && <ErrBox text={data.error} />}
      {err && <ErrBox text={err} />}

      {loading ? (
        <Spinner label="Загрузка задолженностей…" />
      ) : (
        <>
          <div
            className={`grid gap-2 ${
              data?.source === "import" ? "grid-cols-3" : "grid-cols-2"
            }`}
          >
            <Kpi
              label={
                excluded.size > 0
                  ? "Всего должны (без скрытых), сум"
                  : "Всего должны, сум"
              }
              value={
                <CountUp
                  to={excluded.size > 0 ? shownTotal : data?.totalDebt || 0}
                  format={money}
                />
              }
              tone={C.bad}
            />
            <Kpi
              label="Поставщиков с долгом"
              value={String(rows.length)}
              tone={C.warn}
            />
            {data?.source === "import" && (
              <Kpi
                label="Просрочено, сум"
                value={<CountUp to={data?.overdueTotal || 0} format={money} />}
                tone={C.bad}
              />
            )}
          </div>

          {/* Разбивка долга по филиалам (складам) */}
          {data?.source === "import" &&
            !wh &&
            (data?.byWarehouse || []).length > 1 && (
              <div
                className="rounded-2xl bg-white p-3 overflow-x-auto"
                style={{ border: `1px solid ${C.border}` }}
              >
                <div
                  className="font-bold mb-2"
                  style={{ color: C.ink, fontSize: 13 }}
                >
                  По филиалам (складам)
                </div>
                <table className="w-full" style={{ fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ color: C.faint, textAlign: "left" }}>
                      <th className="pb-2 pr-2 font-semibold">
                        Филиал / склад
                      </th>
                      <th className="pb-2 pr-2 font-semibold text-right">
                        Поставщиков
                      </th>
                      <th className="pb-2 pr-2 font-semibold text-right">
                        Просрочено, сум
                      </th>
                      <th className="pb-2 font-semibold text-right">
                        Долг, сум
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.byWarehouse || []).map((w) => (
                      <tr
                        key={w.warehouse}
                        onClick={() => setWh(w.warehouse)}
                        style={{
                          borderTop: `1px solid ${C.line}`,
                          cursor: "pointer",
                        }}
                      >
                        <td
                          className="py-2 pr-2"
                          style={{ color: C.ink, fontWeight: 600 }}
                        >
                          {w.warehouse}
                        </td>
                        <td
                          className="py-2 pr-2 text-right"
                          style={{ color: C.sub }}
                        >
                          {w.suppliers}
                        </td>
                        <td
                          className="py-2 pr-2 text-right"
                          style={{
                            color: w.overdueDebt > 0 ? C.bad : C.faint,
                            fontWeight: w.overdueDebt > 0 ? 700 : 400,
                          }}
                        >
                          {w.overdueDebt > 0 ? money(w.overdueDebt) : "—"}
                        </td>
                        <td
                          className="py-2 text-right"
                          style={{ color: C.bad, fontWeight: 700 }}
                        >
                          {money(w.debt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ fontSize: 11, color: C.faint, marginTop: 6 }}>
                  Нажмите на филиал, чтобы показать долг только по нему.
                </div>
              </div>
            )}

          {(data?.rowSample || data?.suppliersRawFirst) && rows.length > 0 ? (
            <div
              className="rounded-2xl p-3"
              style={{ background: "#FFFBEB", border: "1px solid #FDE68A" }}
            >
              <div
                className="font-bold mb-1"
                style={{ color: "#92400E", fontSize: 13 }}
              >
                Диагностика: имена поставщиков не подставились
              </div>
              <pre
                className="overflow-x-auto"
                style={{
                  fontSize: 10.5,
                  background: "#fff",
                  border: "1px solid #FDE68A",
                  borderRadius: 8,
                  padding: 8,
                  maxHeight: 240,
                  whiteSpace: "pre-wrap",
                  color: "#57430E",
                }}
              >
                {`Строка баланса: ${data.rowSample || "—"}\n\nСправочник: ${data.suppliersRawFirst || "—"}`}
              </pre>
              <div style={{ fontSize: 11, color: "#92400E", marginTop: 6 }}>
                Пришлите этот блок разработчику — по нему подставим настоящие
                имена поставщиков.
              </div>
            </div>
          ) : null}

          {allRows.length === 0 ? (
            <>
              <EmptyState
                icon={Receipt}
                title="Задолженностей нет"
                hint="Либо всё оплачено, либо в iiko не ведутся взаиморасчёты с поставщиками."
              />
              {data &&
              data.raw === 0 &&
              (data.sample || data.suppliersRawFirst) ? (
                <div
                  className="rounded-2xl p-3"
                  style={{ background: "#FFFBEB", border: "1px solid #FDE68A" }}
                >
                  <div
                    className="font-bold mb-1"
                    style={{ color: "#92400E", fontSize: 13 }}
                  >
                    Диагностика (ответ iiko)
                  </div>
                  <pre
                    className="overflow-x-auto"
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
                    {data.sample || data.suppliersRawFirst}
                  </pre>
                  <div style={{ fontSize: 11, color: "#92400E", marginTop: 6 }}>
                    Пришлите разработчику — настроим разбор взаиморасчётов.
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <div
              className="rounded-2xl bg-white p-3 overflow-x-auto"
              style={{ border: `1px solid ${C.border}` }}
            >
              <table className="w-full" style={{ fontSize: 12.5 }}>
                <thead>
                  <tr style={{ color: C.faint, textAlign: "left" }}>
                    <th className="pb-2 pr-2 font-semibold">
                      {data?.source === "import" || data?.source === "iiko-olap"
                        ? "Поставщик"
                        : "Счёт / контрагент"}
                    </th>
                    {data?.source === "import" && (
                      <th className="pb-2 pr-2 font-semibold text-right">
                        Док.
                      </th>
                    )}
                    {data?.source === "import" && (
                      <th className="pb-2 pr-2 font-semibold text-right">
                        Просрочено, сум
                      </th>
                    )}
                    <th className="pb-2 font-semibold text-right">Долг, сум</th>
                  </tr>
                </thead>
                <tbody>
                  {allRows.slice(0, 400).map((r) => {
                    const off = excluded.has(r.name);
                    return (
                      <tr
                        key={r.supplierId || r.name}
                        style={{
                          borderTop: `1px solid ${C.line}`,
                          opacity: off ? 0.45 : 1,
                        }}
                      >
                        <td
                          className="py-2 pr-2"
                          style={{ color: C.ink, fontWeight: 600 }}
                        >
                          <button
                            onClick={() => toggleExcluded(r.name)}
                            title={off ? "Вернуть в отчёт" : "Скрыть из отчёта"}
                            style={{
                              marginRight: 8,
                              color: off ? C.ok : C.faint,
                              fontSize: 15,
                              lineHeight: 1,
                              fontWeight: 700,
                            }}
                          >
                            {off ? "+" : "×"}
                          </button>
                          <span
                            style={{
                              textDecoration: off ? "line-through" : "none",
                            }}
                          >
                            {r.name}
                          </span>
                        </td>
                        {data?.source === "import" && (
                          <td
                            className="py-2 pr-2 text-right"
                            style={{ color: C.sub }}
                          >
                            {r.docs || 0}
                          </td>
                        )}
                        {data?.source === "import" && (
                          <td
                            className="py-2 pr-2 text-right"
                            style={{
                              color: r.overdueDebt > 0 ? C.bad : C.faint,
                              fontWeight: r.overdueDebt > 0 ? 700 : 400,
                            }}
                          >
                            {r.overdueDebt > 0 ? money(r.overdueDebt) : "—"}
                          </td>
                        )}
                        <td
                          className="py-2 text-right"
                          style={{
                            color: C.bad,
                            fontWeight: 700,
                            textDecoration: off ? "line-through" : "none",
                          }}
                        >
                          {money(r.debt)}
                        </td>
                      </tr>
                    );
                  })}
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
