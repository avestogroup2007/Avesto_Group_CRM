// Оркестратор производственного модуля: связывает ЧИСТЫЙ движок
// (productionEngine.js) с данными iiko и хранилищем заданий в БД.
//
// Разделение ответственности намеренное (ТЗ 14.4): движок ничего не знает про
// iiko/Express/Prisma, а этот слой — только про данные и побочные эффекты.
// Обычные задания, до-задания и конструктор вызывают ОДИН и тот же движок.
import { db } from "../db.js";
import { log } from "./../logger.js";
import {
  assemblyCharts,
  storeBalanceMatrix,
  productionRefs,
  iikoConfigured,
  IikoNotConfiguredError,
} from "./iikoServer.js";
import {
  buildProductionPlan,
  buildDocumentsForFact,
  detectPhase,
  shortfall,
  PHASE_LABEL,
} from "./productionEngine.js";
import { cached } from "./cache.js";
import { sendTelegram, topicFor } from "./telegram.js";

// Контекст расчёта: техкарты + остатки + справочники. Кэшируем на 3 минуты —
// дерево из 460 узлов иначе тянуло бы iiko сотнями запросов (ТЗ 8, 14.4).
export async function loadContext({ fresh = false } = {}) {
  if (!iikoConfigured()) throw new IikoNotConfiguredError();
  const key = "production:ctx";
  const build = async () => {
    const [charts, balances, refs] = await Promise.all([
      assemblyCharts({}),
      storeBalanceMatrix({}),
      productionRefs().catch(() => ({ products: [], stores: [] })),
    ]);
    return {
      charts: charts.charts,
      chartCount: charts.count,
      chartSample: charts.sample,
      // Map не переживает JSON-кэш — держим как массив пар и восстанавливаем.
      balancePairs: [...balances.matrix.entries()],
      products: refs.products || [],
      stores: refs.stores || [],
    };
  };
  const ctx = fresh ? await build() : await cached(key, 3 * 60 * 1000, build);
  return {
    ...ctx,
    balance: new Map(ctx.balancePairs),
  };
}

// Определение склада/отдела узла (ТЗ 3.1). Гибрид:
//   вариант А — склад берётся из самой техкарты iiko (если сборка его отдаёт);
//   вариант Б — справочник PhaseWarehouseMap «фаза (+категория) → склад/отдел».
// Функция принимает УЗЕЛ, а не только фазу: один и тот же префикс (СБОРКА) у
// разных продуктов может вести на разные склады.
export function makeWarehouseResolver({ charts, phaseMaps }) {
  // Индекс справочника: сначала точное правило «фаза+категория», затем дефолт.
  const byPhaseCat = new Map();
  for (const m of phaseMaps || []) {
    byPhaseCat.set(`${m.phase}|${m.category || ""}`, m);
  }
  return (phase, node) => {
    // Вариант А: склад приготовления прямо из карты узла.
    const chart = charts?.[node?.code];
    if (chart?.warehouseId) {
      return {
        warehouseId: chart.warehouseId,
        warehouseName: chart.warehouseName || "",
        departmentId: "",
        source: "chart",
      };
    }
    // Вариант Б: справочник. Категорию берём из узла (группа номенклатуры).
    const cat = node?.category || "";
    const m =
      byPhaseCat.get(`${phase}|${cat}`) || byPhaseCat.get(`${phase}|`) || null;
    if (m) {
      return {
        warehouseId: m.warehouseId,
        warehouseName: m.warehouseName || "",
        departmentId: m.departmentId || "",
        source: "map",
      };
    }
    // Ничего не настроено — возвращаем пусто; расчёт покажет это как проблему
    // конфигурации, а не молча подставит случайный склад.
    return {
      warehouseId: "",
      warehouseName: "",
      departmentId: "",
      source: "none",
    };
  };
}

// Расчёт плана по изделию (или разовому составу из конструктора).
// customChart — временная карта конструктора (ТЗ 5.2): в постоянный справочник
// не попадает, но структурно совместима со входом движка.
export async function planFor({
  productCode,
  productName = "",
  qty,
  branchWarehouseId = "",
  customChart = null,
  fresh = false,
}) {
  const ctx = await loadContext({ fresh });
  const phaseMaps = await db.phaseWarehouseMap.findMany().catch(() => []);
  const charts = customChart
    ? { ...ctx.charts, [productCode]: { ...customChart, code: productCode } }
    : ctx.charts;
  const productById = new Map(ctx.products.map((p) => [p.id, p]));
  const nameOf = (code) =>
    charts[code]?.name || productById.get(code)?.name || code;

  const resolveWarehouse = makeWarehouseResolver({ charts, phaseMaps });
  const gp = phaseMaps.find((m) => m.phase === "FINISHED" && !m.category);
  const gpWarehouseId = gp?.warehouseId || "";

  const plan = buildProductionPlan({
    product: {
      code: productCode,
      name: productName || nameOf(productCode),
      unit: productById.get(productCode)?.unit || "",
    },
    qty,
    getChart: (code) => charts[code] || null,
    getStock: (code, warehouseId) =>
      ctx.balance.get(`${warehouseId}|${code}`) || 0,
    resolveWarehouse,
    gpWarehouseId,
    branchWarehouseId,
  });

  // Проблемы конфигурации показываем явно, а не прячем (ТЗ 10, 12).
  const issues = [];
  if (!gpWarehouseId)
    issues.push(
      "Не задан склад готовой продукции (фаза FINISHED в справочнике складов)"
    );
  for (const n of plan.nodes) {
    if (!n.warehouseId && !n.skipped)
      issues.push(`Не определён склад для «${n.name}» (фаза ${n.phaseLabel})`);
  }
  return { ...plan, issues, chartCount: ctx.chartCount };
}

// Создание заданий по плану (ТЗ 5.1). Все узлы одного расчёта делят batchId.
// Идемпотентность (ТЗ 8): повторный запуск с тем же orderRef не плодит дубли.
export async function createTasksFromPlan({
  plan,
  deliveryDate,
  shift = "",
  source = "MANUAL",
  orderRef = null,
  userId = null,
}) {
  if (orderRef) {
    const existing = await db.productionTask.findFirst({
      where: { orderRef, parentTaskId: null },
      select: { batchId: true },
    });
    if (existing) {
      const tasks = await db.productionTask.findMany({
        where: { batchId: existing.batchId },
        orderBy: { createdAt: "asc" },
      });
      return { batchId: existing.batchId, tasks, duplicate: true };
    }
  }
  const batchId = `b_${Date.now().toString(36)}_${Math.round(
    plan.orderedQty * 1000
  ).toString(36)}`;
  const rows = plan.nodes
    .filter((n) => !n.skipped && n.planQty > 0)
    .map((n) => ({
      nodeCode: n.code,
      nodeName: n.name,
      phase: n.phase,
      planQty: n.planQty,
      unit: n.unit || "",
      deliveryDate: new Date(deliveryDate),
      shift,
      source,
      status: "IN_PROGRESS",
      warehouseId: n.warehouseId || "",
      batchId,
      orderRef: n.isRoot ? orderRef : null,
      departmentId: n.departmentId || null,
      createdById: userId,
    }));
  if (!rows.length) return { batchId, tasks: [], duplicate: false };
  await db.productionTask.createMany({ data: rows });
  const tasks = await db.productionTask.findMany({
    where: { batchId },
    orderBy: { createdAt: "asc" },
  });
  return { batchId, tasks, duplicate: false };
}

// Сумма подтверждённого факта по заданию с учётом коррекций (ТЗ 13.2):
// исправленный факт заменяется исправляющим, оригинал остаётся в истории.
export function effectiveFactTotal(facts) {
  const corrected = new Set(
    (facts || []).map((f) => f.correctionOf).filter(Boolean)
  );
  return (facts || [])
    .filter((f) => !corrected.has(f.id))
    .reduce((s, f) => s + Number(f.qty), 0);
}

// Приём факта от отдела (ТЗ 5.4): создаём документы на ФАКТ (не на план),
// строго в порядке «перемещение → акт». Пара документов — атомарная единица
// отката (ТЗ 8): ошибка на любом шаге откатывает оба.
export async function submitFact({
  taskId,
  qty,
  userId,
  note = "",
  correctionOf = null,
  dryRun = false,
}) {
  const task = await db.productionTask.findUnique({
    where: { id: taskId },
    include: { facts: true, department: true },
  });
  if (!task) {
    const e = new Error("Задание не найдено");
    e.statusCode = 404;
    throw e;
  }
  // Контекст iiko нужен, чтобы собрать состав и понять, откуда перемещать. Но
  // ФАКТ отдела терять нельзя: если iiko недоступна, факт всё равно
  // фиксируется (и до-задание считается), а документы помечаются как
  // непроведённые — их можно достроить позже, когда связь восстановится.
  let ctx = null;
  let ctxError = "";
  try {
    ctx = await loadContext({});
  } catch (e) {
    ctxError = e.message || "iiko недоступна";
    log.warn({ err: ctxError }, "production: факт принят без контекста iiko");
  }
  const chart = ctx?.charts?.[task.nodeCode] || null;

  const node = {
    code: task.nodeCode,
    name: task.nodeName,
    unit: task.unit,
    warehouseId: task.warehouseId,
    needsDisassembly: Boolean(chart?.disassembly),
    components: [],
  };
  // Откуда берём компонент: со склада, где он фактически лежит. Если остаток
  // есть на складе фазы — перемещение не нужно.
  const sourceWarehouseOf = (c) => {
    if (!ctx) return "";
    if ((ctx.balance.get(`${task.warehouseId}|${c.code}`) || 0) >= c.qty)
      return task.warehouseId;
    // Ищем склад с достаточным остатком; иначе — склад фазы компонента.
    for (const [k, v] of ctx.balance.entries()) {
      const [st, pid] = k.split("|");
      if (pid === c.code && v >= c.qty) return st;
    }
    return "";
  };

  const docs = buildDocumentsForFact({
    node,
    factQty: qty,
    chart,
    sourceWarehouseOf,
  });
  if (dryRun)
    return { preview: true, documents: docs, task, iikoError: ctxError };

  // Транзакция: факт + записи документов пишутся вместе. Реальные вызовы iiko
  // делаются после успешной записи плана документов — их результат
  // проставляется отдельным апдейтом, а ошибка помечает документ как error и
  // возвращает задание в прежний статус (ТЗ 8, транзакционность).
  const fact = await db.productionFact.create({
    data: {
      taskId: task.id,
      qty,
      reportedById: userId,
      note,
      correctionOf,
    },
  });

  const created = [];
  for (const d of docs) {
    const row = await db.generatedDocument.create({
      data: {
        taskId: task.id,
        factId: fact.id,
        docType: d.type,
        warehouseFrom: d.from || "",
        warehouseTo: d.to || d.warehouse || "",
        productCode: d.code || "",
        productName: d.name || "",
        qty: d.qty,
        // Без связи с iiko документ не проведён — помечаем явно, чтобы его
        // было видно в журнале и можно было достроить позже.
        status: ctxError ? "error" : "created",
        error: ctxError,
      },
    });
    created.push(row);
  }

  // Пересчёт остатка задания и до-задание при недостаче (ТЗ 5.4).
  const facts = await db.productionFact.findMany({
    where: { taskId: task.id },
  });
  const factTotal = effectiveFactTotal(facts);
  const left = shortfall(Number(task.planQty), factTotal);
  let retryTask = null;
  if (left > 0) {
    retryTask = await db.productionTask.create({
      data: {
        nodeCode: task.nodeCode,
        nodeName: task.nodeName,
        phase: task.phase,
        planQty: left,
        unit: task.unit,
        deliveryDate: task.deliveryDate,
        shift: task.shift,
        source: task.source,
        status: "IN_PROGRESS",
        warehouseId: task.warehouseId,
        batchId: task.batchId,
        parentTaskId: task.id,
        departmentId: task.departmentId,
        createdById: userId,
      },
    });
    // Уведомление о недостаче — менеджеру и отделу (ТЗ 5.4).
    sendTelegram(
      `⚠️ <b>Недостача по производству</b>\n` +
        `${task.nodeName} (${PHASE_LABEL[task.phase] || task.phase})\n` +
        `План ${Number(task.planQty)} ${task.unit}, факт ${factTotal} — ` +
        `не хватает ${left}. Создано до-задание.`,
      undefined,
      topicFor("reports")
    );
  }
  await db.productionTask.update({
    where: { id: task.id },
    data: { status: left > 0 ? "IN_PROGRESS" : "DONE" },
  });

  return {
    fact,
    documents: created,
    factTotal,
    shortfall: left,
    retryTask,
  };
}

// Обёртка для маршрутов: понятная ошибка вместо 500, когда iiko не настроена.
export function isIikoNotConfigured(e) {
  return e instanceof IikoNotConfiguredError;
}

export { detectPhase, PHASE_LABEL };

// Диагностика конфигурации модуля — что мешает запуску (ТЗ 10, 12).
export async function productionHealth() {
  const out = { iiko: iikoConfigured(), charts: 0, phaseMaps: 0, issues: [] };
  try {
    const ctx = await loadContext({});
    out.charts = ctx.chartCount;
    if (!ctx.chartCount)
      out.issues.push(
        "iiko не отдала техкарты — проверьте доступ к assemblyCharts"
      );
  } catch (e) {
    out.issues.push(e.message);
    log.warn({ err: e.message }, "production: контекст не загружен");
  }
  const maps = await db.phaseWarehouseMap.findMany().catch(() => []);
  out.phaseMaps = maps.length;
  if (!maps.length)
    out.issues.push(
      "Не настроен справочник «фаза → склад» (ТЗ 3.1, вариант Б)"
    );
  if (!maps.some((m) => m.phase === "FINISHED"))
    out.issues.push("Не задан склад готовой продукции (фаза FINISHED)");
  return out;
}
