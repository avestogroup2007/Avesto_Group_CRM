// Проверка прав. Пускает только перечисленные роли, остальным — 403.
// Настоящая защита доступа: даже если пользователь вручную отправит запрос
// в обход интерфейса, сервер откажет.
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Недостаточно прав" });
    }
    next();
  };
}
