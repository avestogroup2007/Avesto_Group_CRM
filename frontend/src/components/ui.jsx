// Мелкие переиспользуемые UI-компоненты (аватары, бейджи, поля, кольца,
// селекты и календарь) — общий словарь интерфейса для всех экранов.
import { useState, useEffect, useRef } from "react";
import {
  CheckCircle2,
  ChevronRight,
  ChevronDown,
  CalendarDays,
  ArrowUp,
} from "lucide-react";
import { C, PHASES } from "../lib/theme.js";
import { tr } from "../lib/i18n.js";
import { initials, avatarColor, ymdNow } from "../lib/format.js";
import { userById } from "../lib/org.js";

export function Avatar({ id, size = 28 }) {
  const u = userById(id);
  return (
    <span
      className="inline-flex items-center justify-center rounded-full font-bold text-white shrink-0"
      style={{
        width: size,
        height: size,
        background: avatarColor(id),
        fontSize: size * 0.4,
      }}
      title={u?.name}
    >
      {initials(u?.name || "?")}
    </span>
  );
}
export function PhasePill({ phase, small }) {
  const p = PHASES[phase - 1];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full font-semibold"
      style={{
        background: p.soft,
        color: p.color,
        padding: small ? "2px 8px" : "4px 10px",
        fontSize: small ? 11 : 12.5,
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{ background: p.color, width: 7, height: 7, borderRadius: 99 }}
      />
      {p.n}. {tr(p.label)}
    </span>
  );
}
export function MiniRail({ phase }) {
  return (
    <div className="flex gap-1 w-full">
      {PHASES.map((p) => (
        <div
          key={p.n}
          className="rounded-full"
          style={{
            flex: 1,
            height: 6,
            background: p.n <= phase ? p.color : "#E5EAF2",
          }}
        />
      ))}
    </div>
  );
}
export function PhaseRail({ phase }) {
  return (
    <div className="relative w-full">
      <div
        className="absolute"
        style={{
          left: "10%",
          right: "10%",
          top: 15,
          height: 3,
          background: "#E5EAF2",
          borderRadius: 2,
        }}
      />
      <div className="relative flex items-start justify-between gap-1">
        {PHASES.map((p) => {
          const st = p.n < phase ? "done" : p.n === phase ? "current" : "todo";
          const sz = st === "current" ? 34 : 30;
          return (
            <div
              key={p.n}
              className="flex flex-col items-center"
              style={{ flex: "1 1 0", minWidth: 0 }}
            >
              <div
                className="flex items-center justify-center rounded-full font-bold"
                style={{
                  width: sz,
                  height: sz,
                  background: st === "todo" ? "#EEF2F7" : p.color,
                  color: st === "todo" ? "#94A3B8" : "#fff",
                  boxShadow: st === "current" ? `0 0 0 4px ${p.soft}` : "none",
                  fontSize: st === "current" ? 15 : 13,
                }}
              >
                {st === "done" ? "✓" : p.n}
              </div>
              <div
                className="mt-1.5 text-center"
                style={{
                  fontSize: 10,
                  lineHeight: 1.15,
                  width: "100%",
                  overflowWrap: "break-word",
                  color: st === "todo" ? "#94A3B8" : "#334155",
                  fontWeight: st === "current" ? 700 : 500,
                }}
              >
                {tr(p.label)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
export function Badge({ children, color = C.sub, bg = C.line }) {
  return (
    <span
      className="rounded-full font-semibold"
      style={{ background: bg, color, padding: "2px 9px", fontSize: 12 }}
    >
      {children}
    </span>
  );
}
export function BigBtn({
  children,
  color,
  icon: Icon,
  onClick,
  outline,
  disabled,
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full inline-flex items-center justify-center gap-2 rounded-xl py-3 font-bold transition"
      style={
        disabled
          ? {
              background: C.line,
              color: C.faint,
              fontSize: 15,
              cursor: "not-allowed",
            }
          : outline
            ? {
                border: `2px solid ${color}`,
                color,
                fontSize: 15,
                background: "#fff",
              }
            : {
                background: color,
                color: "#fff",
                fontSize: 15,
                boxShadow: `0 6px 16px ${color}33`,
              }
      }
    >
      {Icon && <Icon size={18} />} {children}
    </button>
  );
}
export function Meta({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: C.faint, fontWeight: 600 }}>
        {label}
      </div>
      <div style={{ fontSize: 14, color: C.ink, fontWeight: 600 }}>{value}</div>
    </div>
  );
}
export function Field({ label, children }) {
  return (
    <div>
      <div
        style={{
          fontSize: 12,
          color: C.faint,
          fontWeight: 600,
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}
export function Select({ value, onChange, options }) {
  // единый стандарт дизайна: все выпадающие списки программы — через NiceSelect
  return (
    <NiceSelect
      value={value}
      onChange={(v) => onChange(String(v))}
      options={options}
      width="100%"
    />
  );
}
export function Kpi({ label, value, tone }) {
  return (
    <div
      className="rounded-2xl bg-white p-4"
      style={{ border: `1px solid ${C.border}` }}
    >
      <div className="flex items-center gap-2 mb-1">
        <span
          style={{ width: 9, height: 9, borderRadius: 99, background: tone }}
        />
        <span style={{ fontSize: 12.5, color: C.sub, fontWeight: 600 }}>
          {label}
        </span>
      </div>
      <div
        className="font-extrabold"
        style={{ color: C.ink, fontSize: 30, lineHeight: 1.1 }}
      >
        {value}
      </div>
    </div>
  );
}
export function Ring({ value, label, color, size = 132 }) {
  const v = Math.min(100, Math.max(0, value));
  const r = (size - 16) / 2;
  const circ = 2 * Math.PI * r;
  const off = circ * (1 - v / 100);
  return (
    <div className="flex flex-col items-center">
      <div style={{ position: "relative", width: size, height: size }}>
        <svg width={size} height={size}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="#EDF1F7"
            strokeWidth={12}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={12}
            strokeDasharray={circ}
            strokeDashoffset={off}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ transition: "stroke-dashoffset .6s" }}
          />
        </svg>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span
            className="font-extrabold"
            style={{ color: C.ink, fontSize: 28 }}
          >
            {v}%
          </span>
        </div>
      </div>
      {label && (
        <div
          className="mt-1 text-center"
          style={{ fontSize: 12.5, color: C.sub, fontWeight: 600 }}
        >
          {label}
        </div>
      )}
    </div>
  );
}

export function StatusBadge({ ok }) {
  // Короткие подписи и запрет переноса — на телефоне длинная плашка ломала
  // строки «Карты возможностей» на 2–3 строки.
  return (
    <span style={{ whiteSpace: "nowrap" }}>
      {ok ? (
        <Badge color={C.ok} bg="#E9F9EF">
          Работает
        </Badge>
      ) : (
        <Badge color={C.brandA} bg="#EFF4FF">
          В планах
        </Badge>
      )}
    </span>
  );
}

export function NiceSelect({
  label,
  value,
  options,
  onChange,
  disabled,
  width,
  placeholder,
  align = "left",
}) {
  const [open, setOpen] = useState(false);
  const cur = options.find((o) => String(o.value) === String(value));
  return (
    <div style={{ position: "relative", width: width || "auto" }}>
      {label && (
        <label
          style={{
            fontSize: 11.5,
            color: C.sub,
            fontWeight: 600,
            display: "block",
            marginBottom: 4,
          }}
        >
          {label}
        </label>
      )}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="w-full inline-flex items-center justify-between gap-2 rounded-xl px-3"
        style={{
          height: 40,
          border: `1px solid ${C.border}`,
          background: disabled ? "#F1F5F9" : "#fff",
          color: disabled ? C.sub : C.ink,
          fontSize: 13.5,
          fontWeight: 600,
          minWidth: 120,
          cursor: disabled ? "default" : "pointer",
        }}
      >
        <span className="truncate">{cur ? cur.label : placeholder || "—"}</span>
        <ChevronDown
          size={16}
          color={C.faint}
          style={{
            flexShrink: 0,
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform .15s",
          }}
        />
      </button>
      {open && !disabled && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 59,
              // Затемняем фон, пока список открыт — чтобы он читался как меню
              // поверх страницы, а не «наезжал» на контент.
              background: "rgba(24,14,9,0.28)",
            }}
          />
          <div
            className="rounded-2xl bg-white py-1.5"
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              // Выравнивание списка: по правому краю триггера (для селектов у
              // правого края экрана — не вылезает за границу) или по левому.
              ...(align === "right" ? { right: 0 } : { left: 0 }),
              minWidth: "100%",
              width: "max-content",
              maxWidth: "min(280px, calc(100vw - 32px))",
              zIndex: 60,
              background: "#fff",
              border: `1px solid ${C.border}`,
              boxShadow: "0 14px 36px rgba(15,23,42,.16)",
              maxHeight: 320,
              overflowY: "auto",
            }}
          >
            {options.map((o) => {
              const act = String(o.value) === String(value);
              return (
                <button
                  key={String(o.value)}
                  type="button"
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  className="w-full text-left px-3.5 py-2 flex items-center justify-between gap-2.5"
                  style={{
                    fontSize: 13.5,
                    fontWeight: act ? 700 : 500,
                    color: act ? C.brandA : C.ink,
                    background: act ? "#EFF4FF" : "transparent",
                  }}
                  onMouseEnter={(e) => {
                    if (!act) e.currentTarget.style.background = C.line;
                  }}
                  onMouseLeave={(e) => {
                    if (!act) e.currentTarget.style.background = "transparent";
                  }}
                >
                  <span className="truncate">{o.label}</span>
                  {act && (
                    <CheckCircle2
                      size={15}
                      color={C.brandA}
                      style={{ flexShrink: 0 }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// Стандартный календарь системы (нативный date-пикер рисует ОС — заменяем своим)
const CAL_MONTHS = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
];
const CAL_DOW = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const CAL_W = 268; // ширина календаря (px)
const CAL_H = 330; // примерная высота календаря (px) — для вертикального прижатия
export function NiceDate({
  label,
  value,
  onChange,
  min,
  max,
  disabled,
  width,
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  // Позиция календаря (fixed) — считаем от кнопки и прижимаем в границы экрана,
  // чтобы календарь не вылезал за правый край страницы.
  const [pos, setPos] = useState(null);
  const toggleOpen = () => {
    if (!open) {
      const r = wrapRef.current && wrapRef.current.getBoundingClientRect();
      if (r) {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const left = Math.max(8, Math.min(r.left, vw - CAL_W - 8));
        // Если снизу не помещается — раскрываем календарь над полем.
        const below = r.bottom + 6;
        const top =
          below + CAL_H > vh && r.top - CAL_H - 6 > 8
            ? r.top - CAL_H - 6
            : below;
        setPos({ top: Math.round(top), left: Math.round(left) });
      }
    }
    setOpen((o) => !o);
  };
  const [vy, setVy] = useState(+(value || ymdNow()).slice(0, 4));
  const [vm, setVm] = useState(+(value || ymdNow()).slice(5, 7) - 1);
  useEffect(() => {
    if (open && value) {
      setVy(+value.slice(0, 4));
      setVm(+value.slice(5, 7) - 1);
    }
  }, [open, value]);
  const p2 = (n) => String(n).padStart(2, "0");
  const daysIn = new Date(vy, vm + 1, 0).getDate();
  const firstDow = (new Date(vy, vm, 1).getDay() + 6) % 7;
  const cells = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysIn }, (_, i) => i + 1),
  ];
  const today = ymdNow();
  const inRange = (ds) => (!min || ds >= min) && (!max || ds <= max);
  const nav = (d) => {
    let m = vm + d,
      y = vy;
    if (m < 0) {
      m = 11;
      y--;
    }
    if (m > 11) {
      m = 0;
      y++;
    }
    setVm(m);
    setVy(y);
  };
  return (
    <div ref={wrapRef} style={{ position: "relative", width: width || "auto" }}>
      {label && (
        <label
          style={{
            fontSize: 11.5,
            color: C.sub,
            fontWeight: 600,
            display: "block",
            marginBottom: 4,
          }}
        >
          {label}
        </label>
      )}
      <button
        type="button"
        disabled={disabled}
        onClick={toggleOpen}
        className="w-full inline-flex items-center justify-between gap-2 rounded-xl px-3"
        style={{
          height: 40,
          border: `1px solid ${C.border}`,
          background: disabled ? "#F1F5F9" : "#fff",
          color: disabled ? C.sub : C.ink,
          fontSize: 13.5,
          fontWeight: 600,
          minWidth: 128,
          cursor: disabled ? "default" : "pointer",
        }}
      >
        <span>{value ? value.split("-").reverse().join(".") : "—"}</span>
        <CalendarDays size={15} color={C.faint} style={{ flexShrink: 0 }} />
      </button>
      {open && !disabled && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 59,
              background: "rgba(24,14,9,0.28)",
            }}
          />
          <div
            className="rounded-2xl bg-white p-3"
            style={{
              // fixed + координаты от кнопки, прижатые к границам экрана —
              // календарь всегда помещается и не вылезает за край страницы.
              position: "fixed",
              top: pos ? pos.top : 0,
              left: pos ? pos.left : 0,
              zIndex: 60,
              width: CAL_W,
              maxWidth: "calc(100vw - 16px)",
              background: "#fff",
              border: `1px solid ${C.border}`,
              boxShadow: "0 14px 36px rgba(15,23,42,.16)",
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <button
                type="button"
                onClick={() => nav(-1)}
                className="rounded-lg p-1.5"
                style={{ background: C.line }}
              >
                <ChevronRight
                  size={15}
                  color={C.sub}
                  style={{ transform: "rotate(180deg)" }}
                />
              </button>
              <div
                className="font-bold"
                style={{ color: C.ink, fontSize: 13.5 }}
              >
                {tr(CAL_MONTHS[vm])} {vy}
              </div>
              <button
                type="button"
                onClick={() => nav(1)}
                className="rounded-lg p-1.5"
                style={{ background: C.line }}
              >
                <ChevronRight size={15} color={C.sub} />
              </button>
            </div>
            <div
              className="grid"
              style={{ gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}
            >
              {CAL_DOW.map((d) => (
                <div
                  key={d}
                  className="text-center"
                  style={{
                    fontSize: 10.5,
                    color: C.faint,
                    fontWeight: 700,
                    padding: "2px 0",
                  }}
                >
                  {tr(d)}
                </div>
              ))}
              {cells.map((d, i) => {
                if (d === null) return <div key={"e" + i} />;
                const ds = `${vy}-${p2(vm + 1)}-${p2(d)}`;
                const sel = ds === value,
                  isToday = ds === today,
                  ok = inRange(ds);
                return (
                  <button
                    key={ds}
                    type="button"
                    disabled={!ok}
                    onClick={() => {
                      onChange(ds);
                      setOpen(false);
                    }}
                    className="flex items-center justify-center rounded-full mx-auto"
                    style={{
                      width: 30,
                      height: 30,
                      fontSize: 12.5,
                      fontWeight: sel ? 800 : 600,
                      background: sel ? C.brandA : "transparent",
                      color: sel ? "#fff" : !ok ? "#CBD5E1" : C.ink,
                      border:
                        isToday && !sel
                          ? `1.5px solid ${C.brandA}`
                          : "1.5px solid transparent",
                      cursor: ok ? "pointer" : "default",
                    }}
                    onMouseEnter={(e) => {
                      if (!sel && ok) e.currentTarget.style.background = C.line;
                    }}
                    onMouseLeave={(e) => {
                      if (!sel)
                        e.currentTarget.style.background = "transparent";
                    }}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function CashNumField({ label, value, disabled, onChange }) {
  return (
    <div>
      <label style={{ fontSize: 12, color: C.sub, fontWeight: 600 }}>
        {label}
      </label>
      <input
        type="text"
        inputMode="numeric"
        disabled={disabled}
        value={value ? String(value) : ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        className="w-full rounded-xl px-3 py-2 mt-1"
        style={{
          border: `1px solid ${C.border}`,
          fontSize: 14,
          textAlign: "right",
          background: disabled ? "#F1F5F9" : "#fff",
          color: disabled ? C.sub : C.ink,
        }}
      />
    </div>
  );
}

// Кнопка «Наверх»: появляется только когда страница прокручена вниз (по
// необходимости), плавно возвращает к началу. На мобильных поднята над нижней
// навигацией. Скролл идёт по окну (боковое меню зафиксировано).
export function ScrollTopButton() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 400);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  if (!show) return null;
  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Наверх"
      title="Наверх"
      className="lift fixed right-4 md:right-6 bottom-24 md:bottom-6 z-40 flex items-center justify-center rounded-full"
      style={{
        width: 48,
        height: 48,
        background: C.brandGrad,
        color: "#fff",
        border: "1px solid rgba(255,255,255,.35)",
        boxShadow: "0 10px 28px rgba(123,45,31,.34)",
        cursor: "pointer",
      }}
    >
      <ArrowUp size={22} />
    </button>
  );
}

export function AdInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}) {
  return (
    <label className="block">
      {label && (
        <div
          style={{
            fontSize: 12,
            color: C.faint,
            fontWeight: 600,
            marginBottom: 4,
          }}
        >
          {label}
        </div>
      )}
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl px-3 py-2 focus:outline-none"
        style={{
          border: `1px solid ${C.border}`,
          fontSize: 14,
          color: C.ink,
          background: "#fff",
        }}
      />
    </label>
  );
}
export function AdToggle({ label, hint, checked, onChange }) {
  return (
    <div
      className="flex items-center justify-between rounded-xl px-4 py-3"
      style={{ background: "#FBFCFE", border: `1px solid ${C.border}` }}
    >
      <div>
        <div style={{ fontSize: 14, color: C.ink, fontWeight: 600 }}>
          {label}
        </div>
        {hint && <div style={{ fontSize: 12.5, color: C.sub }}>{hint}</div>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className="rounded-full"
        style={{
          width: 46,
          height: 26,
          background: checked ? C.ok : "#CBD5E1",
          position: "relative",
          transition: "background .2s",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 3,
            left: checked ? 23 : 3,
            width: 20,
            height: 20,
            borderRadius: 99,
            background: "#fff",
            transition: "left .2s",
            boxShadow: "0 1px 3px rgba(0,0,0,.2)",
          }}
        />
      </button>
    </div>
  );
}
export function AdCard({ title, children, desc }) {
  return (
    <div
      className="rounded-2xl bg-white p-5"
      style={{ border: `1px solid ${C.border}` }}
    >
      {title && (
        <h3 className="font-bold mb-1" style={{ color: C.ink, fontSize: 16 }}>
          {title}
        </h3>
      )}
      {desc && (
        <p style={{ fontSize: 13, color: C.sub, marginBottom: 12 }}>{desc}</p>
      )}
      {children}
    </div>
  );
}
