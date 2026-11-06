// Крон-эндпоинт прогрева кэша iiko: внешний планировщик (Render Cron/пингер)
// раз в сутки дёргает POST /api/iiko-cron/warm с секретом в заголовке
// X-Cron-Secret. Без JWT (у крона его нет), поэтому защита — секрет.
// Пустой IIKO_WARM_SECRET = прогрев отключён (503).
//
// Зачем. Холодный отчёт продаж за месяц тянется из iiko ~17 секунд: это семь
// OLAP-срезов подряд, а сессия у iikoServer одна и запросы последовательные.
// Если прогреть кэш ночью, утром первый же пользователь получает данные из
// базы за доли секунды и никто не ждёт.
//
// Что греем: закрытые периоды — вчерашний день и текущий месяц по каждому
// филиалу и по сети целиком. Закрытые периоды в кэше не протухают, поэтому
// повторный прогрев тех же дней ничего не стоит — запись уже есть.
import { Router } from "express";
import crypto from "node:crypto";
import { env } from "../env.js";
import { asyncHandler } from "../util/asyncHandler.js";
import { salesReport, iikoConfigured } from "../services/iikoServer.js";
import {
  cachedReport,
  pruneExpired,
  todayTashkent,
} from "../services/iikoCache.js";
import { refreshOrgConfig, orgBranches } from "../services/orgConfig.js";
import { log } from "./../logger.js";

function secretEquals(got, want) {
  const a = Buffer.from(String(got || ""));
  const b = Buffer.from(String(want || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const ymd = (d) => d.toISOString().slice(0, 10);
const shift = (iso, days) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return ymd(d);
};

// Вчера по Ташкенту — последний полностью закрытый день.
function yesterdayTashkent() {
  return shift(todayTashkent(), -1);
}

// Периоды ровно в том виде, в каком их запрашивает интерфейс (пресеты
// «Сегодня», «Вчера», «Текущая/Прошлая неделя», «Текущий/Прошлый месяц»).
// Греть период «по вчера» бесполезно: пользователь нажимает «Текущий месяц»,
// а это 1-е число по СЕГОДНЯ — другой ключ кэша. Неделя считается с
// понедельника. «Текущий год» намеренно не греем: период огромный, а
// открывают его редко — он бы занял почти всё время задания.
function uiPeriods() {
  const today = todayTashkent();
  const yest = shift(today, -1);
  // День недели по Ташкенту: 0 = воскресенье → приводим к понедельнику.
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
  const mondayOffset = dow === 0 ? 6 : dow - 1;
  const curWeekFrom = shift(today, -mondayOffset);
  const prevWeekFrom = shift(curWeekFrom, -7);
  const prevWeekTo = shift(curWeekFrom, -1);
  const curMonthFrom = `${today.slice(0, 7)}-01`;
  const prevMonthTo = shift(curMonthFrom, -1);
  const prevMonthFrom = `${prevMonthTo.slice(0, 7)}-01`;
  return [
    { name: "today", from: today, to: today },
    { name: "yesterday", from: yest, to: yest },
    { name: "curWeek", from: curWeekFrom, to: today },
    { name: "prevWeek", from: prevWeekFrom, to: prevWeekTo },
    { name: "curMonth", from: curMonthFrom, to: today },
    { name: "prevMonth", from: prevMonthFrom, to: prevMonthTo },
  ];
}

const r = Router();

r.post(
  "/warm",
  asyncHandler(async (req, res) => {
    const secret = env.IIKO_WARM_SECRET;
    if (!secret) {
      return res
        .status(503)
        .json({ error: "Прогрев кэша отключён (нет IIKO_WARM_SECRET)" });
    }
    if (!secretEquals(req.get("x-cron-secret"), secret)) {
      return res.status(403).json({ error: "Неверный секрет" });
    }
    if (!iikoConfigured()) {
      return res.status(503).json({ error: "Интеграция iiko не настроена" });
    }

    await refreshOrgConfig().catch(() => {});
    const day = yesterdayTashkent();

    // Сеть целиком + каждый сопоставленный филиал.
    const scopes = [
      { scope: "all", departments: undefined },
      ...orgBranches()
        .filter((b) => b.iikoDept)
        .map((b) => ({ scope: b.iikoDept, departments: [b.iikoDept] })),
    ];
    const periods = uiPeriods();

    const done = [];
    const failed = [];
    // Последовательно: у iikoServer одна сессия, параллельные запросы её рвут.
    for (const s of scopes) {
      for (const p of periods) {
        if (p.from > p.to) continue;
        try {
          await cachedReport(
            { kind: "olap", scope: s.scope, from: p.from, to: p.to },
            () =>
              salesReport({
                from: p.from,
                to: p.to,
                departments: s.departments,
              })
          );
          done.push(`${s.scope}/${p.name}:${p.from}..${p.to}`);
        } catch (e) {
          failed.push({
            scope: s.scope,
            preset: p.name,
            period: `${p.from}..${p.to}`,
            error: e.message,
          });
          log.warn(
            { err: e.message, scope: s.scope },
            "iiko-cron: прогрев не удался"
          );
        }
      }
    }

    const pruned = await pruneExpired();
    res.json({ ok: true, day, warmed: done.length, pruned, done, failed });
  })
);

export default r;
