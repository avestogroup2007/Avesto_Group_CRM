// Чек-листы смены, сданные через веб-приложение. Пишутся в ту же таблицу,
// что и чек-листы Telegram-бота (ShiftChecklistRun, via="app") — сводки в
// боте («Чек-листы сегодня», карточка филиала) видят сдачи из обоих каналов.
import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { asyncHandler } from "../util/asyncHandler.js";

const r = Router();
r.use(requireAuth);

const RunSchema = z.object({
  branchId: z.string().min(1).max(20),
  kind: z.enum(["sanitary", "open", "close"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  slot: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable()
    .optional(),
  // Фото в записи не храним (веб держит их у себя) — только отметку о наличии.
  items: z
    .array(
      z.object({
        text: z.string().min(1).max(200),
        done: z.boolean(),
        needPhoto: z.boolean().default(false),
        hasPhoto: z.boolean().default(false),
      })
    )
    .min(1)
    .max(30),
});

// Сдача чек-листа из веб-приложения. Каждая сдача — новая запись (как у бота):
// история пересдач сохраняется, сводки берут последнюю по времени.
r.post(
  "/run",
  asyncHandler(async (req, res) => {
    const parsed = RunSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Неверный формат чек-листа" });
    }
    const d = parsed.data;
    const done = d.items.filter((it) => it.done).length;
    const pct = Math.round((done / d.items.length) * 100);
    const run = await db.shiftChecklistRun.create({
      data: {
        branchId: d.branchId,
        kind: d.kind,
        date: d.date,
        slot: d.slot || null,
        items: d.items,
        pct,
        userId: req.user.uid,
        via: "app",
      },
    });
    res.status(201).json({ id: run.id, pct: run.pct });
  })
);

export default r;
