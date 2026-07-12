// Настройка доступа по ролям: сисадмин клиента задаёт, какие разделы видит
// каждая роль. Хранится как оверрайды { role: { sectionKey: bool } } поверх
// дефолтов навигации (дефолты живут во фронте — здесь только исключения).
// Чтение — всем вошедшим (фронт строит меню), запись — sysadmin (и owner).
import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { asyncHandler } from "../util/asyncHandler.js";

const r = Router();
r.use(requireAuth);

// Свободная, но безопасная форма: role -> { key -> boolean }. Ключи ролей и
// разделов — строки; значения строго boolean. Ограничения на размер.
const AccessSchema = z.object({
  overrides: z
    .record(
      z.string().max(40),
      z
        .record(z.string().max(60), z.boolean())
        .refine((obj) => Object.keys(obj).length <= 60, {
          message: "Слишком много разделов",
        })
    )
    .refine((obj) => Object.keys(obj).length <= 40, {
      message: "Слишком много ролей",
    }),
});

r.get(
  "/",
  asyncHandler(async (req, res) => {
    const row = await db.accessConfig.findUnique({ where: { id: 1 } });
    const parsed = row ? AccessSchema.safeParse(row.data) : null;
    res.json(parsed && parsed.success ? parsed.data : { overrides: {} });
  })
);

r.put(
  "/",
  asyncHandler(async (req, res) => {
    if (!["sysadmin", "owner"].includes(req.user.role)) {
      return res.status(403).json({
        error: "Настройка доступа — только системному администратору",
      });
    }
    const parsed = AccessSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Неверный формат настроек доступа" });
    }
    const saved = await db.accessConfig.upsert({
      where: { id: 1 },
      create: { id: 1, data: parsed.data, updatedById: req.user.uid },
      update: { data: parsed.data, updatedById: req.user.uid },
    });
    await db.auditLog
      .create({
        data: {
          userId: req.user.uid,
          event: "access_config_update",
          detail: "Изменена настройка доступа по ролям",
          ip: req.ip,
        },
      })
      .catch(() => {});
    res.json(saved.data);
  })
);

export default r;
