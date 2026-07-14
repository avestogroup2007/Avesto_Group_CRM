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

// ── Кэш токена сервисной сессии ─────────────────────────────────────────────
// Раньше каждый вызов делал auth → запрос → logout (3 сетевых вызова вместо
// одного). Теперь токен переиспользуется в пределах TTL: одна лицензия iiko
// занята одной живой сессией, отчёты заметно быстрее. По истечении TTL или
// при 401 сессия обновляется; устаревшие токены закрываются.
const KEY_TTL_MS = 5 * 60 * 1000;
let keyCache = { key: null, at: 0 };

let keyPromise = null; // single-flight: параллельные запросы ждут одну auth()

async function acquireKey() {
  if (keyCache.key && Date.now() - keyCache.at < KEY_TTL_MS) {
    return keyCache.key;
  }
  // Без single-flight два параллельных запроса делали бы два auth(), и второй
  // разлогинивал бы токен, которым ещё пользуется первый (лицензия iiko одна).
  if (!keyPromise) {
    const old = keyCache.key;
    keyPromise = auth()
      .then((key) => {
        keyCache = { key, at: Date.now() };
        if (old) logout(old); // освобождаем старую лицензию, не блокируя запрос
        return key;
      })
      .finally(() => {
        keyPromise = null;
      });
  }
  return keyPromise;
}

// Вместо logout в finally: живой кэшированный токен не закрываем, чужой
// (уже заменённый) — закрываем.
function releaseKey(key) {
  if (key && keyCache.key !== key) logout(key);
}

// iiko отклонил токен (протух раньше TTL) — сбросить кэш, следующий вызов
// авторизуется заново.
function invalidateKey(key) {
  if (keyCache.key === key) keyCache = { key: null, at: 0 };
}

// Живая проверка логина/пароля сотрудника через iiko (SSO при входе в CRM).
// true — iiko принял учётные данные (у сотрудника есть доступ в iikoOffice).
// Сессию сразу закрываем. Недоступность сервера или неверные данные → false.
// Пароль никуда не сохраняется; SHA1 требует сам iiko.
export async function verifyIikoCredentials(login, password) {
  if (!env.IIKO_SERVER_URL || !login || !password) return false;
  try {
    const body =
      `login=${encodeURIComponent(login)}` + `&pass=${sha1(password)}`;
    const res = await fetch(`${BASE}/resto/api/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) return false;
    const key = (await res.text()).trim().replace(/^"|"$/g, "");
    // Успех — вернулся токен (непустая строка без пробелов). Иначе — отказ.
    if (!key || /\s/.test(key)) return false;
    await logout(key);
    return true;
  } catch {
    return false;
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
    // Токен протух раньше TTL — сбрасываем кэш, следующий вызов re-auth.
    if (res.status === 401) invalidateKey(key);
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
  const key = await acquireKey();
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
    releaseKey(key);
  }
}

// ── Производство: номенклатура и склады (для «Акта приготовления») ──────────
// Чтение справочников iiko, нужных чтобы завести акт приготовления: список
// блюд/заготовок (у которых есть тех.карта — их можно «приготовить») и склады.
// Пока только ЧТЕНИЕ — проверяем корректность данных перед записью в iiko.

// Разбор списка складов из XML-ответа /resto/api/corporation/stores.
function parseStoresXml(xml) {
  const blocks =
    xml.match(/<corporateItemDto\b[^>]*>[\s\S]*?<\/corporateItemDto>/g) || [];
  return blocks.map((b) => {
    const one = (tag) => {
      const m = b.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
      return m ? decodeXml(m[1].trim()) : "";
    };
    return {
      id: one("id"),
      code: one("code"),
      name: one("name"),
      type: one("type"),
    };
  });
}

// Разбор списка товаров из XML (запасной путь, если сервер отдал не JSON).
function parseProductsXml(xml) {
  const blocks =
    xml.match(/<productDto\b[^>]*>[\s\S]*?<\/productDto>/g) ||
    xml.match(/<product\b[^>]*>[\s\S]*?<\/product>/g) ||
    [];
  return blocks.map((b) => {
    const one = (tag) => {
      const m = b.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
      return m ? decodeXml(m[1].trim()) : "";
    };
    return {
      id: one("id"),
      name: one("name"),
      num: one("num"),
      code: one("code"),
      type: one("type"),
    };
  });
}

// Блюда/заготовки, которые можно «приготовить» (есть тех.карта): DISH, PREPARED.
const PRODUCIBLE_TYPES = new Set(["DISH", "PREPARED"]);

async function fetchProducts(key) {
  const res = await fetch(
    `${BASE}/resto/api/v2/entities/products/list?key=${encodeURIComponent(
      key
    )}&includeDeleted=false`,
    { headers: { Accept: "application/json" } }
  );
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `iiko products → ${res.status} ${text.slice(0, 300)}`.trim()
    );
  }
  let arr = [];
  try {
    const j = JSON.parse(text);
    arr = Array.isArray(j) ? j : Array.isArray(j.response) ? j.response : [];
  } catch {
    arr = parseProductsXml(text);
  }
  const norm = arr
    .map((p) => ({
      id: p.id,
      name: p.name || "",
      num: p.num || "",
      code: p.code || "",
      type: p.type || "",
    }))
    .filter((p) => p.id && PRODUCIBLE_TYPES.has(p.type))
    .sort((a, b) => (a.name || "").localeCompare(b.name || "", "ru"));
  return { products: norm, total: arr.length, sample: text.slice(0, 1200) };
}

async function fetchStores(key) {
  const res = await fetch(
    `${BASE}/resto/api/corporation/stores?key=${encodeURIComponent(key)}`
  );
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`iiko stores → ${res.status} ${text.slice(0, 300)}`.trim());
  }
  let stores = [];
  try {
    const j = JSON.parse(text);
    if (Array.isArray(j)) {
      stores = j.map((s) => ({
        id: s.id,
        code: s.code || "",
        name: s.name || "",
        type: s.type || "",
      }));
    }
  } catch {
    stores = parseStoresXml(text);
  }
  if (!stores.length) stores = parseStoresXml(text);
  stores = stores
    .filter((s) => s.id)
    .sort((a, b) => (a.name || "").localeCompare(b.name || "", "ru"));
  return { stores, sample: text.slice(0, 1200) };
}

// Справочники для акта приготовления в одной сессии iiko (login → … → logout).
export async function productionRefs() {
  if (!iikoConfigured()) throw new IikoNotConfiguredError();
  const key = await acquireKey();
  try {
    const p = await fetchProducts(key);
    const s = await fetchStores(key);
    const result = {
      products: p.products,
      stores: s.stores,
      productCount: p.products.length,
      storeCount: s.stores.length,
    };
    // Диагностика: если разобрать не удалось — вернём образец сырого ответа,
    // чтобы по нему уточнить формат конкретного сервера.
    if (!p.products.length) result.productsSample = p.sample;
    if (!s.stores.length) result.storesSample = s.sample;
    return result;
  } finally {
    releaseKey(key);
  }
}

// ── Отчёт производства ──────────────────────────────────────────────────────
// Папки номенклатуры iiko (группы) — в терминах компании это «отделы».
async function fetchGroups(key) {
  const res = await fetch(
    `${BASE}/resto/api/v2/entities/products/group/list?key=${encodeURIComponent(
      key
    )}&includeDeleted=false`,
    { headers: { Accept: "application/json" } }
  );
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`iiko groups → ${res.status} ${text.slice(0, 300)}`.trim());
  }
  let arr = [];
  try {
    const j = JSON.parse(text);
    arr = Array.isArray(j) ? j : Array.isArray(j.response) ? j.response : [];
  } catch {
    arr = [];
  }
  return arr
    .map((g) => ({ id: g.id, name: g.name || "", parent: g.parent || null }))
    .filter((g) => g.id);
}

// Полный список продуктов (без фильтра по типу) с папкой (parent) и единицей
// измерения — для отчёта производства нужны имена ЛЮБЫХ productId из актов.
async function fetchAllProducts(key) {
  const res = await fetch(
    `${BASE}/resto/api/v2/entities/products/list?key=${encodeURIComponent(
      key
    )}&includeDeleted=false`,
    { headers: { Accept: "application/json" } }
  );
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `iiko products → ${res.status} ${text.slice(0, 300)}`.trim()
    );
  }
  let arr = [];
  try {
    const j = JSON.parse(text);
    arr = Array.isArray(j) ? j : Array.isArray(j.response) ? j.response : [];
  } catch {
    arr = parseProductsXml(text);
  }
  return arr
    .map((p) => ({
      id: p.id,
      name: p.name || "",
      parent: p.parent || null,
      unit: p.mainUnit || p.unitName || "",
      type: p.type || "",
    }))
    .filter((p) => p.id);
}

// Разбор XML выгрузки актов приготовления: терпимо к обёрткам — ищем блоки
// <document>…</document> (или *DocumentDto), внутри — статус и позиции.
export function parseProductionDocsXml(text) {
  const docs = [];
  const docRe =
    /<(?:document|productionDocumentDto)>([\s\S]*?)<\/(?:document|productionDocumentDto)>/g;
  let m;
  while ((m = docRe.exec(text))) {
    const body = m[1];
    const one = (tag) => {
      const mm = body.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
      return mm ? mm[1] : "";
    };
    const items = [];
    const itemRe = /<item>([\s\S]*?)<\/item>/g;
    let im;
    while ((im = itemRe.exec(body))) {
      const ib = im[1];
      const iv = (tag) => {
        const mm = ib.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
        return mm ? mm[1] : "";
      };
      const productId = iv("productId");
      const amount = Number(iv("amount"));
      if (productId && Number.isFinite(amount))
        items.push({ productId, amount });
    }
    docs.push({
      status: one("status") || "PROCESSED",
      dateIncoming: one("dateIncoming"),
      documentNumber: one("documentNumber"),
      items,
    });
  }
  return docs;
}

// Отчёт производства за период: читает проведённые акты приготовления из iiko
// и агрегирует «какой товар и сколько произведено», с отделом (папкой) товара.
export async function productionReport({ from, to }) {
  if (!iikoConfigured()) throw new IikoNotConfiguredError();
  const key = await acquireKey();
  try {
    const res = await fetch(
      `${BASE}/resto/api/v2/documents/export/productionDocument?key=${encodeURIComponent(
        key
      )}&dateFrom=${encodeURIComponent(from)}&dateTo=${encodeURIComponent(to)}`,
      { headers: { Accept: "application/xml" } }
    );
    const text = await res.text();
    if (res.status === 401) invalidateKey(key);
    if (!res.ok) {
      throw new Error(
        `iiko production export → ${res.status} ${text.slice(0, 300)}`.trim()
      );
    }
    let docs = [];
    // Некоторые сборки отвечают JSON — пробуем сначала его.
    try {
      const j = JSON.parse(text);
      const arr = Array.isArray(j)
        ? j
        : Array.isArray(j.response)
          ? j.response
          : Array.isArray(j.documents)
            ? j.documents
            : [];
      docs = arr.map((d) => ({
        status: d.status || "PROCESSED",
        dateIncoming: d.dateIncoming || "",
        documentNumber: d.documentNumber || "",
        items: (d.items || []).map((it) => ({
          productId: it.productId,
          amount: Number(it.amount) || 0,
        })),
      }));
    } catch {
      docs = parseProductionDocsXml(text);
    }
    const processed = docs.filter(
      (d) => String(d.status).toUpperCase() !== "DELETED"
    );

    // Справочники для имён и отделов.
    const [products, groups] = await Promise.all([
      fetchAllProducts(key),
      fetchGroups(key).catch(() => []),
    ]);
    const prodById = new Map(products.map((p) => [p.id, p]));
    const groupById = new Map(groups.map((g) => [g.id, g]));
    // Верхняя папка (отдел) в цепочке групп продукта.
    const topGroup = (gid) => {
      let g = groupById.get(gid);
      let guard = 0;
      while (g && g.parent && groupById.has(g.parent) && guard < 20) {
        g = groupById.get(g.parent);
        guard += 1;
      }
      return g || null;
    };

    const byProduct = new Map();
    for (const d of processed) {
      for (const it of d.items) {
        const cur = byProduct.get(it.productId) || 0;
        byProduct.set(it.productId, cur + it.amount);
      }
    }
    const items = [...byProduct.entries()]
      .map(([productId, amount]) => {
        const p = prodById.get(productId);
        const grp = p && p.parent ? groupById.get(p.parent) : null;
        const dept = p && p.parent ? topGroup(p.parent) : null;
        return {
          productId,
          name: p ? p.name : productId,
          unit: p ? p.unit : "",
          amount,
          groupId: grp ? grp.id : null,
          groupName: grp ? grp.name : "",
          deptId: dept ? dept.id : null,
          deptName: dept ? dept.name : "Без отдела",
        };
      })
      .sort(
        (a, z) =>
          a.deptName.localeCompare(z.deptName, "ru") || z.amount - a.amount
      );
    const deptMap = new Map();
    for (const it of items) {
      const k = it.deptId || "-";
      const cur = deptMap.get(k) || {
        id: it.deptId,
        name: it.deptName,
        amount: 0,
        positions: 0,
      };
      cur.amount += it.amount;
      cur.positions += 1;
      deptMap.set(k, cur);
    }
    const result = {
      from,
      to,
      docCount: processed.length,
      items,
      depts: [...deptMap.values()].sort((a, z) => z.amount - a.amount),
    };
    // Диагностика: акты есть на сервере, но разбор дал ноль — покажем образец.
    if (!processed.length && text.trim()) result.sample = text.slice(0, 1200);
    return result;
  } finally {
    releaseKey(key);
  }
}

// Экранирование значений для XML тела документа.
function escXml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Строит XML акта приготовления (productionDocument) для импорта в iiko.
// Все позиции производятся и списываются на одном складе storeId.
export function buildProductionXml({
  date,
  storeId,
  items,
  number = "",
  comment = "",
  status = "PROCESSED",
}) {
  const dt = `${date}T12:00:00`;
  const rows = (items || [])
    .map(
      (it) =>
        `<item>` +
        `<productId>${escXml(it.productId)}</productId>` +
        `<storeId>${escXml(storeId)}</storeId>` +
        `<amount>${Number(it.amount)}</amount>` +
        `</item>`
    )
    .join("");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<document>` +
    (number ? `<documentNumber>${escXml(number)}</documentNumber>` : "") +
    `<dateIncoming>${dt}</dateIncoming>` +
    `<status>${status}</status>` +
    (comment ? `<comment>${escXml(comment)}</comment>` : "") +
    `<items>${rows}</items>` +
    `</document>`
  );
}

// Создаёт акт приготовления в iiko. dryRun=true — только строит XML и НИЧЕГО
// не пишет (предпросмотр). Иначе — импортирует документ и возвращает результат
// с ответом iiko (для показа ошибок валидации при неверных данных/правах).
export async function createProduction({
  date,
  storeId,
  items,
  number = "",
  comment = "",
  dryRun = false,
}) {
  if (!iikoConfigured()) throw new IikoNotConfiguredError();
  const xml = buildProductionXml({ date, storeId, items, number, comment });
  if (dryRun) return { dryRun: true, xml };
  const key = await acquireKey();
  try {
    const res = await fetch(
      `${BASE}/resto/api/documents/import/productionDocument?key=${encodeURIComponent(
        key
      )}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/xml" },
        body: xml,
      }
    );
    const text = await res.text();
    if (!res.ok) {
      throw new Error(
        `iiko production → ${res.status} ${text.slice(0, 500)}`.trim()
      );
    }
    // Ответ iiko — XML с результатом. valid=false + errorMessage при ошибке.
    const valid = !/<valid>\s*false\s*<\/valid>/i.test(text);
    const errMatch = text.match(/<errorMessage>([\s\S]*?)<\/errorMessage>/i);
    const idMatch = text.match(/<documentNumber>([\s\S]*?)<\/documentNumber>/i);
    return {
      ok: valid,
      documentNumber: idMatch ? decodeXml(idMatch[1].trim()) : "",
      error: errMatch ? decodeXml(errMatch[1].trim()) : "",
      response: text.slice(0, 2000),
      xml,
    };
  } finally {
    releaseKey(key);
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
  const key = await acquireKey();
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
    releaseKey(key);
  }
}

// Продажи по блюдам с группой 1-го уровня — для расчёта себестоимости (food
// cost). Один OLAP-срез: строка = группа + блюдо, меры — выручка со скидкой и
// количество. Себестоимость по этим данным считается в foodCostConfig.
export async function foodCostSales({ from, to, departments }) {
  if (!iikoConfigured()) throw new IikoNotConfiguredError();
  const key = await acquireKey();
  try {
    return await runOlap(key, {
      from,
      to,
      departments,
      groupByRowFields: ["DishGroup.TopParent", "DishName"],
    });
  } finally {
    releaseKey(key);
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
  const key = await acquireKey();
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
    releaseKey(key);
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
  // Ненулевой оборот с допуском на копейки — обороты это разность двух
  // балансов-float, поэтому точное сравнение с 0 пропускало бы призрачные
  // строки вроде 1e-9. Порог — половина копейки.
  const nz = (v) => Math.abs(v) >= 0.005;
  const node = (a) => {
    const label = a.name || a.code || "—";
    // Скрываем нулевые под-статьи — как в отчёте iiko (там строк с 0 нет).
    const kids = (childrenOf[a.id] || []).map(node).filter((k) => nz(k.value));
    // Двойная запись iiko: доходные счета кредитовые (оборот отрицательный),
    // расходные дебетовые (положительный). sign=-1 у доходов делает их плюсом.
    const own = (turnover[a.id] || 0) * sign;
    if (kids.length && nz(own)) {
      kids.push({ name: `${label}, прочие`, value: own, children: [] });
    }
    const value = kids.length ? kids.reduce((s, k) => s + k.value, 0) : own;
    return { name: label, value, children: kids };
  };
  // Корневые счёта — в порядке плана счетов iiko (childrenOf.__root__ уже
  // отсортирован), только с ненулевым оборотом.
  const roots = (childrenOf.__root__ || [])
    .map(node)
    .filter((n) => nz(n.value));
  const total = roots.reduce((s, n) => s + n.value, 0);
  return { total, lines: roots };
}

// Полный ОПиУ за период. department — название филиала (необязательно);
// без него отчёт по всей корпорации (там суммируются внутренние передачи,
// поэтому для сверки с iiko выбирайте конкретный филиал).
export async function pnlReport({ from, to, department }) {
  if (!iikoConfigured()) throw new IikoNotConfiguredError();
  const key = await acquireKey();
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
      // accountsDump — счета план-счетов (для статей ОПиУ) в ТОМ ПОРЯДКЕ, в
      // котором их вернул iiko, со всеми полями порядка (code/num/order). По
      // нему настраиваем сортировку статей 1-в-1 как в отчёте iiko.
      diagnostics: {
        accounts: accounts.length,
        balEndRows: balEnd.rows.length,
        balStartRows: balStart.rows.length,
        balSample: balEnd.sample || balStart.sample || "",
        accSample: accounts.length ? "" : accText.slice(0, 800),
        accountKeys: accounts[0] ? Object.keys(accounts[0]) : [],
        accountsDump: (() => {
          const nameById = {};
          accounts.forEach((a) => (nameById[a.id] = a.name));
          return accounts
            .filter((a) => !a.deleted && PNL_TYPES[a.type])
            .map((a) => ({
              name: a.name,
              code: a.code ?? null,
              num: a.num ?? a.order ?? a.priority ?? null,
              type: a.type,
              parent: a.accountParentId ? nameById[a.accountParentId] : null,
            }));
        })(),
      },
    };
  } finally {
    releaseKey(key);
  }
}

// ── Закупки и склад ─────────────────────────────────────────────────────────
// Приходные накладные и остатки складов из iiko — для модуля контроля цен и
// остатков. Даты документов iiko ждёт в формате DD.MM.YYYY.
function ddmmyyyy(ymd) {
  const [y, m, d] = String(ymd).slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
}

// Разбор XML-выгрузки приходных накладных (/documents/export/incomingInvoice).
// Терпимо к обёрткам: ищем <document>…</document>, внутри — шапка и позиции.
export function parseIncomingInvoicesXml(xml) {
  const docs = [];
  const docRe = /<document>([\s\S]*?)<\/document>/g;
  let m;
  while ((m = docRe.exec(xml))) {
    const body = m[1];
    const one = (tag) => {
      const mm = body.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
      return mm ? decodeXml(mm[1].trim()) : "";
    };
    const items = [];
    const itemRe = /<item>([\s\S]*?)<\/item>/g;
    let im;
    while ((im = itemRe.exec(body))) {
      const ib = im[1];
      const iv = (tag) => {
        const mm = ib.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
        return mm ? mm[1].trim() : "";
      };
      const productId = iv("productId");
      if (!productId) continue;
      const num = (v) => {
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
      };
      items.push({
        productId,
        amount: num(iv("amount")),
        price: num(iv("price")),
        sum: num(iv("sum")),
        storeId: iv("store") || iv("storeId"),
      });
    }
    docs.push({
      iikoDocId: one("id") || one("documentNumber"),
      docNumber: one("documentNumber"),
      date: one("dateIncoming"),
      supplier: one("supplier") || one("counteragentId") || "",
      items,
    });
  }
  return docs;
}

// Приходные накладные за период (from/to — YYYY-MM-DD). Возвращает плоский
// список позиций, обогащённый именем/единицей товара (в той же сессии iiko).
export async function incomingInvoices({ from, to }) {
  if (!iikoConfigured()) throw new IikoNotConfiguredError();
  const key = await acquireKey();
  try {
    const url =
      `${BASE}/resto/api/documents/export/incomingInvoice` +
      `?from=${encodeURIComponent(ddmmyyyy(from))}` +
      `&to=${encodeURIComponent(ddmmyyyy(to))}` +
      `&key=${encodeURIComponent(key)}`;
    const res = await fetch(url);
    const text = await res.text();
    if (res.status === 401) invalidateKey(key);
    if (!res.ok) {
      throw new Error(
        `iiko invoices → ${res.status} ${text.slice(0, 300)}`.trim()
      );
    }
    const docs = parseIncomingInvoicesXml(text);
    const products = await fetchAllProducts(key).catch(() => []);
    const pById = new Map(products.map((p) => [p.id, p]));
    const entries = [];
    for (const d of docs) {
      for (const it of d.items) {
        const p = pById.get(it.productId);
        entries.push({
          iikoDocId: d.iikoDocId,
          docNumber: d.docNumber,
          date: d.date,
          supplier: d.supplier,
          productId: it.productId,
          productName: p ? p.name : it.productId,
          unit: p ? p.unit : "",
          amount: it.amount,
          price: it.price,
          sum: it.sum,
          storeId: it.storeId || "",
        });
      }
    }
    const result = { entries, docCount: docs.length };
    if (!entries.length) result.sample = text.slice(0, 1000);
    return result;
  } finally {
    releaseKey(key);
  }
}

// Остатки складов на момент timestamp (yyyy-MM-ddTHH:mm:ss). Агрегируем по
// товару (сумма по складам), обогащаем именем/единицей.
export async function storeBalances({ timestamp, departmentId }) {
  if (!iikoConfigured()) throw new IikoNotConfiguredError();
  const key = await acquireKey();
  try {
    const dep = departmentId
      ? `&department=${encodeURIComponent(departmentId)}`
      : "";
    const url =
      `${BASE}/resto/api/v2/reports/balance/stores` +
      `?timestamp=${encodeURIComponent(timestamp)}${dep}` +
      `&key=${encodeURIComponent(key)}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    const text = await res.text();
    if (res.status === 401) invalidateKey(key);
    if (!res.ok) {
      throw new Error(
        `iiko balance/stores → ${res.status} ${text.slice(0, 300)}`.trim()
      );
    }
    let rows = [];
    try {
      const j = text ? JSON.parse(text) : [];
      rows = Array.isArray(j) ? j : j.rows || j.data || [];
    } catch {
      /* оставим пустым */
    }
    const byProduct = new Map();
    for (const r of rows) {
      const pid = r.product || r.productId;
      if (!pid) continue;
      const cur = byProduct.get(pid) || { productId: pid, stock: 0 };
      cur.stock += Number(r.amount) || 0;
      byProduct.set(pid, cur);
    }
    const products = await fetchAllProducts(key).catch(() => []);
    const pById = new Map(products.map((p) => [p.id, p]));
    const out = [...byProduct.values()].map((x) => {
      const p = pById.get(x.productId);
      return {
        productId: x.productId,
        name: p ? p.name : x.productId,
        unit: p ? p.unit : "",
        stock: Math.round(x.stock * 1000) / 1000,
      };
    });
    const result = { rows: out, raw: rows.length };
    if (!rows.length) result.sample = text.slice(0, 800);
    return result;
  } finally {
    releaseKey(key);
  }
}
