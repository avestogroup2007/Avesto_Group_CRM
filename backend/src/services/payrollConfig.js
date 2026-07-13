// Ставки оплаты труда по сотруднику (управляется директором/сисадмином в
// админке): режим (оклад/почасовой) и сумма. Ставок в iiko-API нет — задаются
// в системе. Одна строка (id=1), кэш TTL 60 сек.
import { z } from "zod";
import { db } from "../db.js";
import { log } from "./../logger.js";

export const PayrollSchema = z.object({
  rates: z
    .record(
      z.string().max(40),
      z.object({
        mode: z.enum(["salary", "hourly"]).default("salary"),
        amount: z.number().min(0).max(9e12).default(0),
      })
    )
    .refine((o) => Object.keys(o).length <= 5000, {
      message: "Слишком много сотрудников",
    }),
});

function defaults() {
  return { rates: {} };
}

let cache = { data: defaults(), at: 0, loaded: false };
const TTL_MS = 60 * 1000;

export async function refreshPayrollConfig(force = false) {
  if (!force && cache.loaded && Date.now() - cache.at < TTL_MS)
    return cache.data;
  try {
    const row = await db.payrollConfig.findUnique({ where: { id: 1 } });
    const parsed = row ? PayrollSchema.safeParse(row.data) : null;
    if (row && !parsed.success) {
      log.warn(
        { err: parsed.error?.message },
        "payroll: конфигурация не прошла валидацию — дефолты"
      );
    }
    cache = {
      data: parsed && parsed.success ? parsed.data : defaults(),
      at: Date.now(),
      loaded: true,
    };
  } catch (e) {
    log.warn({ err: e.message }, "payroll: не удалось прочитать из БД");
    cache.at = Date.now();
  }
  return cache.data;
}

export function getPayrollCached() {
  return cache.data;
}

export async function savePayrollConfig(data, userId) {
  const parsed = PayrollSchema.parse(data);
  await db.payrollConfig.upsert({
    where: { id: 1 },
    create: { id: 1, data: parsed, updatedById: userId || null },
    update: { data: parsed, updatedById: userId || null },
  });
  cache = { data: parsed, at: Date.now(), loaded: true };
  return parsed;
}
