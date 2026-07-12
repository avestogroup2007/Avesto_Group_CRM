// Журнал безопасности: чтение AuditLog для директора/сисадмина. Журнал давно
// пишется (входы и неудачные попытки, правки и удаления денег/касс/проводок,
// экспорт и печать) — этот маршрут делает его видимым в админке: защита
// работает только тогда, когда следы кто-то смотрит.
import { Router } from "express";
import { db } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { asyncHandler } from "../util/asyncHandler.js";

const r = Router();
r.use(requireAuth);
r.use(requireRole("director", "sysadmin"));

// GET /api/audit?event=&q=&limit= — последние события, новые сверху.
r.get(
  "/",
  asyncHandler(async (req, res) => {
    const { event, q } = req.query;
    const limit = Math.min(
      Math.max(parseInt(req.query.limit, 10) || 200, 1),
      500
    );
    const where = {};
    if (event) where.event = String(event);
    if (q) {
      where.OR = [
        { detail: { contains: String(q), mode: "insensitive" } },
        { ip: { contains: String(q) } },
        {
          user: {
            OR: [
              { displayName: { contains: String(q), mode: "insensitive" } },
              { name: { contains: String(q), mode: "insensitive" } },
            ],
          },
        },
      ];
    }
    const rows = await db.auditLog.findMany({
      where,
      orderBy: { at: "desc" },
      take: limit,
      include: {
        user: { select: { displayName: true, name: true, role: true } },
      },
    });
    res.json({
      items: rows.map((r2) => ({
        id: r2.id,
        at: r2.at,
        event: r2.event,
        detail: r2.detail || "",
        ip: r2.ip || "",
        userName: r2.user?.displayName || r2.user?.name || "—",
        userRole: r2.user?.role || "",
      })),
    });
  })
);

export default r;
