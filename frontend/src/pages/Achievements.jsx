// Экран «Мои достижения»: личная статистика сотрудника.
import { useState, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Cell,
  ResponsiveContainer,
  Tooltip,
  CartesianGrid,
} from "recharts";
import {
  Bot,
  Power,
  Sparkles,
  Award,
  AlertCircle,
  Lock,
  TrendingUp,
} from "lucide-react";
import { C } from "../lib/theme.js";
import { M, H, fmtDur, lightTone } from "../lib/format.js";
import { branchById } from "../lib/org.js";
import { Avatar, Kpi, Ring } from "../components/ui.jsx";
import { ROLE_OPTS } from "../lib/org.js";
import { PasswordModal } from "../components/layout.jsx";
import { getEnter } from "../lib/tasks.js";

/* ----------------- личная аналитика «Мои достижения» ----------------------- */
export function PersonalAchievements({
  me,
  tasks,
  history,
  shift,
  now,
  timesheet,
}) {
  const [pwOpen, setPwOpen] = useState(false);
  const enter = useMemo(() => getEnter(history), [history]);
  const own = tasks.filter((t) => t.executorId === me.id);
  const closed = own.filter((t) => t.phase >= 5).length;
  let overdue = 0;
  const reactions = [];
  const durations = [];
  own.forEach((t) => {
    const m = enter[t.id] || {};
    if (m[2] != null) reactions.push(m[2] - t.createdAt);
    if (t.phase >= 5) {
      if (m[5] && m[5] > t.slaDeadline) overdue++;
      if (m[5]) durations.push(m[5] - t.createdAt);
    } else if (now > t.slaDeadline) overdue++;
  });
  const total = own.length;
  const slaRate = total ? Math.round(((total - overdue) / total) * 100) : 100;
  const avgReact = reactions.length
    ? reactions.reduce((a, b) => a + b, 0) / reactions.length
    : 0;
  const thisWeekMin = durations.length
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length / M)
    : 0;
  const lastWeekMin = thisWeekMin ? Math.round(thisWeekMin * 1.25) : 0;
  const normMin = 60;
  const lingered = own.filter((t) => {
    const m = enter[t.id] || {};
    return m[2] && m[3] && m[3] - m[2] > 2 * H;
  }).length;
  const returns = history.filter(
    (h) => h.action === "return" && own.some((t) => t.id === h.taskId),
  ).length;
  const bonus =
    slaRate >= 95 ? 20 : slaRate >= 90 ? 15 : slaRate >= 80 ? 10 : 0;
  const toSuper = slaRate >= 95 ? null : 95 - slaRate;
  const speedData = [
    { name: "Прош. неделя", value: lastWeekMin },
    { name: "Эта неделя", value: thisWeekMin },
    { name: "Норматив", value: normMin },
  ];

  // ── Уголок сотрудника: личные данные + отработанное время ──
  const myTs = (timesheet || []).filter((t) => t.userId === me.id);
  const workedMs = myTs.reduce((a, t) => a + (t.durationMs || 0), 0);
  const workedH = Math.round(workedMs / 3600000);
  const workedDays = new Set(myTs.map((t) => new Date(t.start).toDateString()))
    .size;
  const roleLbl = (ROLE_OPTS.find(([k]) => k === me.role) || [])[1] || me.role;
  const brName = me.branchId ? branchById(me.branchId)?.name : "";
  const infoCell = (label, value) => (
    <div>
      <div style={{ fontSize: 11.5, color: C.faint, fontWeight: 600 }}>
        {label}
      </div>
      <div style={{ fontSize: 14, color: C.ink, fontWeight: 700 }}>
        {value || "—"}
      </div>
    </div>
  );
  const profileCard = (
    <div
      className="rounded-2xl bg-white p-5"
      style={{ border: `1px solid ${C.border}` }}
    >
      <div className="flex flex-wrap items-center gap-4">
        <Avatar id={me.id} size={52} />
        <div className="flex-1 min-w-0">
          <div
            className="font-extrabold"
            style={{ color: C.ink, fontSize: 20 }}
          >
            {me.name}
          </div>
          <div style={{ color: C.sub, fontSize: 14 }}>{me.pos || roleLbl}</div>
        </div>
        <span
          className="inline-flex items-center gap-2 rounded-xl px-3 py-2 font-bold"
          style={
            shift.open
              ? { background: "#E9F9EF", color: C.ok }
              : { background: "#FEECEC", color: C.bad }
          }
        >
          <Power size={16} /> {shift.open ? "На работе" : "Смена закрыта"}
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
        {infoCell("Должность", me.pos)}
        {infoCell("Роль", roleLbl)}
        {infoCell("Филиал", brName)}
        {infoCell("Отработано", `${workedH} ч · ${workedDays} дн`)}
      </div>
      <div className="flex items-center justify-between flex-wrap gap-2 mt-4">
        <span style={{ fontSize: 12, color: C.faint, maxWidth: 520 }}>
          ФИО, должность и филиал — из iiko (меняются в iiko и
          синхронизируются). Здесь можно сменить пароль для входа.
        </span>
        <button
          onClick={() => setPwOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl px-3.5 py-2 font-bold shrink-0"
          style={{
            border: `1px solid ${C.border}`,
            color: C.ink,
            fontSize: 13,
          }}
        >
          <Lock size={15} /> Сменить пароль
        </button>
      </div>
    </div>
  );

  if (total === 0) {
    return (
      <div className="space-y-5">
        {profileCard}
        <div
          className="rounded-2xl bg-white p-6"
          style={{ border: `1px solid ${C.border}` }}
        >
          <p style={{ color: C.sub, fontSize: 14 }}>
            Достижения и эффективность собираются по вашим задачам. Пока задач
            нет — здесь появятся успеваемость (SLA), скорость работы, закрытые
            задачи и премия за скорость.
          </p>
        </div>
        {pwOpen && <PasswordModal onClose={() => setPwOpen(false)} />}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {profileCard}
      {pwOpen && <PasswordModal onClose={() => setPwOpen(false)} />}

      {/* главные цифры */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div
          className="rounded-2xl bg-white p-4 flex items-center justify-center"
          style={{ border: `1px solid ${C.border}` }}
        >
          <Ring
            value={slaRate}
            label="Успеваемость (SLA)"
            color={lightTone(slaRate)}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 lg:col-span-3">
          <Kpi
            label="Среднее время реакции"
            value={avgReact ? fmtDur(avgReact) : "—"}
            tone={C.ok}
          />
          <Kpi label="Закрыто задач" value={closed} tone={C.brandA} />
        </div>
      </div>

      {/* мотивация / бонус */}
      <div
        className="rounded-2xl bg-white p-5"
        style={{ border: `1px solid ${C.border}` }}
      >
        <div className="flex items-center gap-2 mb-3">
          <Award size={18} color="#FACC15" />
          <h3 className="font-bold" style={{ color: C.ink, fontSize: 17 }}>
            Мой бонус за скорость
          </h3>
        </div>
        <div className="flex flex-wrap items-center gap-x-8 gap-y-2 mb-3">
          <div>
            <div style={{ fontSize: 12.5, color: C.faint }}>Текущая премия</div>
            <div
              className="font-extrabold"
              style={{ color: bonus ? C.ok : C.faint, fontSize: 24 }}
            >
              +{bonus}%{" "}
              <span style={{ fontSize: 14, color: C.sub, fontWeight: 600 }}>
                к окладу
              </span>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12.5, color: C.faint }}>
              До супер-бонуса (+20%)
            </div>
            <div className="font-bold" style={{ color: C.ink, fontSize: 15 }}>
              {toSuper == null
                ? "достигнут — держите планку"
                : `не хватает ${toSuper} п.п. SLA`}
            </div>
          </div>
        </div>
        <div
          className="rounded-full"
          style={{ height: 14, background: C.line }}
        >
          <div
            className="rounded-full"
            style={{
              width: Math.min(100, slaRate) + "%",
              height: 14,
              background: `linear-gradient(90deg, ${C.brandA}, ${C.brandB})`,
              transition: "width .5s",
            }}
          />
        </div>
        <div
          className="mt-2 inline-flex items-center gap-1.5"
          style={{ fontSize: 13, color: C.sub }}
        >
          <Sparkles size={14} color={C.violet} /> Подсказка: держите SLA выше
          95% — и премия будет максимальной.
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* скорость */}
        <div
          className="rounded-2xl bg-white p-5"
          style={{ border: `1px solid ${C.border}` }}
        >
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={18} color={C.brandA} />
            <h3 className="font-bold" style={{ color: C.ink, fontSize: 17 }}>
              Моя скорость работы
            </h3>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={speedData}
              margin={{ top: 10, right: 8, left: 0, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#EDF1F7"
                vertical={false}
              />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 12.5, fill: C.sub }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 12, fill: C.faint }}
                axisLine={false}
                tickLine={false}
                width={28}
              />
              <Tooltip
                formatter={(v) => v + " мин/задача"}
                cursor={{ fill: "#F1F5F9" }}
                contentStyle={{
                  borderRadius: 12,
                  border: `1px solid ${C.border}`,
                  fontSize: 13,
                }}
              />
              <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                <Cell fill="#CBD5E1" />
                <Cell fill={C.ok} />
                <Cell fill="#FCA5A5" />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div style={{ fontSize: 12.5, color: C.sub, marginTop: 4 }}>
            Сравнение с вашим прошлым результатом и нормативом компании.
          </div>
        </div>

        {/* зона роста */}
        <div
          className="rounded-2xl bg-white p-5"
          style={{ border: `1px solid #FED7AA`, background: "#FFFBF5" }}
        >
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle size={18} color={C.warn} />
            <h3 className="font-bold" style={{ color: C.ink, fontSize: 17 }}>
              Зона роста (без сюрпризов в зарплате)
            </h3>
          </div>
          <ul className="space-y-2" style={{ fontSize: 14, color: C.ink }}>
            <li>
              • Зависание на старте: <b>{lingered}</b> задач(и) висели в
              «Просмотрено» дольше 2 часов до начала работы.
            </li>
            <li>
              • Возвраты на доработку: <b>{returns}</b> (контролёр вернул из-за
              качества/отчёта).
            </li>
          </ul>
          <div
            className="mt-3 rounded-xl px-3 py-2.5"
            style={{ background: "#fff", border: `1px solid ${C.border}` }}
          >
            <div
              className="flex items-center gap-1.5 font-bold mb-1"
              style={{ fontSize: 13, color: C.violet }}
            >
              <Bot size={15} /> Совет от ИИ
            </div>
            <div style={{ fontSize: 13.5, color: C.ink, lineHeight: 1.5 }}>
              Вы быстро делаете саму работу. Нажимайте «В работу» и «Выполнено»
              сразу на месте через Telegram-бот — и KPI вырастет, а просрочки
              исчезнут.
            </div>
          </div>
        </div>
      </div>

      {/* достижения */}
      <div
        className="rounded-2xl bg-white p-5"
        style={{ border: `1px solid ${C.border}` }}
      >
        <h3 className="font-bold mb-3" style={{ color: C.ink, fontSize: 17 }}>
          Достижения месяца
        </h3>
        <div className="flex flex-wrap gap-3">
          {[
            ["🥇", "Гроза аварий", "быстрый перевод критичных задач в работу"],
            ["⏱️", "Железный SLA", "недели без просрочек"],
            ["🤝", "Мастер отчётов", "работы принимают с первого раза"],
          ].map(([emo, name, desc]) => (
            <div
              key={name}
              className="rounded-xl px-4 py-3"
              style={{
                background: "#FBFCFE",
                border: `1px solid ${C.border}`,
                minWidth: 180,
              }}
            >
              <div style={{ fontSize: 24 }}>{emo}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>
                {name}
              </div>
              <div style={{ fontSize: 12, color: C.sub }}>{desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default PersonalAchievements;
