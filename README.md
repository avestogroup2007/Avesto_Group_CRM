# Avesto Group CRM System

CRM/BPM-система Avesto Group: заявки с 5 фазами, роли, неизменяемый журнал,
кассы и инкассация, аналитика продаж (интеграция iiko) и защита финансовых данных.

## Состав репозитория

- **`backend/`** — API-сервер (Node.js + Express + PostgreSQL + Prisma).
  Готов Этап 1: аутентификация по JWT, роли, схема БД, журнал безопасности.
  См. [`backend/README.md`](backend/README.md).
- **`frontend/`** — веб-интерфейс (React). *(добавляется)*

## CI

На каждый pull request и push в `main` запускается проверка бэкенда
(`.github/workflows/ci.yml`): линт, единый стиль, миграции, seed и тесты.
