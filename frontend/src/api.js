// Клиент API к бэкенду Avesto Group CRM System.
// Адрес бэкенда задаётся при сборке через VITE_API_URL (в проде — onrender);
// локально пусто → относительные пути идут через прокси Vite на localhost:3000.
//
// Авторизация: токен приходит в теле логина, храним в localStorage и шлём в
// заголовке Authorization: Bearer (надёжно для кросс-домена github.io↔onrender).
const BASE = import.meta.env.VITE_API_URL || "";
const TOKEN_KEY = "avesto.auth.token";

let token =
  (typeof localStorage !== "undefined" && localStorage.getItem(TOKEN_KEY)) ||
  null;

function setToken(t) {
  token = t || null;
  if (typeof localStorage === "undefined") return;
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

export function isAuthed() {
  return Boolean(token);
}

function authHeaders(extra) {
  const h = { ...(extra || {}) };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function parseError(res) {
  try {
    const data = await res.json();
    return data.error || `Ошибка ${res.status}`;
  } catch {
    return `Ошибка ${res.status}`;
  }
}

// Вход: сохраняет токен, возвращает данные пользователя.
export async function login(loginName, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login: loginName, password }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = await res.json();
  setToken(data.token);
  return data;
}

// Кто я — по действующему токену. null, если не авторизован.
export async function me() {
  if (!token) return null;
  try {
    const res = await fetch(`${BASE}/api/auth/me`, {
      credentials: "include",
      headers: authHeaders(),
    });
    if (!res.ok) {
      if (res.status === 401) setToken(null);
      return null;
    }
    return await res.json();
  } catch {
    return null;
  }
}

// Смена собственного пароля (в т.ч. обязательная при первом входе).
export async function changePassword(currentPassword, newPassword) {
  const res = await fetch(`${BASE}/api/auth/change-password`, {
    method: "POST",
    credentials: "include",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function logout() {
  try {
    await fetch(`${BASE}/api/auth/logout`, {
      method: "POST",
      credentials: "include",
      headers: authHeaders(),
    });
  } catch {
    // игнорируем сетевые ошибки — токен всё равно снимаем локально
  }
  setToken(null);
}

// Общие помощники для будущих защищённых запросов (задачи, кассы, iiko).
export async function apiGet(path) {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function apiPost(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    credentials: "include",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body || {}),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function apiPatch(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "PATCH",
    credentials: "include",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body || {}),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function apiPut(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "PUT",
    credentials: "include",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body || {}),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function apiDelete(path) {
  const res = await fetch(`${BASE}${path}`, {
    method: "DELETE",
    credentials: "include",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

// Скачивание файла с сервера с авторизацией (например, резервной копии):
// обычная ссылка не подходит — нужен заголовок Authorization.
export async function apiDownload(path, fallbackName) {
  const res = await fetch(`${BASE}${path}`, {
    headers: authHeaders(),
    credentials: "include",
  });
  if (!res.ok) throw new Error(await parseError(res));
  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition") || "";
  const m = cd.match(/filename="([^"]+)"/);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = (m && m[1]) || fallbackName || "download";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}
