// Синхронизация и отчёты модуля «Закупки и склад»: тянет из iiko приходные
// накладные и остатки, кладёт историю цен в БД и прогоняет через чистое ядро
// (procurement.js). Универсально: источник данных (iiko) — сменный адаптер.
import { db } from "../db.js";
import { incomingInvoices, storeBalances } from "./iikoServer.js";
import {
  analyzePriceTrends,
  analyzeStock,
  computeMovement,
} from "./procurement.js";
import { refreshProcurementConfig } from "./procurementConfig.js";

// Синхронизация накладных за период (from/to — YYYY-MM-DD): дедуп по документу
// (удаляем позиции документа и пишем заново), затем сохраняем в PurchaseEntry.
export async function syncInvoices({ from, to }) {
  const { entries, docCount } = await incomingInvoices({ from, to });
  const docIds = [...new Set(entries.map((e) => e.iikoDocId).filter(Boolean))];
  if (docIds.length) {
    await db.purchaseEntry.deleteMany({
      where: { iikoDocId: { in: docIds } },
    });
  }
  const data = entries
    .filter((e) => e.productId)
    .map((e) => ({
      iikoDocId: e.iikoDocId || "",
      docNumber: e.docNumber || "",
      date: new Date(e.date),
      supplier: e.supplier || "",
      productId: e.productId,
      productName: e.productName || "",
      unit: e.unit || "",
      amount: Number(e.amount) || 0,
      price: Number(e.price) || 0,
      sum: Number(e.sum) || 0,
      storeId: e.storeId || "",
      storeName: e.storeName || "",
    }))
    .filter((e) => e.date instanceof Date && !isNaN(e.date));
  if (data.length) await db.purchaseEntry.createMany({ data });
  return { docCount, itemCount: data.length };
}

// Тренд цен: читаем историю из БД (по умолчанию — последние 2 года), прогоняем
// через ядро с учётом сезонной нормы.
export async function priceTrends({ months = 24 } = {}) {
  const since = new Date();
  since.setMonth(since.getMonth() - months);
  const rows = await db.purchaseEntry.findMany({
    where: { date: { gte: since } },
    orderBy: { date: "asc" },
    take: 200000,
  });
  const cfg = await refreshProcurementConfig(true);
  return analyzePriceTrends(
    rows.map((r) => ({
      productId: r.productId,
      productName: r.productName,
      unit: r.unit,
      supplier: r.supplier,
      date: r.date,
      price: r.price,
      amount: r.amount,
    })),
    cfg
  );
}

const ymd = (d) => d.toISOString().slice(0, 10);

// Обзор остатков: текущий остаток + средний дневной расход за `days` дней
// (расход = остаток_нач + приход − остаток_кон), + правила мин/макс из БД.
export async function stockOverview({ days = 30 } = {}) {
  const cfg = await refreshProcurementConfig(true);
  const now = new Date();
  const past = new Date(now.getTime() - days * 86400000);
  const nowTs = `${ymd(now)}T23:59:59`;
  const pastTs = `${ymd(past)}T00:00:00`;

  const [cur, prev, inv, rules] = await Promise.all([
    storeBalances({ timestamp: nowTs }),
    storeBalances({ timestamp: pastTs }).catch(() => ({ rows: [] })),
    incomingInvoices({ from: ymd(past), to: ymd(now) }).catch(() => ({
      entries: [],
    })),
    db.productStockRule.findMany(),
  ]);

  const prevById = new Map(prev.rows.map((r) => [r.productId, r.stock]));
  const incomeById = new Map();
  for (const e of inv.entries) {
    incomeById.set(
      e.productId,
      (incomeById.get(e.productId) || 0) + (Number(e.amount) || 0)
    );
  }
  const ruleById = new Map(rules.map((r) => [r.productId, r]));

  const items = cur.rows.map((r) => {
    const open = prevById.get(r.productId) || 0;
    const income = incomeById.get(r.productId) || 0;
    // Теоретический расход за период = начало + приход − конец (не меньше 0).
    const consumption = Math.max(0, open + income - r.stock);
    const rule = ruleById.get(r.productId);
    return {
      productId: r.productId,
      name: r.name,
      stock: r.stock,
      avgDailyConsumption: days > 0 ? consumption / days : 0,
      minQty: rule ? rule.minQty : null,
      maxQty: rule ? rule.maxQty : null,
      manual: rule ? rule.manual : false,
    };
  });
  return analyzeStock(items, cfg);
}

// Движение товара за период: сверка начало + приход − конец = расход.
export async function movementReport({ from, to }) {
  const [openBal, closeBal, inv] = await Promise.all([
    storeBalances({ timestamp: `${from}T00:00:00` }).catch(() => ({
      rows: [],
    })),
    storeBalances({ timestamp: `${to}T23:59:59` }),
    incomingInvoices({ from, to }).catch(() => ({ entries: [] })),
  ]);
  const openById = new Map(openBal.rows.map((r) => [r.productId, r.stock]));
  const nameById = new Map();
  const unitById = new Map();
  for (const r of closeBal.rows) {
    nameById.set(r.productId, r.name);
    unitById.set(r.productId, r.unit);
  }
  const incomeById = new Map();
  for (const e of inv.entries) {
    incomeById.set(
      e.productId,
      (incomeById.get(e.productId) || 0) + (Number(e.amount) || 0)
    );
    if (!nameById.has(e.productId)) nameById.set(e.productId, e.productName);
  }
  const ids = new Set([
    ...openById.keys(),
    ...closeBal.rows.map((r) => r.productId),
    ...incomeById.keys(),
  ]);
  const rows = [...ids].map((productId) => {
    const close =
      closeBal.rows.find((r) => r.productId === productId)?.stock || 0;
    return {
      productId,
      name: nameById.get(productId) || productId,
      unit: unitById.get(productId) || "",
      open: openById.get(productId) || 0,
      income: incomeById.get(productId) || 0,
      close,
    };
  });
  return computeMovement(rows);
}
