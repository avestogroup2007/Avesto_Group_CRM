// Время, деньги, аватары: форматтеры и мелкие утилиты, общие для экранов.
import { C } from "./theme.js";

export const M = 60_000,
  H = 3_600_000,
  D = 86_400_000;
export const uid = () =>
  Math.random().toString(36).slice(2) + Date.now().toString(36);
/* ---------------------------------- утилиты ------------------------------- */
export function fmtDur(ms) {
  ms = Math.max(0, ms);
  const m = Math.round(ms / M);
  if (m < 60) return m + " мин";
  const h = Math.floor(m / 60),
    mm = m % 60;
  if (h < 24) return mm ? `${h} ч ${mm} мин` : `${h} ч`;
  const d = Math.floor(h / 24),
    hh = h % 24;
  return hh ? `${d} дн ${hh} ч` : `${d} дн`;
}
// Часовой пояс Узбекистана — даты/время считаем и показываем по Ташкенту.
export const TZ = "Asia/Tashkent";
export function fmtMoney(n) {
  return (n || 0).toLocaleString("ru-RU") + " сум";
}
// длительность рабочего времени: без «дней» (смена/сессия), для сводных карточек — только часы
export const fmtWork = (ms) => {
  const m = Math.max(0, Math.round(ms / M));
  const h = Math.floor(m / 60),
    mm = m % 60;
  return h ? (mm ? `${h} ч ${mm} мин` : `${h} ч`) : `${mm} мин`;
};
export const fmtWorkH = (ms) => `${Math.round(Math.max(0, ms) / H)} ч`;
export const fmtSum = (n) =>
  Math.round(n || 0).toLocaleString("ru-RU") + " сум";
export function fmtDateTime(ms) {
  return new Date(ms).toLocaleString("ru-RU", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
export function initials(name) {
  const p = (name || "?").trim().split(/\s+/);
  return ((p[0]?.[0] || "") + (p[1]?.[0] || "")).toUpperCase();
}
const AVATAR_COLORS = [
  "#2563EB",
  "#7C3AED",
  "#DB2777",
  "#EA580C",
  "#0891B2",
  "#16A34A",
  "#9333EA",
];
export function avatarColor(id) {
  let s = 0;
  for (const ch of String(id)) s += ch.charCodeAt(0);
  return AVATAR_COLORS[s % AVATAR_COLORS.length];
}
export const lightTone = (rate) =>
  rate >= 90 ? C.ok : rate >= 80 ? C.warn : C.bad;

// Сегодняшняя дата (ГГГГ-ММ-ДД) и месяц (ГГГГ-ММ) по Ташкенту.
export const ymdNow = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
export const ymNow = () => ymdNow().slice(0, 7);
