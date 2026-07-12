// Чек-листы смены: составы пунктов и рабочие окна обходов по типу точки.
import { ORG } from "./org.js";
// ── Чек-листы смены ─────────────────────────────────────────────────────────
// needPhoto — пункт требует фотоотчёт (без фото пункт не закрывается).
export const SANITARY_ITEMS = [
  { text: "Унитаз очищен", needPhoto: true },
  { text: "Раковина вымыта", needPhoto: true },
  { text: "Пол вымыт", needPhoto: false },
  { text: "Туалетная бумага заправлена", needPhoto: true },
  { text: "Мыло заправлено", needPhoto: false },
  { text: "Средство/химия для мытья рук на месте", needPhoto: false },
  { text: "Бумага для сушки рук на месте", needPhoto: false },
];
export const OPEN_ITEMS = [
  { text: "Оборудование включено", needPhoto: false },
  { text: "Температура холодильников в норме", needPhoto: false },
  { text: "Зал и столы чистые", needPhoto: true },
  { text: "Санузел проверен и убран", needPhoto: true },
  { text: "Кассовый размен на месте", needPhoto: false },
];
export const CLOSE_ITEMS = [
  { text: "Уборка зала и кухни", needPhoto: true },
  { text: "Санузел убран", needPhoto: true },
  { text: "Касса сверена", needPhoto: false },
  { text: "Оборудование выключено", needPhoto: false },
  { text: "Мусор вынесен", needPhoto: false },
  { text: "Точка закрыта, сигнализация включена", needPhoto: false },
];
export const CHECKLIST_DEFS = {
  sanitary: { label: "Санитарный обход", hourly: true, items: SANITARY_ITEMS },
  open: { label: "Открытие смены", hourly: false, items: OPEN_ITEMS },
  close: { label: "Закрытие смены", hourly: false, items: CLOSE_ITEMS },
};
// Рабочее окно обхода по типу точки: производство (цех/кейтеринг) — 07:00–16:00,
// рестораны и магазины — 08:00–20:00.
const PROD_BRANCH_IDS = new Set([4, 6]);
export const branchHours = (branchId) => {
  // Окно из конфигурации организации (сервер): у филиала может быть своё.
  const b = (ORG.branches || []).find((x) => Number(x.id) === Number(branchId));
  if (b && b.hours && Number.isFinite(b.hours.from)) return b.hours;
  return PROD_BRANCH_IDS.has(Number(branchId))
    ? { from: 7, to: 16 }
    : { from: 8, to: 20 };
};
export const hourSlots = (branchId) => {
  const { from, to } = branchHours(branchId);
  const out = [];
  for (let h = from; h <= to; h++) out.push(`${String(h).padStart(2, "0")}:00`);
  return out;
};
