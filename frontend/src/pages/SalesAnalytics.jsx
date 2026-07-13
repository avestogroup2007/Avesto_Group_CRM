// Экран «Аналитика продаж» (и режим «Отчёты»): живые OLAP-данные iiko
// (выручка, ОПиУ, подозрительные операции) с демо-фолбэком.
import { useState, useEffect } from "react";
import IikoPanel from "../IikoPanel.jsx";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Cell,
  ResponsiveContainer,
  Tooltip,
  CartesianGrid,
} from "recharts";
import {
  Bot,
  AlertTriangle,
  Sparkles,
  Activity,
  TrendingUp,
} from "lucide-react";
import { apiPost } from "../api.js";
import { C } from "../lib/theme.js";
import { tr } from "../lib/i18n.js";
import { M, fmtSum, ymdNow } from "../lib/format.js";
import { branchById } from "../lib/org.js";
import { usePersisted } from "../lib/hooks.js";
import { NiceSelect, NiceDate } from "../components/ui.jsx";

/* --------------------------- аналитика продаж ------------------------------ */
// Каталог для аналитики. При подключении iiko заменяется реальной номенклатурой.
const PRODUCT_CATALOG = [
  { id: "p1", name: "Капучино", cat: "Кофе", price: 22000, w: 10 },
  { id: "p2", name: "Латте", cat: "Кофе", price: 25000, w: 9 },
  { id: "p3", name: "Американо", cat: "Кофе", price: 18000, w: 7 },
  { id: "p4", name: "Эспрессо", cat: "Кофе", price: 15000, w: 4 },
  { id: "p5", name: "Круассан", cat: "Выпечка", price: 20000, w: 8 },
  { id: "p6", name: "Самса", cat: "Выпечка", price: 15000, w: 9 },
  { id: "p7", name: "Слойка с сыром", cat: "Выпечка", price: 18000, w: 5 },
  { id: "p8", name: "Чизкейк", cat: "Десерты", price: 38000, w: 6 },
  { id: "p9", name: "Медовик", cat: "Десерты", price: 32000, w: 6 },
  { id: "p10", name: "Тирамису", cat: "Десерты", price: 40000, w: 4 },
  { id: "p11", name: "Эклер", cat: "Десерты", price: 22000, w: 5 },
  { id: "p12", name: "Плов", cat: "Горячее", price: 45000, w: 7 },
  { id: "p13", name: "Лагман", cat: "Горячее", price: 42000, w: 5 },
  { id: "p14", name: "Сэндвич", cat: "Горячее", price: 30000, w: 5 },
  { id: "p15", name: "Смузи", cat: "Напитки", price: 28000, w: 3 },
  { id: "p16", name: "Свежий сок", cat: "Напитки", price: 24000, w: 4 },
];
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function rand01(seed) {
  let x = hashStr(seed);
  x = (Math.imul(x, 1103515245) + 12345) >>> 0;
  return (x % 100000) / 100000;
}
// продажи товаров за конкретный день+филиал, распределённые из дневной выручки
function dayProductSales(dateStr, branchId, revenue) {
  if (!revenue || revenue <= 0) return [];
  const j = PRODUCT_CATALOG.map(
    (p) => p.w * (0.55 + 0.9 * rand01(dateStr + "|" + branchId + "|" + p.id)),
  );
  const tw = j.reduce((a, b) => a + b, 0) || 1;
  return PRODUCT_CATALOG.map((p, i) => {
    const qty = Math.max(0, Math.round(((j[i] / tw) * revenue) / p.price));
    return { id: p.id, name: p.name, cat: p.cat, qty, sum: qty * p.price };
  }).filter((x) => x.qty > 0);
}
// количество чеков за день+филиал (детерминированно; средний чек ~45–75к)
function dayChecks(dateStr, branchId, revenue) {
  if (!revenue || revenue <= 0) return 0;
  const avg =
    45000 + Math.round(rand01("chk|" + dateStr + "|" + branchId) * 30000);
  return Math.max(1, Math.round(revenue / avg));
}

// Живые продажи из iiko (OLAP) за период [from,to], опц. по филиалу (department).
// status: loading | ok | empty | off (iiko не настроен) | error.
function useIikoSales({ from, to, department }) {
  const [state, setState] = useState({ status: "loading" });
  useEffect(() => {
    let alive = true;
    setState({ status: "loading" });
    apiPost("/api/iiko/olap", { from, to, department: department || undefined })
      .then((res) => {
        if (!alive) return;
        const arr = (v) => (Array.isArray(v) ? v : []);
        const byDay = arr(res?.byDay);
        const byPay = arr(res?.byPay);
        const byDish = arr(res?.byDish);
        const byGroups = arr(res?.byGroups);
        const byHour = arr(res?.byHour);
        const byStaff = arr(res?.byStaff);
        const byHourDish = arr(res?.byHourDish);
        const num = (v) => {
          const n = Number(v);
          return Number.isFinite(n) ? n : 0;
        };
        // Выручка со скидкой (фактически оплачено); запасной — без скидки.
        const rev = (r) => num(r["DishDiscountSumInt"] ?? r["DishSumInt"]);
        // По дням.
        const dayMap = {};
        byDay.forEach((r) => {
          // OpenDate.Typed приходит как "2014.01.01" — приводим к ISO.
          const raw = r["OpenDate.Typed"] || r["OpenDate"] || r["Date"] || "";
          const key = String(raw).slice(0, 10).replace(/\./g, "-");
          if (!key) return;
          if (!dayMap[key]) dayMap[key] = { revenue: 0, qty: 0 };
          dayMap[key].revenue += rev(r);
          dayMap[key].qty += num(r["DishAmountInt"]);
        });
        const days = Object.keys(dayMap)
          .sort()
          .map((d) => ({
            date: d,
            revenue: dayMap[d].revenue,
            qty: dayMap[d].qty,
          }));
        const total = days.reduce((a, d) => a + d.revenue, 0);
        // Количество чеков — сумма уникальных заказов по всем строкам.
        const checks = byDay.reduce((a, r) => a + num(r["UniqOrderId"]), 0);
        // По типам оплат.
        const payMap = {};
        byPay.forEach((r) => {
          const name = r["PayTypes"] || "—";
          payMap[name] = (payMap[name] || 0) + rev(r);
        });
        const pay = Object.entries(payMap)
          .map(([name, value]) => ({ name, value }))
          .filter((p) => p.value > 0)
          .sort((a, b) => b.value - a.value);
        // По блюдам.
        const dishMap = {};
        byDish.forEach((r) => {
          const name = r["DishName"] || "—";
          if (!dishMap[name]) dishMap[name] = { name, qty: 0, sum: 0 };
          dishMap[name].sum += rev(r);
          dishMap[name].qty += num(r["DishAmountInt"]);
        });
        const products = Object.values(dishMap).sort((a, b) => b.sum - a.sum);
        // Детальные строки групп (все три уровня + блюдо) — для агрегации по
        // уровням и раскрытия группы до блюд (drill-down).
        const groupRows = byGroups.map((r) => ({
          g1: r["DishGroup.TopParent"] || "—",
          g2: r["DishGroup.SecondParent"] || "—",
          g3: r["DishGroup.ThirdParent"] || "—",
          name: r["DishName"] || "—",
          sum: rev(r),
          qty: num(r["DishAmountInt"]),
        }));
        const aggBy = (field) => {
          const m = {};
          groupRows.forEach((r) => {
            const name = r[field] || "—";
            if (!m[name]) m[name] = { name, qty: 0, sum: 0 };
            m[name].sum += r.sum;
            m[name].qty += r.qty;
          });
          return Object.values(m).sort((a, b) => b.sum - a.sum);
        };
        const group1 = aggBy("g1");
        const group2 = aggBy("g2");
        const group3 = aggBy("g3");
        // По часам открытия заказа (0–23): выручка, чеки, средний чек.
        const hourMap = {};
        byHour.forEach((r) => {
          const h = parseInt(
            String(r["HourOpen"] ?? r["Hour"] ?? "").replace(/[^\d]/g, ""),
            10,
          );
          if (!Number.isFinite(h)) return;
          if (!hourMap[h]) hourMap[h] = { revenue: 0, checks: 0, qty: 0 };
          hourMap[h].revenue += rev(r);
          hourMap[h].checks += num(r["UniqOrderId"]);
          hourMap[h].qty += num(r["DishAmountInt"]);
        });
        const hours = Array.from({ length: 24 }, (_, h) => {
          const m = hourMap[h] || { revenue: 0, checks: 0, qty: 0 };
          return {
            hour: h,
            revenue: m.revenue,
            checks: m.checks,
            qty: m.qty,
            avg: m.checks ? m.revenue / m.checks : 0,
          };
        });
        // Активность персонала: кто чаще открывает заказы (по официанту).
        const staffMap = {};
        byStaff.forEach((r) => {
          const name = r["OrderWaiter"] || r["Waiter"] || r["Cashier"] || "—";
          if (!staffMap[name]) staffMap[name] = { name, checks: 0, revenue: 0 };
          staffMap[name].checks += num(r["UniqOrderId"]);
          staffMap[name].revenue += rev(r);
        });
        const staff = Object.values(staffMap)
          .filter((x) => x.name && x.name !== "—")
          .sort((a, b) => b.checks - a.checks);
        // Блюда по часам: hour -> отсортированный список {name, qty, sum} —
        // чтобы по клику на час показать, что продавалось в этот час.
        const hourDishMap = {};
        byHourDish.forEach((r) => {
          const h = parseInt(
            String(r["HourOpen"] ?? "").replace(/[^\d]/g, ""),
            10,
          );
          if (!Number.isFinite(h)) return;
          const name = r["DishName"] || "—";
          if (!hourDishMap[h]) hourDishMap[h] = {};
          if (!hourDishMap[h][name])
            hourDishMap[h][name] = { name, qty: 0, sum: 0 };
          hourDishMap[h][name].qty += num(r["DishAmountInt"]);
          hourDishMap[h][name].sum += rev(r);
        });
        const hourProducts = {};
        Object.keys(hourDishMap).forEach((h) => {
          hourProducts[h] = Object.values(hourDishMap[h]).sort(
            (a, b) => b.sum - a.sum,
          );
        });
        setState({
          status: days.length ? "ok" : "empty",
          days,
          total,
          checks,
          pay,
          products,
          group1,
          group2,
          group3,
          groupRows,
          hours,
          staff,
          hourProducts,
        });
      })
      .catch((e) => {
        if (!alive) return;
        const msg = (e && e.message) || "";
        if (/configured|не настро/i.test(msg)) setState({ status: "off" });
        else setState({ status: "error", error: msg });
      });
    return () => {
      alive = false;
    };
  }, [from, to, department]);
  return state;
}

// Отчёт о прибылях и убытках (ОПиУ) из iiko — тянется по требованию (тяжёлый
// отчёт по балансам), поэтому только когда открыта вкладка.
function useIikoPnl({ from, to, department, enabled }) {
  const [state, setState] = useState({ status: "idle" });
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    setState({ status: "loading" });
    apiPost("/api/iiko/pnl", { from, to, department: department || undefined })
      .then((res) => {
        if (alive) setState({ status: "ok", data: res });
      })
      .catch((e) => {
        if (!alive) return;
        const msg = (e && e.message) || "";
        if (/configured|не настро/i.test(msg)) setState({ status: "off" });
        else setState({ status: "error", error: msg });
      });
    return () => {
      alive = false;
    };
  }, [from, to, department, enabled]);
  return state;
}

// Подозрительные операции (удаления/сторно заказов + крупные скидки в разрезе
// сотрудников) — тянем только при открытой вкладке.
function useIikoRisky({ from, to, department, enabled }) {
  const [state, setState] = useState({ status: "idle" });
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    setState({ status: "loading" });
    apiPost("/api/iiko/risky", {
      from,
      to,
      department: department || undefined,
    })
      .then((res) => {
        if (alive) setState({ status: "ok", data: res });
      })
      .catch((e) => {
        if (!alive) return;
        const msg = (e && e.message) || "";
        if (/configured|не настро/i.test(msg)) setState({ status: "off" });
        else setState({ status: "error", error: msg });
      });
    return () => {
      alive = false;
    };
  }, [from, to, department, enabled]);
  return state;
}

// Рендер отчёта по подозрительным операциям: удаления/сторно заказов и крупные
// скидки в разрезе сотрудников. Данные приходят из iiko (OLAP).
function RiskyView({ data }) {
  const t = data.totals || {};
  const deletions = data.deletions || [];
  const discounts = data.discounts || [];
  const pctThreshold = Math.round((data.discountPct || 0.3) * 100);
  const Card = ({ children }) => (
    <div
      className="rounded-2xl bg-white p-4 sm:p-5"
      style={{ border: `1px solid ${C.border}` }}
    >
      {children}
    </div>
  );
  const maxDel = Math.max(...deletions.map((x) => x.count), 1);
  const maxDisc = Math.max(...discounts.map((x) => x.discount), 1);
  return (
    <div className="space-y-4">
      {/* Сводка */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          ["Удалённых заказов", t.delCount || 0],
          ["Сумма удалений", fmtSum(t.delSum || 0)],
          ["Сумма скидок", fmtSum(t.discountSum || 0)],
          [`Сотрудников с высокой скидкой (>${pctThreshold}%)`, t.flagged || 0],
        ].map(([label, value], i) => (
          <div
            key={i}
            className="rounded-2xl bg-white p-3"
            style={{ border: `1px solid ${C.border}` }}
          >
            <div style={{ fontSize: 11.5, color: C.faint, marginBottom: 4 }}>
              {label}
            </div>
            <div style={{ fontSize: 17, fontWeight: 700, color: C.ink }}>
              {value}
            </div>
          </div>
        ))}
      </div>

      {/* Удаления/сторно заказов */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold" style={{ color: C.ink, fontSize: 15 }}>
            Удаления и сторно заказов
          </h3>
          <span style={{ fontSize: 12, color: C.faint }}>● данные из iiko</span>
        </div>
        {deletions.length ? (
          <div className="space-y-1 overflow-x-auto">
            {deletions.slice(0, 30).map((x, i) => (
              <div
                key={x.name}
                className="flex items-center gap-2"
                style={{ fontSize: 12 }}
              >
                <div style={{ width: 22, color: C.faint }}>{i + 1}.</div>
                <div
                  style={{
                    flex: 1,
                    minWidth: 80,
                    color: C.ink,
                    fontWeight: 600,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {x.name}
                </div>
                <div
                  style={{
                    width: 120,
                    background: "#F1EBE1",
                    borderRadius: 6,
                    height: 14,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${Math.round((x.count / maxDel) * 100)}%`,
                      background: "#C0392B",
                      height: "100%",
                    }}
                  />
                </div>
                <div style={{ width: 74, textAlign: "right", color: C.ink }}>
                  {x.count} зак.
                </div>
                <div style={{ width: 120, textAlign: "right", color: C.sub }}>
                  {fmtSum(x.sum)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ fontSize: 13, color: C.faint }}>
            Удалённых или сторнированных заказов за период не найдено.
          </p>
        )}
      </Card>

      {/* Крупные скидки */}
      <Card>
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-bold" style={{ color: C.ink, fontSize: 15 }}>
            Скидки в разрезе сотрудников
          </h3>
          <span style={{ fontSize: 12, color: C.faint }}>● данные из iiko</span>
        </div>
        <p style={{ fontSize: 12, color: C.sub, marginBottom: 10 }}>
          Красным отмечены сотрудники, у которых доля скидки превышает{" "}
          {pctThreshold}% оборота.
        </p>
        {discounts.length ? (
          <div className="space-y-1 overflow-x-auto">
            {discounts.slice(0, 30).map((x, i) => (
              <div
                key={x.name}
                className="flex items-center gap-2"
                style={{ fontSize: 12 }}
              >
                <div style={{ width: 22, color: C.faint }}>{i + 1}.</div>
                <div
                  style={{
                    flex: 1,
                    minWidth: 80,
                    color: x.flagged ? "#C0392B" : C.ink,
                    fontWeight: 600,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {x.name}
                </div>
                <div
                  style={{
                    width: 120,
                    background: "#F1EBE1",
                    borderRadius: 6,
                    height: 14,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${Math.round((x.discount / maxDisc) * 100)}%`,
                      background: x.flagged ? "#C0392B" : "#C99A6A",
                      height: "100%",
                    }}
                  />
                </div>
                <div
                  style={{
                    width: 54,
                    textAlign: "right",
                    color: x.flagged ? "#C0392B" : C.sub,
                    fontWeight: x.flagged ? 700 : 400,
                  }}
                >
                  {(x.share * 100).toFixed(1)}%
                </div>
                <div style={{ width: 120, textAlign: "right", color: C.sub }}>
                  {fmtSum(x.discount)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ fontSize: 13, color: C.faint }}>
            Скидок за период не найдено.
          </p>
        )}
      </Card>
    </div>
  );
}

// Рендер ОПиУ: разделы и статьи приходят из iiko (по типам счетов), проценты
// считаются к выручке.
function PnlView({ data }) {
  const t = data.totals || {};
  const rev = t.revenue || 1;
  const pct = (v) => `${((v / rev) * 100).toFixed(2)}%`;
  const flat = (lines) => {
    const out = [];
    const walk = (arr, level) =>
      (arr || []).forEach((n) => {
        out.push({ n, level });
        if (n.children && n.children.length) walk(n.children, level + 1);
      });
    walk(lines, 0);
    return out;
  };
  const Row = ({ label, value, level = 0, bold, big, color, top }) => (
    <div
      className="flex items-center justify-between gap-2"
      style={{
        fontSize: big ? 15 : 13.5,
        fontWeight: bold ? 700 : 400,
        color: color || C.ink,
        padding: big ? "8px 0" : "3px 0",
        paddingLeft: 8 + level * 16,
        borderTop: top ? `1px solid ${C.line}` : "none",
      }}
    >
      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
        {label}
      </span>
      <span style={{ display: "flex", gap: 12, flexShrink: 0 }}>
        <span style={{ width: 130, textAlign: "right" }}>{fmtSum(value)}</span>
        <span style={{ width: 56, textAlign: "right", color: C.faint }}>
          {pct(value)}
        </span>
      </span>
    </div>
  );
  const section = (typeKey, title, itogo) => {
    const sec = (data.sections && data.sections[typeKey]) || { lines: [] };
    if (!sec.lines.length && !sec.total) return null;
    return (
      <div>
        <div
          style={{
            fontSize: 13.5,
            fontWeight: 700,
            color: C.sub,
            padding: "8px 0 2px",
          }}
        >
          {title}
        </div>
        {flat(sec.lines).map((x, i) => (
          <Row key={i} label={x.n.name} value={x.n.value} level={x.level + 1} />
        ))}
        <Row label={itogo} value={sec.total} bold top />
      </div>
    );
  };
  const hasData = Object.values(t).some((v) => v);
  return (
    <div
      className="rounded-2xl bg-white p-4 sm:p-5"
      style={{ border: `1px solid ${C.border}` }}
    >
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-bold" style={{ color: C.ink, fontSize: 15 }}>
          Отчёт о прибылях и убытках
        </h3>
        <span style={{ fontSize: 12, color: C.faint }}>● данные из iiko</span>
      </div>
      <p style={{ fontSize: 12, color: C.sub, marginBottom: 10 }}>
        {data.departmentResolved
          ? `Филиал: ${data.departmentResolved}`
          : "Вся корпорация (для сверки с iiko выберите филиал вверху — по всей сети суммируются внутренние передачи)"}
      </p>
      {!hasData ? (
        <div>
          <p style={{ fontSize: 13, color: C.faint }}>
            Нет данных за период (или требуется настройка полей ответа iiko).
          </p>
          {data.diagnostics ? (
            <details style={{ marginTop: 10 }}>
              <summary
                style={{ fontSize: 12.5, color: C.sub, cursor: "pointer" }}
              >
                Диагностика (прислать для настройки)
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
                {`счетов: ${data.diagnostics.accounts}, балансы к/н: ${data.diagnostics.balEndRows}/${data.diagnostics.balStartRows}`}
                {data.diagnostics.accSample
                  ? "\n\n[accounts]\n" + data.diagnostics.accSample
                  : ""}
                {data.diagnostics.balSample
                  ? "\n\n[balance]\n" + data.diagnostics.balSample
                  : ""}
              </pre>
            </details>
          ) : null}
        </div>
      ) : (
        <div>
          {section("INCOME", "Выручка", "Итого Выручка")}
          {section(
            "COST_OF_GOODS_SOLD",
            "Себестоимость",
            "Итого Себестоимость",
          )}
          <Row label="Валовая прибыль" value={t.grossProfit} bold top />
          {section("EXPENSES", "Расходы", "Итого Расходы")}
          <Row
            label="Прибыль от основной деятельности"
            value={t.operatingProfit}
            bold
            top
          />
          {section("OTHER_INCOME", "Прочие доходы", "Итого Прочие доходы")}
          {section("OTHER_EXPENSES", "Прочие расходы", "Итого Прочие расходы")}
          <Row
            label="ИТОГО ЧИСТАЯ ПРИБЫЛЬ"
            value={t.netProfit}
            bold
            big
            top
            color={t.netProfit >= 0 ? C.ok : C.bad}
          />
        </div>
      )}

      {/* Диагностика статей: порядок и коды счетов, как их вернул iiko.
          Нужна, чтобы настроить порядок статей 1-в-1 как в отчёте iiko. */}
      {data.diagnostics &&
        data.diagnostics.accountsDump &&
        data.diagnostics.accountsDump.length > 0 && (
          <details style={{ marginTop: 14 }}>
            <summary
              style={{ fontSize: 12.5, color: C.sub, cursor: "pointer" }}
            >
              Статьи и коды счетов iiko (прислать для точной настройки порядка)
            </summary>
            <div
              style={{
                marginTop: 8,
                padding: 10,
                background: "#F7F4EF",
                borderRadius: 10,
                border: `1px solid ${C.line}`,
                fontSize: 11.5,
                overflowX: "auto",
              }}
            >
              <div style={{ color: C.faint, marginBottom: 6 }}>
                Поля счёта: {(data.diagnostics.accountKeys || []).join(", ")}
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ color: C.faint, textAlign: "left" }}>
                    <th style={{ padding: "2px 6px" }}>#</th>
                    <th style={{ padding: "2px 6px" }}>Название</th>
                    <th style={{ padding: "2px 6px" }}>Код</th>
                    <th style={{ padding: "2px 6px" }}>num</th>
                    <th style={{ padding: "2px 6px" }}>Тип</th>
                    <th style={{ padding: "2px 6px" }}>Родитель</th>
                  </tr>
                </thead>
                <tbody>
                  {data.diagnostics.accountsDump.map((a, i) => (
                    <tr key={i} style={{ borderTop: `1px solid ${C.line}` }}>
                      <td style={{ padding: "2px 6px", color: C.faint }}>
                        {i + 1}
                      </td>
                      <td style={{ padding: "2px 6px", color: C.ink }}>
                        {a.name}
                      </td>
                      <td style={{ padding: "2px 6px" }}>
                        {a.code == null ? "—" : String(a.code)}
                      </td>
                      <td style={{ padding: "2px 6px" }}>
                        {a.num == null ? "—" : String(a.num)}
                      </td>
                      <td style={{ padding: "2px 6px", color: C.faint }}>
                        {a.type}
                      </td>
                      <td style={{ padding: "2px 6px", color: C.faint }}>
                        {a.parent || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
    </div>
  );
}

// Финансовый анализ ОПиУ: по цифрам отчёта строим оценку состояния бизнеса
// точки, ключевые показатели (маржи, доли затрат), проблемы и рекомендации.
// Правила детерминированные (без ИИ-ключа) и опираются на бенчмарки общепита,
// поэтому переносятся на любую базу без настройки.
function PnlAnalysis({ data }) {
  const t = (data && data.totals) || {};
  const rev = t.revenue || 0;
  if (!rev) return null;
  const r = (v) => v / rev; // доля к выручке
  const gm = r(t.grossProfit || 0); // валовая маржа
  const om = r(t.operatingProfit || 0); // операционная маржа
  const nm = r(t.netProfit || 0); // чистая маржа
  const food = r(t.cogs || 0); // доля себестоимости (фудкост)
  const opex = r(t.expenses || 0); // доля операционных расходов
  const p1 = (v) => `${(v * 100).toFixed(1)}%`;

  // Крупнейшая статья расходов (верхний уровень раздела «Расходы»).
  const expLines = (data.sections && data.sections.EXPENSES) || { lines: [] };
  const topExp = [...(expLines.lines || [])]
    .filter((x) => x && x.value > 0)
    .sort((a, b) => b.value - a.value)[0];

  // Бенчмарки общепита (кафе/ресторан): фудкост 25–35%, чистая маржа 8–15%.
  const good = C.ok;
  const warn = "#B7791F";
  const bad = C.bad;
  const foodTone = food <= 0.35 ? good : food <= 0.42 ? warn : bad;
  const opexTone = opex <= 0.35 ? good : opex <= 0.5 ? warn : bad;
  const nmTone = nm < 0 ? bad : nm < 0.05 ? warn : nm < 0.12 ? C.brandA : good;

  // Общая оценка состояния точки.
  let verdict, verdictTone, verdictText;
  if ((t.netProfit || 0) < 0) {
    verdict = "Убыток";
    verdictTone = bad;
    verdictText =
      "Точка работает в минус: расходы превышают доходы. Нужен план сокращения затрат и роста выручки.";
  } else if (nm < 0.05) {
    verdict = "Низкая прибыльность";
    verdictTone = warn;
    verdictText =
      "Бизнес прибыльный, но маржа очень тонкая — небольшое падение выручки уводит точку в минус.";
  } else if (nm < 0.12) {
    verdict = "Умеренная прибыльность";
    verdictTone = C.brandA;
    verdictText =
      "Точка устойчиво прибыльна. Есть резерв роста маржи за счёт контроля затрат.";
  } else {
    verdict = "Здоровое состояние";
    verdictTone = good;
    verdictText =
      "Показатели здоровые. Можно реинвестировать прибыль в развитие точки и маркетинг.";
  }

  // Проблемы (по правилам).
  const problems = [];
  if ((t.netProfit || 0) < 0)
    problems.push(
      `Чистый убыток ${fmtSum(t.netProfit)}. Операционная деятельность не покрывает расходы.`,
    );
  if (food > 0.42)
    problems.push(
      `Себестоимость ${p1(food)} выручки — выше нормы (для общепита 25–35%). Вероятны завышенные закупки, большие списания или недоучёт порций.`,
    );
  else if (food > 0.35)
    problems.push(
      `Себестоимость ${p1(food)} — у верхней границы нормы; есть резерв на оптимизации закупок и порционирования.`,
    );
  if (opex > 0.5)
    problems.push(
      `Операционные расходы ${p1(opex)} выручки — очень высокие. Крупнейшие статьи (аренда, ФОТ, коммуналка) требуют пересмотра.`,
    );
  if (nm >= 0 && nm < 0.05)
    problems.push(
      `Чистая маржа всего ${p1(nm)} — запас прочности минимальный.`,
    );
  if (
    (t.otherExpenses || 0) > (t.operatingProfit || 0) &&
    (t.operatingProfit || 0) > 0
  )
    problems.push(
      `Прочие расходы (${fmtSum(t.otherExpenses)}) съедают почти всю операционную прибыль — проверьте их природу.`,
    );
  if (topExp && topExp.value > (t.revenue || 0) * 0.25)
    problems.push(
      `Одна статья расходов — «${topExp.name}» (${fmtSum(topExp.value)}, ${p1(r(topExp.value))}) — очень весома; контролируйте её отдельно.`,
    );

  // Рекомендации / направления.
  const recs = [];
  if (food > 0.35)
    recs.push(
      "Пересмотреть закупочные цены и поставщиков, ввести контроль списаний и порций. Сверьтесь с отчётом «Подозрительные операции» по удалениям и скидкам.",
    );
  if (opex > 0.4)
    recs.push(
      "Разобрать крупнейшие статьи в разделе «Расходы» выше и сократить необязательные; пересмотреть условия аренды и график смен под фактическую загрузку.",
    );
  if ((t.netProfit || 0) < 0)
    recs.push(
      "Сфокусироваться на выручке: средний чек, допродажи, загрузка в пиковые часы (см. «Аналитика продаж → По времени») и работа с меню по ABC.",
    );
  if (nm >= 0.12)
    recs.push(
      "Состояние сильное — рассмотрите масштабирование успешных практик этой точки на другие филиалы.",
    );
  if (!recs.length)
    recs.push(
      "Удерживать текущие показатели; точечно работать над средним чеком и составом меню (ABC-анализ).",
    );

  const Tile = ({ label, value, tone, hint }) => (
    <div
      className="rounded-2xl bg-white p-3"
      style={{ border: `1px solid ${C.border}` }}
    >
      <div style={{ fontSize: 11.5, color: C.faint, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color: tone || C.ink }}>
        {value}
      </div>
      {hint ? (
        <div style={{ fontSize: 10.5, color: C.faint, marginTop: 2 }}>
          {hint}
        </div>
      ) : null}
    </div>
  );

  return (
    <div
      className="rounded-2xl p-4 sm:p-5 mt-4"
      style={{
        background: "linear-gradient(135deg, #F3F7FF, #FBF6FF)",
        border: `1px solid ${C.border}`,
      }}
    >
      <div className="flex items-center gap-2 mb-1">
        <Sparkles size={18} color={C.violet} />
        <h3 className="font-bold" style={{ color: C.ink, fontSize: 15 }}>
          Финансовый анализ
        </h3>
      </div>
      <p style={{ fontSize: 12, color: C.sub, marginBottom: 12 }}>
        {data.departmentResolved
          ? `Оценка по филиалу: ${data.departmentResolved}`
          : "Оценка по всей корпорации (для точечного анализа выберите филиал вверху)"}
      </p>

      {/* Ключевые показатели */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-3">
        <Tile
          label="Валовая маржа"
          value={p1(gm)}
          tone={gm >= 0.6 ? good : warn}
          hint="норма 65–75%"
        />
        <Tile
          label="Операционная маржа"
          value={p1(om)}
          tone={om >= 0.1 ? good : warn}
        />
        <Tile
          label="Чистая маржа"
          value={p1(nm)}
          tone={nmTone}
          hint="норма 8–15%"
        />
        <Tile
          label="Доля себестоимости"
          value={p1(food)}
          tone={foodTone}
          hint="норма 25–35%"
        />
        <Tile label="Доля расходов" value={p1(opex)} tone={opexTone} />
      </div>

      {/* Общая оценка */}
      <div
        className="rounded-xl p-3 mb-3 flex items-start gap-2.5"
        style={{ background: "#fff", border: `1px solid ${C.border}` }}
      >
        <Activity size={18} color={verdictTone} style={{ marginTop: 1 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: verdictTone }}>
            {verdict}
          </div>
          <div style={{ fontSize: 12.5, color: C.sub, marginTop: 2 }}>
            {verdictText}
          </div>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        {/* Проблемы */}
        <div
          className="rounded-xl p-3"
          style={{ background: "#fff", border: `1px solid ${C.border}` }}
        >
          <div className="flex items-center gap-1.5 mb-2">
            <AlertTriangle size={15} color={bad} />
            <span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>
              Проблемы и риски
            </span>
          </div>
          {problems.length ? (
            <ul style={{ margin: 0, paddingLeft: 16 }}>
              {problems.map((x, i) => (
                <li
                  key={i}
                  style={{ fontSize: 12.5, color: C.sub, marginBottom: 5 }}
                >
                  {x}
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ fontSize: 12.5, color: C.faint }}>
              Критичных отклонений по цифрам не выявлено.
            </p>
          )}
        </div>

        {/* Рекомендации */}
        <div
          className="rounded-xl p-3"
          style={{ background: "#fff", border: `1px solid ${C.border}` }}
        >
          <div className="flex items-center gap-1.5 mb-2">
            <TrendingUp size={15} color={C.ok} />
            <span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>
              Рекомендации и направления
            </span>
          </div>
          <ul style={{ margin: 0, paddingLeft: 16 }}>
            {recs.map((x, i) => (
              <li
                key={i}
                style={{ fontSize: 12.5, color: C.sub, marginBottom: 5 }}
              >
                {x}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <p style={{ fontSize: 10.5, color: C.faint, marginTop: 10 }}>
        Анализ построен автоматически по цифрам отчёта и отраслевым нормам
        общепита; используйте как ориентир, а не как готовое решение.
      </p>
    </div>
  );
}

function SalesAnalytics({ s, me, branchScope, mode = "analytics" }) {
  const isReports = mode === "reports";
  const branches = s.branches || [];
  const isMgr = me.role === "manager";
  const myBranch = me.branchId || (branches[0] && branches[0].id) || 1;
  const pad = (n) => String(n).padStart(2, "0");
  const ymd = (d) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const toD = (x) => new Date(x + "T00:00:00");
  const addDays = (x, n) => {
    const d = toD(x);
    d.setDate(d.getDate() + n);
    return ymd(d);
  };
  const monday = (x) => {
    const d = toD(x);
    const wd = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - wd);
    return ymd(d);
  };
  const dm = (x) => x.split("-").reverse().join(".");
  const today = ymdNow();

  const PRESETS = [
    ["today", "Сегодня"],
    ["yesterday", "Вчера"],
    ["curWeek", "Текущая неделя"],
    ["prevWeek", "Прошлая неделя"],
    ["curMonth", "Текущий месяц"],
    ["prevMonth", "Прошлый месяц"],
    ["curYear", "Текущий год"],
    ["custom", "Другой…"],
  ];
  const rangeOf = (p) => {
    const y = today.slice(0, 4),
      m = today.slice(0, 7);
    if (p === "today") return { from: today, to: today };
    if (p === "yesterday") {
      const d = addDays(today, -1);
      return { from: d, to: d };
    }
    if (p === "curWeek")
      return { from: monday(today), to: addDays(monday(today), 6) };
    if (p === "prevWeek") {
      const mo = addDays(monday(today), -7);
      return { from: mo, to: addDays(mo, 6) };
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
    return null;
  };
  const init = rangeOf("prevMonth");
  // Фильтры аналитики запоминаются между обновлениями страницы.
  const [preset, setPreset] = usePersisted("avesto.sales.preset", "prevMonth");
  const [from, setFrom] = usePersisted("avesto.sales.from", init.from);
  const [to, setTo] = usePersisted("avesto.sales.to", init.to);
  const fBranch = isMgr ? myBranch : branchScope || 0;
  // Живые продажи из iiko: по выбранному филиалу (его Department) или по всем.
  const selBranchObj = branchById(fBranch || 0);
  const selDept = fBranch && selBranchObj ? selBranchObj.iikoDept : null;
  const live = useIikoSales({ from, to, department: selDept });
  // iiko подключён и ответил (реальные данные; для «пустого» ответа — нули).
  // Демо-данные больше не подставляем — показываем только реальные цифры iiko,
  // а где продаж нет (например, цех) — честный ноль.
  const liveOn = live.status === "ok" || live.status === "empty";
  const pick = (p) => {
    setPreset(p);
    const r = rangeOf(p);
    if (r) {
      setFrom(r.from);
      setTo(r.to);
    }
  };
  // Разделили экран на «Аналитику» (оперативные срезы) и «Отчёты» (формальные
  // отчёты вроде ОПиУ). Набор вкладок зависит от режима.
  const ANALYTICS_REPORTS = [
    ["revenue", "Динамика выручки"],
    ["time", "По времени"],
    ["pay", "Оплаты"],
    ["dishes", "Блюда"],
    ["abc", "ABC"],
    ["staff", "Персонал"],
    ["insights", "Выводы"],
  ];
  const REPORT_REPORTS = [
    ["pnl", "Прибыль / убыток"],
    ["risky", "Подозрительные операции"],
  ];
  const REPORTS = isReports ? REPORT_REPORTS : ANALYTICS_REPORTS;
  const [tab, setTab] = usePersisted(
    isReports ? "avesto.reports.tab" : "avesto.sales.tab",
    isReports ? "pnl" : "revenue",
  );
  // Если сохранённая вкладка не из текущего набора (после разделения экранов) —
  // сбрасываем на первую доступную.
  useEffect(() => {
    if (!REPORTS.some(([k]) => k === tab)) setTab(REPORTS[0][0]);
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps
  const [abcMode, setAbcMode] = usePersisted("avesto.sales.abcMode", "dish"); // dish | g1 | g2 | g3
  const [dishSort, setDishSort] = usePersisted("avesto.sales.dishSort", "sum"); // sum | qty
  const [abcDrill, setAbcDrill] = useState(null); // раскрытая группа (имя)
  const [openHour, setOpenHour] = useState(null); // раскрытый час (вкладка «По времени»)

  const inScope = (r, a, b) =>
    r.date >= a &&
    r.date <= b &&
    (isMgr ? r.branchId === myBranch : fBranch ? r.branchId === fBranch : true);
  const nDays = Math.max(1, Math.round((toD(to) - toD(from)) / 86400000) + 1);
  const prevTo = addDays(from, -1),
    prevFrom = addDays(from, -nDays);
  // Прошлый период из iiko — для реального сравнения (без демо).
  const livePrev = useIikoSales({
    from: prevFrom,
    to: prevTo,
    department: selDept,
  });
  const prevIikoOn = livePrev.status === "ok" || livePrev.status === "empty";

  // Цвет для типа оплаты: по известным названиям, иначе — из палитры по кругу.
  const PAY_COLORS = {
    налич: C.brandA,
    humo: "#7C3AED",
    uzcard: C.violet,
    click: C.brandB,
    payme: "#0EA5E9",
    uzum: C.ok,
    yandex: "#F59E0B",
    перечисл: C.warn,
    карт: C.violet,
  };
  const PAY_FALLBACK = [
    C.brandA,
    C.brandB,
    C.violet,
    C.ok,
    C.warn,
    "#0EA5E9",
    "#7C3AED",
    "#F59E0B",
    C.faint,
  ];
  const payColor = (name, i) => {
    const k = String(name).toLowerCase();
    for (const key in PAY_COLORS) if (k.includes(key)) return PAY_COLORS[key];
    return PAY_FALLBACK[i % PAY_FALLBACK.length];
  };
  // Оплаты из iiko (реальные; пусто → пусто, без демо).
  const payRows = liveOn
    ? (live.pay || []).map((p, i) => [p.name, p.value, payColor(p.name, i)])
    : [];
  const payTotal = payRows.reduce((a, r) => a + r[1], 0) || 1;

  // Показываем реальные продажи iiko (нули, если продаж нет). Демо не подставляем.
  const displayRevenue = liveOn ? live.total || 0 : 0;
  const displayChecks = liveOn ? live.checks || 0 : 0;
  const displayAvg =
    displayChecks && displayRevenue
      ? Math.round(displayRevenue / displayChecks)
      : 0;
  const displaySeries = liveOn
    ? (live.days || []).map((d) => ({
        label: d.date.slice(8) + "." + d.date.slice(5, 7),
        day: d.date,
        revenue: d.revenue,
      }))
    : [];

  // Блюда из iiko (реальные; пусто → пусто, без демо).
  const products = liveOn
    ? (live.products || []).map((p) => ({
        name: p.name,
        cat: "",
        qty: p.qty,
        sum: p.sum,
      }))
    : [];
  // Продажи по часам (0–23) из iiko — для вкладки «По времени».
  const liveHours = liveOn && live.hours ? live.hours : null;
  // Блюда по часам (для раскрытия по клику на час).
  const liveHourProducts =
    liveOn && live.hourProducts ? live.hourProducts : null;
  // Активность персонала из iiko — для вкладки «Персонал».
  const liveStaff = liveOn && live.staff ? live.staff : null;
  // ОПиУ — тянем только при открытой вкладке «Прибыль / убыток».
  const pnl = useIikoPnl({
    from,
    to,
    department: selDept,
    enabled: tab === "pnl",
  });
  // Подозрительные операции — тянем только при открытой вкладке.
  const risky = useIikoRisky({
    from,
    to,
    department: selDept,
    enabled: tab === "risky",
  });
  // Список блюд, отсортированный для вкладки «Блюда»: по выручке или по
  // количеству («что чаще покупают»).
  const dishRows = [...products].sort((a, b) =>
    dishSort === "qty" ? b.qty - a.qty : b.sum - a.sum,
  );
  const dishTop = dishRows.slice(0, 5);
  const dishBottom = dishRows.slice(-5).reverse();
  // Раскладка ABC (доля, накопит., группа) на любом списке {name,qty,sum}.
  const withAbc = (list) => {
    const total = list.reduce((a, p) => a + p.sum, 0) || 1;
    let c = 0;
    return list.map((p) => {
      const share = p.sum / total;
      c += share;
      return {
        ...p,
        share,
        cum: c,
        abc: c <= 0.8 ? "A" : c <= 0.95 ? "B" : "C",
      };
    });
  };
  const abcProducts = withAbc(products);
  const top = abcProducts.slice(0, 5);
  const bottom = abcProducts.slice(-5).reverse();
  const abcColor = (g) =>
    g === "A"
      ? { bg: "#E9F9EF", fg: C.ok }
      : g === "B"
        ? { bg: "#FEF3C7", fg: "#92400E" }
        : { bg: "#F1F5F9", fg: C.faint };
  // ABC можно смотреть по блюдам или по группам блюд 1/2/3 (если iiko отдал их).
  const groupLists = liveOn
    ? { g1: live.group1, g2: live.group2, g3: live.group3 }
    : {};
  const hasGroups = ["g1", "g2", "g3"].some(
    (k) => groupLists[k] && groupLists[k].length,
  );
  const isGroupMode = abcMode !== "dish";
  // Раскрытие группы (drill-down) до блюд внутри неё.
  let abcSource;
  if (!isGroupMode) {
    abcSource = abcProducts;
  } else if (abcDrill) {
    const m = {};
    (live.groupRows || [])
      .filter((r) => r[abcMode] === abcDrill)
      .forEach((r) => {
        if (!m[r.name]) m[r.name] = { name: r.name, qty: 0, sum: 0 };
        m[r.name].sum += r.sum;
        m[r.name].qty += r.qty;
      });
    abcSource = Object.values(m).sort((a, b) => b.sum - a.sum);
  } else {
    abcSource = groupLists[abcMode] || [];
  }
  const abcRows = isGroupMode ? withAbc(abcSource) : abcProducts;
  // В группах строки-группы кликабельны (раскрываются), блюда — нет.
  const abcClickable = isGroupMode && !abcDrill;
  const abcTotal = abcRows.reduce((a, p) => a + p.sum, 0) || 1;
  const abcCount = (g) => abcRows.filter((p) => p.abc === g).length;
  const abcSum = (g) =>
    abcRows.filter((p) => p.abc === g).reduce((a, p) => a + p.sum, 0);

  // рекомендации
  const insights = [];
  if (liveOn)
    insights.push(
      `Выручка за период: ${fmtSum(displayRevenue)}${displayChecks ? ` · ${displayChecks.toLocaleString("ru-RU")} чеков` : ""} (данные из iiko).`,
    );
  if (top[0])
    insights.push(
      `Лидер продаж: ${top[0].name} — ${fmtSum(top[0].sum)} (${(top[0].share * 100).toFixed(0)}% выручки).`,
    );
  const cItems = abcProducts.filter((p) => p.abc === "C");
  if (cItems.length)
    insights.push(
      `Аутсайдеры (группа C): ${cItems
        .slice(0, 4)
        .map((p) => p.name)
        .join(", ")} — рассмотрите акции или замену в меню.`,
    );
  if (displayAvg) insights.push(`Средний чек ${fmtSum(displayAvg)}.`);
  if (payRows[0])
    insights.push(
      `Основной способ оплаты: ${payRows[0][0]} — ${((payRows[0][1] / payTotal) * 100).toFixed(0)}% оплат.`,
    );

  const inpSt = {
    border: `1px solid ${C.border}`,
    fontSize: 13.5,
    background: "#fff",
    color: C.ink,
  };
  const KPI = ({ label, value, sub, tone }) => (
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
          fontSize: 19,
          color: C.ink,
          overflowWrap: "break-word",
          lineHeight: 1.15,
        }}
      >
        {value}
      </div>
      {sub != null && (
        <div
          style={{
            fontSize: 12,
            marginTop: 2,
            fontWeight: 700,
            color: tone === "up" ? C.ok : tone === "down" ? C.bad : C.faint,
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );
  return (
    <div className="space-y-5 max-w-5xl">
      {/* проверка подключения iiko */}
      <IikoPanel />

      {/* период + филиал */}
      <div
        className="rounded-2xl bg-white p-3.5"
        style={{ border: `1px solid ${C.border}` }}
      >
        <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
          <NiceSelect
            label={tr("За период")}
            value={preset}
            onChange={(v) => pick(v)}
            width={180}
            options={PRESETS.map(([k, l]) => ({ value: k, label: tr(l) }))}
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
        </div>
        {isMgr && (
          <div className="mt-2" style={{ fontSize: 12, color: C.faint }}>
            {tr("Ваш филиал")}:{" "}
            <b style={{ color: C.sub }}>{branchById(myBranch)?.name}</b>
          </div>
        )}
        {/* статус живых данных iiko */}
        {live.status === "loading" && (
          <div className="mt-2" style={{ fontSize: 12, color: C.faint }}>
            Загрузка данных из iiko…
          </div>
        )}
        {live.status === "ok" && (
          <div
            className="mt-2"
            style={{ fontSize: 12, color: C.ok, fontWeight: 700 }}
          >
            ● Данные из iiko
            {selDept ? ` · ${selBranchObj?.name}` : " · все точки"}
          </div>
        )}
        {live.status === "empty" && (
          <div className="mt-2" style={{ fontSize: 12, color: C.faint }}>
            iiko подключён, но за выбранный период/филиал продаж нет. Для цехов
            и складов это норма — там нет чеков.
          </div>
        )}
        {live.status === "off" && (
          <div className="mt-2" style={{ fontSize: 12, color: C.faint }}>
            iiko не подключён — реальных продаж пока нет.
          </div>
        )}
        {live.status === "error" && (
          <div className="mt-2" style={{ fontSize: 12, color: C.warn }}>
            iiko недоступен ({live.error}).
          </div>
        )}
      </div>

      {/* KPI */}
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}
      >
        <KPI
          label={tr("Выручка за период")}
          value={fmtSum(displayRevenue)}
          sub={liveOn ? "● данные из iiko" : null}
          tone="up"
        />
        <KPI
          label={tr("Средний чек")}
          value={fmtSum(displayAvg)}
          sub={liveOn ? "● данные из iiko" : null}
          tone="up"
        />
        <KPI
          label={tr("Количество чеков")}
          value={displayChecks.toLocaleString("ru-RU")}
          sub={liveOn ? "● данные из iiko" : null}
          tone="up"
        />
        <KPI
          label={tr("Прошлый период")}
          value={fmtSum(prevIikoOn ? livePrev.total || 0 : 0)}
          sub={`${dm(prevFrom)} — ${dm(prevTo)}`}
        />
      </div>

      {/* переключатель отчётов */}
      <div
        className="rounded-2xl bg-white p-1.5 flex gap-1 overflow-x-auto"
        style={{ border: `1px solid ${C.border}` }}
      >
        {REPORTS.map(([k, l]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className="rounded-xl px-3.5 py-2 font-bold whitespace-nowrap shrink-0"
            style={{
              fontSize: 13.5,
              background: tab === k ? C.brandA : "transparent",
              color: tab === k ? "#fff" : C.sub,
            }}
          >
            {tr(l)}
          </button>
        ))}
      </div>

      {/* пустое состояние активной вкладки */}
      {((tab === "revenue" && !displaySeries.length) ||
        (tab === "pay" && !payRows.length) ||
        (tab === "dishes" && !products.length) ||
        (tab === "insights" && !insights.length)) && (
        <div
          className="rounded-2xl bg-white p-5"
          style={{
            border: `1px solid ${C.border}`,
            fontSize: 13,
            color: C.faint,
          }}
        >
          {tr("Нет данных за выбранный период")}
        </div>
      )}

      {/* динамика выручки */}
      {tab === "revenue" && displaySeries.length > 0 && (
        <div
          className="rounded-2xl bg-white p-4 sm:p-5"
          style={{ border: `1px solid ${C.border}` }}
        >
          <h3 className="font-bold mb-3" style={{ color: C.ink, fontSize: 16 }}>
            {tr("Динамика выручки")}
            {liveOn && (
              <span
                style={{
                  fontSize: 12,
                  color: C.ok,
                  fontWeight: 700,
                  marginLeft: 8,
                }}
              >
                ● iiko
              </span>
            )}
          </h3>
          <div style={{ width: "100%", height: 240 }}>
            <ResponsiveContainer>
              <BarChart
                data={displaySeries}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke={C.line}
                  vertical={false}
                />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: C.faint }}
                  tickLine={false}
                  axisLine={{ stroke: C.line }}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: C.faint }}
                  tickLine={false}
                  axisLine={false}
                  width={54}
                  tickFormatter={(v) => (v / 1000000).toFixed(1) + "M"}
                />
                <Tooltip
                  formatter={(v) => fmtSum(v)}
                  labelStyle={{ color: C.ink }}
                  contentStyle={{
                    borderRadius: 12,
                    border: `1px solid ${C.border}`,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="revenue" radius={[6, 6, 0, 0]}>
                  {displaySeries.map((e, i) => (
                    <Cell key={i} fill={C.brandA} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* продажи по времени (по часам) */}
      {tab === "time" && (
        <div
          className="rounded-2xl bg-white p-4 sm:p-5"
          style={{ border: `1px solid ${C.border}` }}
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold" style={{ color: C.ink, fontSize: 15 }}>
              Продажи по времени (по часам)
            </h3>
            {liveOn && (
              <span style={{ fontSize: 12, color: C.faint }}>
                ● данные из iiko
              </span>
            )}
          </div>
          {liveHours && liveHours.some((h) => h.revenue > 0) ? (
            (() => {
              const active = liveHours.filter(
                (h) => h.revenue > 0 || h.checks > 0,
              );
              const maxRev = Math.max(...active.map((h) => h.revenue), 1);
              const peak = active.reduce(
                (a, h) => (h.revenue > a.revenue ? h : a),
                active[0],
              );
              return (
                <div>
                  <p style={{ fontSize: 12.5, color: C.sub, marginBottom: 10 }}>
                    Пиковый час: <b>{pad(peak.hour)}:00</b> —{" "}
                    {fmtSum(peak.revenue)}
                  </p>
                  <div className="space-y-1 overflow-x-auto">
                    {active.map((h) => {
                      const isOpen = openHour === h.hour;
                      const dishes =
                        (liveHourProducts && liveHourProducts[h.hour]) || [];
                      return (
                        <div key={h.hour}>
                          <div
                            onClick={() => setOpenHour(isOpen ? null : h.hour)}
                            className="flex items-center gap-2"
                            style={{ fontSize: 12, cursor: "pointer" }}
                            title="Показать, что продавалось в этот час"
                          >
                            <div style={{ width: 14, color: C.brandA }}>
                              {isOpen ? "▾" : "▸"}
                            </div>
                            <div style={{ width: 46, color: C.sub }}>
                              {pad(h.hour)}:00
                            </div>
                            <div
                              style={{
                                flex: 1,
                                minWidth: 60,
                                background: "#F1EBE1",
                                borderRadius: 6,
                                height: 16,
                                overflow: "hidden",
                              }}
                            >
                              <div
                                style={{
                                  width: `${Math.round((h.revenue / maxRev) * 100)}%`,
                                  background:
                                    h.hour === peak.hour ? C.brandA : "#C99A6A",
                                  height: "100%",
                                }}
                              />
                            </div>
                            <div
                              style={{
                                width: 108,
                                textAlign: "right",
                                color: C.ink,
                              }}
                            >
                              {fmtSum(h.revenue)}
                            </div>
                            <div
                              style={{
                                width: 64,
                                textAlign: "right",
                                color: C.faint,
                              }}
                            >
                              {h.checks} чек.
                            </div>
                            <div
                              style={{
                                width: 110,
                                textAlign: "right",
                                color: C.sub,
                              }}
                            >
                              ср. {fmtSum(h.avg)}
                            </div>
                          </div>
                          {isOpen && (
                            <div
                              style={{
                                margin: "4px 0 8px 60px",
                                padding: "8px 10px",
                                background: "#F7F4EF",
                                border: `1px solid ${C.line}`,
                                borderRadius: 10,
                              }}
                            >
                              {dishes.length === 0 ? (
                                <div style={{ fontSize: 12, color: C.faint }}>
                                  Нет детализации по блюдам за этот час.
                                </div>
                              ) : (
                                <div className="space-y-0.5">
                                  <div
                                    style={{
                                      fontSize: 11.5,
                                      color: C.faint,
                                      marginBottom: 4,
                                    }}
                                  >
                                    Блюда за {pad(h.hour)}:00–{pad(h.hour)}:59 (
                                    {dishes.length}):
                                  </div>
                                  {dishes.slice(0, 50).map((d, i) => (
                                    <div
                                      key={i}
                                      className="flex items-center justify-between gap-2"
                                      style={{ fontSize: 12 }}
                                    >
                                      <span style={{ color: C.ink }}>
                                        {d.name}
                                      </span>
                                      <span
                                        style={{
                                          color: C.sub,
                                          whiteSpace: "nowrap",
                                        }}
                                      >
                                        {d.qty} шт · {fmtSum(d.sum)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()
          ) : (
            <p style={{ fontSize: 13, color: C.faint }}>
              Данные по времени доступны при подключении к iiko (реальные
              продажи по часам за выбранный период).
            </p>
          )}
        </div>
      )}

      {/* выручка по типам оплат */}
      {tab === "pay" && payRows.length > 0 && (
        <div
          className="rounded-2xl bg-white p-4 sm:p-5"
          style={{ border: `1px solid ${C.border}` }}
        >
          <h3 className="font-bold mb-3" style={{ color: C.ink, fontSize: 16 }}>
            {tr("Выручка по типам оплат")}
          </h3>
          <div className="space-y-2.5">
            {payRows.map(([name, val, col]) => {
              const share = (val / payTotal) * 100;
              return (
                <div key={name}>
                  <div
                    className="flex items-center justify-between gap-2"
                    style={{ fontSize: 13 }}
                  >
                    <span style={{ color: C.ink, fontWeight: 600 }}>
                      {name}
                    </span>
                    <span style={{ color: C.sub, whiteSpace: "nowrap" }}>
                      {fmtSum(val)} ·{" "}
                      <b style={{ color: C.ink }}>{share.toFixed(1)}%</b>
                    </span>
                  </div>
                  <div
                    style={{
                      height: 8,
                      borderRadius: 6,
                      background: C.line,
                      marginTop: 4,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${share}%`,
                        height: "100%",
                        background: col,
                        borderRadius: 6,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ABC-анализ */}
      {tab === "abc" && (
        <div
          className="rounded-2xl bg-white p-4 sm:p-5"
          style={{ border: `1px solid ${C.border}` }}
        >
          <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
            <h3 className="font-bold" style={{ color: C.ink, fontSize: 16 }}>
              {tr("ABC-анализ")}
            </h3>
            <span style={{ fontSize: 12, color: C.faint }}>
              {tr("A — основная выручка, C — аутсайдеры")}
            </span>
          </div>
          {/* переключатель разреза ABC: блюда / группы 1–3 (если iiko отдал группы) */}
          {hasGroups && (
            <div
              className="inline-flex rounded-xl p-1 mb-3 overflow-x-auto"
              style={{ border: `1px solid ${C.border}`, background: "#fff" }}
            >
              {[
                ["dish", "Блюда"],
                ["g1", "Группа 1"],
                ["g2", "Группа 2"],
                ["g3", "Группа 3"],
              ].map(([k, l]) => (
                <button
                  key={k}
                  onClick={() => {
                    setAbcMode(k);
                    setAbcDrill(null);
                  }}
                  className="rounded-lg px-3 py-1.5 font-bold whitespace-nowrap"
                  style={{
                    fontSize: 12.5,
                    background: abcMode === k ? C.brandA : "transparent",
                    color: abcMode === k ? "#fff" : C.sub,
                  }}
                >
                  {tr(l)}
                </button>
              ))}
            </div>
          )}
          {/* хлебные крошки / раскрытая группа */}
          {isGroupMode && !abcDrill && hasGroups && (
            <div className="mb-2" style={{ fontSize: 12, color: C.faint }}>
              {tr("Нажмите на группу, чтобы раскрыть ABC блюд внутри неё")}
            </div>
          )}
          {isGroupMode && abcDrill && (
            <div className="mb-3 flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setAbcDrill(null)}
                className="rounded-lg px-3 py-1.5 font-bold"
                style={{
                  fontSize: 12.5,
                  border: `1px solid ${C.border}`,
                  color: C.sub,
                  background: "#fff",
                }}
              >
                ← {tr("К группам")}
              </button>
              <span style={{ fontSize: 13, color: C.ink, fontWeight: 700 }}>
                {tr("Группа")}: {abcDrill}
              </span>
            </div>
          )}
          <div className="flex flex-wrap gap-2 mb-3">
            {["A", "B", "C"].map((g) => {
              const c = abcColor(g);
              return (
                <div
                  key={g}
                  className="rounded-xl px-3 py-2"
                  style={{ background: c.bg, minWidth: 128 }}
                >
                  <div style={{ fontSize: 12, color: c.fg, fontWeight: 800 }}>
                    {tr("Группа")} {g} · {abcCount(g)}{" "}
                    {abcMode !== "dish" ? tr("гр.") : tr("тов.")}
                  </div>
                  <div
                    style={{ fontSize: 13.5, color: C.ink, fontWeight: 700 }}
                  >
                    {fmtSum(abcSum(g))} ·{" "}
                    {((abcSum(g) / abcTotal) * 100).toFixed(0)}%
                  </div>
                </div>
              );
            })}
          </div>
          {abcRows.length > 0 ? (
            <div className="hidden md:block">
              <table
                className="w-full"
                style={{ borderCollapse: "collapse", fontSize: 13 }}
              >
                <thead>
                  <tr style={{ color: C.faint, textAlign: "right" }}>
                    <th className="py-2" style={{ textAlign: "left" }}>
                      {abcClickable ? tr("Группа") : tr("Товар")}
                    </th>
                    <th style={{ textAlign: "left" }}>{tr("Категория")}</th>
                    <th>{tr("Кол-во")}</th>
                    <th>{tr("Выручка")}</th>
                    <th>{tr("Доля")}</th>
                    <th>{tr("Накопит.")}</th>
                    <th>ABC</th>
                  </tr>
                </thead>
                <tbody>
                  {abcRows.map((p, i) => {
                    const c = abcColor(p.abc);
                    return (
                      <tr
                        key={i}
                        onClick={() => abcClickable && setAbcDrill(p.name)}
                        style={{
                          borderTop: `1px solid ${C.line}`,
                          textAlign: "right",
                          cursor: abcClickable ? "pointer" : "default",
                        }}
                      >
                        <td
                          className="py-2"
                          style={{
                            textAlign: "left",
                            color: abcClickable ? C.brandA : C.ink,
                            fontWeight: 600,
                          }}
                        >
                          {abcClickable ? "▸ " : ""}
                          {p.name}
                        </td>
                        <td style={{ textAlign: "left", color: C.sub }}>
                          {p.cat || ""}
                        </td>
                        <td style={{ color: C.sub, whiteSpace: "nowrap" }}>
                          {p.qty}
                        </td>
                        <td
                          style={{
                            color: C.ink,
                            fontWeight: 700,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {fmtSum(p.sum)}
                        </td>
                        <td style={{ color: C.sub }}>
                          {(p.share * 100).toFixed(1)}%
                        </td>
                        <td style={{ color: C.faint }}>
                          {(p.cum * 100).toFixed(0)}%
                        </td>
                        <td>
                          <span
                            className="rounded-full font-bold"
                            style={{
                              fontSize: 11,
                              padding: "2px 8px",
                              background: c.bg,
                              color: c.fg,
                            }}
                          >
                            {p.abc}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: C.faint }}>
              {tr("Нет данных за выбранный период")}
            </div>
          )}

          {/* мобильные карточки */}
          <div className="md:hidden space-y-2">
            {abcRows.map((p, i) => {
              const c = abcColor(p.abc);
              return (
                <div
                  key={i}
                  onClick={() => abcClickable && setAbcDrill(p.name)}
                  className="flex items-center gap-2 rounded-xl px-3 py-2.5 flex-wrap"
                  style={{
                    background: "#FBFCFE",
                    border: `1px solid ${C.border}`,
                    cursor: abcClickable ? "pointer" : "default",
                  }}
                >
                  <span
                    className="rounded-full font-bold shrink-0"
                    style={{
                      fontSize: 11,
                      padding: "2px 8px",
                      background: c.bg,
                      color: c.fg,
                    }}
                  >
                    {p.abc}
                  </span>
                  <div className="min-w-0" style={{ flex: "1 1 120px" }}>
                    <div
                      className="truncate"
                      style={{
                        fontSize: 13.5,
                        color: abcClickable ? C.brandA : C.ink,
                        fontWeight: 700,
                      }}
                    >
                      {abcClickable ? "▸ " : ""}
                      {p.name}
                    </div>
                    <div style={{ fontSize: 11.5, color: C.faint }}>
                      {p.cat ? `${p.cat} · ` : ""}
                      {p.qty} {tr("шт")}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div
                      style={{
                        fontSize: 13,
                        color: C.ink,
                        fontWeight: 700,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {fmtSum(p.sum)}
                    </div>
                    <div style={{ fontSize: 11.5, color: C.sub }}>
                      {(p.share * 100).toFixed(1)}%
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* топ и аутсайдеры */}
      {tab === "dishes" && products.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span style={{ fontSize: 13, color: C.sub }}>Сортировка:</span>
            {[
              ["sum", "по выручке"],
              ["qty", "по количеству"],
            ].map(([k, l]) => (
              <button
                key={k}
                onClick={() => setDishSort(k)}
                className="rounded-lg px-3 py-1.5 font-semibold"
                style={{
                  fontSize: 12.5,
                  background: dishSort === k ? C.brandA : "#fff",
                  color: dishSort === k ? "#fff" : C.sub,
                  border: `1px solid ${dishSort === k ? C.brandA : C.line}`,
                }}
              >
                {l}
              </button>
            ))}
            <span style={{ fontSize: 12, color: C.faint }}>
              {dishSort === "qty"
                ? "что покупают чаще всего"
                : "что приносит больше выручки"}
            </span>
          </div>
          <div
            className="grid gap-4"
            style={{
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            }}
          >
            <div
              className="rounded-2xl bg-white p-4 sm:p-5"
              style={{ border: `1px solid ${C.border}` }}
            >
              <h3
                className="font-bold mb-2"
                style={{ color: C.ok, fontSize: 15 }}
              >
                ▲{" "}
                {dishSort === "qty"
                  ? tr("Чаще всего покупают")
                  : tr("Лучше всего продаются")}
              </h3>
              {dishTop.map((p, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-2 py-1.5"
                  style={{
                    borderBottom:
                      i < dishTop.length - 1 ? `1px solid ${C.line}` : "none",
                  }}
                >
                  <span style={{ fontSize: 13, color: C.ink, fontWeight: 600 }}>
                    {i + 1}. {p.name}
                  </span>
                  <span
                    style={{ fontSize: 13, color: C.sub, whiteSpace: "nowrap" }}
                  >
                    {fmtSum(p.sum)} · {p.qty} {tr("шт")}
                  </span>
                </div>
              ))}
            </div>
            <div
              className="rounded-2xl bg-white p-4 sm:p-5"
              style={{ border: `1px solid ${C.border}` }}
            >
              <h3
                className="font-bold mb-2"
                style={{ color: C.bad, fontSize: 15 }}
              >
                ▼{" "}
                {dishSort === "qty"
                  ? tr("Реже всего покупают")
                  : tr("Хуже всего продаются")}
              </h3>
              {dishBottom.map((p, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-2 py-1.5"
                  style={{
                    borderBottom:
                      i < dishBottom.length - 1
                        ? `1px solid ${C.line}`
                        : "none",
                  }}
                >
                  <span style={{ fontSize: 13, color: C.ink, fontWeight: 600 }}>
                    {p.name}
                  </span>
                  <span
                    style={{ fontSize: 13, color: C.sub, whiteSpace: "nowrap" }}
                  >
                    {fmtSum(p.sum)} · {p.qty} {tr("шт")}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* активность персонала */}
      {tab === "staff" && (
        <div
          className="rounded-2xl bg-white p-4 sm:p-5"
          style={{ border: `1px solid ${C.border}` }}
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold" style={{ color: C.ink, fontSize: 15 }}>
              Активность персонала (кто чаще открывает заказы)
            </h3>
            {liveOn && (
              <span style={{ fontSize: 12, color: C.faint }}>
                ● данные из iiko
              </span>
            )}
          </div>
          {liveStaff && liveStaff.length > 0 ? (
            (() => {
              const maxChecks = Math.max(...liveStaff.map((x) => x.checks), 1);
              return (
                <div>
                  <p style={{ fontSize: 12.5, color: C.sub, marginBottom: 10 }}>
                    Самый активный: <b>{liveStaff[0].name}</b> —{" "}
                    {liveStaff[0].checks} заказ.
                  </p>
                  <div className="space-y-1 overflow-x-auto">
                    {liveStaff.slice(0, 20).map((x, i) => (
                      <div
                        key={x.name}
                        className="flex items-center gap-2"
                        style={{ fontSize: 12 }}
                      >
                        <div style={{ width: 22, color: C.faint }}>
                          {i + 1}.
                        </div>
                        <div
                          style={{
                            flex: 1,
                            minWidth: 80,
                            color: C.ink,
                            fontWeight: 600,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {x.name}
                        </div>
                        <div
                          style={{
                            width: 120,
                            background: "#F1EBE1",
                            borderRadius: 6,
                            height: 14,
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              width: `${Math.round((x.checks / maxChecks) * 100)}%`,
                              background: i === 0 ? C.brandA : "#C99A6A",
                              height: "100%",
                            }}
                          />
                        </div>
                        <div
                          style={{
                            width: 74,
                            textAlign: "right",
                            color: C.ink,
                          }}
                        >
                          {x.checks} зак.
                        </div>
                        <div
                          style={{
                            width: 120,
                            textAlign: "right",
                            color: C.sub,
                          }}
                        >
                          {fmtSum(x.revenue)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()
          ) : (
            <p style={{ fontSize: 13, color: C.faint }}>
              Активность персонала доступна при подключении к iiko (число
              заказов по сотруднику за период).
            </p>
          )}
        </div>
      )}

      {/* отчёт о прибылях и убытках */}
      {tab === "pnl" && (
        <div>
          {pnl.status === "loading" && (
            <div
              className="rounded-2xl bg-white p-5"
              style={{
                border: `1px solid ${C.border}`,
                fontSize: 13,
                color: C.faint,
              }}
            >
              Загрузка отчёта из iiko…
            </div>
          )}
          {pnl.status === "off" && (
            <div
              className="rounded-2xl bg-white p-5"
              style={{
                border: `1px solid ${C.border}`,
                fontSize: 13,
                color: C.faint,
              }}
            >
              Интеграция iiko не настроена.
            </div>
          )}
          {pnl.status === "error" && (
            <div
              className="rounded-2xl bg-white p-5"
              style={{ border: `1px solid ${C.border}`, fontSize: 13 }}
            >
              <span style={{ color: "#B23" }}>
                Не удалось получить отчёт: {pnl.error}
              </span>
            </div>
          )}
          {pnl.status === "ok" && (
            <>
              <PnlView data={pnl.data} />
              <PnlAnalysis data={pnl.data} />
            </>
          )}
        </div>
      )}

      {/* подозрительные операции */}
      {tab === "risky" && (
        <div>
          {risky.status === "loading" && (
            <div
              className="rounded-2xl bg-white p-5"
              style={{
                border: `1px solid ${C.border}`,
                fontSize: 13,
                color: C.faint,
              }}
            >
              Загрузка данных из iiko…
            </div>
          )}
          {risky.status === "off" && (
            <div
              className="rounded-2xl bg-white p-5"
              style={{
                border: `1px solid ${C.border}`,
                fontSize: 13,
                color: C.faint,
              }}
            >
              Интеграция iiko не настроена.
            </div>
          )}
          {risky.status === "error" && (
            <div
              className="rounded-2xl bg-white p-5"
              style={{ border: `1px solid ${C.border}`, fontSize: 13 }}
            >
              <span style={{ color: "#B23" }}>
                Не удалось получить данные: {risky.error}
              </span>
            </div>
          )}
          {risky.status === "ok" && <RiskyView data={risky.data} />}
        </div>
      )}

      {/* рекомендации */}
      {tab === "insights" && insights.length > 0 && (
        <div
          className="rounded-2xl p-4 sm:p-5"
          style={{
            background: "linear-gradient(135deg, #EFF4FF, #F5F3FF)",
            border: `1px solid ${C.border}`,
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <Bot size={18} color={C.violet} />
            <h3 className="font-bold" style={{ color: C.ink, fontSize: 16 }}>
              {tr("Выводы и рекомендации")}
            </h3>
          </div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {insights.map((t, i) => (
              <li
                key={i}
                style={{ fontSize: 13.5, color: C.sub, lineHeight: 1.6 }}
              >
                {t}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p style={{ fontSize: 12, color: C.faint, lineHeight: 1.5 }}>
        {tr(
          "Данные по товарам рассчитаны из дневной выручки касс. После подключения iiko здесь будет реальная номенклатура: блюда, количество и суммы по чекам.",
        )}
      </p>
    </div>
  );
}

export default SalesAnalytics;
