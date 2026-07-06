// Синхронизация кадров из iiko в базу CRM. iiko — источник правды: тянем
// сотрудников, заводим/обновляем учётные записи, уволенных в iiko блокируем.
import bcrypt from "bcrypt";
import { db } from "../db.js";
import { listEmployees } from "./iikoServer.js";

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

// Забирает сотрудников из iiko и upsert-ит их в таблицу User по iikoId.
// Возвращает счётчики. Новым выдаём временный пароль (табельный номер) и флаг
// смены пароля при первом входе.
export async function syncEmployeesToDb() {
  const { employees } = await listEmployees();
  let created = 0;
  let updated = 0;
  let blocked = 0;

  for (const e of employees) {
    if (!e.iikoId) continue;
    const dept = (e.departmentNames || e.departmentCodes || []).join(", ");
    if (e.deleted) blocked++;

    const existing = await db.user.findUnique({ where: { iikoId: e.iikoId } });
    if (existing) {
      await db.user.update({
        where: { iikoId: e.iikoId },
        data: {
          displayName: e.name,
          login: e.login || existing.login,
          position: e.position,
          positionCode: e.positionCode || "",
          iikoDepartment: dept,
          iikoDeleted: e.deleted,
          // Уволенных в iiko блокируем; активность остальных не трогаем
          // (директор мог вручную деактивировать/активировать сотрудника).
          active: e.deleted ? false : existing.active,
          hireDate: e.hireDate || null,
          fireDate: e.fireDate || null,
          source: "iiko",
        },
      });
      updated++;
    } else {
      // Временный пароль = табельный номер (или логин). Обязательная смена.
      const tempPass = String(e.code || e.login || "avesto");
      const passwordHash = await bcrypt.hash(tempPass, 10);
      await db.user.create({
        data: {
          name: `iiko-${e.iikoId}`, // внутренний уникальный ключ
          login: e.login || null,
          displayName: e.name,
          passwordHash,
          role: crmRole(e.positionCode),
          position: e.position,
          positionCode: e.positionCode || "",
          iikoId: e.iikoId,
          iikoDepartment: dept,
          source: "iiko",
          iikoDeleted: e.deleted,
          active: !e.deleted,
          mustChangePassword: true,
          hireDate: e.hireDate || null,
          fireDate: e.fireDate || null,
        },
      });
      created++;
    }
  }

  return { total: employees.length, created, updated, blocked };
}

// Список синхронизированных из iiko сотрудников (для экрана управления).
export async function listDbEmployees() {
  return db.user.findMany({
    where: { source: "iiko" },
    select: {
      id: true,
      displayName: true,
      login: true,
      position: true,
      iikoDepartment: true,
      role: true,
      active: true,
      iikoDeleted: true,
      mustChangePassword: true,
    },
    orderBy: { displayName: "asc" },
  });
}
