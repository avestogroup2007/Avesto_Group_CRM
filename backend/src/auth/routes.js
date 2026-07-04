// Аутентификация: вход по логину/паролю, выход, «кто я».
// Токен выдаётся в httpOnly-cookie, поэтому его нельзя украсть через JS.
import { Router } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { db } from "../db.js";
import { env } from "../env.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { asyncHandler } from "../util/asyncHandler.js";

const r = Router();

const TOKEN_TTL_HOURS = 12;

const LoginSchema = z.object({
  login: z.string().min(1),
  password: z.string().min(1),
});

// Общие параметры cookie в одном месте — чтобы logout снимал ровно ту же cookie.
function cookieOptions() {
  return {
    httpOnly: true, // JS не может прочитать
    secure: env.COOKIE_SECURE, // только по HTTPS (в проде true)
    sameSite: env.COOKIE_SAMESITE, // strict локально; none для кросс-домена (github.io↔onrender)
    path: "/",
  };
}

// POST /api/auth/login
r.post(
  "/login",
  asyncHandler(async (req, res) => {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Неверный формат" });
    }

    const user = await db.user.findFirst({
      where: { name: parsed.data.login, active: true },
    });

    // Одинаковый ответ и текст для «нет пользователя» и «неверный пароль» —
    // чтобы нельзя было по ответу перебирать существующие логины.
    const ok = user
      ? await bcrypt.compare(parsed.data.password, user.passwordHash)
      : false;
    if (!user || !ok) {
      return res.status(401).json({ error: "Неверный логин или пароль" });
    }

    // В токен кладём только id и роль — ничего секретного.
    const token = jwt.sign(
      { uid: user.id, role: user.role, branchId: user.branchId },
      env.JWT_SECRET,
      { expiresIn: `${TOKEN_TTL_HOURS}h` }
    );

    res.cookie("token", token, {
      ...cookieOptions(),
      maxAge: TOKEN_TTL_HOURS * 3600 * 1000,
    });

    // Пишем вход в журнал безопасности.
    await db.auditLog.create({
      data: { userId: user.id, event: "login", ip: req.ip },
    });

    res.json({
      // token в теле — для кросс-доменной связки (фронт на github.io ↔ бэкенд
      // на onrender.com), где межсайтовые cookie ненадёжны. Фронт шлёт его
      // в заголовке Authorization: Bearer. Cookie тоже ставится (для same-origin).
      token,
      id: user.id,
      name: user.name,
      role: user.role,
      branchId: user.branchId,
      position: user.position,
    });
  })
);

// POST /api/auth/logout — снимаем cookie.
r.post("/logout", requireAuth, (req, res) => {
  res.clearCookie("token", cookieOptions());
  res.json({ ok: true });
});

// GET /api/auth/me — данные текущего пользователя (по действующему токену).
r.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await db.user.findUnique({
      where: { id: req.user.uid },
      select: {
        id: true,
        name: true,
        role: true,
        branchId: true,
        position: true,
        active: true,
      },
    });
    if (!user || !user.active) {
      return res.status(401).json({ error: "Пользователь недоступен" });
    }
    res.json(user);
  })
);

export default r;
