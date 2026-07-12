// Синхронизация кадров из iiko в базу CRM. iiko — источник правды: тянем
// сотрудников, заводим/обновляем учётные записи, уволенных в iiko блокируем.
import bcrypt from "bcrypt";
import { db } from "../db.js";
import { listEmployees } from "./iikoServer.js";
import { invalidateUserAuthCache } from "../middleware/requireAuth.js";

// Роль iiko (код) -> роль CRM. Ставится только при СОЗДАНИИ; при обновлении
// роль не трогаем, чтобы не затирать ручные настройки директора/админа.
const ROLE_MAP = {
  ADM: "sysadmin", // Системный администратор
  MN0: "manager", // Управляющий
  MN1: "manager", // Менеджер
};
function crmRole(positionCode) {
  return ROLE_MAP[positionCode] || "staff";
}

// Роли, которым система нужна (управление/офис). Линейный персонал (staff —
// официанты, охранники, повара, посудомойки и т.п.) CRM не нужен: их учётки
// заводятся НЕАКТИВНЫМИ (вход закрыт). Доступ конкретному человеку при
// необходимости открывает администратор (роль + активность в управлении кадрами).
const OFFICE_ROLES = new Set([
  "director",
  "finance",
  "manager",
  "accountant",
  "sysadmin",
]);

// Забирает сотрудников из iiko и upsert-ит их в таблицу User по iikoId.
// Возвращает счётчики. Новым выдаём временный пароль (табельный номер) и флаг
// смены пароля при первом входе.
// Без N+1: существующие учётки читаются ОДНИМ findMany, обновления идут
// параллельными пачками, новые создаются одним createMany (вместо ~2N
// последовательных запросов на N сотрудников).
export async function syncEmployeesToDb() {
  const { employees } = await listEmployees();
  const valid = employees.filter((e) => e.iikoId);
  const blocked = valid.filter((e) => e.deleted).length;

  const existing = await db.user.findMany({
    where: { iikoId: { in: valid.map((e) => e.iikoId) } },
    select: { iikoId: true, login: true, active: true },
  });
  const byIiko = new Map(existing.map((u) => [u.iikoId, u]));

  const updates = [];
  const fresh = [];
  for (const e of valid) {
    const dept = (e.departmentNames || e.departmentCodes || []).join(", ");
    const ex = byIiko.get(e.iikoId);
    if (ex) {
      updates.push({
        where: { iikoId: e.iikoId },
        data: {
          displayName: e.name,
          login: e.login || ex.login,
          position: e.position,
          positionCode: e.positionCode || "",
          iikoDepartment: dept,
          iikoDeleted: e.deleted,
          // Уволенных в iiko блокируем; активность остальных не трогаем
          // (директор мог вручную деактивировать/активировать сотрудника).
          active: e.deleted ? false : ex.active,
          hireDate: e.hireDate || null,
          fireDate: e.fireDate || null,
          source: "iiko",
        },
      });
    } else {
      fresh.push({ e, dept });
    }
  }

  // Обновления — параллельно, пачками по 20 (щадим пул соединений БД).
  for (let i = 0; i < updates.length; i += 20) {
    await Promise.all(updates.slice(i, i + 20).map((u) => db.user.update(u)));
  }

  // Новые — bcrypt-хэши параллельно, вставка одним createMany.
  const rows = await Promise.all(
    fresh.map(async ({ e, dept }) => {
      // Временный пароль = табельный номер (или логин). Обязательная смена.
      const tempPass = String(e.code || e.login || "avesto");
      const passwordHash = await bcrypt.hash(tempPass, 10);
      const role = crmRole(e.positionCode);
      // Активны по умолчанию только управленческие/офисные роли. Линейный
      // персонал — неактивен (вход закрыт), доступ открывает администратор.
      const active = !e.deleted && OFFICE_ROLES.has(role);
      return {
        name: `iiko-${e.iikoId}`, // внутренний уникальный ключ
        login: e.login || null,
        displayName: e.name,
        passwordHash,
        role,
        position: e.position,
        positionCode: e.positionCode || "",
        iikoId: e.iikoId,
        iikoDepartment: dept,
        source: "iiko",
        iikoDeleted: e.deleted,
        active,
        // Пароль управляется в iiko (вход по живому SSO) — принудительная
        // «смена пароля при первом входе» для таких учёток не имеет смысла.
        mustChangePassword: false,
        hireDate: e.hireDate || null,
        fireDate: e.fireDate || null,
      };
    })
  );
  if (rows.length) {
    await db.user.createMany({ data: rows, skipDuplicates: true });
  }

  // Уволенные блокируются в БД — кэш авторизации сбрасываем целиком, чтобы
  // доступ закрылся сразу.
  invalidateUserAuthCache();

  return {
    total: employees.length,
    created: rows.length,
    updated: updates.length,
    blocked,
  };
}

const ALLOWED_ROLES = [
  "director",
  "finance",
  "manager",
  "accountant",
  "sysadmin",
  "staff",
  // Роли владельца системы: owner — полный доступ + Back Office,
  // vendor — сотрудник продаж владельца (видит только Back Office).
  "owner",
  "vendor",
];

// Поля учётной записи сотрудника, отдаваемые на экран управления кадрами.
const EMP_SELECT = {
  id: true,
  displayName: true,
  login: true,
  position: true,
  iikoDepartment: true,
  role: true,
  active: true,
  iikoDeleted: true,
  mustChangePassword: true,
  telegramId: true,
  checklistBranch: true,
};

// Настройка прав синхронизированного сотрудника: роль, активность и привязка к
// Telegram-боту чек-листов (telegramId + филиал). Разрешено менять только записи
// из iiko (source=iiko) — демо/ручные не трогаем.
export async function updateEmployeeAccess(
  id,
  { role, active, telegramId, checklistBranch }
) {
  const existing = await db.user.findUnique({ where: { id } });
  if (!existing || existing.source !== "iiko") {
    throw new Error("Сотрудник из iiko не найден");
  }
  const data = {};
  if (role !== undefined) {
    if (!ALLOWED_ROLES.includes(role)) throw new Error("Недопустимая роль");
    data.role = role;
  }
  if (active !== undefined) data.active = Boolean(active);
  if (telegramId !== undefined) {
    const tid = String(telegramId || "").trim();
    if (tid && !/^\d{3,15}$/.test(tid)) {
      throw new Error("Telegram ID — только цифры");
    }
    data.telegramId = tid || null;
  }
  if (checklistBranch !== undefined) {
    const b = String(checklistBranch || "").trim();
    data.checklistBranch = b || null;
  }
  try {
    const updated = await db.user.update({
      where: { id },
      data,
      select: EMP_SELECT,
    });
    // Блокировка/смена роли действует сразу, не дожидаясь минутного кэша.
    invalidateUserAuthCache(id);
    return updated;
  } catch (e) {
    // Уникальность telegramId: один Telegram — один сотрудник.
    if (e.code === "P2002")
      throw new Error("Этот Telegram уже привязан к другому сотруднику");
    throw e;
  }
}

// Список синхронизированных из iiko сотрудников (для экрана управления).
export async function listDbEmployees() {
  return db.user.findMany({
    where: { source: "iiko" },
    select: EMP_SELECT,
    orderBy: { displayName: "asc" },
  });
}
