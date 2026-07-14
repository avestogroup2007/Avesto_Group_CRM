// Модуль «Закупки и склад»: тренд цен закупки, остатки, движение товара и
// сигналы. Данные — из iiko (накладные + остатки) через сервис синхронизации.
// Чтение — офисным ролям; синхронизация и правка настроек/правил — директору/
// сисадмину (с записью в журнал безопасности).
import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { asyncHandler } from "../util/asyncHandler.js";
import {
  ProcurementSchema,
  refreshProcurementConfig,
  saveProcurementConfig,
} from "../services/procurementConfig.js";
import {
  syncInvoices,
  priceTrends,
  stockOverview,
  movementReport,
  supplierDebts,
} from "../services/procurementSync.js";
import { sendProcurementAlerts } from "../services/procurementAlerts.js";
import {
  importDebtWorkbook,
  importedDebtSummary,
} from "../services/procurementDebts.js";

const r = Router();
r.use(requireAuth);
r.use(requireRole("director", "finance", "accountant", "manager", "sysadmin"));

const YMD = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Дата в формате YYYY-MM-DD");

// ── Настройки (конструктор правил) ──────────────────────────────────────────
r.get(
  "/config",
  asyncHandler(async (req, res) => {
    res.json(await refreshProcurementConfig(true));
  })
);

r.put(
  "/config",
  requireRole("director", "sysadmin"),
  asyncHandler(async (req, res) => {
    const parsed = ProcurementSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Неверный формат настроек" });
    }
    const saved = await saveProcurementConfig(parsed.data, req.user.uid);
    await db.auditLog
      .create({
        data: {
          userId: req.user.uid,
          event: "procurement_config_update",
          detail: `Закупки: скачок ${saved.spikeThresholdPct}%, запас ${saved.stockDaysCover}д, метод ${saved.stockMethod}`,
          ip: req.ip,
        },
      })
      .catch(() => {});
    res.json(saved);
  })
);

// ── Синхронизация накладных из iiko за период ───────────────────────────────
const SyncSchema = z.object({ from: YMD, to: YMD });
r.post(
  "/sync",
  requireRole("director", "finance", "sysadmin"),
  asyncHandler(async (req, res) => {
    const parsed = SyncSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Укажите период from/to" });
    }
    let out;
    try {
      out = await syncInvoices(parsed.data);
    } catch (e) {
      // iiko не настроен или ответил ошибкой — отдаём понятно (не 500), чтобы
      // UI показал причину, а не «сломалось».
      const notConfigured = e && e.name === "IikoNotConfiguredError";
      return res.status(notConfigured ? 200 : 502).json({
        itemCount: 0,
        docCount: 0,
        iikoConfigured: !notConfigured,
        error: notConfigured
          ? "Интеграция iiko не настроена (нет IIKO_SERVER_URL/LOGIN/PASSWORD в окружении)"
          : e.message || "Ошибка обращения к iiko",
      });
    }
    await db.auditLog
      .create({
        data: {
          userId: req.user.uid,
          event: "procurement_sync",
          detail: `Синхронизация накладных ${parsed.data.from}…${parsed.data.to}: документов ${out.docCount}, позиций ${out.itemCount}`,
          ip: req.ip,
        },
      })
      .catch(() => {});
    res.json(out);
  })
);

// ── Проверить сейчас: собрать сигналы и отправить в Telegram (с дедупом) ─────
r.post(
  "/check-now",
  requireRole("director", "finance", "sysadmin"),
  asyncHandler(async (req, res) => {
    const result = await sendProcurementAlerts();
    res.json(result);
  })
);

// ── Тренд цен закупки (сезонная норма + сигналы) ────────────────────────────
r.get(
  "/price-trends",
  asyncHandler(async (req, res) => {
    const months = Math.min(60, Math.max(1, Number(req.query.months) || 24));
    res.json(await priceTrends({ months }));
  })
);

// ── Остатки и их статус ─────────────────────────────────────────────────────
r.get(
  "/stock",
  asyncHandler(async (req, res) => {
    const days = Math.min(180, Math.max(1, Number(req.query.days) || 30));
    res.json(await stockOverview({ days }));
  })
);

// ── Движение товара за период ───────────────────────────────────────────────
r.get(
  "/movement",
  asyncHandler(async (req, res) => {
    const parsed = z
      .object({ from: YMD, to: YMD })
      .safeParse({ from: req.query.from, to: req.query.to });
    if (!parsed.success) {
      return res.status(400).json({ error: "Укажите период from/to" });
    }
    res.json(await movementReport(parsed.data));
  })
);

// ── Задолженность перед поставщиками (баланс взаиморасчётов из iiko) ─────────
r.get(
  "/debts",
  asyncHandler(async (req, res) => {
    // Приоритет — импортированный отчёт «Задолженность перед контрагентами»
    // (реальный долг по каждому поставщику). Если импорта не было — баланс iiko.
    const imported = await importedDebtSummary().catch(() => null);
    if (imported) return res.json(imported);
    try {
      res.json(await supplierDebts());
    } catch (e) {
      const notConfigured = e && e.name === "IikoNotConfiguredError";
      res.status(notConfigured ? 200 : 502).json({
        rows: [],
        totalDebt: 0,
        iikoConfigured: !notConfigured,
        error: notConfigured
          ? "Интеграция iiko не настроена"
          : e.message || "Ошибка обращения к iiko",
      });
    }
  })
);

// Импорт отчёта iiko «Задолженность перед контрагентами» (Excel, base64).
const DebtImportSchema = z.object({ file: z.string().min(10) });
r.post(
  "/debts-import",
  requireRole("director", "finance", "sysadmin"),
  asyncHandler(async (req, res) => {
    const parsed = DebtImportSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Файл не передан" });
    }
    // Принимаем как «data:...;base64,XX
    // » так и чистый base64.
    const b64 = parsed.data.file.replace(/^data:[^,]*,/, "");
    let buffer;
    try {
      buffer = Buffer.from(b64, "base64");
    } catch {
      return res.status(400).json({ error: "Не удалось прочитать файл" });
    }
    const out = await importDebtWorkbook(buffer);
    if (out.error) return res.status(400).json(out);
    await db.auditLog
      .create({
        data: {
          userId: req.user.uid,
          event: "procurement_debts_import",
          detail: `Импорт долгов: документов ${out.imported}, поставщиков ${out.suppliers}`,
          ip: req.ip,
        },
      })
      .catch(() => {});
    res.json(out);
  })
);

// ── Правила остатка по товару (ручной мин/макс) ─────────────────────────────
r.get(
  "/rules",
  asyncHandler(async (req, res) => {
    const rules = await db.productStockRule.findMany({ take: 20000 });
    res.json({ rules });
  })
);

const RuleSchema = z.object({
  productId: z.string().min(1).max(200),
  name: z.string().max(300).optional(),
  minQty: z.number().min(0).max(9e9).nullable().optional(),
  maxQty: z.number().min(0).max(9e9).nullable().optional(),
  manual: z.boolean().optional(),
});
r.put(
  "/rules",
  requireRole("director", "finance", "sysadmin"),
  asyncHandler(async (req, res) => {
    const parsed = RuleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Неверный формат правила" });
    }
    const { productId, name, minQty, maxQty, manual } = parsed.data;
    const saved = await db.productStockRule.upsert({
      where: { productId },
      create: {
        productId,
        name: name || "",
        minQty: minQty ?? null,
        maxQty: maxQty ?? null,
        manual: manual ?? true,
      },
      update: {
        ...(name != null ? { name } : {}),
        minQty: minQty ?? null,
        maxQty: maxQty ?? null,
        ...(manual != null ? { manual } : {}),
      },
    });
    res.json(saved);
  })
);

export default r;
