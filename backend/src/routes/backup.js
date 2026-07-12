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
    // Предел на таблицу — защита от OOM/подвисания сериализации на большой
    // базе. При достижении лимита в ответе будет truncated:true (см. ниже).
    const CAP = 100000;
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
      orgConfig,
      vendorClients,
      featureRequests,
      auditLog,
    ] = await Promise.all([
      db.company.findMany(),
      db.branch.findMany(),
      // Учётки включаются целиком (с хэшами паролей — они bcrypt): копия
      // должна позволять полное восстановление. Доступ к файлу — как к базе.
      db.user.findMany(),
      db.task.findMany({ take: CAP }),
      db.taskHistory.findMany({ take: CAP }),
      db.comment.findMany({ take: CAP }),
      db.moneyTx.findMany({ take: CAP }),
      db.moneyDict.findMany(),
      db.moneyRecurring.findMany(),
      db.ledgerAccount.findMany(),
      db.postingRule.findMany(),
      db.posting.findMany({ take: CAP }),
      db.cashReport.findMany({ take: CAP }),
      db.shiftChecklistRun.findMany({ take: CAP }),
      // Конфигурация организации, реестр клиентов Back Office и доска развития
      // — тоже часть полной копии (раньше пропускались).
      db.orgConfig.findMany(),
      db.vendorClient.findMany(),
      db.featureRequest.findMany(),
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
        orgConfig,
        vendorClients,
        featureRequests,
        auditLog,
      },
    };
    payload.counts = Object.fromEntries(
      Object.entries(payload.tables).map(([k, v]) => [k, v.length])
    );
    // Флаг, если какая-то таблица упёрлась в предел выгрузки (нужен полный
    // pg_dump через GitHub Actions для по-настоящему больших баз).
    payload.truncated = [tasks, taskHistory, comments, moneyTx, postings].some(
      (t) => t.length >= 100000
    );

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
