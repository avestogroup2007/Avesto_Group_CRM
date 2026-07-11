// Валидация переменных окружения при старте.
// Если чего-то не хватает или JWT_SECRET слишком короткий — сервер не запускается,
// а не падает позже в непонятном месте.
import { existsSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

// Загружаем .env, если файл есть. В проде его обычно нет — переменные
// приходят от платформы (Render/Railway/systemd), и этот шаг просто пропускается.
const envPath = path.resolve(process.cwd(), ".env");
if (existsSync(envPath) && typeof process.loadEnvFile === "function") {
  process.loadEnvFile(envPath);
}

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL обязателен"),
  JWT_SECRET: z
    .string()
    .min(32, "JWT_SECRET должен быть не короче 32 символов"),
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  FRONTEND_URL: z.string().url().default("http://localhost:5173"),
  COOKIE_SECURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  // Для кросс-доменной связки (фронт на github.io ↔ бэкенд на onrender.com)
  // нужен SameSite=None (и обязательно Secure). Локально — strict.
  COOKIE_SAMESITE: z.enum(["strict", "lax", "none"]).default("strict"),
  // iiko (iikoServer / iikoOffice API). Секреты задаются ТОЛЬКО в окружении
  // хостинга. Если не заданы, iiko-эндпоинты вернут 503 «не настроено».
  // Авторизация: /resto/api/auth?login=..&pass=SHA1(пароль).
  IIKO_SERVER_URL: z.string().url().optional(), // https://host:port
  IIKO_SERVER_LOGIN: z.string().min(1).optional(), // логин пользователя iikoOffice
  IIKO_SERVER_PASSWORD: z.string().min(1).optional(), // пароль (SHA1 считает сервер)
  // Telegram-уведомления. Токен бота и id чата задаются ТОЛЬКО в окружении
  // хостинга (Render). Если не заданы — уведомления просто не отправляются,
  // остальная система работает как обычно. Токен получают у @BotFather,
  // chat_id — id личного чата или группы, куда бот добавлен.
  TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
  TELEGRAM_CHAT_ID: z.string().min(1).optional(),
  // Темы (topics) супергруппы: раскладывают разные уведомления по своим темам
  // одной группы. Id темы (message_thread_id) — не секрет; берётся из помощника
  // подключения. Пусто = уведомление уходит в общую ленту группы.
  TELEGRAM_TOPIC_EXPENSES: z.string().min(1).optional(), // расходы/согласования
  TELEGRAM_TOPIC_TASKS: z.string().min(1).optional(), // задачи/автоматизация
  TELEGRAM_TOPIC_CASH: z.string().min(1).optional(), // касса/инкассация
  TELEGRAM_TOPIC_STAFF: z.string().min(1).optional(), // персонал (синхро iiko, доступ)
  TELEGRAM_TOPIC_REPORTS: z.string().min(1).optional(), // отчёты/сводки
  TELEGRAM_TOPIC_CHECKLIST: z.string().min(1).optional(), // чек-листы смены
  // Интерактивный бот чек-листов (вебхук). Секрет проверяется в заголовке
  // X-Telegram-Bot-Api-Secret-Token; пусто = вебхук отключён. PUBLIC_BASE_URL —
  // внешний адрес бэкенда для setWebhook (на Render можно RENDER_EXTERNAL_URL).
  TELEGRAM_WEBHOOK_SECRET: z.string().min(1).optional(),
  PUBLIC_BASE_URL: z.string().url().optional(),
  // Политика входа: пускаем только сотрудников из iiko (source=iiko, не
  // уволенные). Одна защищённая учётка-администратор пускается всегда — для
  // первичной синхронизации и на случай, если iiko-сервер недоступен. Логин
  // этой учётки задаётся здесь (по умолчанию «sysadmin» — демо-админ из сида).
  BOOTSTRAP_ADMIN_LOGIN: z.string().min(1).default("sysadmin"),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  // Namеренно пишем прямо в stderr: логгер ещё может быть не готов.
  console.error(`Ошибка конфигурации окружения (.env):\n${issues}`);
  process.exit(1);
}

export const env = parsed.data;
