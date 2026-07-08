// Клиент iikoServer API (iiko RMS / iikoOffice), адрес вида
// https://host:port/resto/api. Логин/пароль пользователя iikoOffice задаются
// ТОЛЬКО в окружении хостинга и НИКОГДА не уходят клиенту.
// Поток: auth (login + SHA1(pass)) -> получаем token -> запросы OLAP v2 с
// ?key=token -> logout (сессия одна, обязательно закрываем).
// Ограничения iikoServer: запросы последовательно, период <= 1 месяца,
// buildSummary=false, <= 7 полей группировки.
import crypto from "node:crypto";
import { env } from "../env.js";

const BASE = (env.IIKO_SERVER_URL || "").replace(/\/+$/, "");

// Настроена ли интеграция (есть адрес сервера, логин и пароль).
export function iikoConfigured() {
  return Boolean(
    env.IIKO_SERVER_URL && env.IIKO_SERVER_LOGIN && env.IIKO_SERVER_PASSWORD
  );
}

// Ошибка «iiko не настроен» — маршрут превратит её в аккуратный 503.
export class IikoNotConfiguredError extends Error {
  constructor() {
    super("Интеграция iiko не настроена (нет IIKO_SERVER_URL/LOGIN/PASSWORD)");
    this.name = "IikoNotConfiguredError";
  }
}

function sha1(s) {
  return crypto.createHash("sha1").update(s, "utf8").digest("hex");
}

// Авторизация: возвращает токен (строка). Токен живёт недолго и одна сессия —
// поэтому логинимся под запрос и затем разлогиниваемся.
async function auth() {
  // Логин/пароль передаём в теле как application/x-www-form-urlencoded —
  // эндпоинт auth использует @FormParam и отклоняет query-параметры.
  const body =
    `login=${encodeURIComponent(env.IIKO_SERVER_LOGIN)}` +
    `&pass=${sha1(env.IIKO_SERVER_PASSWORD)}`;
  const res = await fetch(`${BASE}/resto/api/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const text = (await res.text()).trim();
  if (!res.ok) {
    throw new Error(`iiko auth → ${res.status} ${text}`.trim());
  }
  // Ответ — сам токен (строка). Иногда может прийти в кавычках.
  return text.replace(/^"|"$/g, "");
}

async function logout(key) {
  try {
    await fetch(`${BASE}/resto/api/logout?key=${encodeURIComponent(key)}`);
  } catch {
    // разлогин не критичен — молча игнорируем
  }
}

// Границы периода в формате iiko: from — начало дня, to — начало следующего
// дня после последней даты (в OLAP верхняя граница не включается).
function dayStart(ymd) {
  return `${ymd}T00:00:00.000`;
}
function nextDayStart(ymd) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T00:00:00.000`;
}

// Один OLAP-запрос под открытой сессией (key). Возвращает массив data.
// deleted:true — вместо активных заказов берём УДАЛЁННЫЕ/сторнированные
// (для отчёта по подозрительным операциям).
async function runOlap(
  key,
  { from, to, departments, groupByRowFields, deleted }
) {
  const filters = {
    // Этот сервер требует фильтр именно по «Учётному дню» (OpenDate.Typed).
    "OpenDate.Typed": {
      filterType: "DateRange",
      periodType: "CUSTOM",
      from: dayStart(from),
      to: nextDayStart(to),
    },
    ...(deleted
      ? {
          DeletedWithWriteoff: {
            filterType: "IncludeValues",
            values: ["DELETED_WITH_WRITEOFF", "DELETED_WITHOUT_WRITEOFF"],
          },
          OrderDeleted: {
            filterType: "IncludeValues",
            values: ["DELETED"],
          },
        }
      : {
          DeletedWithWriteoff: {
            filterType: "ExcludeValues",
            values: ["DELETED_WITH_WRITEOFF", "DELETED_WITHOUT_WRITEOFF"],
          },
          OrderDeleted: {
            filterType: "IncludeValues",
            values: ["NOT_DELETED"],
          },
        }),
  };
  if (Array.isArray(departments) && departments.length) {
    filters.Department = { filterType: "IncludeValues", values: departments };
  }
  const body = {
    reportType: "SALES",
    buildSummary: false,
    groupByRowFields,
    groupByColFields: [],
    aggregateFields: [
      "DishSumInt",
      "DishDiscountSumInt",
      "DishAmountInt",
      "UniqOrderId",
    ],
    filters,
  };
  const res = await fetch(`${BASE}/resto/api/v2/reports/olap?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`iiko olap → ${res.status} ${text}`.trim());
  }
  const json = text ? JSON.parse(text) : {};
  return Array.isArray(json.data) ? json.data : [];
}

// ── Сотрудники ────────────────────────────────────────────────────────────
// iikoServer отдаёт список сотрудников по /resto/api/employees. Ответ может
// прийти как XML (по умолчанию) или JSON — обрабатываем оба варианта и
// нормализуем к единому виду для фронтенда.

function decodeXml(s) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

// Разбор плоского XML-списка сотрудников (best-effort: точные поля уточним,
// когда увидим реальный ответ сервера).
function parseEmployeesXml(xml) {
  const blocks = xml.match(/<employee\b[^>]*>[\s\S]*?<\/employee>/g) || [];
  return blocks.map((b) => {
    const one = (tag) => {
      const m = b.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
      return m ? decodeXml(m[1].trim()) : undefined;
    };
    const many = (tag) => {
      const out = [];
      const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g");
      let m;
      while ((m = re.exec(b))) out.push(decodeXml(m[1].trim()));
      return out;
    };
    return {
      id: one("id"),
      code: one("code"),
      firstName: one("firstName"),
      middleName: one("middleName"),
      lastName: one("lastName"),
      name: one("name"),
      displayName: one("displayName"),
      login: one("login"),
      mainRoleCode: one("mainRoleCode"),
      // iiko сериализует списки как повторяющиеся теги по имени поля
      // (<roleCodes>КОД</roleCodes>, <departmentCodes>КОД</departmentCodes>),
      // а не как обёртку с вложенными элементами.
      roleCodes: many("roleCodes"),
      departmentCodes: many("departmentCodes"),
      // Основной филиал сотрудника — если departmentCodes пуст, берём его.
      preferredDepartmentCode: one("preferredDepartmentCode"),
      deleted: one("deleted"),
      hireDate: one("hireDate"),
      fireDate: one("fireDate"),
      phone: one("phone"),
      cellPhone: one("cellPhone"),
      email: one("email"),
    };
  });
}

// Справочник ролей iiko (код -> читаемое название должности). Из справочника
// ролей заведения. Если код не найден — показываем сам код.
const ROLE_NAMES = {
  BR1: "Бармен",
  Груз: "Грузчик",
  CS1: "Кассир",
  FFC: "Кассир фаст-фуда",
  MN1: "Менеджер",
  HR: "Отдел кадров",
  WR1: "Официант",
  SG1: "Охранник",
  CO1: "Повар",
  ПК: "Помощник кондитера",
  DW1: "Посудомойка",
  ADM: "Системный администратор",
  MN0: "Управляющий",
};

// Приведение одного сотрудника (из XML или JSON) к единому виду.
function mapEmployee(e) {
  const fio = [e.lastName, e.firstName, e.middleName]
    .filter(Boolean)
    .join(" ")
    .trim();
  // Предпочитаем настоящее ФИО (фамилия имя), затем displayName, затем name.
  const name = (fio || e.displayName || e.name || "").trim();
  // Значения списков очищаем от возможных вложенных тегов (на случай обёрток).
  const clean = (v) =>
    (v == null ? [] : [].concat(v))
      .map((x) =>
        String(x)
          .replace(/<[^>]*>/g, "")
          .trim()
      )
      .filter(Boolean);
  const pref = (e.preferredDepartmentCode || "").trim();
  const deptCodes = clean(e.departmentCodes);
  const roleCode = (e.mainRoleCode || e.mainRole || "").trim();
  return {
    iikoId: e.id || e.iikoId || "",
    code: e.code || "",
    name,
    login: (e.login || "").trim(),
    // Должность: читаемое название по справочнику ролей (иначе — сам код).
    position: ROLE_NAMES[roleCode] || roleCode,
    positionCode: roleCode,
    roleCodes: clean(e.roleCodes),
    // Если явных подразделений нет — используем основной филиал (preferred).
    departmentCodes: deptCodes.length ? deptCodes : pref ? [pref] : [],
    deleted: String(e.deleted) === "true",
    hireDate: (e.hireDate || "").trim(),
    fireDate: (e.fireDate || "").trim(),
    phone: e.cellPhone || e.phone || "",
    email: e.email || "",
  };
}

function normalizeEmployees(text) {
  const trimmed = (text || "").trim();
  let raw = [];
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    const json = JSON.parse(trimmed);
    raw = Array.isArray(json) ? json : json.employees || json.items || [];
  } else {
    raw = parseEmployeesXml(trimmed);
  }
  return raw.map(mapEmployee).filter((e) => e.iikoId || e.name);
}

// Справочник подразделений iiko: { code -> name }. Нужен, чтобы показывать у
// сотрудников название филиала/подразделения вместо числового кода.
function parseDepartments(text) {
  const trimmed = (text || "").trim();
  const out = [];
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const json = JSON.parse(trimmed);
      const arr = Array.isArray(json)
        ? json
        : json.departments || json.items || [];
      for (const d of arr) {
        out.push({
          code: String(d.code ?? "").trim(),
          name: (d.name || "").trim(),
        });
      }
    } catch {
      // не удалось разобрать JSON — оставим пустым
    }
    return out.filter((d) => d.code);
  }
  // XML: iiko отдаёт элементы <corporateItemDto> с <code> и <name>.
  const blocks =
    trimmed.match(/<corporateItemDto\b[^>]*>[\s\S]*?<\/corporateItemDto>/g) ||
    [];
  for (const b of blocks) {
    const code = (b.match(/<code>([\s\S]*?)<\/code>/) || [])[1];
    const name = (b.match(/<name>([\s\S]*?)<\/name>/) || [])[1];
    if (code != null) {
      out.push({
        code: decodeXml(code.trim()),
        name: decodeXml((name || "").trim()),
      });
    }
  }
  return out.filter((d) => d.code);
}

// Забирает справочник подразделений под уже открытой сессией. Best-effort:
// при любой ошибке возвращает пустую карту (тогда покажем сырые коды).
async function fetchDepartmentMap(key) {
  try {
    const res = await fetch(
      `${BASE}/resto/api/corporation/departments?key=${encodeURIComponent(key)}`
    );
    const text = await res.text();
    if (!res.ok) return { map: {}, rawFirst: "" };
    const depts = parseDepartments(text);
    const map = {};
    for (const d of depts) if (d.code && !(d.code in map)) map[d.code] = d.name;
    const fm = text.match(
      /<corporateItemDto\b[^>]*>[\s\S]*?<\/corporateItemDto>/
    );
    return { map, rawFirst: fm ? fm[0].slice(0, 1200) : "" };
  } catch {
    return { map: {}, rawFirst: "" };
  }
}

// Список сотрудников из iiko (одна сессия). Возвращает нормализованный массив.
// Если разобрать не удалось (пустой список) — отдаём короткий сырой образец,
// чтобы уточнить формат ответа, как делали с OLAP.
export async function listEmployees() {
  if (!iikoConfigured()) throw new IikoNotConfiguredError();
  const key = await auth();
  try {
    // Важно: НЕ просим application/json — этот эндпоинт при JSON отдаёт пустые
    // объекты ([{},{}...]). Реальные данные приходят в XML, который и разбираем.
    const res = await fetch(
      `${BASE}/resto/api/employees?key=${encodeURIComponent(key)}`
    );
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`iiko employees → ${res.status} ${text}`.trim());
    }
    const employees = normalizeEmployees(text);
    // Справочник подразделений (код -> название) — в той же сессии.
    const { map: deptMap, rawFirst: deptRawFirst } =
      await fetchDepartmentMap(key);
    for (const e of employees) {
      e.departmentNames = (e.departmentCodes || []).map((c) => deptMap[c] || c);
    }
    const result = { employees, count: employees.length };
    // Пока отлаживаем формат — если разобрать не удалось, отдаём образец
    // сырого ответа побольше, чтобы увидеть реальные названия полей.
    if (!employees.length) result.sample = text.slice(0, 1500);
    // Структура одного сотрудника (сырой XML) — чтобы уточнить реальные теги
    // подразделения/должности. Пока идёт настройка разбора.
    const firstMatch = text.match(/<employee\b[^>]*>[\s\S]*?<\/employee>/);
    result.rawFirst = firstMatch ? firstMatch[0].slice(0, 1800) : "";
    // Если названий подразделений сопоставить не удалось — образец справочника.
    if (!Object.keys(deptMap).length) result.deptRawFirst = deptRawFirst;
    return result;
  } finally {
    await logout(key);
  }
}

// Полный отчёт продаж за период (одна сессия iiko, несколько OLAP-срезов):
//  - byDay:   по дню и филиалу (выручка/график/KPI);
//  - byPay:   по типам оплат (вкладка «Оплаты»);
//  - byDish:  по блюдам (вкладки «Блюда»/«ABC»);
//  - byGroup: по группам блюд 1-го уровня (ABC по группам).
// Все, кроме byDay, best-effort: если конкретный срез не удался — вернём
// пустой, но выручка по дням (главное) не пострадает.
export async function salesReport({ from, to, departments }) {
  if (!iikoConfigured()) throw new IikoNotConfiguredError();
  const key = await auth();
  try {
    const opts = { from, to, departments };
    const byDay = await runOlap(key, {
      ...opts,
      groupByRowFields: ["OpenDate.Typed", "Department"],
    });
    const byPay = await runOlap(key, {
      ...opts,
      groupByRowFields: ["PayTypes"],
    }).catch(() => []);
    const byDish = await runOlap(key, {
      ...opts,
      groupByRowFields: ["DishName"],
    }).catch(() => []);
    // Все три уровня групп + блюдо одним запросом — для ABC по группам 1/2/3
    // и раскрытия группы до блюд внутри неё (drill-down).
    const byGroups = await runOlap(key, {
      ...opts,
      groupByRowFields: [
        "DishGroup.TopParent",
        "DishGroup.SecondParent",
        "DishGroup.ThirdParent",
        "DishName",
      ],
    }).catch(() => []);
    // По часу открытия заказа — для аналитики продаж по времени (пиковые часы,
    // средний чек по часам).
    const byHour = await runOlap(key, {
      ...opts,
      groupByRowFields: ["HourOpen"],
    }).catch(() => []);
    // По официанту заказа — активность персонала (кто чаще открывает заказы).
    const byStaff = await runOlap(key, {
      ...opts,
      groupByRowFields: ["OrderWaiter"],
    }).catch(() => []);
    // Час + блюдо — чтобы по клику на час показать, что продавалось в этот час.
    const byHourDish = await runOlap(key, {
      ...opts,
      groupByRowFields: ["HourOpen", "DishName"],
    }).catch(() => []);
    return { byDay, byPay, byDish, byGroups, byHour, byStaff, byHourDish };
  } finally {
    await logout(key);
  }
}

// ── Подозрительные операции ────────────────────────────────────────────────
// Контроль злоупотреблений персонала за период по данным iiko:
//  - удаления/сторно заказов в разрезе сотрудника (кто и на какую сумму
//    удаляет заказы — частый способ вывести деньги из кассы);
//  - крупные скидки в разрезе сотрудника (скидка = сумма без скидки −
//    сумма со скидкой; доля скидки к обороту сотрудника).
// Порог доли скидки для «флага» настраивается (по умолчанию 30 %).
export async function riskyReport({ from, to, department, discountPct = 0.3 }) {
  if (!iikoConfigured()) throw new IikoNotConfiguredError();
  const key = await auth();
  const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  const waiter = (r) =>
    (r["OrderWaiter"] || r["Waiter"] || r["Cashier"] || "").trim();
  try {
    const departments =
      Array.isArray(department) && department.length
        ? department
        : department
          ? [department]
          : undefined;
    const opts = { from, to, departments };
    // Удалённые/сторнированные заказы по официанту.
    const delRows = await runOlap(key, {
      ...opts,
      deleted: true,
      groupByRowFields: ["OrderWaiter"],
    }).catch(() => []);
    // Активные заказы по официанту — для расчёта скидок.
    const actRows = await runOlap(key, {
      ...opts,
      groupByRowFields: ["OrderWaiter"],
    }).catch(() => []);

    const delMap = {};
    delRows.forEach((r) => {
      const name = waiter(r) || "—";
      if (!delMap[name]) delMap[name] = { name, count: 0, sum: 0 };
      delMap[name].count += num(r["UniqOrderId"]);
      delMap[name].sum += num(r["DishSumInt"]);
    });
    const deletions = Object.values(delMap)
      .filter((x) => x.name && x.name !== "—" && (x.count || x.sum))
      .sort((a, b) => b.count - a.count || b.sum - a.sum);

    const discMap = {};
    actRows.forEach((r) => {
      const name = waiter(r) || "—";
      if (!discMap[name]) discMap[name] = { name, gross: 0, net: 0 };
      // DishSumInt — сумма без скидки, DishDiscountSumInt — со скидкой.
      discMap[name].gross += num(r["DishSumInt"]);
      discMap[name].net += num(r["DishDiscountSumInt"]);
    });
    const discounts = Object.values(discMap)
      .map((x) => {
        const discount = x.gross - x.net;
        const share = x.gross > 0 ? discount / x.gross : 0;
        return { ...x, discount, share, flagged: share >= discountPct };
      })
      .filter((x) => x.name && x.name !== "—" && x.discount > 0)
      .sort((a, b) => b.discount - a.discount);

    const totals = {
      delCount: deletions.reduce((a, x) => a + x.count, 0),
      delSum: deletions.reduce((a, x) => a + x.sum, 0),
      discountSum: discounts.reduce((a, x) => a + x.discount, 0),
      flagged: discounts.filter((x) => x.flagged).length,
    };

    return {
      from,
      to,
      department: department || null,
      discountPct,
      deletions,
      discounts,
      totals,
      diagnostics: { delRows: delRows.length, actRows: actRows.length },
    };
  } finally {
    await logout(key);
  }
}

// ── Отчёт о прибылях и убытках (ОПиУ) ──────────────────────────────────────
// Собираем ДИНАМИЧЕСКИ из плана счетов iiko (тип счёта — системный, одинаков
// на любой базе): INCOME/COST_OF_GOODS_SOLD/EXPENSES/OTHER_INCOME/OTHER_EXPENSES.
// Оборот за период = баланс(конец) − баланс(начало) по каждому счёту.

// Разделы ОПиУ по системному типу счёта iiko (порядок как в отчёте).
const PNL_TYPES = {
  INCOME: "Выручка",
  COST_OF_GOODS_SOLD: "Себестоимость",
  EXPENSES: "Расходы",
  OTHER_INCOME: "Прочие доходы",
  OTHER_EXPENSES: "Прочие расходы",
};

// Подразделения корпорации (id + название) — чтобы фильтровать балансы по
// филиалу (balance/counteragents ждёт id подразделения, а не название).
async function fetchDepartments(key) {
  try {
    const res = await fetch(
      `${BASE}/resto/api/corporation/departments?key=${encodeURIComponent(key)}`
    );
    const text = await res.text();
    if (!res.ok) return [];
    const blocks =
      text.match(/<corporateItemDto\b[^>]*>[\s\S]*?<\/corporateItemDto>/g) ||
      [];
    return blocks.map((b) => ({
      id: (b.match(/<id>([\s\S]*?)<\/id>/) || [])[1] || "",
      name: decodeXml(
        ((b.match(/<name>([\s\S]*?)<\/name>/) || [])[1] || "").trim()
      ),
    }));
  } catch {
    return [];
  }
}

// Балансы по счетам на учётную дату (timestamp: yyyy-MM-ddTHH:mm:ss).
// departmentId — необязательный фильтр по подразделению (id).
async function fetchAccountBalances(key, timestamp, departmentId) {
  const dep = departmentId
    ? `&department=${encodeURIComponent(departmentId)}`
    : "";
  const res = await fetch(
    `${BASE}/resto/api/v2/reports/balance/counteragents?key=${encodeURIComponent(
      key
    )}&timestamp=${encodeURIComponent(timestamp)}${dep}`,
    { headers: { Accept: "application/json" } }
  );
  const text = await res.text();
  if (!res.ok) return { rows: [], sample: text.slice(0, 800) };
  let rows = [];
  try {
    const json = text ? JSON.parse(text) : [];
    rows = Array.isArray(json) ? json : json.rows || json.data || [];
  } catch {
    /* оставим пустым */
  }
  return { rows, sample: rows.length ? "" : text.slice(0, 800) };
}

// Сумма баланса по счёту (id -> сумма). Поля ответа разбираем терпимо.
function balanceById(rows) {
  const m = {};
  for (const r of Array.isArray(rows) ? rows : []) {
    const id =
      r.account || r.accountId || r.accountUuid || r.accountUUID || null;
    if (!id) continue;
    const val = Number(r.sum ?? r.balance ?? r.amount ?? r.value ?? 0) || 0;
    m[id] = (m[id] || 0) + val;
  }
  return m;
}

// Строит поддерево счетов заданного типа (по accountParentId) с оборотами.
// Знак оборота сохраняем (коррекции бывают отрицательными). Собственные
// проводки счёта-группы iiko показывает строкой «<название>, прочие», поэтому
// у родителя с ненулевым собственным оборотом добавляем такой лист.
function buildPnlSection(accounts, type, turnover, sign) {
  const inType = accounts.filter((a) => a.type === type && !a.deleted);
  const ids = new Set(inType.map((a) => a.id));
  const childrenOf = {};
  inType.forEach((a) => {
    const p = ids.has(a.accountParentId) ? a.accountParentId : "__root__";
    (childrenOf[p] = childrenOf[p] || []).push(a);
  });
  // Порядок статей — как в отчёте iiko: по коду счёта в плане счетов
  // (натуральная сортировка чисел в коде), при отсутствии кода — по названию.
  // Раньше сортировали по величине суммы — из-за этого расходился порядок с iiko.
  const orderKey = (a) => {
    const c = a.code ?? a.num ?? a.order ?? "";
    return String(c);
  };
  const byAccount = (a, b) => {
    const ca = orderKey(a);
    const cb = orderKey(b);
    if (ca !== cb)
      return ca.localeCompare(cb, undefined, {
        numeric: true,
        sensitivity: "base",
      });
    return String(a.name || "").localeCompare(String(b.name || ""), "ru");
  };
  // Если у счетов есть коды — упорядочиваем по ним (как iiko). Если кодов нет,
  // сохраняем порядок, в котором iiko вернул счёта (тоже порядок плана счетов).
  const hasCodes = inType.some((a) => a.code != null && String(a.code) !== "");
  if (hasCodes)
    Object.keys(childrenOf).forEach((p) => childrenOf[p].sort(byAccount));
  const node = (a) => {
    const label = a.name || a.code || "—";
    // Скрываем нулевые под-статьи — как в отчёте iiko (там строк с 0 нет).
    const kids = (childrenOf[a.id] || [])
      .map(node)
      .filter((k) => k.value !== 0);
    // Двойная запись iiko: доходные счета кредитовые (оборот отрицательный),
    // расходные дебетовые (положительный). sign=-1 у доходов делает их плюсом.
    const own = (turnover[a.id] || 0) * sign;
    if (kids.length && own) {
      kids.push({ name: `${label}, прочие`, value: own, children: [] });
    }
    const value = kids.length ? kids.reduce((s, k) => s + k.value, 0) : own;
    return { name: label, value, children: kids };
  };
  // Корневые счёта — в порядке плана счетов iiko (childrenOf.__root__ уже
  // отсортирован), только с ненулевым оборотом.
  const roots = (childrenOf.__root__ || [])
    .map(node)
    .filter((n) => n.value !== 0);
  const total = roots.reduce((s, n) => s + n.value, 0);
  return { total, lines: roots };
}

// Полный ОПиУ за период. department — название филиала (необязательно);
// без него отчёт по всей корпорации (там суммируются внутренние передачи,
// поэтому для сверки с iiko выбирайте конкретный филиал).
export async function pnlReport({ from, to, department }) {
  if (!iikoConfigured()) throw new IikoNotConfiguredError();
  const key = await auth();
  try {
    // План счетов (структуру берёт iiko — переносимо на другую базу).
    const accRes = await fetch(
      `${BASE}/resto/api/v2/entities/accounts/list?key=${encodeURIComponent(
        key
      )}`,
      { headers: { Accept: "application/json" } }
    );
    const accText = await accRes.text();
    let accounts = [];
    try {
      const json = accText ? JSON.parse(accText) : [];
      accounts = Array.isArray(json) ? json : json.accounts || [];
    } catch {
      /* оставим пустым */
    }

    // Резолвим id филиала по названию (для фильтра балансов).
    let departmentId = null;
    let departmentResolved = null;
    if (department) {
      const depts = await fetchDepartments(key);
      const found = depts.find((d) => d.name === department);
      departmentId = found ? found.id : null;
      departmentResolved = found ? found.name : null;
    }

    // Обороты за период = баланс(конец) − баланс(начало).
    const startTs = `${from}T00:00:00`;
    const endTs = nextDayStart(to).replace(".000", "");
    const balEnd = await fetchAccountBalances(key, endTs, departmentId);
    const balStart = await fetchAccountBalances(key, startTs, departmentId);
    const endM = balanceById(balEnd.rows);
    const startM = balanceById(balStart.rows);
    const turnover = {};
    const allIds = new Set([...Object.keys(endM), ...Object.keys(startM)]);
    allIds.forEach((id) => {
      turnover[id] = (endM[id] || 0) - (startM[id] || 0);
    });

    const sections = {};
    const incomeTypes = new Set(["INCOME", "OTHER_INCOME"]);
    for (const type of Object.keys(PNL_TYPES)) {
      const sign = incomeTypes.has(type) ? -1 : 1;
      sections[type] = buildPnlSection(accounts, type, turnover, sign);
    }
    const revenue = sections.INCOME.total;
    const cogs = sections.COST_OF_GOODS_SOLD.total;
    const grossProfit = revenue - cogs;
    const expenses = sections.EXPENSES.total;
    const operatingProfit = grossProfit - expenses;
    const otherIncome = sections.OTHER_INCOME.total;
    const otherExpenses = sections.OTHER_EXPENSES.total;
    const netProfit = operatingProfit + otherIncome - otherExpenses;

    return {
      from,
      to,
      department: department || null,
      departmentResolved,
      sections,
      totals: {
        revenue,
        cogs,
        grossProfit,
        expenses,
        operatingProfit,
        otherIncome,
        otherExpenses,
        netProfit,
      },
      // Диагностика на время настройки: сколько счетов, есть ли балансы.
      diagnostics: {
        accounts: accounts.length,
        balEndRows: balEnd.rows.length,
        balStartRows: balStart.rows.length,
        balSample: balEnd.sample || balStart.sample || "",
        accSample: accounts.length ? "" : accText.slice(0, 800),
      },
    };
  } finally {
    await logout(key);
  }
}
