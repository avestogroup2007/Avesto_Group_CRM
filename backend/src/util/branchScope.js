// Серверное ограничение данных по филиалу. Старшие роли вправе работать по
// любому филиалу (выбирают сами); остальные привязаны к своему рабочему филиалу
// (assignedBranch = checklistBranch), если он задан. Так привязка сотрудника к
// филиалу становится настоящей границей на сервере, а не только видимостью в UI.
const BRANCH_FREE_ROLES = new Set(["owner", "director", "finance", "sysadmin"]);

// Филиал (строкой), к которому принудительно ограничен пользователь, или null —
// если он вправе работать по любому филиалу либо не привязан к филиалу.
// opts.alsoFree — дополнительные роли, которые для данного случая тоже видят
// все филиалы (напр. бухгалтер при ЧТЕНИИ финансов — обзорная роль по решению
// владельца, тогда как управляющий ограничен своим филиалом).
export function forcedBranch(user, opts = {}) {
  if (!user || BRANCH_FREE_ROLES.has(user.role)) return null;
  if (Array.isArray(opts.alsoFree) && opts.alsoFree.includes(user.role))
    return null;
  const b = user.assignedBranch;
  return b != null && String(b).trim() !== "" ? String(b).trim() : null;
}

// Роли, которые видят финансы по всей компании (обзорные). Бухгалтер — по
// решению владельца — видит компанию целиком; управляющий ограничен филиалом.
export const FINANCE_FREE = ["accountant"];
