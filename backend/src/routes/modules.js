// Модули продукта: чтение — всем вошедшим (фронт скрывает/показывает разделы),
// изменение — только владельцу системы (Back Office). Каталог MODULES отдаётся
// вместе с флагами, чтобы Back Office рисовал переключатели по описаниям.
import { Router } from "express";
import { db } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { asyncHandler } from "../util/asyncHandler.js";
import { MODULES, refreshModules, saveModules } from "../services/modules.js";

const r = Router();
r.use(requireAuth);

r.get(
  "/",
  asyncHandler(async (req, res) => {
    const flags = await refreshModules(true);
    res.json({
      flags,
      catalog: Object.fromEntries(
        Object.entries(MODULES).map(([k, v]) => [
          k,
          { label: v.label, desc: v.desc },
        ])
      ),
    });
  })
);

r.put(
  "/",
  asyncHandler(async (req, res) => {
    // Только владелец системы — не бизнес-роли клиента.
    if (req.user.role !== "owner") {
      return res
        .status(403)
        .json({ error: "Модули включает владелец системы (Back Office)" });
    }
    try {
      const saved = await saveModules(req.body, req.user.uid);
      await db.auditLog
        .create({
          data: {
            userId: req.user.uid,
            event: "modules_update",
            detail: `Изменён набор модулей: ${Object.entries(saved)
              .map(([k, v]) => `${k}=${v ? "вкл" : "выкл"}`)
              .join(", ")}`,
            ip: req.ip,
          },
        })
        .catch(() => {});
      res.json(saved);
    } catch (e) {
      if (e && e.name === "ZodError") {
        return res.status(400).json({ error: "Неверный формат модулей" });
      }
      throw e;
    }
  })
);

export default r;
