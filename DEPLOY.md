# Развёртывание

## Фронтенд — GitHub Pages (уже работает)

Публикуется автоматически при пуше в `main` (workflow `deploy-pages.yml`).
Адрес: **https://avestogroup2007.github.io/Avesto_Group_CRM/**

## Бэкенд — Render (Blueprint)

В репозитории есть `render.yaml` — он описывает веб-сервис + PostgreSQL.
Развёртывание в несколько кликов:

1. Зайдите на **https://render.com** и войдите через GitHub.
2. **New → Blueprint**.
3. Выберите репозиторий **`avestogroup2007/Avesto_Group_CRM`** (ветка `main`).
4. Render прочитает `render.yaml` и покажет, что создаст:
   - `avesto-crm-backend` — веб-сервис (Node);
   - `avesto-crm-db` — PostgreSQL.
5. Нажмите **Apply**. Дождитесь сборки (первый раз ~2–4 минуты).

Переменные окружения проставляются автоматически:
`DATABASE_URL`, `JWT_SECRET` (генерируется), `NODE_ENV=production`,
`COOKIE_SECURE=true`, `COOKIE_SAMESITE=none`,
`FRONTEND_URL=https://avestogroup2007.github.io`.

После деплоя бэкенд будет доступен по адресу вида
**`https://avesto-crm-backend.onrender.com`**, проверка:
`https://avesto-crm-backend.onrender.com/api/health` → `{ "ok": true }`.

### Демо-пользователи (по желанию)

Чтобы завести демо-учётки для входа, в панели Render:
**avesto-crm-backend → Shell** и выполнить:

```bash
npm run seed
```

(Логины `director / finance / manager / …`, пароль `changeme123` — сменить позже.)

### iiko (Этап 3)

Ключ iiko добавляется **только** в переменные окружения Render, не в git:
**avesto-crm-backend → Environment → Add Environment Variable**
- `IIKO_API_LOGIN` = ваш apiLogin из iikoCloud
- `IIKO_BASE_URL` = `https://api-ru.iiko.services`

### Важно про бесплатный тариф Render

- Веб-сервис на free засыпает после ~15 минут простоя; первый запрос после сна
  «будит» его ~30–50 секунд (для теста нормально).
- Бесплатный PostgreSQL на Render ограничен по сроку — для постоянной работы
  позже переключимся на платный план или другую базу (Neon/Supabase).
