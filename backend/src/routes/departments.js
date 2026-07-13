// Отделы и маршрутизация категорий: чтение — всем вошедшим (приложение строит
// видимость задач по отделам), запись — директору/сисадмину (это настройка
// оргструктуры). Изменения пишутся в журнал безопасности.
import { Router } from "express";
import { db } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { asyncHandler } from "../util/asyncHandler.js";
import {
  DeptSchema,
  refreshDeptConfig,
  saveDeptConfig,
} from "../services/deptConfig.js";

const r = Router();
r.use(requireAuth);

r.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json(await refreshDeptConfig(true));
  })
);

r.put(
  "/",
  requireRole("director", "sysadmin"),
  asyncHandler(async (req, res) => {
    const parsed = DeptSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Неверный формат отделов" });
    }
    let saved;
    try {
      saved = await saveDeptConfig(parsed.data, req.user.uid);
    } catch (e) {
      return res.status(400).json({ error: e.message || "Ошибка сохранения" });
    }
    await db.auditLog
      .create({
        data: {
          userId: req.user.uid,
          event: "dept_config_update",
          detail: `Отделы обновлены (${saved.departments.length} отд.)`,
          ip: req.ip,
        },
      })
      .catch(() => {});
    res.json(saved);
  })
);

export default r;
