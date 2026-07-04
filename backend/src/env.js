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
