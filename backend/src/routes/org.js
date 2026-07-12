// Конфигурация организации: чтение — всем вошедшим (фронт строит по ней
// филиалы/окна), запись — директор/сисадмин. Публичный /public отдаёт только
// название бренда — для экрана входа.
import { Router } from "express";
import { db } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { asyncHandler } from "../util/asyncHandler.js";
import { refreshOrgConfig, saveOrgConfig } from "../services/orgConfig.js";

const r = Router();

// Без авторизации: только бренд (для страницы входа).
r.get(
  "/public",
  asyncHandler(async (req, res) => {
    const cfg = await refreshOrgConfig();
    res.json({ brandName: cfg.brandName });
  })
);

r.use(requireAuth);

r.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json(await refreshOrgConfig());
  })
);

r.put(
  "/",
  requireRole("director", "sysadmin"),
  asyncHandler(async (req, res) => {
    try {
      const saved = await saveOrgConfig(req.body, req.user.uid);
      await db.auditLog
        .create({
          data: {
            userId: req.user.uid,
            event: "org_config_update",
            detail: `Изменена конфигурация организации (${saved.branches.length} филиалов)`,
            ip: req.ip,
          },
        })
        .catch(() => {});
      res.json(saved);
    } catch (e) {
      if (e && e.name === "ZodError") {
        return res
          .status(400)
          .json({ error: "Неверный формат конфигурации организации" });
      }
      throw e;
    }
  })
);

export default r;
