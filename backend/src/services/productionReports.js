// Отчёты производственного модуля (ТЗ 6, 11): план/факт по заданиям и
// недовыработка с расходом сырья по этапам.
//
// Слой читает ТОЛЬКО базу CRM — в iiko не ходит. Это осознанно: отчёт должен
// открываться и когда интеграция недоступна, иначе он бесполезен именно тогда,
// когда нужнее всего (разбор смены, где что-то пошло не так).
import { db } from "../db.js";
import { PHASE_LABEL } from "./productionEngine.js";
import { effectiveFactTotal } from "./productionPlanner.js";

const num = (v) => Number(v || 0);
const round = (v) => Math.round(num(v) * 1000) / 1000;
const pct = (part, whole) =>
  whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0;

// Границы периода по дате поставки. Верхняя граница ИСКЛЮЧАЮЩАЯ (начало
// следующего дня) — иначе задания последнего дня периода теряются.
function range(from, to) {
  const gte = new Date(`${from}T00:00:00.000Z`);
  const lt = new Date(`${to}T00:00:00.000Z`);
  lt.setUTCDate(lt.getUTCDate() + 1);
  return { gte, lt };
}

async function loadTasks({ from, to, departmentId }) {
  const where = { deliveryDate: range(from, to) };
  if (departmentId) where.departmentId = departmentId;
  return db.productionTask.findMany({
    where,
    include: { facts: true, department: true },
    orderBy: [{ deliveryDate: "asc" }, { nodeName: "asc" }],
    take: 5000,
  });
}

// Строка план/факт по одному заданию с уже посчитанным отклонением.
function rowOf(t) {
  const plan = num(t.planQty);
  const fact = effectiveFactTotal(t.facts);
  return {
    id: t.id,
    nodeCode: t.nodeCode,
    nodeName: t.nodeName,
    phase: t.phase,
    phaseLabel: PHASE_LABEL[t.phase] || t.phase,
    unit: t.unit,
    departmentId: t.departmentId || "",
    departmentName: t.department?.name || "",
    deliveryDate: t.deliveryDate,
    shift: t.shift,
    source: t.source,
    status: t.status,
    isRetry: Boolean(t.parentTaskId),
    planQty: round(plan),
    factQty: round(fact),
    // Отклонение со знаком: минус — недовыработка, плюс — перевыполнение.
    deviation: round(fact - plan),
    donePct: pct(fact, plan),
    corrections: t.facts.filter((f) => f.correctionOf).length,
  };
}

// Свод: суммируем по произвольному ключу, проценты считаем от СУММ, а не
// усреднением процентов — среднее из процентов искажает картину, когда
// задания разного размера.
function group(rows, keyOf, labelOf) {
  const map = new Map();
  for (const r of rows) {
    const k = keyOf(r);
    if (!map.has(k))
      map.set(k, {
        key: k,
        label: labelOf(r),
        planQty: 0,
        factQty: 0,
        tasks: 0,
        retries: 0,
        corrections: 0,
      });
    const g = map.get(k);
    g.planQty += r.planQty;
    g.factQty += r.factQty;
    g.tasks += 1;
    if (r.isRetry) g.retries += 1;
    g.corrections += r.corrections;
  }
  return [...map.values()]
    .map((g) => ({
      ...g,
      planQty: round(g.planQty),
      factQty: round(g.factQty),
      deviation: round(g.factQty - g.planQty),
      donePct: pct(g.factQty, g.planQty),
    }))
    .sort((a, b) => a.deviation - b.deviation);
}

// План/факт за период: по заданиям, с разрезами по фазам, отделам и изделиям.
export async function planFactReport({ from, to, departmentId = "" } = {}) {
  const tasks = await loadTasks({ from, to, departmentId });
  const rows = tasks.map(rowOf);
  const planQty = round(rows.reduce((s, r) => s + r.planQty, 0));
  const factQty = round(rows.reduce((s, r) => s + r.factQty, 0));
  return {
    from,
    to,
    total: {
      tasks: rows.length,
      planQty,
      factQty,
      deviation: round(factQty - planQty),
      donePct: pct(factQty, planQty),
      done: rows.filter((r) => r.status === "DONE").length,
      inProgress: rows.filter((r) => r.status === "IN_PROGRESS").length,
      retries: rows.filter((r) => r.isRetry).length,
      corrections: rows.reduce((s, r) => s + r.corrections, 0),
    },
    byPhase: group(
      rows,
      (r) => r.phase,
      (r) => r.phaseLabel
    ),
    byDepartment: group(
      rows,
      (r) => r.departmentId,
      (r) => r.departmentName || "Без отдела"
    ),
    byProduct: group(
      rows,
      (r) => r.nodeCode,
      (r) => r.nodeName
    ),
    // Наверх — задания с наибольшей недовыработкой: с них начинают разбор.
    worst: rows
      .filter((r) => r.deviation < 0)
      .sort((a, b) => a.deviation - b.deviation)
      .slice(0, 50),
    rows,
  };
}

// Недовыработка и расход сырья по этапам.
//
// «Потери» здесь — недовыработка относительно плана (план минус факт), а НЕ
// разница масс входа и выхода: единицы измерения узлов разные (кг, шт, л), и
// вычитать их друг из друга нельзя. Рядом показываем фактический расход сырья
// по документам перемещения — то, что реально ушло в производство.
export async function lossesReport({ from, to, departmentId = "" } = {}) {
  const tasks = await loadTasks({ from, to, departmentId });
  const rows = tasks.map(rowOf);

  const byPhase = new Map();
  for (const r of rows) {
    if (!byPhase.has(r.phase))
      byPhase.set(r.phase, {
        phase: r.phase,
        label: r.phaseLabel,
        planQty: 0,
        factQty: 0,
        shortQty: 0,
        tasks: 0,
        shortTasks: 0,
        retries: 0,
      });
    const g = byPhase.get(r.phase);
    g.planQty += r.planQty;
    g.factQty += r.factQty;
    g.tasks += 1;
    if (r.deviation < 0) {
      g.shortQty += -r.deviation;
      g.shortTasks += 1;
    }
    if (r.isRetry) g.retries += 1;
  }

  // Расход сырья: перемещения, привязанные к заданиям периода.
  const taskIds = tasks.map((t) => t.id);
  const transfers = taskIds.length
    ? await db.generatedDocument.findMany({
        where: { taskId: { in: taskIds }, docType: "TRANSFER" },
        take: 10000,
      })
    : [];
  const materials = new Map();
  for (const d of transfers) {
    const k = d.productCode;
    if (!materials.has(k))
      materials.set(k, {
        code: d.productCode,
        name: d.productName || d.productCode,
        qty: 0,
        docs: 0,
        posted: 0,
        notPosted: 0,
      });
    const m = materials.get(k);
    m.qty += num(d.qty);
    m.docs += 1;
    if (d.status === "posted") m.posted += 1;
    else m.notPosted += 1;
  }

  const shortQty = round(
    rows.reduce((s, r) => s + Math.max(0, -r.deviation), 0)
  );
  const planQty = round(rows.reduce((s, r) => s + r.planQty, 0));
  return {
    from,
    to,
    total: {
      planQty,
      shortQty,
      shortPct: pct(shortQty, planQty),
      shortTasks: rows.filter((r) => r.deviation < 0).length,
      tasks: rows.length,
      retries: rows.filter((r) => r.isRetry).length,
    },
    byPhase: [...byPhase.values()]
      .map((g) => ({
        ...g,
        planQty: round(g.planQty),
        factQty: round(g.factQty),
        shortQty: round(g.shortQty),
        shortPct: pct(g.shortQty, g.planQty),
      }))
      .sort((a, b) => b.shortQty - a.shortQty),
    materials: [...materials.values()]
      .map((m) => ({ ...m, qty: round(m.qty) }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 200),
  };
}
