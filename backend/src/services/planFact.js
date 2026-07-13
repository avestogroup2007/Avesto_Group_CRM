// План-факт: чистые расчёты для сравнения плана с фактом. Хранение планов — в
// таблице PlanEntry (месяц × филиал). Факт выручки берётся из сверённой с iiko
// выручки касс (CashReport.iiko), факт расходов — из согласованных операций
// «Учёта денег». Здесь только арифметика — легко тестируется.

// Дней в месяце и сколько уже прошло к дате «сегодня» (для темпа план/факт).
// month: "YYYY-MM", todayStr: "YYYY-MM-DD" (Asia/Tashkent).
export function monthMeta(month, todayStr) {
  const [y, mo] = String(month).split("-").map(Number);
  const daysInMonth = new Date(y, mo, 0).getDate();
  const [ty, tmo, td] = String(todayStr).split("-").map(Number);
  const curMonth = `${ty}-${String(tmo).padStart(2, "0")}`;
  let daysElapsed;
  if (month < curMonth)
    daysElapsed = daysInMonth; // прошлый месяц — весь
  else if (month > curMonth)
    daysElapsed = 0; // будущий — ещё не начался
  else daysElapsed = Math.min(td, daysInMonth); // текущий — по сегодня
  return { daysInMonth, daysElapsed };
}

// Производные показатели по одному филиалу за месяц.
export function computePlanFact({
  planRevenue,
  planExpense,
  factRevenue,
  factExpense,
  daysInMonth,
  daysElapsed,
}) {
  const pr = Number(planRevenue) || 0;
  const pe = Number(planExpense) || 0;
  const fr = Number(factRevenue) || 0;
  const fe = Number(factExpense) || 0;
  const pct = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);
  const frac = daysInMonth > 0 ? daysElapsed / daysInMonth : 0;
  // Ожидаемая выручка к дате (равномерно по дням) — для оценки темпа.
  const expectedRevenue = Math.round(pr * frac);
  return {
    planRevenue: pr,
    planExpense: pe,
    factRevenue: fr,
    factExpense: fe,
    revenuePct: pct(fr, pr), // % выполнения плана выручки за месяц
    expensePct: pct(fe, pe), // % израсходовано от плана расходов
    expectedRevenue, // сколько «должно быть» к сегодня
    revenuePace: fr - expectedRevenue, // >0 опережение, <0 отставание (сум)
    revenuePacePct: pct(fr, expectedRevenue), // темп к ожидаемому, %
  };
}
