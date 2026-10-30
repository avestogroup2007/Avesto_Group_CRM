// Прокси-маршруты iiko (iikoServer API): фронтенд обращается сюда, а не к iiko
// напрямую — логин/пароль остаются на сервере. Все маршруты требуют входа.
import { Router } from "express";
import { db } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { asyncHandler } from "../util/asyncHandler.js";
import {
  iikoConfigured,
  IikoNotConfiguredError,
  salesReport,
  listEmployees,
  pnlReport,
  riskyReport,
  productionRefs,
  createProduction,
  productionReport,
  productionSample,
  foodCostSales,
  listAttendance,
  listRoles,
} from "../services/iikoServer.js";
import {
  refreshFoodCostConfig,
  computeFoodCost,
} from "../services/foodCostConfig.js";
import {
  syncEmployeesToDb,
  listDbEmployees,
  updateEmployeeAccess,
} from "../services/iikoSync.js";
import { sendTelegram, topicFor, esc } from "../services/telegram.js";
import { cachedReport } from "../services/iikoCache.js";
import { forcedBranch, FINANCE_FREE } from "../util/branchScope.js";
import { refreshOrgConfig, orgBranchById } from "../services/orgConfig.js";

// iiko-подразделение (department), которым ограничен пользователь, или null,
// если он видит все филиалы. Управляющий ограничен своим филиалом; бухгалтер и
// офис — все. Бросает 403-совместимую ошибку, если филиал не сопоставлен с iiko.
async function forcedDepartment(user) {
  const forced = forcedBranch(user, {
    alsoFree: FINANCE_FREE,
    failClosed: true,
  });
  if (!forced) return null;
  await refreshOrgConfig().catch(() => {});
  const b = orgBranchById(forced);
  if (!b || !b.iikoDept) {
    const e = new Error("Ваш филиал не сопоставлен с подразделением iiko");
    e.statusCode = 403;
    throw e;
  }
  return b.iikoDept;
}

// Срок жизни отчётов теперь решает services/iikoCache.js: закрытые периоды
// хранятся в БД бессрочно (данные за прошедший день не меняются), период с
// «сегодня» — коротко. Поэтому локальный reportTtl здесь больше не нужен.

const r = Router();
r.use(requireAuth);
// Финансовые отчёты (OLAP/ОПиУ/подозрительные) и кадровые данные — только
// офисным ролям и управляющим: линейному персоналу выручка компании и список
// сотрудников с контактами не положены.

// Превращает «iiko не настроен» в 503, остальное — 502 с реальной причиной.
function handleIiko(fn) {
  return asyncHandler(async (req, res) => {
    try {
      await fn(req, res);
    } catch (e) {
      if (e instanceof IikoNotConfiguredError) {
        return res.status(503).json({ error: e.message, configured: false });
      }
      // Явный статус (напр. 403 при ограничении по филиалу) отдаём как есть.
      if (e && e.statusCode) {
        return res.status(e.statusCode).json({ error: e.message });
      }
      // Показываем реальную причину от iiko — помогает при настройке
      // (неверный логин/пароль, недоступный сервер и т.п.). Для документов
      // дополнительно отдаём отправленный XML: по нему сразу видно, какого
      // поля не хватило конкретной сборке iikoChain.
      return res.status(502).json({
        error: e.message || "Ошибка запроса к iiko",
        ...(e.sentXml ? { sentXml: e.sentXml } : {}),
        ...(e.iikoResponse ? { iikoResponse: e.iikoResponse } : {}),
      });
    }
  });
}

// Настроена ли интеграция — фронт покажет demo/live соответственно.
r.get("/status", (req, res) => res.json({ configured: iikoConfigured() }));

// OLAP-отчёт продаж за период. Тело:
// { from: "YYYY-MM-DD", to: "YYYY-MM-DD", department?: "Имя филиала" }.
// Возвращает { byDay, byPay, byDish } для вкладок аналитики.
r.post(
  "/olap",
  requireRole("director", "finance", "accountant", "sysadmin", "manager"),
  handleIiko(async (req, res) => {
    const { from, to, department } = req.body || {};
    if (!from || !to) {
      return res.status(400).json({ error: "Нужны параметры from и to" });
    }
    // Управляющий ограничен своим филиалом; бухгалтер/офис — любой/все.
    const dept = (await forcedDepartment(req.user)) || department;
    const departments = dept ? [dept] : undefined;
    res.json(
      await cachedReport(
        { kind: "olap", scope: dept || "all", from, to },
        () => salesReport({ from, to, departments })
      )
    );
  })
);

// Себестоимость (food cost) за период: продажи по блюдам из iiko × заданная в
// системе себестоимость (гибрид). Тело: { from, to, department? }. Возвращает
// строки по блюдам (выручка, себестоимость, ФК%, маржа) и итоги. Продажи
// кэшируются как остальные отчёты; себестоимость применяется поверх, поэтому
// правка настроек отражается сразу (без ожидания кэша iiko).
r.post(
  "/food-cost",
  requireRole("director", "finance", "accountant", "sysadmin"),
  handleIiko(async (req, res) => {
    const { from, to, department } = req.body || {};
    const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
    if (!isDate(from) || !isDate(to)) {
      return res
        .status(400)
        .json({ error: "Нужны корректные даты from и to (ГГГГ-ММ-ДД)" });
    }
    const dept = (await forcedDepartment(req.user)) || department;
    const departments = dept ? [dept] : undefined;
    const rows = await cachedReport(
      { kind: "foodcost", scope: dept || "all", from, to },
      () => foodCostSales({ from, to, departments })
    );
    const cfg = await refreshFoodCostConfig(true);
    const dishes = (Array.isArray(rows) ? rows : []).map((x) => ({
      name: x.DishName || "—",
      group: x["DishGroup.TopParent"] || "",
      revenue: Number(x.DishDiscountSumInt ?? x.DishSumInt ?? 0),
      qty: Number(x.DishAmountInt ?? 0),
    }));
    res.json({
      configured: true,
      from,
      to,
      defaultPct: cfg.defaultPct,
      ...computeFoodCost(dishes, cfg),
    });
  })
);

// Отчёт о прибылях и убытках (ОПиУ) за период. Тело: { from, to }.
// Структура берётся из плана счетов iiko (по типам счетов) — динамически.
r.post(
  "/pnl",
  requireRole("director", "finance", "accountant", "sysadmin", "manager"),
  handleIiko(async (req, res) => {
    const { from, to, department } = req.body || {};
    if (!from || !to) {
      return res.status(400).json({ error: "Нужны параметры from и to" });
    }
    const dept = (await forcedDepartment(req.user)) || department;
    res.json(
      await cachedReport(
        { kind: "pnl", scope: dept || "all", from, to },
        () => pnlReport({ from, to, department: dept || undefined })
      )
    );
  })
);

// Подозрительные операции за период: удаления/сторно заказов и крупные
// скидки в разрезе сотрудников. Тело: { from, to, department?, discountPct? }.
r.post(
  "/risky",
  requireRole("director", "finance", "accountant", "sysadmin", "manager"),
  handleIiko(async (req, res) => {
    const { from, to, department, discountPct } = req.body || {};
    if (!from || !to) {
      return res.status(400).json({ error: "Нужны параметры from и to" });
    }
    const dept = (await forcedDepartment(req.user)) || department;
    res.json(
      await cachedReport(
        {
          kind: "risky",
          // Процент скидки входит в scope: при другом пороге это другой отчёт.
          scope: `${dept || "all"}:${discountPct ?? "def"}`,
          from,
          to,
        },
        () =>
          riskyReport({
            from,
            to,
            department: dept || undefined,
            discountPct:
              typeof discountPct === "number" ? discountPct : undefined,
          })
      )
    );
  })
);

// Список сотрудников из iiko (для импорта в справочник CRM). Пока только
// чтение/предпросмотр: { employees: [...], count }. Возвращает ФИО, должность,
// подразделения и признак «уволен» — источник правды по кадрам это iiko.
// Только офисные роли: список сотрудников с должностями/контактами — по всей
// сети, поэтому управляющему филиала (manager) не отдаём (утечка чужих кадров).
r.get(
  "/employees",
  requireRole("director", "finance", "accountant", "sysadmin"),
  handleIiko(async (req, res) => {
    res.json(await listEmployees());
  })
);

// Справочники для «Акта приготовления»: блюда/заготовки (с тех.картой) и
// склады из iiko. Пока только чтение — проверяем данные перед записью актов.
// Доступ — офисные роли и управляющий.
r.get(
  "/production/refs",
  requireRole("director", "finance", "accountant", "sysadmin"),
  handleIiko(async (req, res) => {
    res.json(await productionRefs());
  })
);

// Отчёт производства за период: какие товары и в каком количестве произведены
// (по проведённым актам приготовления в iiko), с отделом (папкой) товара.
// Тело: { from, to }. Кэш как у остальных отчётов.
r.post(
  "/production/report",
  requireRole("director", "finance", "accountant", "sysadmin"),
  handleIiko(async (req, res) => {
    const { from, to } = req.body || {};
    if (!from || !to) {
      return res.status(400).json({ error: "Нужны параметры from и to" });
    }
    res.json(
      await cachedReport({ kind: "prodrep", scope: "all", from, to }, () =>
        productionReport({ from, to })
      )
    );
  })
);

// Образец РЕАЛЬНОГО акта приготовления из iiko (сырой XML выгрузки).
// Нужен, когда импорт отвергается («store must not be null» и т.п.): по
// выгрузке видно точные имена полей конкретной сборки iikoChain, а не
// предполагаемые. Ничего не пишет.
r.get(
  "/production/sample",
  requireRole("director", "finance", "accountant", "sysadmin"),
  handleIiko(async (req, res) => {
    const to =
      String(req.query.to || "") ||
      new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tashkent" });
    // По умолчанию смотрим на месяц назад — там наверняка есть проведённые акты.
    const from =
      String(req.query.from || "") ||
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toLocaleDateString(
        "en-CA",
        { timeZone: "Asia/Tashkent" }
      );
    res.json(await productionSample({ from, to }));
  })
);

// Создание «Акта приготовления» в iiko. Тело:
// { date, storeId, items:[{productId, amount}], number?, comment?, dryRun? }.
// dryRun:true — только предпросмотр XML (в iiko ничего не пишется). Реальное
// проведение (dryRun:false) меняет остатки в iiko — фиксируем в журнале.
// Только офисные роли: storeId приходит из запроса, а сопоставления склад→
// филиал в системе нет, поэтому управляющего филиала (manager) не пускаем —
// иначе он смог бы провести акт в склад ЧУЖОГО филиала (запись в остатки iiko).
r.post(
  "/production/act",
  requireRole("director", "finance", "accountant", "sysadmin"),
  handleIiko(async (req, res) => {
    const { date, storeId, items, number, comment, dryRun } = req.body || {};
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) {
      return res.status(400).json({ error: "Нужна дата (ГГГГ-ММ-ДД)" });
    }
    if (!storeId) return res.status(400).json({ error: "Выберите склад" });
    if (!Array.isArray(items) || !items.length) {
      return res.status(400).json({ error: "Добавьте хотя бы одно блюдо" });
    }
    for (const it of items) {
      if (!it || !it.productId || !(Number(it.amount) > 0)) {
        return res
          .status(400)
          .json({ error: "У каждой позиции нужен продукт и количество > 0" });
      }
    }
    const result = await createProduction({
      date,
      storeId,
      items,
      number: number || "",
      comment: comment || "",
      dryRun: !!dryRun,
    });
    // В журнал пишем только реальное проведение (не предпросмотр).
    if (!dryRun) {
      await db.auditLog
        .create({
          data: {
            userId: req.user.uid,
            event: "iiko_production_act",
            detail: `Акт приготовления в iiko: склад ${storeId}, позиций ${items.length}, дата ${date}`,
            ip: req.ip,
          },
        })
        .catch(() => {});
    }
    res.json(result);
  })
);

// Синхронизация кадров из iiko в базу CRM (только директор/сисадмин).
// Заводит/обновляет учётные записи, уволенных в iiko блокирует.
r.post(
  "/employees/sync",
  requireRole("director", "sysadmin"),
  handleIiko(async (req, res) => {
    const result = await syncEmployeesToDb();
    // Массовое заведение/блокировка учёток — изменение границ доступа, пишем
    // в журнал безопасности (best-effort).
    await db.auditLog
      .create({
        data: {
          userId: req.user.uid,
          event: "iiko_employees_sync",
          detail: `Синхронизация кадров iiko: всего ${result.total}, новых ${result.created}, обновлено ${result.updated}, заблокировано ${result.blocked}`,
          ip: req.ip,
        },
      })
      .catch(() => {});
    // Персонал: сводка синхронизации в свою тему (best-effort).
    sendTelegram(
      `👥 <b>Синхронизация с iiko</b>\n` +
        `Всего: ${result.total} · новых: ${result.created} · ` +
        `обновлено: ${result.updated} · заблокировано: ${result.blocked}`,
      undefined,
      topicFor("staff")
    );
    res.json(result);
  })
);

// Список уже синхронизированных из iiko сотрудников (учётные записи CRM).
r.get(
  "/employees/db",
  requireRole("director", "sysadmin"),
  asyncHandler(async (req, res) => {
    res.json({ employees: await listDbEmployees() });
  })
);

// Настройка прав сотрудника из iiko: роль и/или активность (доступ ко входу).
r.patch(
  "/employees/:id",
  requireRole("director", "sysadmin"),
  asyncHandler(async (req, res) => {
    const { role, active, telegramId, checklistBranch, allBranches } =
      req.body || {};
    try {
      const updated = await updateEmployeeAccess(req.params.id, {
        role,
        active,
        telegramId,
        checklistBranch,
        allBranches,
      });
      // Журнал безопасности: изменение роли/доступа/филиала — чувствительная
      // операция (граница доступа), фиксируем кто и что менял.
      await db.auditLog
        .create({
          data: {
            userId: req.user.uid,
            event: "employee_access_update",
            detail:
              `Доступ сотрудника ${updated.displayName || updated.login || req.params.id}: ` +
              `роль ${updated.role}, ${updated.active ? "активен" : "заблокирован"}` +
              (checklistBranch != null
                ? `, филиал ${checklistBranch || "—"}`
                : "") +
              (allBranches !== undefined
                ? `, надзор за всеми филиалами: ${allBranches ? "да" : "нет"}`
                : ""),
            ip: req.ip,
          },
        })
        .catch(() => {});
      // Персонал: изменение доступа сотрудника в свою тему (best-effort).
      sendTelegram(
        `👤 <b>Доступ сотрудника изменён</b>\n` +
          `${esc(updated.displayName || updated.login || "—")} — ` +
          `роль: ${esc(updated.role)}, ` +
          `${updated.active ? "активен ✅" : "заблокирован ⛔"}`,
        undefined,
        topicFor("staff")
      );
      res.json(updated);
    } catch (e) {
      res.status(400).json({ error: e.message || "Не удалось обновить" });
    }
  })
);


// Учёт рабочего времени из iiko: ?from=YYYY-MM-DD&to=YYYY-MM-DD.
// Явки (/resto/api/employees/attendance) содержат начало и конец смены и
// подразделение, в котором смена открыта, — этого достаточно для табеля:
// часы по сотруднику, по подразделению и список самих смен.
// Управляющий ограничен своим филиалом, офис видит всю сеть.
r.get(
  "/attendance",
  requireRole("director", "finance", "accountant", "sysadmin", "manager"),
  handleIiko(async (req, res) => {
    const { from, to, department, position } = req.query;
    const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
    if (!isDate(from) || !isDate(to)) {
      return res.status(400).json({ error: "Нужны даты from и to (ГГГГ-ММ-ДД)" });
    }
    // Управляющему филиал навязан; офис может выбрать филиал сам — иначе
    // фильтр «Все филиалы» в шапке на этом экране ни на что не влиял бы.
    const dept =
      (await forcedDepartment(req.user)) ||
      (department ? String(department) : null);
    const [rows, roles, users] = await Promise.all([
      cachedReport({ kind: "attendance", scope: "all", from, to }, () =>
        listAttendance({ from, to })
      ),
      listRoles().catch(() => ({ byCode: {}, byId: {} })),
      db.user.findMany({
        where: { iikoId: { not: null } },
        select: { iikoId: true, displayName: true, name: true },
      }),
    ]);
    // Имя сотрудника по его id в iiko: в явках приходит только employeeId.
    const nameByIiko = new Map(
      users.map((u) => [u.iikoId, u.displayName || u.name || ""])
    );
    // Фильтр филиала применяем ПОСЛЕ кэша: отчёт из iiko один на сеть, и
    // кэшировать его отдельно под каждого управляющего было бы расточительно.
    // Должность явки резолвим по roleId: в самой явке приходит GUID.
    const roleName = (r) => (roles.byId || {})[r.roleId] || "";
    const scoped = rows.filter(
      (r) =>
        (!dept || r.departmentName === dept) &&
        (!position || roleName(r) === String(position))
    );
    const byEmployee = new Map();
    const byDepartment = new Map();
    for (const r of scoped) {
      const key = r.employeeId;
      if (!byEmployee.has(key)) {
        byEmployee.set(key, {
          employeeId: key,
          name: nameByIiko.get(key) || "— не найден в CRM —",
          minutes: 0,
          shifts: 0,
          departments: new Set(),
          positions: new Set(),
        });
      }
      const e = byEmployee.get(key);
      e.minutes += r.minutes;
      e.shifts += 1;
      if (r.departmentName) e.departments.add(r.departmentName);
      const pos = roleName(r);
      if (pos) e.positions.add(pos);
      const d = r.departmentName || "— без подразделения —";
      byDepartment.set(d, (byDepartment.get(d) || 0) + r.minutes);
    }
    const employees = [...byEmployee.values()]
      .map((e) => ({
        employeeId: e.employeeId,
        name: e.name,
        minutes: e.minutes,
        hours: Math.round((e.minutes / 60) * 10) / 10,
        shifts: e.shifts,
        departments: [...e.departments],
        positions: [...e.positions],
      }))
      .sort((a, b) => b.minutes - a.minutes);
    res.json({
      from,
      to,
      department: dept || null,
      position: position ? String(position) : null,
      // Подразделения и должности, РЕАЛЬНО встречающиеся в явках периода.
      // Списки считаются до фильтрации (по rows, а не scoped), иначе после
      // выбора филиала выпадашка схлопнулась бы до одного пункта и вернуться
      // к «всем» было бы нечем. Должности берём не из справочника целиком:
      // из 34 в периоде заняты единицы, остальные были бы мусором в фильтре.
      departments: [
        ...new Set(rows.map((r) => r.departmentName).filter(Boolean)),
      ].sort((a, b) => a.localeCompare(b, "ru")),
      positions: [...new Set(rows.map(roleName).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, "ru")
      ),
      roles,
      totals: {
        shifts: scoped.length,
        open: scoped.filter((r) => r.open).length,
        minutes: scoped.reduce((a, r) => a + r.minutes, 0),
        employees: employees.length,
      },
      byDepartment: [...byDepartment.entries()]
        .map(([name, minutes]) => ({
          name,
          minutes,
          hours: Math.round((minutes / 60) * 10) / 10,
        }))
        .sort((a, b) => b.minutes - a.minutes),
      employees,
      shifts: scoped.slice(0, 500),
    });
  })
);

export default r;
