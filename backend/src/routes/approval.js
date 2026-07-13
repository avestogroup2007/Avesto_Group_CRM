// Пороги согласования расходов: чтение — офисным ролям (для формы кассы),
// запись — директору/сисадмину (это настройка контроля денег). Изменения
// пишутся в журнал безопасности.
import { Router } from "express";
import { db } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { asyncHandler } from "../util/asyncHandler.js";
import {
  ApprovalSchema,
  refreshApprovalConfig,
  saveApprovalConfig,
} from "../services/approvalConfig.js";

const r = Router();
r.use(requireAuth);
r.use(requireRole("director", "finance", "accountant", "sysadmin"));

r.get(
  "/",
  asyncHandler(async (req, res) => {
    const cfg = await refreshApprovalConfig(true);
    res.json(cfg);
  })
);

r.put(
  "/",
  requireRole("director", "sysadmin"),
  asyncHandler(async (req, res) => {
    const parsed = ApprovalSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Неверный формат порогов" });
    }
    const saved = await saveApprovalConfig(parsed.data, req.user.uid);
    await db.auditLog
      .create({
        data: {
          userId: req.user.uid,
          event: "approval_config_update",
          detail: `Пороги согласования: общий ${saved.threshold} сум, филиалов с переопределением ${Object.keys(saved.branchThresholds).length}`,
          ip: req.ip,
        },
      })
      .catch(() => {});
    res.json(saved);
  })
);

export default r;
