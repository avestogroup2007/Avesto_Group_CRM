// Резервная копия базы из самой программы: сервер выгружает все таблицы в
// один JSON-файл. Не требует доступа к панели Render или секретов GitHub —
// у сервера доступ к БД уже есть. Только директор/сисадмин; каждая выгрузка
// фиксируется в журнале безопасности.
//
// Это логическая копия (данные, не структура). Полное восстановление —
// миграциями Prisma (структура) + загрузкой этого JSON. Ежедневный pg_dump
// через GitHub Actions остаётся рекомендуемым вторым слоем.
import { Router } from "express";
import { db } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { asyncHandler } from "../util/asyncHandler.js";

const r = Router();
r.use(requireAuth);
r.use(requireRole("director", "sysadmin"));

// BigInt и Date — в строки, иначе JSON.stringify падает/теряет данные.
function replacer(key, value) {
  return typeof value === "bigint" ? value.toString() : value;
}

r.get(
  "/export",
  asyncHandler(async (req, res) => {
    const [
      companies,
      branches,
      users,
      tasks,
      taskHistory,
      comments,
      moneyTx,
      moneyDict,
      moneyRecurring,
      ledgerAccounts,
      postingRules,
      postings,
      cashReports,
      shiftChecklistRuns,
      auditLog,
    ] = await Promise.all([
      db.company.findMany(),
      db.branch.findMany(),
      // Учётки включаются целиком (с хэшами паролей — они bcrypt): копия
      // должна позволять полное восстановление. Доступ к файлу — как к базе.
      db.user.findMany(),
      db.task.findMany(),
      db.taskHistory.findMany(),
      db.comment.findMany(),
      db.moneyTx.findMany(),
      db.moneyDict.findMany(),
      db.moneyRecurring.findMany(),
      db.ledgerAccount.findMany(),
      db.postingRule.findMany(),
      db.posting.findMany(),
      db.cashReport.findMany(),
      db.shiftChecklistRun.findMany(),
      db.auditLog.findMany({ orderBy: { at: "desc" }, take: 20000 }),
    ]);

    const stamp = new Date().toLocaleDateString("en-CA", {
      timeZone: "Asia/Tashkent",
    });
    const payload = {
      format: "avesto-crm-backup",
      version: 1,
      createdAt: new Date().toISOString(),
      tables: {
        companies,
        branches,
        users,
        tasks,
        taskHistory,
        comments,
        moneyTx,
        moneyDict,
        moneyRecurring,
        ledgerAccounts,
        postingRules,
        postings,
        cashReports,
        shiftChecklistRuns,
        auditLog,
      },
      counts: Object.fromEntries(
        Object.entries({
          companies,
          branches,
          users,
          tasks,
          taskHistory,
          comments,
          moneyTx,
          moneyDict,
          moneyRecurring,
          ledgerAccounts,
          postingRules,
          postings,
          cashReports,
          shiftChecklistRuns,
          auditLog,
        }).map(([k, v]) => [k, v.length])
      ),
    };

    await db.auditLog
      .create({
        data: {
          userId: req.user.uid,
          event: "backup_export",
          detail: `Скачана резервная копия БД (${Object.values(payload.counts).reduce((a, b) => a + b, 0)} записей)`,
          ip: req.ip,
        },
      })
      .catch(() => {});

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="avesto-crm-backup-${stamp}.json"`
    );
    res.send(JSON.stringify(payload, replacer));
  })
);

export default r;
