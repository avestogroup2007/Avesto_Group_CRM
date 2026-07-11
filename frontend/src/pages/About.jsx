// Экран «О системе».
import { CheckCircle2, Server, Lock } from "lucide-react";
import Logo from "../Logo.jsx";
import { C } from "../lib/theme.js";
import { StatusBadge } from "../components/ui.jsx";

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
    ["Telegram-бот (двусторонний обмен)", false],
    ["Распознавание речи (Whisper) и гео-метки фото", false],
    ["Zero Trust: RLS, шифрование AES-256, водяные знаки", false],
    ["DevOps: Sentry, CI/CD, ежечасные бэкапы, репликация", false],
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
          Это рабочий интерактивный прототип (MVP) на основе вашего ТЗ. Логика,
          интерфейс и ИИ-сценарии работают прямо здесь; данные сохраняются между
          сессиями. Серверные модули ниже спроектированы в ТЗ и подключаются на
          этапе бэкенда.
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
              className="flex items-center justify-between rounded-xl px-3 py-2.5"
              style={{ background: "#FBFCFE", border: `1px solid ${C.border}` }}
            >
              <span
                className="flex items-center gap-2"
                style={{ fontSize: 14, color: C.ink }}
              >
                {ok ? (
                  <CheckCircle2 size={16} color={C.ok} />
                ) : (
                  <Server size={16} color={C.brandA} />
                )}{" "}
                {label}
              </span>
              <StatusBadge ok={ok} />
            </div>
          ))}
        </div>
      </div>
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
          Спринт 1 — БД (PostgreSQL) + смены. Спринт 2 — движок 5 фаз +
          Telegram-бот. Спринт 3 — ИИ (голос, ревизор аномалий, бюджеты). Спринт
          4 — кабина директора, личная аналитика, безопасность (RLS, шифрование,
          водяные знаки) и DevOps. Архитектура модульная: дизайн, функции и роли
          расширяются без переписывания ядра.
        </p>
      </div>
    </div>
  );
}

export default AboutView;
