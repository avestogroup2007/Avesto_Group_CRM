# Размещение Avesto Group CRM на своём сервере — `avesto.group/crm`

Инструкция для случая: **свой VPS/сервер, один домен `avesto.group`, приложение
живёт под подпутём `avesto.group/crm`.** Фронтенд (статика) и API работают на
одном домене (same-origin) — это проще и безопаснее кросс-домена: не нужны
`SameSite=None`-cookie и настройка CORS под чужой источник.

## Как это устроено

```
                        avesto.group  (nginx или Caddy, TLS)
                       ┌───────────────────────────────────┐
Браузер ──HTTPS──►     │  /crm/…      → статика (frontend/dist)
                       │  /crm/api/…  → reverse-proxy → Node :3000  (/api/…)
                       └───────────────────────────────────┘
                                              │
                                     PostgreSQL :5432
```

- У приложения **нет серверного роутера** — текущий экран хранится в состоянии,
  поэтому любой путь под `/crm` должен отдавать `index.html` (это делает
  `try_files`). Подпуть влияет только на: (а) загрузку ассетов — `VITE_BASE`;
  (б) адрес API — `VITE_API_URL`.
- Reverse-proxy срезает префикс `/crm` перед бэкендом, поэтому Node продолжает
  отвечать на привычные `/api/...`.

## Предварительно

- Node.js 20+ и npm на сервере (для сборки; либо соберите фронт на CI и залейте
  готовый `dist`).
- PostgreSQL 14+.
- nginx **или** Caddy. TLS-сертификат на `avesto.group` (Caddy получает сам;
  для nginx — например, `certbot`).
- DNS: A/AAAA-запись `avesto.group` указывает на сервер.

## 1. База данных

```bash
sudo -u postgres psql <<'SQL'
CREATE USER avesto_crm WITH PASSWORD 'СМЕНИТЕ_ПАРОЛЬ';
CREATE DATABASE avesto_crm OWNER avesto_crm;
SQL
```

## 2. Бэкенд

```bash
sudo mkdir -p /opt/avesto-crm
sudo chown -R avesto:avesto /opt/avesto-crm
git clone <repo> /opt/avesto-crm && cd /opt/avesto-crm/backend
npm ci
npx prisma generate

# Окружение: скопируйте пример и заполните (секреты — только здесь, не в git).
cp .env.production.example .env
$EDITOR .env      # DATABASE_URL, JWT_SECRET (openssl rand -base64 48), OWNER_LOGIN …

# Миграции + демо-справочники (идемпотентно):
npx prisma migrate deploy
node prisma/seed.js
```

Запуск как служба (см. `deploy/avesto-crm.service` — поправьте `User`/пути):

```bash
sudo cp deploy/avesto-crm.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now avesto-crm
journalctl -u avesto-crm -f          # логи
curl -s http://127.0.0.1:3000/api/health   # {"ok":true,...}
```

Ключевые переменные окружения для подпути (полный список — в
`backend/.env.production.example`):

| Переменная         | Значение                        |
| ------------------ | ------------------------------- |
| `FRONTEND_URL`     | `https://avesto.group`          |
| `COOKIE_SECURE`    | `true`                          |
| `COOKIE_SAMESITE`  | `lax`                           |
| `OWNER_LOGIN`      | ваш логин из iiko (даёт owner)  |
| `PUBLIC_BASE_URL`  | `https://avesto.group/crm` (для Telegram-вебхука) |
| `PUBLIC_APP_URL`   | `https://avesto.group/crm/` (кнопка «Открыть CRM») |

## 3. Фронтенд (сборка под подпуть)

Собираем с базовым путём `/crm/` и адресом API `/crm` (запросы идут same-origin,
proxy направит `/crm/api` на бэкенд):

```bash
cd /opt/avesto-crm/frontend
npm ci
VITE_BASE=/crm/ VITE_API_URL=/crm npm run build
# Результат — в frontend/dist. Разложим под веб-корень:
sudo mkdir -p /var/www/avesto.group/crm
sudo cp -r dist/* /var/www/avesto.group/crm/
```

> Важно: `VITE_API_URL=/crm` (без `/api` на конце) — в коде к нему добавляются
> пути вида `/api/...`, итог `/crm/api/...`.

## 4. Reverse-proxy

**Вариант A — nginx.** Возьмите `deploy/nginx-avesto-crm.conf`, поправьте пути к
сертификатам:

```bash
sudo cp deploy/nginx-avesto-crm.conf /etc/nginx/sites-available/avesto-crm.conf
sudo ln -s /etc/nginx/sites-available/avesto-crm.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

**Вариант B — Caddy** (сам оформит TLS):

```bash
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

## 5. Проверка

- `https://avesto.group/crm/` — открывается вход в CRM.
- Войдите под учёткой из `OWNER_LOGIN` → должен появиться раздел «Back Office».
- В DevTools → Network запросы идут на `https://avesto.group/crm/api/...` и
  возвращают 200, ассеты грузятся с `/crm/assets/...`.
- `curl -sI https://avesto.group/crm/api/health` → `200`.

## Обновление версии

```bash
cd /opt/avesto-crm && git pull
cd backend  && npm ci && npx prisma migrate deploy && sudo systemctl restart avesto-crm
cd ../frontend && npm ci && VITE_BASE=/crm/ VITE_API_URL=/crm npm run build \
  && sudo cp -r dist/* /var/www/avesto.group/crm/
```

## Разместить в корне домена (`avesto.group`, без `/crm`)

Если позже захотите отдать всё приложение с корня: собирайте фронт с
`VITE_BASE=/` и `VITE_API_URL=` (пусто), кладите `dist` в корень веб-сервера, а
в proxy проксируйте `/api/` → `:3000` напрямую. Значения cookie/CORS те же.
