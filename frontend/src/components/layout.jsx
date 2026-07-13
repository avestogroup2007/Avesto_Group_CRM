// Каркас интерфейса: боковое меню, шапка, нижняя навигация, смена пароля.
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Cell } from "recharts";
import { X, Users, Power, Lock, Menu, ChevronDown } from "lucide-react";
import { changePassword } from "../api.js";
import Logo from "../Logo.jsx";
import { C } from "../lib/theme.js";
import { tr, LANG } from "../lib/i18n.js";
import { fmtDur } from "../lib/format.js";
import { Avatar } from "../components/ui.jsx";
import { ROLE_OPTS } from "../lib/org.js";
import { NAV_SHORT, navSections, groupOfView } from "../lib/nav.js";

// Один пункт меню (используется и в соло-разделах, и внутри групп).
function NavItem({ n, active, onClick, nested }) {
  return (
    <button
      onClick={onClick}
      className={`nav-item flex items-center gap-3 rounded-xl text-left${active ? " nav-item-active" : ""}`}
      style={{
        padding: nested ? "9px 10px 9px 12px" : "12px",
        background: active ? C.brandGrad : "transparent",
        color: active ? "#fff" : C.ink,
        fontWeight: active ? 700 : 600,
        fontSize: nested ? 13.5 : 14.5,
        boxShadow: active ? "0 6px 18px rgba(123,45,31,.30)" : "none",
      }}
    >
      <n.icon size={nested ? 18 : 20} color={active ? "#fff" : C.sub} />
      {tr(n.label)}
    </button>
  );
}

export function Sidebar({ view, setView, role, brandName }) {
  const sections = navSections(role);
  const activeGroup = groupOfView(view);
  // Раскрыта группа активного раздела; пользователь может открывать/закрывать
  // остальные. При переходе в раздел его группа раскрывается автоматически.
  const [open, setOpen] = useState(() =>
    new Set(activeGroup ? [activeGroup] : []),
  );
  useEffect(() => {
    if (activeGroup)
      setOpen((prev) =>
        prev.has(activeGroup) ? prev : new Set(prev).add(activeGroup),
      );
  }, [activeGroup]);
  const toggle = (k) =>
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(k) ? next.delete(k) : next.add(k);
      return next;
    });
  return (
    <aside
      className="hidden md:flex flex-col glass-chrome"
      style={{
        position: "fixed",
        left: 0,
        top: 0,
        width: 250,
        height: "100vh",
        overflowY: "auto",
        borderRight: `1px solid ${C.glassBorder}`,
        boxShadow: "1px 0 24px rgba(74,38,22,.05)",
        zIndex: 40,
      }}
    >
      <div
        className="shrink-0 flex items-center gap-3"
        style={{
          height: 65,
          paddingLeft: 16,
          paddingRight: 16,
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <Logo size={36} radius={10} />
        <div className="min-w-0 flex flex-col justify-center">
          <div
            className="font-extrabold truncate"
            style={{ color: C.ink, fontSize: 15.5, lineHeight: 1.25 }}
          >
            {brandName || "Avesto Group"}
          </div>
          <div
            className="truncate"
            style={{ fontSize: 11, color: C.faint, lineHeight: 1.25 }}
          >
            CRM System
          </div>
        </div>
      </div>
      <nav className="flex flex-col gap-1" style={{ padding: 12 }}>
        {sections.map((sec) => {
          if (sec.type === "solo") {
            return (
              <NavItem
                key={sec.item.key}
                n={sec.item}
                active={view === sec.item.key}
                onClick={() => setView(sec.item.key)}
              />
            );
          }
          const expanded = open.has(sec.key);
          const hasActive = sec.items.some((i) => i.key === view);
          return (
            <div key={sec.key} className="flex flex-col gap-1">
              <button
                onClick={() => toggle(sec.key)}
                className="flex items-center gap-3 rounded-xl px-3 py-3 text-left"
                style={{
                  background:
                    hasActive && !expanded ? "rgba(123,45,31,.08)" : "transparent",
                  color: hasActive ? C.brandA : C.ink,
                  fontWeight: 700,
                  fontSize: 14.5,
                }}
              >
                <sec.icon size={20} color={hasActive ? C.brandA : C.sub} />
                <span className="flex-1">{tr(sec.label)}</span>
                <ChevronDown
                  size={17}
                  color={C.faint}
                  style={{
                    transform: expanded ? "rotate(0deg)" : "rotate(-90deg)",
                    transition: "transform .15s",
                  }}
                />
              </button>
              {expanded && (
                <div
                  className="flex flex-col gap-1"
                  style={{
                    marginLeft: 12,
                    paddingLeft: 8,
                    borderLeft: `1px solid ${C.border}`,
                  }}
                >
                  {sec.items.map((n) => (
                    <NavItem
                      key={n.key}
                      n={n}
                      nested
                      active={view === n.key}
                      onClick={() => setView(n.key)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>
      <div
        className="mt-auto"
        style={{
          padding: "16px 16px 16px 24px",
          fontSize: 11.5,
          color: C.faint,
          lineHeight: 1.5,
        }}
      >
        Стандарт доступности: крупный шрифт, текстовые подписи, цветовое
        кодирование фаз.
      </div>
    </aside>
  );
}

// Плоский список доступных пунктов в порядке групп — для мобильной панели.
function flatItems(role) {
  const out = [];
  for (const sec of navSections(role)) {
    if (sec.type === "solo") out.push(sec.item);
    else out.push(...sec.items);
  }
  return out;
}

export function BottomNav({ view, setView, role, onMore }) {
  const items = flatItems(role);
  const primary = items.slice(0, 4);
  const overflow = items.slice(4);
  const overflowActive = overflow.some((n) => n.key === view);
  const Cell = ({ active, onClick, Icon, label }) => (
    <button
      onClick={onClick}
      className="flex-1 flex flex-col items-center justify-center gap-0.5 py-1.5 px-0.5"
      style={{ minWidth: 0, color: active ? C.brandA : C.sub }}
    >
      <Icon size={20} color={active ? C.brandA : C.sub} />
      <span
        style={{
          fontSize: 9.5,
          letterSpacing: "-.01em",
          fontWeight: active ? 800 : 600,
          maxWidth: "100%",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
    </button>
  );
  return (
    <nav
      className="md:hidden fixed left-0 right-0 bottom-0 flex items-stretch glass-chrome"
      style={{
        borderTop: `1px solid ${C.glassBorder}`,
        boxShadow: "0 -6px 22px rgba(74,38,22,.09)",
        paddingBottom: "max(6px, env(safe-area-inset-bottom))",
        zIndex: 30,
      }}
    >
      {primary.map((n) => (
        <Cell
          key={n.key}
          active={view === n.key}
          onClick={() => setView(n.key)}
          Icon={n.icon}
          label={tr(NAV_SHORT[n.key] || n.label)}
        />
      ))}
      {overflow.length > 0 && (
        <Cell
          active={overflowActive}
          onClick={onMore}
          Icon={Menu}
          label={tr("Ещё")}
        />
      )}
    </nav>
  );
}

export function MoreSheet({ open, onClose, role, view, setView }) {
  if (!open) return null;
  const sections = navSections(role);
  const Item = (n) => {
    const active = view === n.key;
    return (
      <button
        key={n.key}
        onClick={() => {
          setView(n.key);
          onClose();
        }}
        className="flex items-center gap-2.5 rounded-xl px-3 py-3 text-left min-w-0"
        style={{
          background: active ? C.brandA : "#F8FAFC",
          color: active ? "#fff" : C.ink,
          fontWeight: 600,
          fontSize: 13.5,
          border: `1px solid ${active ? C.brandA : C.border}`,
        }}
      >
        <n.icon
          size={19}
          color={active ? "#fff" : C.sub}
          className="shrink-0"
        />
        <span className="min-w-0" style={{ lineHeight: 1.15 }}>
          {tr(n.label)}
        </span>
      </button>
    );
  };
  return (
    <div className="md:hidden fixed inset-0" style={{ zIndex: 60 }}>
      <div
        className="absolute inset-0"
        style={{
          background: "rgba(30,16,10,.42)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
        }}
        onClick={onClose}
      />
      <div
        className="absolute left-0 right-0 bottom-0 glass-chrome p-4 fade-up"
        style={{
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          borderTop: `1px solid ${C.glassBorder}`,
          paddingBottom: "max(16px, env(safe-area-inset-bottom))",
          boxShadow: "0 -12px 40px rgba(30,16,10,.24)",
        }}
      >
        <div
          className="mx-auto mb-3"
          style={{
            width: 40,
            height: 4,
            borderRadius: 99,
            background: "#E2E8F0",
          }}
        />
        <div className="flex items-center justify-between mb-3">
          <div
            className="font-extrabold"
            style={{ color: C.ink, fontSize: 16 }}
          >
            {tr("Все разделы")}
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl"
            style={{ background: C.line }}
          >
            <X size={18} color={C.sub} />
          </button>
        </div>
        <div
          className="flex flex-col gap-3"
          style={{ maxHeight: "62vh", overflowY: "auto" }}
        >
          {sections.map((sec) =>
            sec.type === "solo" ? (
              <div key={sec.item.key} className="grid grid-cols-1 gap-2">
                {Item(sec.item)}
              </div>
            ) : (
              <div key={sec.key}>
                <div
                  className="px-1 mb-1.5 font-bold uppercase"
                  style={{ color: C.faint, fontSize: 11, letterSpacing: ".04em" }}
                >
                  {tr(sec.label)}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {sec.items.map(Item)}
                </div>
              </div>
            ),
          )}
        </div>
      </div>
    </div>
  );
}

// Модалка самостоятельной смены пароля (из профиля). Меняет пароль входа в CRM.
export function PasswordModal({ onClose }) {
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [conf, setConf] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const submit = async () => {
    if (!cur || !next) return setErr("Заполните текущий и новый пароль");
    if (next.length < 6) return setErr("Новый пароль — минимум 6 символов");
    if (next !== conf)
      return setErr("Новый пароль и подтверждение не совпадают");
    setBusy(true);
    setErr("");
    try {
      await changePassword(cur, next);
      setDone(true);
    } catch (e) {
      setErr(e.message || "Не удалось сменить пароль");
    } finally {
      setBusy(false);
    }
  };
  const inp = {
    border: `1px solid ${C.border}`,
    borderRadius: 12,
    padding: "10px 12px",
    width: "100%",
    fontSize: 14,
  };
  // Портал в body: иначе position:fixed привязывается к шапке с backdrop-filter
  // (та создаёт containing block) и модалка съезжает в угол вместо центра.
  return createPortal(
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,.4)" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="rounded-2xl bg-white p-5 w-full max-w-sm"
        style={{ border: `1px solid ${C.border}` }}
      >
        <h3 className="font-bold mb-1" style={{ color: C.ink, fontSize: 16 }}>
          Смена пароля
        </h3>
        {done ? (
          <>
            <div
              className="rounded-xl px-3 py-2 my-2"
              style={{ background: "#DCFCE7", color: "#15803D", fontSize: 13 }}
            >
              Пароль изменён.
            </div>
            <button
              onClick={onClose}
              className="w-full rounded-xl px-4 py-2.5 font-bold text-white"
              style={{ background: C.brandA }}
            >
              Готово
            </button>
          </>
        ) : (
          <>
            <p style={{ fontSize: 12.5, color: C.sub, marginBottom: 12 }}>
              Меняется пароль для входа в CRM. У сотрудников iiko основной
              пароль — из iiko; здесь меняется локальный (запасной) пароль CRM.
            </p>
            <div className="space-y-2">
              <input
                type="password"
                placeholder="Текущий пароль"
                value={cur}
                onChange={(e) => setCur(e.target.value)}
                style={inp}
                autoComplete="current-password"
              />
              <input
                type="password"
                placeholder="Новый пароль (мин. 6 символов)"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                style={inp}
                autoComplete="new-password"
              />
              <input
                type="password"
                placeholder="Повторите новый пароль"
                value={conf}
                onChange={(e) => setConf(e.target.value)}
                style={inp}
                autoComplete="new-password"
              />
            </div>
            {err && (
              <div style={{ color: C.bad, fontSize: 12.5, marginTop: 8 }}>
                {err}
              </div>
            )}
            <div className="flex gap-2 mt-3">
              <button
                onClick={onClose}
                className="flex-1 rounded-xl px-4 py-2.5 font-bold"
                style={{
                  border: `1px solid ${C.border}`,
                  color: C.sub,
                  background: "#fff",
                }}
              >
                Отмена
              </button>
              <button
                onClick={submit}
                disabled={busy}
                className="flex-1 rounded-xl px-4 py-2.5 font-bold text-white"
                style={{ background: C.brandA, opacity: busy ? 0.7 : 1 }}
              >
                {busy ? "…" : "Сменить"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

export function TopBar({
  me,
  shift,
  dispatch,
  onToggleShift,
  authUser,
  onLogout,
}) {
  const [open, setOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  return (
    <header
      className="topbar-h glass-chrome px-3 md:px-6 py-2 flex flex-wrap items-center gap-2 sm:gap-3 sticky top-0"
      style={{
        minHeight: 65,
        borderBottom: `1px solid ${C.glassBorder}`,
        boxShadow: "0 4px 20px rgba(74,38,22,.05)",
        zIndex: 20,
      }}
    >
      <button
        onClick={onToggleShift}
        className="inline-flex items-center gap-2 rounded-xl px-2.5 sm:px-3.5 py-2.5 font-bold transition"
        style={{
          ...(shift.open
            ? {
                background: "#E9F9EF",
                color: C.ok,
                border: `1.5px solid ${C.ok}`,
              }
            : {
                background: "#FEECEC",
                color: C.bad,
                border: `1.5px solid ${C.bad}`,
              }),
        }}
      >
        <Power size={17} className="shrink-0" />
        <span>
          {shift.open ? tr("Смена открыта") : tr("Открыть смену")}
          {shift.open && shift.openedAt
            ? ` · ${fmtDur(Date.now() - shift.openedAt)}`
            : ""}
        </span>
      </button>
      {shift.open && (
        <button
          onClick={onToggleShift}
          className="hidden sm:inline-flex rounded-xl px-3 py-2 font-semibold"
          style={{ background: C.line, color: C.sub, fontSize: 13 }}
        >
          {tr("Закрыть смену")}
        </button>
      )}
      <div className="ml-auto flex items-center gap-2 sm:gap-3 relative">
        <div
          className="flex rounded-xl overflow-hidden shrink-0"
          style={{ border: `1px solid ${C.border}` }}
        >
          {["ru", "uz"].map((lg) => (
            <button
              key={lg}
              onClick={() =>
                dispatch({ type: "SET_SETTING", key: "lang", value: lg })
              }
              className="px-2.5 py-1.5 font-bold"
              style={{
                background: LANG === lg ? C.brandA : "#fff",
                color: LANG === lg ? "#fff" : C.sub,
                fontSize: 12.5,
              }}
            >
              {lg === "ru" ? "RU" : "UZ"}
            </button>
          ))}
        </div>
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2.5 rounded-xl px-2 py-1.5"
          style={{ border: `1px solid ${C.border}` }}
        >
          <Avatar id={me.id} size={34} />
          <div className="text-left hidden sm:block">
            <div
              style={{
                fontSize: 13.5,
                fontWeight: 700,
                color: C.ink,
                lineHeight: 1.1,
              }}
            >
              {me.name}
            </div>
            <div style={{ fontSize: 12, color: C.sub }}>{me.pos}</div>
          </div>
          <Users size={16} color={C.faint} className="hidden sm:block" />
        </button>
        {open && (
          <div
            className="absolute right-0 top-12 z-30 rounded-2xl bg-white p-2 shadow-xl"
            style={{
              border: `1px solid ${C.border}`,
              width: "min(280px, calc(100vw - 24px))",
            }}
          >
            {authUser && (
              <div
                className="px-2.5 py-2 mb-1 rounded-xl"
                style={{ background: "#F1F5FD" }}
              >
                <div
                  style={{ fontSize: 11.5, color: C.faint, fontWeight: 700 }}
                >
                  {tr("Вход выполнен")}
                </div>
                <div
                  className="truncate"
                  style={{ fontSize: 13.5, color: C.ink, fontWeight: 700 }}
                >
                  {(() => {
                    // Имя: реальное ФИО (displayName), а не внутренний ключ
                    // «iiko-…». Должность: читаемая (position) или роль по словарю.
                    const nm =
                      authUser.displayName ||
                      (String(authUser.name || "").startsWith("iiko-")
                        ? ""
                        : authUser.name) ||
                      "Пользователь";
                    const pos =
                      authUser.position ||
                      (ROLE_OPTS.find(([k]) => k === authUser.role) || [])[1] ||
                      authUser.role ||
                      "";
                    return pos ? `${nm} · ${pos}` : nm;
                  })()}
                </div>
              </div>
            )}
            {/* Пароль iiko-учёток управляется в iiko — локальную смену не
                показываем, чтобы не путать (сервер её всё равно отклонит). */}
            {!authUser?.passwordManagedByIiko && (
              <button
                onClick={() => {
                  setOpen(false);
                  setPwOpen(true);
                }}
                className="w-full flex items-center gap-2 rounded-xl px-2.5 py-2.5 font-semibold"
                style={{ color: C.ink, fontSize: 13.5 }}
              >
                <Lock size={16} /> Сменить пароль
              </button>
            )}
            {onLogout && (
              <button
                onClick={() => {
                  setOpen(false);
                  onLogout();
                }}
                className="w-full flex items-center gap-2 rounded-xl px-2.5 py-2.5 mt-1 font-bold"
                style={{ color: C.bad, borderTop: `1px solid ${C.line}` }}
              >
                <Power size={16} /> {tr("Выйти")}
              </button>
            )}
          </div>
        )}
      </div>
      {pwOpen && <PasswordModal onClose={() => setPwOpen(false)} />}
    </header>
  );
}
