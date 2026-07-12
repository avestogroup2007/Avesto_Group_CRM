// Экран «Автоматизация»: правила-триггеры и журнал срабатываний.
import { useState, useEffect } from "react";
import { Send, Bot, Trash2 } from "lucide-react";
import { apiGet, apiPost } from "../api.js";
import { C } from "../lib/theme.js";
import { uid } from "../lib/format.js";
import {
  AUTOMATION_TRIGGERS,
  NOTIFY_TARGETS,
  autoActionLabel,
  triggerLabel,
} from "../lib/automation.js";

export function AutomationView({ rules, setRules, log, setLog, now }) {
  const [name, setName] = useState("");
  const [trigIdx, setTrigIdx] = useState(0);
  const [notifyOn, setNotifyOn] = useState(true);
  const [notifyTarget, setNotifyTarget] = useState("controller");
  const [prOn, setPrOn] = useState(false);
  const [prLevel, setPrLevel] = useState("Критический");
  const [followOn, setFollowOn] = useState(false);
  const [followDays, setFollowDays] = useState("7");
  const [followTitle, setFollowTitle] = useState("");
  const [tg, setTg] = useState(null); // null=неизвестно, {configured}
  const [tgMsg, setTgMsg] = useState("");
  const [tgBusy, setTgBusy] = useState(false);
  const [tgInfo, setTgInfo] = useState(null); // помощник подключения
  const [tgInfoBusy, setTgInfoBusy] = useState(false);

  useEffect(() => {
    apiGet("/api/telegram/status")
      .then((r) => setTg(r))
      .catch(() => setTg({ configured: false }));
  }, []);
  const sendTest = async () => {
    setTgBusy(true);
    setTgMsg("");
    try {
      await apiPost("/api/telegram/test", {});
      setTgMsg("Отправлено — проверьте Telegram.");
    } catch (e) {
      setTgMsg(e.message || "Не удалось отправить");
    } finally {
      setTgBusy(false);
    }
  };
  const loadTgInfo = async () => {
    setTgInfoBusy(true);
    setTgMsg("");
    try {
      const info = await apiGet("/api/telegram/info");
      setTgInfo(info);
    } catch (e) {
      setTgInfo({ error: e.message || "Не удалось проверить бота" });
    } finally {
      setTgInfoBusy(false);
    }
  };
  const testTopics = async () => {
    setTgBusy(true);
    setTgMsg("");
    try {
      const r = await apiPost("/api/telegram/test-topics", {});
      const sent = (r.results || []).filter((x) => x.ok).map((x) => x.label);
      const skipped = (r.results || [])
        .filter((x) => x.skipped)
        .map((x) => x.label);
      const failed = (r.results || [])
        .filter((x) => !x.ok && !x.skipped)
        .map((x) => x.label);
      let m = sent.length
        ? `Отправлено в темы: ${sent.join(", ")}.`
        : "Ни одна тема не настроена.";
      if (skipped.length) m += ` Не заданы (нет id): ${skipped.join(", ")}.`;
      if (failed.length) m += ` Ошибка: ${failed.join(", ")}.`;
      setTgMsg(m);
    } catch (e) {
      setTgMsg(e.message || "Не удалось отправить");
    } finally {
      setTgBusy(false);
    }
  };
  // Бот чек-листов: включение вебхука и статус.
  const [hookMsg, setHookMsg] = useState("");
  const [hookBusy, setHookBusy] = useState(false);
  const setupHook = async () => {
    setHookBusy(true);
    setHookMsg("");
    try {
      const r = await apiPost("/api/telegram/webhook/setup", {});
      setHookMsg(`Бот включён. Вебхук: ${r.url || "установлен"}`);
    } catch (e) {
      setHookMsg(e.message || "Не удалось включить бота");
    } finally {
      setHookBusy(false);
    }
  };
  const hookStatus = async () => {
    setHookBusy(true);
    setHookMsg("");
    try {
      const r = await apiGet("/api/telegram/webhook/info");
      setHookMsg(
        r.url
          ? `Вебхук активен: ${r.url}. В очереди: ${r.pending}.` +
              (r.lastError ? ` Последняя ошибка: ${r.lastError}` : "")
          : "Вебхук не установлен — нажмите «Включить бота».",
      );
    } catch (e) {
      setHookMsg(e.message || "Не удалось получить статус");
    } finally {
      setHookBusy(false);
    }
  };
  const copyText = (t) => {
    const s = String(t);
    // «Скопировано» показываем только при реальном успехе. Если Clipboard API
    // недоступен (не-HTTPS, webview) или запись отклонена — показываем id для
    // ручного копирования, а не ложный успех.
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(s).then(
        () => setTgMsg(`Скопировано: ${s}`),
        () => setTgMsg(`Скопируйте вручную: ${s}`),
      );
    } else {
      setTgMsg(`Скопируйте вручную: ${s}`);
    }
  };

  const inpSt = {
    border: `1px solid ${C.border}`,
    fontSize: 13.5,
    background: "#fff",
    color: C.ink,
    borderRadius: 10,
    padding: "8px 11px",
  };
  const addRule = () => {
    const trg = AUTOMATION_TRIGGERS[trigIdx];
    const actions = [];
    if (notifyOn) actions.push({ type: "notify", target: notifyTarget });
    if (prOn) actions.push({ type: "priority", pr: prLevel });
    if (followOn)
      actions.push({
        type: "followup",
        days: Number(followDays) || 3,
        title: followTitle.trim(),
      });
    if (!name.trim() || !actions.length) return;
    const rule = {
      id: "r" + uid().slice(0, 6),
      name: name.trim(),
      active: true,
      trigger: {
        type: trg.type,
        ...(trg.phase != null ? { phase: trg.phase } : {}),
      },
      actions,
    };
    setRules((rs) => [rule, ...rs]);
    setName("");
    setPrOn(false);
    setFollowOn(false);
    setFollowTitle("");
  };
  const toggle = (id) =>
    setRules((rs) =>
      rs.map((r) => (r.id === id ? { ...r, active: !r.active } : r)),
    );
  const remove = (id) => setRules((rs) => rs.filter((r) => r.id !== id));
  const ago = (at) => {
    const min = Math.round((now - at) / 60000);
    if (min < 1) return "только что";
    if (min < 60) return min + " мин назад";
    const h = Math.round(min / 60);
    if (h < 24) return h + " ч назад";
    return Math.round(h / 24) + " дн назад";
  };

  return (
    <div className="space-y-4 max-w-4xl">
      <div
        className="rounded-xl px-4 py-3"
        style={{
          background: "#FFF7E8",
          border: "1px solid #F1DFC0",
          color: "#8A6A2F",
          fontSize: 13,
        }}
      >
        ⚠️ Данные этого раздела пока хранятся локально в этом браузере и не
        видны с других устройств. Перенос на сервер — в дорожной карте.
      </div>
      <div
        className="rounded-2xl p-4 sm:p-5"
        style={{
          background: C.brandGrad,
          color: "#fff",
          boxShadow: "0 12px 30px rgba(123,45,31,.28)",
        }}
      >
        <div className="flex items-center gap-2 mb-1">
          <Bot size={20} />
          <h2 className="font-extrabold" style={{ fontSize: 17 }}>
            Автоматизация процессов
          </h2>
        </div>
        <p style={{ fontSize: 13, opacity: 0.92 }}>
          Правила срабатывают сами при событиях по задачам: переход фазы,
          возврат на доработку, просрочка по сроку. Действие — уведомление,
          повышение приоритета или создание задачи-напоминания.
        </p>
      </div>

      {/* Telegram-уведомления */}
      <div
        className="rounded-2xl bg-white p-4 sm:p-5"
        style={{ border: `1px solid ${C.border}` }}
      >
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <Send size={16} color={C.brandA} />
              <h3 className="font-bold" style={{ color: C.ink, fontSize: 15 }}>
                Уведомления в Telegram
              </h3>
              <span
                className="rounded-full px-2 py-0.5"
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  background: tg?.configured ? "#DCFCE7" : C.line,
                  color: tg?.configured ? "#15803D" : C.faint,
                }}
              >
                {tg == null
                  ? "…"
                  : tg.configured
                    ? "подключено"
                    : "не настроено"}
              </span>
            </div>
            <p style={{ fontSize: 12.5, color: C.sub, marginTop: 4 }}>
              Заявки на согласование расходов, их одобрение/отклонение и
              уведомления автоправил дублируются в Telegram. Токен бота и id
              чата задаются в переменных окружения сервера (Render):
              <b> TELEGRAM_BOT_TOKEN</b>, <b>TELEGRAM_CHAT_ID</b>.
            </p>
          </div>
          <div className="flex flex-col gap-2 shrink-0">
            <button
              onClick={sendTest}
              disabled={tgBusy || !tg?.configured}
              className="rounded-lg px-3 py-2 font-bold text-white"
              style={{
                background: tg?.configured ? C.brandA : C.border,
                fontSize: 13,
                opacity: tgBusy ? 0.7 : 1,
              }}
            >
              {tgBusy ? "Отправка…" : "Тест-сообщение"}
            </button>
            <button
              onClick={testTopics}
              disabled={tgBusy || !tg?.configured}
              className="rounded-lg px-3 py-2 font-bold"
              style={{
                background: "#fff",
                border: `1px solid ${tg?.configured ? C.brandA : C.border}`,
                color: tg?.configured ? C.brandA : C.faint,
                fontSize: 13,
                opacity: tgBusy ? 0.7 : 1,
              }}
            >
              Проверить темы
            </button>
          </div>
        </div>
        {tgMsg && (
          <div style={{ fontSize: 12.5, color: C.sub, marginTop: 8 }}>
            {tgMsg}
          </div>
        )}

        {/* Бот чек-листов: включение вебхука (интерактивный бот для персонала) */}
        <div
          className="mt-3 rounded-xl p-3"
          style={{ background: "#FCFAF7", border: `1px solid ${C.line}` }}
        >
          <div
            className="font-bold mb-1"
            style={{ color: C.ink, fontSize: 13.5 }}
          >
            Бот чек-листов для персонала
          </div>
          <p style={{ color: C.sub, fontSize: 12, marginBottom: 8 }}>
            Сотрудник открывает бота, жмёт <b>/start</b> и входит по своему{" "}
            <b>логину и паролю</b> (как в CRM/iiko) — бот сам узнаёт сотрудника
            и привязывает Telegram, вручную ID вводить не нужно. Нужны
            переменные окружения <b>TELEGRAM_WEBHOOK_SECRET</b> и{" "}
            <b>PUBLIC_BASE_URL</b> (адрес бэкенда). Поля Telegram ID/филиал в
            «Учётных записях из iiko» — для ручной привязки при необходимости.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={setupHook}
              disabled={hookBusy}
              className="rounded-lg px-3 py-2 font-bold text-white"
              style={{
                background: C.brandA,
                fontSize: 13,
                opacity: hookBusy ? 0.7 : 1,
              }}
            >
              Включить бота
            </button>
            <button
              onClick={hookStatus}
              disabled={hookBusy}
              className="rounded-lg px-3 py-2 font-bold"
              style={{
                background: "#fff",
                border: `1px solid ${C.border}`,
                color: C.brandA,
                fontSize: 13,
                opacity: hookBusy ? 0.7 : 1,
              }}
            >
              Статус
            </button>
          </div>
          {hookMsg && (
            <div style={{ fontSize: 12.5, color: C.sub, marginTop: 8 }}>
              {hookMsg}
            </div>
          )}
        </div>

        {/* Помощник подключения: найти chat_id общего операционного чата */}
        <div
          className="mt-3 rounded-xl p-3"
          style={{ background: "#FCFAF7", border: `1px solid ${C.line}` }}
        >
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div style={{ fontSize: 12.5, color: C.sub, maxWidth: 560 }}>
              <b style={{ color: C.ink }}>Помощник подключения.</b> 1) У{" "}
              <b>@BotFather</b> создайте бота, вставьте{" "}
              <b>TELEGRAM_BOT_TOKEN</b> в Render. 2) Добавьте бота в{" "}
              <b>общий рабочий чат</b> и <b>сделайте его администратором</b>{" "}
              группы (иначе из-за privacy mode бот не видит обычные сообщения),
              затем напишите в группе любое сообщение. 3) Нажмите «Проверить
              бота», скопируйте id чата и вставьте в <b>TELEGRAM_CHAT_ID</b> в
              Render → Deploy.
            </div>
            <button
              onClick={loadTgInfo}
              disabled={tgInfoBusy}
              className="rounded-lg px-3 py-2 font-bold shrink-0"
              style={{
                border: `1px solid ${C.border}`,
                color: C.sub,
                background: "#fff",
                fontSize: 12.5,
                opacity: tgInfoBusy ? 0.7 : 1,
              }}
            >
              {tgInfoBusy ? "Проверка…" : "Проверить бота"}
            </button>
          </div>

          {tgInfo && tgInfo.error && (
            <div style={{ fontSize: 12.5, color: C.bad, marginTop: 8 }}>
              {tgInfo.error}
            </div>
          )}
          {tgInfo && !tgInfo.error && (
            <div className="mt-2" style={{ fontSize: 12.5 }}>
              {!tgInfo.tokenSet ? (
                <div style={{ color: C.bad }}>
                  TELEGRAM_BOT_TOKEN не задан в окружении сервера (Render).
                </div>
              ) : tgInfo.unreachable ? (
                <div style={{ color: C.bad }}>
                  Не удалось связаться с Telegram: {tgInfo.hint}. Проверьте
                  связь на сервере и попробуйте ещё раз (токен мог остаться
                  рабочим).
                </div>
              ) : !tgInfo.tokenValid ? (
                <div style={{ color: C.bad }}>
                  Токен недействителен: {tgInfo.hint || "проверьте BotFather"}
                </div>
              ) : (
                <>
                  <div style={{ color: C.ink }}>
                    Бот:{" "}
                    <b>
                      {tgInfo.bot?.username
                        ? `@${tgInfo.bot.username}`
                        : tgInfo.bot?.name}
                    </b>{" "}
                    — токен рабочий ✅
                    {tgInfo.currentChatId ? (
                      <span style={{ color: C.sub }}>
                        {" "}
                        · текущий чат: {tgInfo.currentChatId}
                      </span>
                    ) : null}
                  </div>
                  {tgInfo.chats && tgInfo.chats.length ? (
                    <div className="mt-2">
                      <div style={{ color: C.sub, marginBottom: 4 }}>
                        Чаты, где бот побывал (нажмите id, чтобы скопировать):
                      </div>
                      <div className="space-y-1">
                        {tgInfo.chats.map((c) => (
                          <div
                            key={c.id}
                            className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5"
                            style={{
                              background: "#fff",
                              border: `1px solid ${C.line}`,
                            }}
                          >
                            <span style={{ color: C.ink }}>
                              {c.title || "—"}{" "}
                              <span style={{ color: C.faint, fontSize: 11 }}>
                                ({c.type})
                              </span>
                              {String(c.id) ===
                                String(tgInfo.currentChatId) && (
                                <span
                                  className="rounded px-1.5 py-0.5"
                                  style={{
                                    marginLeft: 6,
                                    fontSize: 10,
                                    fontWeight: 700,
                                    background: "#DCFCE7",
                                    color: "#15803D",
                                  }}
                                >
                                  текущий
                                </span>
                              )}
                            </span>
                            <button
                              onClick={() => copyText(c.id)}
                              className="rounded-md px-2 py-1 font-mono shrink-0"
                              style={{
                                border: `1px solid ${C.border}`,
                                color: C.brandA,
                                fontSize: 12,
                                fontWeight: 700,
                              }}
                            >
                              {c.id}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div style={{ color: C.sub, marginTop: 6 }}>
                      {tgInfo.hint ||
                        "Чатов пока не видно. Напишите боту/в группу и нажмите «Проверить бота»."}
                    </div>
                  )}
                  {/* Темы супергруппы: раскладываем уведомления по темам */}
                  <div className="mt-3">
                    <div style={{ color: C.sub, marginBottom: 4 }}>
                      Темы группы — чтобы разные уведомления шли в свои темы:
                    </div>
                    {tgInfo.topics && tgInfo.topics.length ? (
                      <div className="space-y-1">
                        {tgInfo.topics.map((t) => (
                          <div
                            key={t.id}
                            className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5"
                            style={{
                              background: "#fff",
                              border: `1px solid ${C.line}`,
                            }}
                          >
                            <span style={{ color: C.ink }}>
                              {t.name || "Тема"}
                            </span>
                            <button
                              onClick={() => copyText(t.id)}
                              className="rounded-md px-2 py-1 font-mono shrink-0"
                              style={{
                                border: `1px solid ${C.border}`,
                                color: C.brandA,
                                fontSize: 12,
                                fontWeight: 700,
                              }}
                            >
                              {t.id}
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ color: C.faint, fontSize: 12 }}>
                        Темы пока не видны. Включите темы в группе (Управление
                        группой → Темы), напишите по одному сообщению в нужную
                        тему и нажмите «Проверить бота».
                      </div>
                    )}
                    <div style={{ color: C.sub, fontSize: 12, marginTop: 6 }}>
                      Скопируйте id темы и впишите в переменные окружения на
                      Render: <b>TELEGRAM_TOPIC_EXPENSES</b>{" "}
                      (расходы/согласования), <b>TELEGRAM_TOPIC_TASKS</b>{" "}
                      (задачи/заявки), <b>TELEGRAM_TOPIC_CASH</b>{" "}
                      (касса/инкассация), <b>TELEGRAM_TOPIC_STAFF</b>{" "}
                      (персонал), <b>TELEGRAM_TOPIC_REPORTS</b> (отчёты/сводки).
                      Пусто — уведомление идёт в общую ленту группы.
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Правила */}
      <div
        className="rounded-2xl bg-white p-4 sm:p-5"
        style={{ border: `1px solid ${C.border}` }}
      >
        <h3 className="font-bold mb-3" style={{ color: C.ink, fontSize: 15 }}>
          Правила ({rules.filter((r) => r.active).length} активны)
        </h3>
        <div className="space-y-2">
          {rules.length === 0 && (
            <p style={{ fontSize: 13, color: C.faint }}>
              Пока нет правил — добавьте ниже.
            </p>
          )}
          {rules.map((r) => (
            <div
              key={r.id}
              className="rounded-xl p-3 flex items-start justify-between gap-3"
              style={{
                border: `1px solid ${C.line}`,
                background: r.active ? "#fff" : "#FAFAF9",
                opacity: r.active ? 1 : 0.7,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>
                  {r.name}
                </div>
                <div style={{ fontSize: 12.5, color: C.sub, marginTop: 2 }}>
                  Когда: <b>{triggerLabel(r.trigger)}</b>
                </div>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {r.actions.map((ac, i) => (
                    <span
                      key={i}
                      className="rounded-md px-2 py-0.5"
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        background: C.brandSoft || "#FBEEE9",
                        color: C.brandA,
                      }}
                    >
                      {autoActionLabel(ac)}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => toggle(r.id)}
                  className="rounded-full"
                  title={r.active ? "Выключить" : "Включить"}
                  style={{
                    width: 40,
                    height: 22,
                    background: r.active ? C.ok : C.border,
                    position: "relative",
                    transition: "background .15s",
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      top: 2,
                      left: r.active ? 20 : 2,
                      width: 18,
                      height: 18,
                      borderRadius: 99,
                      background: "#fff",
                      transition: "left .15s",
                      boxShadow: "0 1px 3px rgba(0,0,0,.25)",
                    }}
                  />
                </button>
                <button
                  onClick={() => remove(r.id)}
                  className="p-1.5 rounded-lg"
                  style={{ color: C.bad }}
                  title="Удалить"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Добавить правило */}
        <div
          className="rounded-xl p-3 mt-4"
          style={{ background: "#FBFCFE", border: `1px dashed ${C.border}` }}
        >
          <div
            className="font-bold mb-2"
            style={{ color: C.ink, fontSize: 13.5 }}
          >
            Новое правило
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Название правила"
              style={inpSt}
            />
            <select
              value={trigIdx}
              onChange={(e) => setTrigIdx(Number(e.target.value))}
              style={inpSt}
            >
              {AUTOMATION_TRIGGERS.map((t, i) => (
                <option key={i} value={i}>
                  Когда: {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label
              className="flex items-center gap-2 flex-wrap"
              style={{ fontSize: 13, color: C.sub }}
            >
              <input
                type="checkbox"
                checked={notifyOn}
                onChange={(e) => setNotifyOn(e.target.checked)}
                style={{ width: 15, height: 15, accentColor: C.brandA }}
              />
              Уведомить
              <select
                value={notifyTarget}
                onChange={(e) => setNotifyTarget(e.target.value)}
                disabled={!notifyOn}
                style={{ ...inpSt, padding: "5px 9px" }}
              >
                {NOTIFY_TARGETS.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label
              className="flex items-center gap-2 flex-wrap"
              style={{ fontSize: 13, color: C.sub }}
            >
              <input
                type="checkbox"
                checked={prOn}
                onChange={(e) => setPrOn(e.target.checked)}
                style={{ width: 15, height: 15, accentColor: C.brandA }}
              />
              Поднять приоритет до
              <select
                value={prLevel}
                onChange={(e) => setPrLevel(e.target.value)}
                disabled={!prOn}
                style={{ ...inpSt, padding: "5px 9px" }}
              >
                <option value="Высокий">Высокий</option>
                <option value="Критический">Критический</option>
              </select>
            </label>
            <label
              className="flex items-center gap-2 flex-wrap"
              style={{ fontSize: 13, color: C.sub }}
            >
              <input
                type="checkbox"
                checked={followOn}
                onChange={(e) => setFollowOn(e.target.checked)}
                style={{ width: 15, height: 15, accentColor: C.brandA }}
              />
              Создать напоминание через
              <input
                value={followDays}
                onChange={(e) => setFollowDays(e.target.value)}
                disabled={!followOn}
                style={{ ...inpSt, padding: "5px 9px", width: 56 }}
              />
              дн.
              <input
                value={followTitle}
                onChange={(e) => setFollowTitle(e.target.value)}
                disabled={!followOn}
                placeholder="заголовок (необязательно)"
                style={{ ...inpSt, padding: "5px 9px", flex: 1, minWidth: 120 }}
              />
            </label>
          </div>
          <button
            onClick={addRule}
            className="mt-3 rounded-lg px-4 py-2 font-bold text-white"
            style={{ background: C.brandA, fontSize: 13 }}
          >
            + Добавить правило
          </button>
        </div>
      </div>

      {/* Журнал срабатываний */}
      <div
        className="rounded-2xl bg-white p-4 sm:p-5"
        style={{ border: `1px solid ${C.border}` }}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold" style={{ color: C.ink, fontSize: 15 }}>
            Журнал срабатываний
          </h3>
          {log.length > 0 && (
            <button
              onClick={() => setLog([])}
              style={{ fontSize: 12.5, color: C.faint }}
            >
              очистить
            </button>
          )}
        </div>
        {log.length === 0 ? (
          <p style={{ fontSize: 13, color: C.faint }}>
            Пока пусто. Как только сработает правило — здесь появится запись.
          </p>
        ) : (
          <div className="space-y-2">
            {log.map((e) => (
              <div
                key={e.id}
                className="rounded-xl p-2.5"
                style={{ background: "#F8FAFC", border: `1px solid ${C.line}` }}
              >
                <div
                  className="flex items-center justify-between gap-2"
                  style={{ fontSize: 12.5 }}
                >
                  <span style={{ fontWeight: 700, color: C.ink }}>
                    {e.rule}
                  </span>
                  <span style={{ color: C.faint }}>{ago(e.at)}</span>
                </div>
                <div style={{ fontSize: 12, color: C.sub, marginTop: 1 }}>
                  {e.trigger} · «{e.task}»
                </div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {e.actions.map((a, i) => (
                    <span
                      key={i}
                      className="rounded-md px-1.5 py-0.5"
                      style={{
                        fontSize: 10.5,
                        background: "#EEF2F7",
                        color: C.sub,
                      }}
                    >
                      {a}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default AutomationView;
