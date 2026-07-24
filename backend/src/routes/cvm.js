// CVM (управление ценностью клиента): клиентская база, RFM-сегментация, LTV,
// отток и кампании/офферы. Данные — клиенты с агрегатами покупок (ручной ввод/
// импорт Excel/обогащение из iiko Лояльность). Модуль гейтится флагом `cvm`
// (Back Office). Персональные данные клиентов — только офисным ролям; правка и
// запуск кампаний фиксируются в журнале безопасности.
import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { asyncHandler } from "../util/asyncHandler.js";
import { refreshModules, moduleEnabled } from "../services/modules.js";
import {
  scoreCustomers,
  cvmSummary,
  normalizePhone,
  SEGMENTS,
} from "../services/cvm.js";
import {
  refreshCvmConfig,
  saveCvmConfig,
  CvmSchema,
} from "../services/cvmConfig.js";
import { importCustomerWorkbook } from "../services/customerImport.js";
import {
  syncCustomersFromIiko,
  iikoLoyaltyConfigured,
  IikoLoyaltyNotConfiguredError,
} from "../services/iikoLoyalty.js";
import { sendTelegram, topicFor } from "../services/telegram.js";

const r = Router();
r.use(requireAuth);
// CVM — офисные роли (персональные данные клиентов). Управляющий филиала сюда
// не входит: клиентская база — это данные всей сети, а не одного филиала.
r.use(requireRole("director", "finance", "accountant", "sysadmin"));

// Гейтинг модуля: если владелец не включил CVM — раздел недоступен.
r.use(
  asyncHandler(async (req, res, next) => {
    await refreshModules().catch(() => {});
    if (!moduleEnabled("cvm")) {
      return res.status(403).json({
        error: "Модуль CVM выключен — обратитесь к владельцу системы",
      });
    }
    next();
  })
);

async function logCvm(req, event, detail) {
  await db.auditLog
    .create({ data: { userId: req.user.uid, event, detail, ip: req.ip } })
    .catch(() => {});
}

const now = () => Date.now();

// ── Клиенты + аналитика ─────────────────────────────────────────────────────
// GET /customers?segment=&q=&limit= — список с RFM-баллами и сегментом. Баллы
// считаем по ВСЕЙ базе (иначе квантили сегментов «поедут»), фильтр применяем
// после расчёта.
r.get(
  "/customers",
  asyncHandler(async (req, res) => {
    const cfg = await refreshCvmConfig(true);
    const all = await db.customer.findMany({ take: 20000 });
    const scored = scoreCustomers(all, now());
    const q = String(req.query.q || "")
      .trim()
      .toLowerCase();
    const segment = String(req.query.segment || "").trim();
    let rows = scored;
    if (segment) rows = rows.filter((c) => c.segment === segment);
    if (q)
      rows = rows.filter(
        (c) => c.name.toLowerCase().includes(q) || (c.phone || "").includes(q)
      );
    rows.sort((a, b) => Number(b.totalSpent) - Number(a.totalSpent));
    const limit = Math.min(
      Math.max(parseInt(req.query.limit, 10) || 500, 1),
      5000
    );
    res.json({
      total: rows.length,
      churnDays: cfg.churnDays,
      customers: rows.slice(0, limit).map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        email: c.email,
        branchName: c.branchName,
        consent: c.consent,
        source: c.source,
        orders: c.orders,
        totalSpent: Number(c.totalSpent),
        lastOrderAt: c.lastOrderAt,
        recencyDays: c.recencyDays,
        r: c.r,
        f: c.f,
        m: c.m,
        rfm: c.rfm,
        segment: c.segment,
      })),
    });
  })
);

// Сводка: итоги, LTV-метрики, разбивка по сегментам, отток.
r.get(
  "/summary",
  asyncHandler(async (req, res) => {
    const cfg = await refreshCvmConfig(true);
    const all = await db.customer.findMany({ take: 20000 });
    res.json({ ...cvmSummary(all, now(), cfg.churnDays), segments: SEGMENTS });
  })
);

const CustomerSchema = z.object({
  name: z.string().max(200).default(""),
  phone: z.string().max(40).default(""),
  email: z.string().max(200).default(""),
  branchName: z.string().max(200).default(""),
  consent: z.boolean().default(false),
  orders: z.number().int().min(0).max(1_000_000).default(0),
  totalSpent: z.number().min(0).max(9e14).default(0),
  lastOrderAt: z.coerce.date().nullable().optional(),
  firstOrderAt: z.coerce.date().nullable().optional(),
  note: z.string().max(1000).default(""),
});

r.post(
  "/customers",
  asyncHandler(async (req, res) => {
    const parsed = CustomerSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: "Неверный формат клиента" });
    const d = parsed.data;
    if (!d.name && !d.phone)
      return res.status(400).json({ error: "Нужны имя или телефон" });
    const created = await db.customer.create({
      data: {
        source: "manual",
        name: d.name,
        phone: normalizePhone(d.phone),
        email: d.email,
        branchName: d.branchName,
        consent: d.consent,
        orders: d.orders,
        totalSpent: BigInt(Math.round(d.totalSpent)),
        lastOrderAt: d.lastOrderAt || null,
        firstOrderAt: d.firstOrderAt || null,
        note: d.note,
      },
    });
    await logCvm(
      req,
      "cvm_customer_create",
      `Добавлен клиент «${created.name || created.phone}»`
    );
    res.status(201).json({ id: created.id });
  })
);

r.patch(
  "/customers/:id",
  asyncHandler(async (req, res) => {
    const parsed = CustomerSchema.partial().safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: "Неверный формат" });
    const d = parsed.data;
    const data = {};
    for (const k of [
      "name",
      "email",
      "branchName",
      "consent",
      "orders",
      "note",
    ])
      if (d[k] !== undefined) data[k] = d[k];
    if (d.phone !== undefined) data.phone = normalizePhone(d.phone);
    if (d.totalSpent !== undefined)
      data.totalSpent = BigInt(Math.round(d.totalSpent));
    if (d.lastOrderAt !== undefined) data.lastOrderAt = d.lastOrderAt || null;
    if (d.firstOrderAt !== undefined)
      data.firstOrderAt = d.firstOrderAt || null;
    const updated = await db.customer
      .update({ where: { id: req.params.id }, data })
      .catch(() => null);
    if (!updated) return res.status(404).json({ error: "Клиент не найден" });
    await logCvm(
      req,
      "cvm_customer_update",
      `Изменён клиент «${updated.name || updated.phone}»`
    );
    res.json({ ok: true });
  })
);

r.delete(
  "/customers/:id",
  requireRole("director", "sysadmin"),
  asyncHandler(async (req, res) => {
    const deleted = await db.customer
      .delete({ where: { id: req.params.id } })
      .catch(() => null);
    if (!deleted) return res.status(404).json({ error: "Клиент не найден" });
    await logCvm(
      req,
      "cvm_customer_delete",
      `Удалён клиент «${deleted.name || deleted.phone}»`
    );
    res.json({ ok: true });
  })
);

// Импорт клиентской базы из Excel (base64), как импорт долгов.
const ImportSchema = z.object({ file: z.string().min(10) });
r.post(
  "/customers/import",
  requireRole("director", "finance", "sysadmin"),
  asyncHandler(async (req, res) => {
    const parsed = ImportSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: "Файл не передан" });
    const b64 = parsed.data.file.replace(/^data:[^,]*,/, "");
    let buffer;
    try {
      buffer = Buffer.from(b64, "base64");
    } catch {
      return res.status(400).json({ error: "Не удалось прочитать файл" });
    }
    if (buffer.length > 8 * 1024 * 1024)
      return res
        .status(400)
        .json({ error: "Файл слишком большой (максимум 8 МБ)" });
    let out;
    try {
      out = await importCustomerWorkbook(buffer);
    } catch {
      return res
        .status(400)
        .json({ error: "Не удалось разобрать Excel — проверьте формат" });
    }
    await logCvm(
      req,
      "cvm_customers_import",
      `Импорт клиентов: всего ${out.total}, новых ${out.created}, обновлено ${out.updated}`
    );
    res.json(out);
  })
);

// ── Конфигурация CVM ────────────────────────────────────────────────────────
r.get(
  "/config",
  asyncHandler(async (req, res) => res.json(await refreshCvmConfig(true)))
);
r.put(
  "/config",
  requireRole("director", "sysadmin"),
  asyncHandler(async (req, res) => {
    const parsed = CvmSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: "Неверный формат настроек" });
    const saved = await saveCvmConfig(parsed.data, req.user.uid);
    await logCvm(
      req,
      "cvm_config_update",
      `CVM: окно оттока ${saved.churnDays} дн.`
    );
    res.json(saved);
  })
);

// ── Кампании / офферы ───────────────────────────────────────────────────────
// Запуск кампании = зафиксировать целевую аудиторию (клиенты сегмента с
// согласием на рассылку) и её размер. Персональная доставка требует шлюза
// SMS/мессенджера или Telegram-id клиентов — в v1 отдаём список для выгрузки и
// уведомляем команду в Telegram. Так «действие» честное и не имитирует отправку.
r.get(
  "/campaigns",
  asyncHandler(async (req, res) => {
    const items = await db.cvmCampaign.findMany({
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    res.json({ items });
  })
);

const CampaignSchema = z.object({
  name: z.string().min(1).max(200),
  segment: z.string().min(1).max(40), // код сегмента или "all"
  offer: z.string().max(1000).default(""),
  channel: z.enum(["telegram", "sms", "manual"]).default("manual"),
});

r.post(
  "/campaigns",
  asyncHandler(async (req, res) => {
    const parsed = CampaignSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: "Неверный формат кампании" });
    const created = await db.cvmCampaign.create({
      data: { ...parsed.data, status: "draft", createdById: req.user.uid },
    });
    await logCvm(
      req,
      "cvm_campaign_create",
      `Кампания «${created.name}» (сегмент ${created.segment})`
    );
    res.status(201).json(created);
  })
);

// Аудитория сегмента с согласием на рассылку (для запуска/выгрузки).
async function audienceForSegment(segment) {
  const cfg = await refreshCvmConfig(true);
  const all = await db.customer.findMany({ take: 20000 });
  const scored = scoreCustomers(all, Date.now(), cfg.churnDays);
  return scored.filter(
    (c) => c.consent && (segment === "all" || c.segment === segment)
  );
}

r.get(
  "/campaigns/:id/audience",
  asyncHandler(async (req, res) => {
    const camp = await db.cvmCampaign.findUnique({
      where: { id: req.params.id },
    });
    if (!camp) return res.status(404).json({ error: "Кампания не найдена" });
    const aud = await audienceForSegment(camp.segment);
    res.json({
      count: aud.length,
      audience: aud.map((c) => ({ name: c.name, phone: c.phone })),
    });
  })
);

r.post(
  "/campaigns/:id/send",
  requireRole("director", "finance", "sysadmin"),
  asyncHandler(async (req, res) => {
    const camp = await db.cvmCampaign.findUnique({
      where: { id: req.params.id },
    });
    if (!camp) return res.status(404).json({ error: "Кампания не найдена" });
    if (camp.status === "sent")
      return res.status(400).json({ error: "Кампания уже запущена" });
    const aud = await audienceForSegment(camp.segment);
    const updated = await db.cvmCampaign.update({
      where: { id: camp.id },
      data: {
        status: "sent",
        audience: aud.length,
        sentCount: aud.length,
        sentAt: new Date(),
      },
    });
    // Команде — сводка о запуске (best-effort). Персональную доставку делает
    // внешний канал по выгруженному списку аудитории.
    sendTelegram(
      `🎯 <b>CVM кампания запущена</b>\n«${camp.name}» · сегмент ${camp.segment}\n` +
        `Аудитория (с согласием): ${aud.length}\n${camp.offer ? `Оффер: ${camp.offer}` : ""}`,
      undefined,
      topicFor("reports")
    );
    await logCvm(
      req,
      "cvm_campaign_send",
      `Запущена кампания «${camp.name}»: аудитория ${aud.length}`
    );
    res.json({
      campaign: updated,
      audience: aud.map((c) => ({ name: c.name, phone: c.phone })),
    });
  })
);

// ── Синхронизация с iiko Лояльность (обогащение по телефону) ─────────────────
r.get("/iiko-status", (req, res) =>
  res.json({ configured: iikoLoyaltyConfigured() })
);
r.post(
  "/sync-iiko",
  requireRole("director", "sysadmin"),
  asyncHandler(async (req, res) => {
    try {
      const out = await syncCustomersFromIiko({ limit: 500 });
      await logCvm(
        req,
        "cvm_iiko_sync",
        `Обогащение из iiko Лояльность: обработано ${out.scanned}, обновлено ${out.enriched}`
      );
      res.json(out);
    } catch (e) {
      if (e instanceof IikoLoyaltyNotConfiguredError) {
        return res.status(503).json({ error: e.message, configured: false });
      }
      return res
        .status(502)
        .json({ error: e.message || "Ошибка iiko Лояльность" });
    }
  })
);

export default r;
