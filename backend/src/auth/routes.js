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
import { verifyIikoCredentials } from "../services/iikoServer.js";
import { sendTelegram, topicFor, esc } from "../services/telegram.js";

const r = Router();

const TOKEN_TTL_HOURS = 12;

const LoginSchema = z.object({
  login: z.string().min(1),
  password: z.string().min(1),
});

// Политика доступа: работать в программе могут только сотрудники из iiko
// (source=iiko и не уволены). Исключение — одна защищённая учётка-администратор
// (BOOTSTRAP_ADMIN_LOGIN): для первичной синхронизации и на случай, когда
// iiko-сервер недоступен.
//
// «Мягкий старт»: пока из iiko не синхронизирован НИ ОДИН сотрудник, правило не
// применяется — существующие учётки работают как раньше. Иначе выкатка правила
// закрыла бы вход всем ещё до первой синхронизации (включая владельца). Как
// только появился хотя бы один сотрудник из iiko — правило действует строго.
function isBootstrapAdmin(user) {
  const key = env.BOOTSTRAP_ADMIN_LOGIN;
  return user.name === key || user.login === key;
}

// Бутстрап владельца: если логин совпадает с OWNER_LOGIN (задаётся в окружении
// хостинга), при входе выдаём роль owner — это единственный безопасный способ
// назначить владельца (через интерфейс owner назначить нельзя). Идемпотентно.
async function maybePromoteOwner(user) {
  // Читаем из process.env напрямую — значение задаётся в окружении хостинга
  // (Render) и не является секретом; так же оно доступно и тестам во время
  // выполнения. Схема env.js документирует переменную.
  const key = process.env.OWNER_LOGIN;
  if (!key) return user;
  const matches = user.name === key || user.login === key;
  if (!matches || user.role === "owner") return user;
  const updated = await db.user
    .update({ where: { id: user.id }, data: { role: "owner" } })
    .catch(() => null);
  if (updated) {
    await db.auditLog
      .create({
        data: {
          userId: user.id,
          event: "owner_bootstrap",
          detail: `Аккаунт ${user.name} повышен до owner по OWNER_LOGIN`,
        },
      })
      .catch(() => {});
    return updated;
  }
  return user;
}
async function loginAllowed(user) {
  if (isBootstrapAdmin(user)) return true;
  if (user.source === "iiko") return !user.iikoDeleted;
  // До первой синхронизации кадров из iiko — не блокируем (защита от
  // самоблокировки перед настройкой). После — только iiko.
  const iikoCount = await db.user.count({ where: { source: "iiko" } });
  return iikoCount === 0;
}

// Пароль сотрудника из iiko управляется В iiko (вход — живой SSO-проверкой):
// менять его из CRM невозможно, локальный хэш — лишь кэш на случай, когда iiko
// недоступен. Поэтому таким учёткам не навязываем «смену пароля при первом
// входе» и не показываем локальную смену пароля.
function passwordManagedByIiko(user) {
  return user.source === "iiko" && Boolean(user.login);
}

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

    // Вход по логину из iiko ИЛИ по внутреннему имени (демо-учётки, ручные).
    const user = await db.user.findFirst({
      where: {
        active: true,
        OR: [{ login: parsed.data.login }, { name: parsed.data.login }],
      },
    });

    // Проверка пароля. Сотрудники из iiko, у которых есть логин, входят по
    // ЖИВОМУ паролю iiko (SSO): пароль проверяется напрямую через iiko. Если
    // iiko отклонил или недоступен — пробуем локальный пароль (временный/кэш),
    // чтобы вход работал у рядового персонала без доступа в iikoOffice и когда
    // iiko прилёг. Админ-исключение и ручные учётки — только локальный bcrypt.
    // Одинаковый 401 для «нет пользователя» и «неверный пароль» — против
    // перебора существующих логинов.
    let ok = false;
    if (user) {
      const password = parsed.data.password;
      if (user.source === "iiko" && user.login) {
        const iikoOk = await verifyIikoCredentials(user.login, password);
        if (iikoOk) {
          ok = true;
          // Кэшируем пароль локально (bcrypt) — вход не сломается, если iiko
          // окажется недоступен; пароль остаётся синхронным с iiko.
          const passwordHash = await bcrypt.hash(password, 10);
          await db.user
            .update({
              where: { id: user.id },
              data: { passwordHash, mustChangePassword: false },
            })
            .catch(() => {});
        } else {
          ok = await bcrypt.compare(password, user.passwordHash);
        }
      } else {
        ok = await bcrypt.compare(password, user.passwordHash);
      }
    }
    if (!user || !ok) {
      // Неудачную попытку по СУЩЕСТВУЮЩЕЙ учётке пишем в журнал безопасности —
      // серия таких записей видна как перебор пароля. Ответ одинаковый для
      // «нет пользователя» и «неверный пароль» — логины не раскрываем.
      if (user) {
        await db.auditLog
          .create({
            data: { userId: user.id, event: "login_failed", ip: req.ip },
          })
          .catch(() => {});
      }
      return res.status(401).json({ error: "Неверный логин или пароль" });
    }

    // Пароль верный, но учётка не из iiko (и не админ-исключение) — не пускаем.
    // Проверяем ПОСЛЕ пароля, чтобы нельзя было перебором вычислять учётки.
    if (!(await loginAllowed(user))) {
      return res.status(403).json({
        error:
          "Доступ разрешён только сотрудникам из iiko. Обратитесь к администратору.",
      });
    }

    // Бутстрап владельца по OWNER_LOGIN (до выпуска токена — чтобы роль owner
    // сразу попала в токен и раздел «Back Office» стал виден с первого входа).
    const authed = await maybePromoteOwner(user);

    // В токен кладём только id и роль — ничего секретного.
    const token = jwt.sign(
      { uid: authed.id, role: authed.role, branchId: authed.branchId },
      env.JWT_SECRET,
      { expiresIn: `${TOKEN_TTL_HOURS}h` }
    );

    res.cookie("token", token, {
      ...cookieOptions(),
      maxAge: TOKEN_TTL_HOURS * 3600 * 1000,
    });

    // Пишем вход в журнал безопасности (detail — устройство/браузер).
    const userAgent = String(req.headers["user-agent"] || "").slice(0, 250);
    // Видели ли этот IP у этого пользователя раньше — до записи нового входа.
    const knownIp = await db.auditLog
      .findFirst({
        where: { userId: user.id, event: "login", ip: req.ip },
        select: { id: true },
      })
      .catch(() => null);
    await db.auditLog.create({
      data: { userId: user.id, event: "login", ip: req.ip, detail: userAgent },
    });
    // Вход управленческой учётки с нового IP — уведомление в тему «Персонал»
    // (best-effort). Линейный персонал не алертим: мобильные IP меняются часто.
    const OFFICE_ALERT_ROLES = new Set([
      "director",
      "finance",
      "accountant",
      "sysadmin",
      "manager",
    ]);
    if (!knownIp && OFFICE_ALERT_ROLES.has(user.role)) {
      sendTelegram(
        `🔐 <b>Вход с нового адреса</b>\n` +
          `${esc(user.displayName || user.name)} (${esc(user.role)})\n` +
          `IP: ${esc(req.ip || "—")}\n` +
          `Устройство: ${esc(userAgent.slice(0, 120) || "—")}`,
        undefined,
        topicFor("staff")
      ).catch(() => {});
    }

    res.json({
      // token в теле — для кросс-доменной связки (фронт на github.io ↔ бэкенд
      // на onrender.com), где межсайтовые cookie ненадёжны. Фронт шлёт его
      // в заголовке Authorization: Bearer. Cookie тоже ставится (для same-origin).
      token,
      id: user.id,
      name: user.name,
      displayName: user.displayName || user.name,
      role: authed.role,
      branchId: user.branchId,
      // Рабочий филиал сотрудника (id из конфигурации организации). Задаётся в
      // админке; ограничивает, какие данные сотрудник видит в приложении.
      branch: user.checklistBranch,
      position: user.position,
      mustChangePassword: passwordManagedByIiko(user)
        ? false
        : user.mustChangePassword,
      passwordManagedByIiko: passwordManagedByIiko(user),
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
        login: true,
        displayName: true,
        role: true,
        branchId: true,
        checklistBranch: true,
        position: true,
        active: true,
        source: true,
        iikoDeleted: true,
        mustChangePassword: true,
      },
    });
    if (!user || !user.active || !(await loginAllowed(user))) {
      return res.status(401).json({ error: "Пользователь недоступен" });
    }
    // source/iikoDeleted/login — служебные, наружу не отдаём.
    res.json({
      id: user.id,
      name: user.name,
      displayName: user.displayName,
      role: user.role,
      branchId: user.branchId,
      // Рабочий филиал сотрудника (id из конфигурации организации), задаётся в
      // админке — по нему приложение ограничивает видимые данные.
      branch: user.checklistBranch,
      position: user.position,
      mustChangePassword: passwordManagedByIiko(user)
        ? false
        : user.mustChangePassword,
      passwordManagedByIiko: passwordManagedByIiko(user),
    });
  })
);

// POST /api/auth/change-password — смена собственного пароля (в т.ч. первичная).
const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6),
});
r.post(
  "/change-password",
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = ChangePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Новый пароль — минимум 6 символов" });
    }
    const user = await db.user.findUnique({ where: { id: req.user.uid } });
    if (!user || !user.active) {
      return res.status(401).json({ error: "Пользователь недоступен" });
    }
    if (passwordManagedByIiko(user)) {
      return res.status(400).json({
        error:
          "Пароль этой учётной записи управляется в iiko — поменяйте его в iikoOffice, здесь он изменится сам при следующем входе.",
      });
    }
    const ok = await bcrypt.compare(
      parsed.data.currentPassword,
      user.passwordHash
    );
    if (!ok) {
      return res.status(400).json({ error: "Текущий пароль неверный" });
    }
    const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
    await db.user.update({
      where: { id: user.id },
      data: { passwordHash, mustChangePassword: false },
    });
    res.json({ ok: true });
  })
);

export default r;
