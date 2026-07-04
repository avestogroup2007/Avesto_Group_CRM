# Avesto Group CRM System — Бэкенд (Этап 1)

Каркас API-сервера: аутентификация по JWT в httpOnly-cookie, роли, схема базы
данных и журнал безопасности. Это фундамент, на который дальше встают задачи,
кассы и интеграция iiko (Этапы 2–3).

## Стек

- **Node.js 20+**, **Express** — API-сервер
- **PostgreSQL 16** + **Prisma** — база и доступ к ней
- **JWT в httpOnly-cookie** — вход, защищённый от кражи токена через JS
- **Zod** — валидация входа и переменных окружения
- **helmet**, **express-rate-limit** — базовая защита
- **Pino** — структурированный лог

## Что уже готово (Этап 1)

- Полная схема БД (`prisma/schema.prisma`): компании, филиалы, пользователи,
  задачи, история задач, комментарии, отчёты касс, журнал безопасности.
- Вход/выход/«кто я»: `POST /api/auth/login`, `POST /api/auth/logout`,
  `GET /api/auth/me`.
- Проверка входа (`requireAuth`) и ролей (`requireRole`) как middleware.
- Запись входа в журнал безопасности (`AuditLog`).
- Проверка живости: `GET /api/health`.

Маршруты задач, касс и iiko (`app.use(...)` в `src/app.js`) подключаются на
следующих этапах — заготовки помечены комментариями.

## Запуск локально

```bash
cd backend

# 1. Зависимости
npm install

# 2. Настроить окружение
cp .env.example .env
# затем в .env указать DATABASE_URL и сгенерировать JWT_SECRET:
#   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# 3. Создать таблицы и клиент Prisma
npm run migrate         # prisma migrate dev
npm run generate        # prisma generate (обычно вызывается автоматически)

# 4. Наполнить демо-данными (компания, филиалы, по 1 учётке на роль)
npm run seed

# 5. Запустить сервер
npm run dev             # с автоперезапуском (nodemon)
# или
npm start
```

Проверка: открыть <http://localhost:3000/api/health> — вернётся `{ ok: true }`.

## Демо-учётки после `npm run seed`

Пароль у всех один: `changeme123` (переопределяется переменной `SEED_PASSWORD`).
**Смените их перед продакшеном.**

| Логин        | Роль                                       |
| ------------ | ------------------------------------------ |
| `director`   | director                                   |
| `finance`    | finance                                    |
| `manager`    | manager (привязан к филиалу «Центральный») |
| `accountant` | accountant                                 |
| `sysadmin`   | sysadmin                                   |
| `staff`      | staff                                      |

## Быстрая проверка входа через curl

```bash
# Вход — сохраняем cookie в файл
curl -s -c cookies.txt -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"login":"director","password":"changeme123"}'

# Кто я — с сохранённой cookie
curl -s -b cookies.txt http://localhost:3000/api/auth/me

# Без cookie — 401
curl -s http://localhost:3000/api/auth/me
```

## Проверки качества (запускаются в CI на каждый PR)

```bash
npm run lint          # ESLint — чистота кода
npm run format:check  # Prettier — единый стиль (npm run format всё поправит)
npm test              # интеграционные тесты (node --test): поднимают сервер и БД
```

CI (`.github/workflows/ci.yml`) на каждый pull request и push в `main` поднимает
PostgreSQL 16, ставит зависимости, прогоняет линт, проверку формата, применяет
миграции, наполняет демо-данными и запускает тесты. Красный CI = что-то
сломалось, и это видно до слияния.

## Переменные окружения

См. `.env.example`. Ключевые:

- `DATABASE_URL` — строка подключения к PostgreSQL.
- `JWT_SECRET` — минимум 32 символа (иначе сервер не стартует).
- `COOKIE_SECURE` — `true` только под HTTPS (в проде обязательно).
- `FRONTEND_URL` — адрес фронтенда для CORS.

## Структура

```
backend/
├── prisma/
│   ├── schema.prisma     # схема БД (все таблицы)
│   └── seed.js           # демо-данные
├── src/
│   ├── index.js          # точка входа: запуск сервера
│   ├── app.js            # сборка Express-приложения (без listen)
│   ├── env.js            # валидация .env через Zod
│   ├── db.js             # клиент Prisma
│   ├── logger.js         # Pino
│   ├── auth/
│   │   └── routes.js     # login / logout / me
│   ├── middleware/
│   │   ├── requireAuth.js   # проверка входа
│   │   ├── requireRole.js   # проверка прав (RBAC)
│   │   └── errorHandler.js  # 404 и ошибки
│   └── util/
│       └── asyncHandler.js
├── test/
│   └── auth.test.js      # интеграционные тесты
├── eslint.config.js
├── .prettierrc.json
├── .env.example
└── package.json
```

CI-конфигурация — в `.github/workflows/ci.yml` (в корне репозитория).
