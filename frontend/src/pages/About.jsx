// Экран «О системе».
import { useState, useEffect } from "react";
import { CheckCircle2, Server, Lock, Send } from "lucide-react";
import { apiGet, apiPost } from "../api.js";
import Logo from "../Logo.jsx";
import { C } from "../lib/theme.js";
import { StatusBadge } from "../components/ui.jsx";

// Предложение улучшения: уходит владельцу системы (в Back Office, на доску
// развития), если в окружении установки настроен канал обратной связи.
function SuggestCard() {
  const [available, setAvailable] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    apiGet("/api/feedback/status")
      .then((d) => setAvailable(!!d.configured))
      .catch(() => {});
  }, []);
  if (!available) return null;
  const send = async () => {
    if (title.trim().length < 3) {
      setMsg("Опишите предложение (минимум 3 символа)");
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      await apiPost("/api/feedback", {
        title: title.trim(),
        description: description.trim(),
      });
      setTitle("");
      setDescription("");
      setMsg("Спасибо! Предложение отправлено разработчикам ✅");
    } catch (e) {
      setMsg(e.message || "Не удалось отправить, попробуйте позже");
    } finally {
      setBusy(false);
    }
  };
  const inp = {
    border: `1px solid ${C.border}`,
    borderRadius: 10,
    padding: "9px 12px",
    fontSize: 14,
    width: "100%",
    color: C.ink,
    background: "#fff",
  };
  return (
    <div
      className="rounded-2xl bg-white p-5"
      style={{ border: `1px solid ${C.border}` }}
    >
      <div className="flex items-center gap-2 mb-1">
        <Send size={17} color={C.brandA} />
        <h3 className="font-bold" style={{ color: C.ink, fontSize: 16 }}>
          Предложить улучшение
        </h3>
      </div>
      <p style={{ fontSize: 13, color: C.sub, marginBottom: 10 }}>
        Чего не хватает или что неудобно? Предложение уйдёт напрямую команде
        разработки системы.
      </p>
      <div className="space-y-2">
        <input
          style={inp}
          value={title}
          placeholder="Коротко: что улучшить"
          onChange={(e) => setTitle(e.target.value)}
        />
        <textarea
          style={{ ...inp, resize: "none" }}
          rows={3}
          value={description}
          placeholder="Подробности (необязательно)"
          onChange={(e) => setDescription(e.target.value)}
        />
        <button
          onClick={send}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 font-bold text-white"
          style={{
            background: C.brandA,
            fontSize: 14,
            opacity: busy ? 0.6 : 1,
          }}
        >
          <Send size={15} /> {busy ? "Отправляем…" : "Отправить"}
        </button>
        {msg && <p style={{ fontSize: 13, color: C.sub }}>{msg}</p>}
      </div>
    </div>
  );
}

/* ------------------------------ о системе ---------------------------------- */
export function AboutView() {
  const rows = [
    ["5 фаз заявок и неизменяемый журнал", true],
    ["Роли, RBAC, разграничение видимости", true],
    ["Учёт смен (открыть/закрыть)", true],
    ["SLA-таймеры и приоритеты", true],
    ["SOP-чек-листы и фото-гейт", true],
    ["ИИ-маршрутизация по тексту + голосовой ввод", true],
    ["ИИ-ревизор: аномалии и инциденты", true],
    ["Контроль бюджетов филиалов", true],
    ["Дашборд директора и личная аналитика", true],
    ["Бэкенд: PostgreSQL, вход по логину/паролю, аудит", true],
    ["Интеграция iiko: продажи, ОПиУ, кадры, акты", true],
    ["Telegram-бот: чек-листы, сводки, филиалы, Mini App", true],
    ["Касса: отчёты филиалов на сервере", true],
    ["Конструктор тортов + ИИ-помощник (Claude)", true],
    ["Безопасность: CSP, rate-limit, алерты о входах", true],
    ["CI/CD: линт, тесты и сборка на каждый PR", true],
    ["Мониторинг ошибок (Sentry) и живой health-check", true],
    ["Ежедневные бэкапы БД (GitHub Actions)", true],
    ["Автодокументы конструктора (акты, перемещения)", false],
    ["Распознавание речи (Whisper) и гео-метки фото", false],
    ["ИИ-агенты в актах и аналитике", false],
  ];
  return (
    <div className="space-y-5 max-w-3xl">
      <div
        className="rounded-2xl p-6 text-white"
        style={{ background: `linear-gradient(135deg, ${C.brandA}, #5A2113)` }}
      >
        <div className="flex items-center gap-3 mb-2">
          <Logo size={40} radius={11} />
          <h2 className="font-extrabold" style={{ fontSize: 22 }}>
            Avesto Group CRM System
          </h2>
        </div>
        <p style={{ fontSize: 14.5, lineHeight: 1.55, opacity: 0.95 }}>
          Рабочая система управления группой Avesto: заявки и маршруты
          согласования, кассы и деньги, аналитика продаж из iiko, чек-листы смен
          и Telegram-бот. Данные хранятся на сервере (PostgreSQL), вход — по
          учётным записям сотрудников из iiko.
        </p>
      </div>
      <div
        className="rounded-2xl bg-white p-5"
        style={{ border: `1px solid ${C.border}` }}
      >
        <h3 className="font-bold mb-3" style={{ color: C.ink, fontSize: 17 }}>
          Карта возможностей
        </h3>
        <div className="space-y-2">
          {rows.map(([label, ok], i) => (
            <div
              key={i}
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 rounded-xl px-3 py-2.5"
              style={{ background: "#FBFCFE", border: `1px solid ${C.border}` }}
            >
              <span
                className="flex items-center gap-2 min-w-0"
                style={{ fontSize: 14, color: C.ink, flex: "1 1 180px" }}
              >
                {ok ? (
                  <CheckCircle2 size={16} color={C.ok} className="shrink-0" />
                ) : (
                  <Server size={16} color={C.brandA} className="shrink-0" />
                )}{" "}
                {label}
              </span>
              <StatusBadge ok={ok} />
            </div>
          ))}
        </div>
      </div>
      <SuggestCard />
      <div
        className="rounded-2xl bg-white p-5"
        style={{ border: `1px solid ${C.border}` }}
      >
        <div className="flex items-center gap-2 mb-2">
          <Lock size={17} color={C.ink} />
          <h3 className="font-bold" style={{ color: C.ink, fontSize: 16 }}>
            Как развивать дальше
          </h3>
        </div>
        <p style={{ fontSize: 14, color: C.sub, lineHeight: 1.55 }}>
          Ближайшие шаги дорожной карты: автоматическое формирование актов
          приготовления и внутренних перемещений из конструктора тортов (по
          правилам складов и групп iiko), расширение ИИ-помощника на акты и
          аналитику, мониторинг ошибок и ежедневные бэкапы базы. Архитектура
          модульная: функции и роли расширяются без переписывания ядра.
        </p>
      </div>
    </div>
  );
}

export default AboutView;
