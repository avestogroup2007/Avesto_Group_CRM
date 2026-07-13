// Серверное ограничение данных по филиалу. Старшие роли вправе работать по
// любому филиалу (выбирают сами); остальные привязаны к своему рабочему филиалу
// (assignedBranch = checklistBranch), если он задан. Так привязка сотрудника к
// филиалу становится настоящей границей на сервере, а не только видимостью в UI.
const BRANCH_FREE_ROLES = new Set(["owner", "director", "finance", "sysadmin"]);

// Филиал (строкой), к которому принудительно ограничен пользователь, или null —
// если он вправе работать по любому филиалу либо не привязан к филиалу.
export function forcedBranch(user) {
  if (!user || BRANCH_FREE_ROLES.has(user.role)) return null;
  const b = user.assignedBranch;
  return b != null && String(b).trim() !== "" ? String(b).trim() : null;
}
