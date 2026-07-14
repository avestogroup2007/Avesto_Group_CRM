#!/usr/bin/env bash
# Обновление self-hosted развёртывания (avesto.group/crm) одной командой:
# тянет свежий код, применяет миграции, пересобирает фронт и перезапускает бэкенд.
#
# Запуск на сервере:   bash deploy/update.sh
# Переопределяемые пути (по умолчанию — как в инструкции DEPLOY.md):
#   WEBROOT   — куда кладётся собранный фронтенд   (по умолчанию /var/www/crm)
#   PM2_NAME  — имя процесса pm2 для бэкенда        (по умолчанию avesto-crm)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEBROOT="${WEBROOT:-/var/www/crm}"
PM2_NAME="${PM2_NAME:-avesto-crm}"

echo "→ Репозиторий: $ROOT"
cd "$ROOT"
git pull --ff-only

echo "→ Бэкенд: зависимости + миграции + рестарт"
cd "$ROOT/backend"
npm ci
npx prisma migrate deploy
pm2 restart "$PM2_NAME" --update-env

echo "→ Фронтенд: сборка под подпуть /crm"
cd "$ROOT/frontend"
npm ci
VITE_BASE=/crm/ VITE_API_URL=/crm npm run build
sudo cp -r dist/* "$WEBROOT"/

echo "✓ Обновление завершено. Проверка:"
curl -s http://127.0.0.1:3001/api/health && echo
