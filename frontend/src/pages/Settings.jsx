// Экран настроек (сейчас не подключён к навигации — язык переключается в шапке).
import { RotateCcw } from "lucide-react";
import { C } from "../lib/theme.js";

/* ------------------------------ настройки ---------------------------------- */
function SettingsView({ dispatch, notify }) {
  return (
    <div className="max-w-xl space-y-4">
      <div
        className="rounded-2xl bg-white p-5"
        style={{ border: `1px solid ${C.border}` }}
      >
        <h3 className="font-bold mb-1" style={{ color: C.ink, fontSize: 17 }}>
          Системные настройки
        </h3>
        <p style={{ fontSize: 13.5, color: C.sub }}>
          Раздел доступен только роли «Системный администратор»: конструктор
          шаблонов заявок, интеграции (Telegram-бот, ИИ), управление доступом и
          аудит.
        </p>
      </div>
      <div
        className="rounded-2xl bg-white p-5"
        style={{ border: `1px solid ${C.border}` }}
      >
        <h3 className="font-bold mb-1" style={{ color: C.ink, fontSize: 16 }}>
          Демо-данные
        </h3>
        <p style={{ fontSize: 13.5, color: C.sub, marginBottom: 12 }}>
          Сбросить все задачи, журнал и смены к исходному демонстрационному
          состоянию.
        </p>
        <button
          onClick={() => {
            dispatch({ type: "RESET" });
            notify("Демо-данные сброшены");
          }}
          className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 font-bold text-white"
          style={{ background: C.bad, fontSize: 14 }}
        >
          <RotateCcw size={16} /> Сбросить демо-данные
        </button>
      </div>
    </div>
  );
}

export default SettingsView;
