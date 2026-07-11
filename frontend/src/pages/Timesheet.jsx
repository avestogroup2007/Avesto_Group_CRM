// Экран «Учёт времени»: табель смен по сотрудникам и филиалам.
import { Clock } from "lucide-react";
import { C } from "../lib/theme.js";
import { tr } from "../lib/i18n.js";
import { D, TZ, fmtWork, fmtWorkH, fmtDateTime } from "../lib/format.js";
import { userById, branchById } from "../lib/org.js";
import { Avatar } from "../components/ui.jsx";

/* --------------------------- учёт рабочего времени ------------------------- */
function TimesheetView({ s, me, now, branchScope }) {
  const ds = new Date(now);
  ds.setHours(0, 0, 0, 0);
  const dayStart = ds.getTime();
  const weekStart = dayStart - ((ds.getDay() + 6) % 7) * D;
  const ts = s.timesheet || [];
  const shifts = s.shifts || {};
  const ov = (a, b, s0, e0) => Math.max(0, Math.min(b, e0) - Math.max(a, s0));
  const calc = (id) => {
    let today = 0,
      week = 0;
    ts.forEach((x) => {
      if (x.userId === id) {
        today += ov(x.start, x.end, dayStart, now);
        week += ov(x.start, x.end, weekStart, now);
      }
    });
    const sh = shifts[id];
    let live = 0;
    if (sh && sh.open && sh.openedAt) {
      live = now - sh.openedAt;
      today += ov(sh.openedAt, now, dayStart, now);
      week += ov(sh.openedAt, now, weekStart, now);
    }
    return { today, week, open: !!(sh && sh.open), live };
  };
  const all = (s.users || []).filter((u) => u.active !== false);
  let people =
    me.role === "manager"
      ? all.filter(
          (u) => u.branchId && me.branchId && u.branchId === me.branchId,
        )
      : branchScope
        ? all.filter((u) => u.branchId === branchScope)
        : all;
  people = [...people].sort((a, b) => {
    const A = calc(a.id),
      B = calc(b.id);
    return B.open - A.open || B.week - A.week;
  });
  const onNow = all.filter((u) => calc(u.id).open).length;
  const sumToday = people.reduce((a, u) => a + calc(u.id).today, 0);
  const sumWeek = people.reduce((a, u) => a + calc(u.id).week, 0);
  const mine = calc(me.id);
  const recent = [...ts].sort((a, b) => b.end - a.end).slice(0, 12);

  const Stat = ({ label, value, strong }) => (
    <div style={{ textAlign: "right", minWidth: 78 }}>
      <div style={{ fontSize: 10.5, color: C.faint, fontWeight: 600 }}>
        {label}
      </div>
      <div
        style={{
          fontSize: 14,
          color: strong ? C.ink : C.sub,
          fontWeight: 700,
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </div>
    </div>
  );

  return (
    <div className="space-y-5 max-w-4xl">
      {/* моё время */}
      <div
        className="rounded-2xl p-5 text-white"
        style={{ background: `linear-gradient(135deg, ${C.brandA}, #5A2113)` }}
      >
        <div className="flex items-center gap-2 mb-3">
          <Clock size={18} />
          <span className="font-bold" style={{ fontSize: 15 }}>
            {tr("Моё рабочее время")}
          </span>
        </div>
        <div className="flex items-end gap-6 flex-wrap">
          <div>
            <div style={{ fontSize: 12, opacity: 0.85 }}>{tr("Сегодня")}</div>
            <div
              className="font-extrabold"
              style={{ fontSize: 26, lineHeight: 1.1 }}
            >
              {fmtWork(mine.today)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, opacity: 0.85 }}>{tr("За неделю")}</div>
            <div
              className="font-extrabold"
              style={{ fontSize: 26, lineHeight: 1.1 }}
            >
              {fmtWork(mine.week)}
            </div>
          </div>
          <div
            className="ml-auto rounded-full px-3 py-1.5"
            style={{
              background: "rgba(255,255,255,.2)",
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            {mine.open
              ? `● ${tr("На смене")} · ${fmtWork(mine.live)}`
              : tr("Не на смене")}
          </div>
        </div>
      </div>

      {/* сводка */}
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: "repeat(3, minmax(0,1fr))" }}
      >
        {[
          [tr("На смене сейчас"), `${onNow}`, C.ok],
          [tr("Часов за сегодня"), fmtWorkH(sumToday), C.brandA],
          [tr("Часов за неделю"), fmtWorkH(sumWeek), C.violet],
        ].map(([l, v, col], i) => (
          <div
            key={i}
            className="rounded-2xl bg-white p-4"
            style={{ border: `1px solid ${C.border}` }}
          >
            <div style={{ fontSize: 12, color: C.faint, fontWeight: 600 }}>
              {l}
            </div>
            <div
              className="font-extrabold mt-0.5"
              style={{
                fontSize: 19,
                color: col,
                lineHeight: 1.1,
                overflowWrap: "break-word",
              }}
            >
              {v}
            </div>
          </div>
        ))}
      </div>

      {/* сотрудники */}
      <div
        className="rounded-2xl bg-white p-4 sm:p-5"
        style={{ border: `1px solid ${C.border}` }}
      >
        <h3 className="font-bold mb-3" style={{ color: C.ink, fontSize: 16 }}>
          {tr("Сотрудники")}
        </h3>
        <div className="space-y-2">
          {people.map((u) => {
            const r = calc(u.id);
            return (
              <div
                key={u.id}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 flex-wrap"
                style={{
                  background: "#FBFCFE",
                  border: `1px solid ${C.border}`,
                }}
              >
                <div className="shrink-0">
                  <Avatar id={u.id} size={36} />
                </div>
                <div className="min-w-0" style={{ flex: "1 1 150px" }}>
                  <div
                    className="truncate"
                    style={{ fontSize: 14, color: C.ink, fontWeight: 700 }}
                  >
                    {u.name}
                  </div>
                  <div
                    className="truncate"
                    style={{ fontSize: 12, color: C.faint }}
                  >
                    {u.pos}
                    {branchById(u.branchId)
                      ? ` · ${branchById(u.branchId).name}`
                      : ""}
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <span
                    className="rounded-full font-semibold"
                    style={{
                      fontSize: 11.5,
                      padding: "3px 10px",
                      whiteSpace: "nowrap",
                      background: r.open ? "#E9F9EF" : C.line,
                      color: r.open ? C.ok : C.faint,
                    }}
                  >
                    {r.open
                      ? `● ${tr("На смене")} · ${fmtWork(r.live)}`
                      : tr("Не на смене")}
                  </span>
                  <Stat label={tr("Сегодня")} value={fmtWork(r.today)} strong />
                  <Stat label={tr("За неделю")} value={fmtWork(r.week)} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* последние смены */}
      <div
        className="rounded-2xl bg-white p-4 sm:p-5"
        style={{ border: `1px solid ${C.border}` }}
      >
        <h3 className="font-bold mb-3" style={{ color: C.ink, fontSize: 16 }}>
          {tr("Последние смены")}
        </h3>
        <div className="space-y-1.5">
          {recent.length === 0 && (
            <div style={{ fontSize: 13, color: C.faint }}>
              {tr("Пока нет закрытых смен")}
            </div>
          )}
          {recent.map((x) => {
            const u = userById(x.userId);
            return (
              <div
                key={x.id}
                className="flex items-center gap-2 flex-wrap py-1.5"
                style={{ borderBottom: `1px solid ${C.line}` }}
              >
                <div className="shrink-0">
                  <Avatar id={x.userId} size={24} />
                </div>
                <span
                  className="min-w-0 truncate"
                  style={{
                    fontSize: 13,
                    color: C.ink,
                    fontWeight: 600,
                    flex: "1 1 120px",
                  }}
                >
                  {u?.name}
                </span>
                <span
                  style={{ fontSize: 12, color: C.sub, whiteSpace: "nowrap" }}
                >
                  {fmtDateTime(x.start)} →{" "}
                  {new Date(x.end).toLocaleTimeString("ru-RU", {
                    timeZone: TZ,
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <span
                  className="rounded-full font-semibold shrink-0"
                  style={{
                    fontSize: 12,
                    padding: "2px 9px",
                    background: C.line,
                    color: C.ink,
                    whiteSpace: "nowrap",
                  }}
                >
                  {fmtWork(x.durationMs)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default TimesheetView;
