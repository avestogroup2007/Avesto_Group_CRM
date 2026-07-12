// Проверка прав. Пускает только перечисленные роли, остальным — 403.
// Настоящая защита доступа: даже если пользователь вручную отправит запрос
// в обход интерфейса, сервер откажет.
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(403).json({ error: "Недостаточно прав" });
    }
    // owner — владелец системы (Back Office): полный доступ ко всем разделам.
    if (req.user.role === "owner" || roles.includes(req.user.role)) {
      return next();
    }
    return res.status(403).json({ error: "Недостаточно прав" });
  };
}
