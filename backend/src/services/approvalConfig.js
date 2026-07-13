// Пороги согласования расходов. Расход с суммой в сумах не выше порога
// проводится сразу (approved), выше — уходит на согласование (pending). Порог
// можно переопределить по филиалу. Управляется директором/сисадмином в админке.
//
// По умолчанию порог 0 — согласования требует любой расход (прежнее поведение,
// новые установки ничего не теряют). Одна строка (id=1), кэш TTL 60 сек.
import { z } from "zod";
import { db } from "../db.js";
import { log } from "./../logger.js";

// threshold — общий порог в сумах; branchThresholds — переопределение по
// филиалу (ключ — id филиала строкой). Отрицательные значения не допускаются.
export const ApprovalSchema = z.object({
  threshold: z.number().min(0).max(9e15).default(0),
  branchThresholds: z
    .record(z.string().max(20), z.number().min(0).max(9e15))
    .default({})
    .refine((o) => Object.keys(o).length <= 100, {
      message: "Слишком много филиалов",
    }),
});

function defaults() {
  return { threshold: 0, branchThresholds: {} };
}

let cache = { data: defaults(), at: 0, loaded: false };
const TTL_MS = 60 * 1000;

export async function refreshApprovalConfig(force = false) {
  if (!force && cache.loaded && Date.now() - cache.at < TTL_MS)
    return cache.data;
  try {
    const row = await db.approvalConfig.findUnique({ where: { id: 1 } });
    const parsed = row ? ApprovalSchema.safeParse(row.data) : null;
    if (row && !parsed.success) {
      log.warn(
        { err: parsed.error?.message },
        "approval: конфигурация не прошла валидацию — дефолты"
      );
    }
    cache = {
      data: parsed && parsed.success ? parsed.data : defaults(),
      at: Date.now(),
      loaded: true,
    };
  } catch (e) {
    log.warn({ err: e.message }, "approval: не удалось прочитать из БД");
    cache.at = Date.now();
  }
  return cache.data;
}

export function getApprovalCached() {
  return cache.data;
}

// Порог для конкретного филиала: переопределение по филиалу или общий порог.
export function thresholdForBranch(branchId) {
  const cfg = getApprovalCached();
  const key = branchId == null ? "" : String(branchId);
  if (
    key &&
    Object.prototype.hasOwnProperty.call(cfg.branchThresholds || {}, key)
  ) {
    return Number(cfg.branchThresholds[key]) || 0;
  }
  return Number(cfg.threshold) || 0;
}

export async function saveApprovalConfig(data, userId) {
  const parsed = ApprovalSchema.parse({ ...defaults(), ...data });
  await db.approvalConfig.upsert({
    where: { id: 1 },
    create: { id: 1, data: parsed, updatedById: userId || null },
    update: { data: parsed, updatedById: userId || null },
  });
  cache = { data: parsed, at: Date.now(), loaded: true };
  return parsed;
}
