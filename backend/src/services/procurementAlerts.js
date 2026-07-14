// Сигналы модуля «Закупки и склад» в Telegram: резкий рост цены закупки,
// критическая нехватка/минус остатка. Дедуп — один сигнал на (товар, тип, день)
// через таблицу ProcurementAlert, чтобы авто-проверка не спамила. Отправка — в
// топик «Товары» (TELEGRAM_TOPIC_GOODS). Уважает флаг notifyTelegram в конфиге.
import { db } from "../db.js";
import { sendTelegram, topicFor, esc, telegramConfigured } from "./telegram.js";
import { refreshProcurementConfig } from "./procurementConfig.js";
import { priceTrends, stockOverview } from "./procurementSync.js";

const money = (n) => Number(n || 0).toLocaleString("ru-RU");

// Ранг серьёзности для сортировки/ограничения (меньше = важнее).
const RANK = {
  price_spike: 0,
  stock_negative: 1,
  stock_critical: 2,
  stock_low: 3,
};

// Чистая сборка сигналов из результатов анализа. todayStr — YYYY-MM-DD.
// Возвращает [{ productId, kind, day, text, detail }], отсортированные по
// серьёзности. Тестируется без БД и сети.
export function collectAlerts(trends, stock, todayStr) {
  const out = [];
  for (const r of (trends && trends.rows) || []) {
    if (r.flag !== "spike") continue;
    const base =
      r.baselineKind === "seasonal" ? "сезонной норме" : "средней цене";
    out.push({
      productId: r.productId,
      kind: "price_spike",
      day: todayStr,
      detail: `${r.lastPrice} vs ${r.baseline} (${r.deltaPct}%)`,
      text:
        `📈 <b>Резкий рост цены закупки</b>\n` +
        `${esc(r.name)}: <b>${money(r.lastPrice)}</b> ` +
        `(${r.deltaPct > 0 ? "+" : ""}${r.deltaPct}% к ${base} ${money(r.baseline)})\n` +
        `Проверьте накладную и поставщика.`,
    });
  }
  for (const r of (stock && stock.rows) || []) {
    if (!["critical", "negative", "low"].includes(r.status)) continue;
    const kind =
      r.status === "critical"
        ? "stock_critical"
        : r.status === "negative"
          ? "stock_negative"
          : "stock_low";
    const label =
      r.status === "negative"
        ? "Минусовой остаток"
        : r.status === "critical"
          ? "Критический остаток"
          : "Мало на складе";
    out.push({
      productId: r.productId,
      kind,
      day: todayStr,
      detail: `stock ${r.stock}`,
      text:
        `📦 <b>${label}</b>\n` +
        `${esc(r.name)}: остаток <b>${money(r.stock)}</b>` +
        (r.daysCover != null ? ` (хватит на ${r.daysCover} дн.)` : "") +
        (r.suggestedOrder > 0
          ? `\nРекомендуется заказать ~${money(r.suggestedOrder)}`
          : ""),
    });
  }
  out.sort((a, b) => (RANK[a.kind] ?? 9) - (RANK[b.kind] ?? 9));
  return out;
}

// Запуск авто-проверки: тянет тренд цен и остатки, собирает сигналы, дедупит по
// (товар, тип, день) и шлёт новые в топик «Товары». CAP ограничивает число за
// один прогон, чтобы не залить чат. Возвращает сводку.
export async function sendProcurementAlerts({ todayStr, cap = 25 } = {}) {
  const cfg = await refreshProcurementConfig(true);
  if (!cfg.notifyTelegram) return { skipped: true, reason: "notify_off" };
  if (!telegramConfigured())
    return { skipped: true, reason: "telegram_not_configured" };

  const day = todayStr || new Date().toISOString().slice(0, 10);
  const [trends, stock] = await Promise.all([
    priceTrends({ months: 24 }).catch(() => ({ rows: [] })),
    stockOverview({ days: 30 }).catch(() => ({ rows: [] })),
  ]);
  const alerts = collectAlerts(trends, stock, day);

  const topic = topicFor("goods");
  let sent = 0;
  let dup = 0;
  for (const a of alerts) {
    if (sent >= cap) break;
    // Пытаемся застолбить сигнал — при конфликте уникальности он уже отправлен
    // сегодня (дедуп). Столбим ДО отправки, чтобы не задвоить при повторе.
    const marked = await db.procurementAlert
      .create({
        data: {
          productId: a.productId,
          kind: a.kind,
          day: a.day,
          detail: a.detail,
        },
      })
      .catch(() => null);
    if (!marked) {
      dup++;
      continue;
    }
    await sendTelegram(a.text, undefined, topic);
    sent++;
  }
  return {
    total: alerts.length,
    sent,
    duplicatesSkipped: dup,
    capped: alerts.length > cap,
  };
}
