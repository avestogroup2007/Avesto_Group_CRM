// CVM — управление ценностью клиента: клиентская база с RFM-сегментацией, LTV,
// оттоком и кампаниями/офферами. Данные — ручной ввод/импорт Excel и обогащение
// из iiko Лояльность. Три вкладки: Аналитика, Клиенты, Кампании.
import { useState, useEffect, useCallback, useRef } from "react";
import { Users, RefreshCw, Upload, Send, Plus, Trash2 } from "lucide-react";
import { apiGet, apiPost, apiPut, apiDelete } from "../api.js";
import { C } from "../lib/theme.js";
import { Kpi, PageHeader, NiceSelect } from "../components/ui.jsx";

const money = (n) => Number(n || 0).toLocaleString("ru-RU");
const SEG_COLORS = {
  champions: "#15803D",
  loyal: "#16A34A",
  potential: "#0D9488",
  new: "#2563EB",
  attention: "#B45309",
  at_risk: "#DC2626",
  hibernating: "#7C3AED",
  lost: "#6B7280",
};

function ErrBox({ text }) {
  return (
    <div
      className="rounded-2xl bg-white p-5"
      style={{ border: `1px solid ${C.border}`, color: C.sub, fontSize: 13 }}
    >
      {text}
    </div>
  );
}

export default function CvmView({ notify, role }) {
  const canEdit = ["director", "finance", "sysadmin"].includes(role);
  const canAdmin = ["director", "sysadmin"].includes(role);
  const [tab, setTab] = useState("analytics");
  const [summary, setSummary] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [seg, setSeg] = useState("");
  const [q, setQ] = useState("");
  const [churnDays, setChurnDays] = useState(60);
  const [iikoCfg, setIikoCfg] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, cfg, iiko] = await Promise.all([
        apiGet("/api/cvm/summary"),
        apiGet("/api/cvm/config").catch(() => null),
        apiGet("/api/cvm/iiko-status").catch(() => ({ configured: false })),
      ]);
      setSummary(s);
      if (cfg) setChurnDays(cfg.churnDays);
      setIikoCfg(Boolean(iiko?.configured));
      setErr("");
    } catch (e) {
      setErr(e.message || "Не удалось загрузить");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCustomers = useCallback(async () => {
    try {
      const p = new URLSearchParams();
      if (seg) p.set("segment", seg);
      if (q) p.set("q", q);
      const d = await apiGet(`/api/cvm/customers?${p.toString()}`);
      setCustomers(d.customers || []);
    } catch (e) {
      setErr(e.message || "Ошибка");
    }
  }, [seg, q]);

  const loadCampaigns = useCallback(async () => {
    try {
      const d = await apiGet("/api/cvm/campaigns");
      setCampaigns(d.items || []);
    } catch (e) {
      setErr(e.message || "Ошибка");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (tab === "customers") loadCustomers();
    if (tab === "campaigns") loadCampaigns();
  }, [tab, loadCustomers, loadCampaigns]);

  const saveChurn = async () => {
    try {
      await apiPut("/api/cvm/config", {
        churnDays: Number(churnDays) || 60,
        defaultOffer: "",
      });
      notify && notify("Настройки CVM сохранены");
      load();
    } catch (e) {
      notify && notify(e.message || "Ошибка");
    }
  };

  const onImport = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const out = await apiPost("/api/cvm/customers/import", {
          file: String(reader.result),
        });
        notify &&
          notify(
            `Импорт: всего ${out.total}, новых ${out.created}, обновлено ${out.updated}` +
              (out.warning ? ` · ${out.warning}` : ""),
          );
        load();
        loadCustomers();
      } catch (e2) {
        notify && notify(e2.message || "Не удалось импортировать");
      }
    };
    reader.readAsDataURL(f);
    e.target.value = "";
  };

  const syncIiko = async () => {
    try {
      const out = await apiPost("/api/cvm/sync-iiko", {});
      notify &&
        notify(
          `iiko Лояльность: обработано ${out.scanned}, обновлено ${out.enriched}`,
        );
      load();
    } catch (e) {
      notify && notify(e.message || "iiko Лояльность недоступна");
    }
  };

  const moduleOff = err && /выключен/i.test(err);

  const header = (
    <PageHeader icon={Users} title="CVM — ценность клиента">
      <div className="flex gap-1">
        {[
          ["analytics", "Аналитика"],
          ["customers", "Клиенты"],
          ["campaigns", "Кампании"],
        ].map(([k, lbl]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className="rounded-lg px-2.5 py-1 font-semibold"
            style={{
              fontSize: 12,
              border: `1px solid ${tab === k ? C.brandA : C.border}`,
              color: tab === k ? C.brandA : C.sub,
              background: tab === k ? "#F5F3FF" : "#fff",
            }}
          >
            {lbl}
          </button>
        ))}
      </div>
      <button
        onClick={load}
        className="p-2 rounded-lg"
        style={{ border: `1px solid ${C.border}`, color: C.sub }}
        title="Обновить"
      >
        <RefreshCw size={14} />
      </button>
    </PageHeader>
  );

  if (moduleOff) {
    return (
      <div className="space-y-4">
        {header}
        <ErrBox text="Модуль CVM выключен. Включите его в Back Office (владелец системы) — раздел «Модули»." />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {header}

      {err && !moduleOff && <ErrBox text={err} />}
      {loading && !summary ? (
        <div style={{ color: C.sub, fontSize: 14 }}>Загрузка…</div>
      ) : null}

      {tab === "analytics" && summary && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Kpi
              label="Клиентов"
              value={money(summary.totals.customers)}
              tone={C.brandB}
            />
            <Kpi
              label="Средний LTV, сум"
              value={money(summary.totals.avgLtv)}
              tone={C.ok}
            />
            <Kpi
              label="Отток, %"
              value={`${summary.totals.churnRate}%`}
              tone={summary.totals.churnRate > 30 ? C.bad : "#B45309"}
            />
            <Kpi
              label="Под угрозой"
              value={money(summary.totals.atRisk)}
              tone={C.bad}
            />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Kpi
              label="Средний чек, сум"
              value={money(summary.totals.avgOrderValue)}
              tone={C.sub}
            />
            <Kpi
              label="Частота (покупок/чел)"
              value={summary.totals.avgFrequency}
              tone={C.sub}
            />
            <Kpi
              label="Активных"
              value={money(summary.totals.active)}
              tone={C.ok}
            />
            <Kpi
              label="С согласием на связь"
              value={money(summary.totals.withConsent)}
              tone={C.sub}
            />
          </div>

          <div
            className="rounded-2xl bg-white p-4 sm:p-5"
            style={{ border: `1px solid ${C.border}` }}
          >
            <div style={{ fontWeight: 700, color: C.ink, marginBottom: 10 }}>
              Сегменты (RFM)
            </div>
            <div className="overflow-x-auto">
              <table className="w-full" style={{ fontSize: 12.5 }}>
                <thead>
                  <tr style={{ color: C.faint, textAlign: "right" }}>
                    <th
                      className="pb-2 pr-2 font-semibold"
                      style={{ textAlign: "left" }}
                    >
                      Сегмент
                    </th>
                    <th className="pb-2 pr-2 font-semibold">Клиентов</th>
                    <th className="pb-2 pr-2 font-semibold">Доля</th>
                    <th className="pb-2 pr-2 font-semibold">Выручка, сум</th>
                    <th
                      className="pb-2 font-semibold"
                      style={{ textAlign: "left" }}
                    >
                      Что делать
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {summary.bySegment.map((s) => (
                    <tr
                      key={s.key}
                      style={{ borderTop: `1px solid ${C.line}` }}
                    >
                      <td className="py-1.5 pr-2" style={{ fontWeight: 600 }}>
                        <span
                          style={{
                            display: "inline-block",
                            width: 8,
                            height: 8,
                            borderRadius: 99,
                            background: SEG_COLORS[s.key] || C.sub,
                            marginRight: 6,
                          }}
                        />
                        {s.label}
                      </td>
                      <td className="py-1.5 pr-2 text-right">
                        {money(s.count)}
                      </td>
                      <td className="py-1.5 pr-2 text-right">{s.share}%</td>
                      <td className="py-1.5 pr-2 text-right">
                        {money(s.revenue)}
                      </td>
                      <td className="py-1.5" style={{ color: C.faint }}>
                        {s.action}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {canAdmin && (
            <div
              className="rounded-2xl bg-white p-4 flex flex-wrap items-center gap-3"
              style={{ border: `1px solid ${C.border}` }}
            >
              <span style={{ fontSize: 12.5, color: C.sub }}>
                Окно оттока, дней без покупки
              </span>
              <input
                value={churnDays}
                onChange={(e) =>
                  setChurnDays(e.target.value.replace(/\D/g, ""))
                }
                inputMode="numeric"
                style={{
                  border: `1px solid ${C.border}`,
                  borderRadius: 8,
                  padding: "4px 7px",
                  width: 70,
                  textAlign: "right",
                }}
              />
              <button
                onClick={saveChurn}
                className="rounded-lg px-3 py-1.5 font-bold text-white"
                style={{ background: C.brandA, fontSize: 12.5 }}
              >
                Сохранить
              </button>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 11.5, color: iikoCfg ? C.ok : C.faint }}>
                iiko Лояльность: {iikoCfg ? "подключена" : "не настроена"}
              </span>
              {canAdmin && iikoCfg && (
                <button
                  onClick={syncIiko}
                  className="rounded-lg px-3 py-1.5 font-semibold"
                  style={{
                    border: `1px solid ${C.border}`,
                    color: C.sub,
                    fontSize: 12,
                  }}
                >
                  Синхронизировать
                </button>
              )}
            </div>
          )}
        </>
      )}

      {tab === "customers" && (
        <CustomersTab
          customers={customers}
          seg={seg}
          setSeg={setSeg}
          q={q}
          setQ={setQ}
          reload={loadCustomers}
          canEdit={canEdit}
          canAdmin={canAdmin}
          notify={notify}
          fileRef={fileRef}
          onImport={onImport}
          segments={summary?.segments || []}
        />
      )}

      {tab === "campaigns" && (
        <CampaignsTab
          campaigns={campaigns}
          reload={loadCampaigns}
          canEdit={canEdit}
          notify={notify}
          segments={summary?.segments || []}
        />
      )}
    </div>
  );
}

function CustomersTab({
  customers,
  seg,
  setSeg,
  q,
  setQ,
  reload,
  canEdit,
  canAdmin,
  notify,
  fileRef,
  onImport,
  segments,
}) {
  const [form, setForm] = useState({
    name: "",
    phone: "",
    orders: "",
    totalSpent: "",
    consent: false,
  });
  const add = async () => {
    if (!form.name && !form.phone) {
      notify && notify("Нужны имя или телефон");
      return;
    }
    try {
      await apiPost("/api/cvm/customers", {
        name: form.name,
        phone: form.phone,
        orders: Number(form.orders) || 0,
        totalSpent: Number(form.totalSpent) || 0,
        consent: !!form.consent,
      });
      setForm({
        name: "",
        phone: "",
        orders: "",
        totalSpent: "",
        consent: false,
      });
      reload();
    } catch (e) {
      notify && notify(e.message || "Ошибка");
    }
  };
  const del = async (id) => {
    try {
      await apiDelete(`/api/cvm/customers/${id}`);
      reload();
    } catch (e) {
      notify && notify(e.message || "Ошибка");
    }
  };
  const inp = {
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    padding: "5px 8px",
    fontSize: 12.5,
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <NiceSelect
          value={seg}
          onChange={(v) => {
            setSeg(v);
          }}
          options={[
            { value: "", label: "Все сегменты" },
            ...segments.map((s) => ({ value: s.key, label: s.label })),
          ]}
          width={200}
        />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Поиск по имени/телефону"
          style={{ ...inp, width: 220 }}
        />
        <button
          onClick={reload}
          className="rounded-lg px-3 py-1.5 font-semibold"
          style={{
            border: `1px solid ${C.border}`,
            color: C.sub,
            fontSize: 12,
          }}
        >
          Найти
        </button>
        <span style={{ flex: 1 }} />
        {canAdmin && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={onImport}
              style={{ display: "none" }}
            />
            <button
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-semibold"
              style={{
                border: `1px solid ${C.border}`,
                color: C.sub,
                fontSize: 12,
              }}
            >
              <Upload size={13} /> Импорт Excel
            </button>
          </>
        )}
      </div>

      {canEdit && (
        <div
          className="rounded-2xl bg-white p-3 flex flex-wrap items-center gap-2"
          style={{ border: `1px solid ${C.border}` }}
        >
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Имя"
            style={{ ...inp, width: 160 }}
          />
          <input
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            placeholder="Телефон"
            style={{ ...inp, width: 150 }}
          />
          <input
            value={form.orders}
            onChange={(e) =>
              setForm({ ...form, orders: e.target.value.replace(/\D/g, "") })
            }
            placeholder="Покупок"
            inputMode="numeric"
            style={{ ...inp, width: 90 }}
          />
          <input
            value={form.totalSpent}
            onChange={(e) =>
              setForm({
                ...form,
                totalSpent: e.target.value.replace(/\D/g, ""),
              })
            }
            placeholder="Сумма, сум"
            inputMode="numeric"
            style={{ ...inp, width: 120 }}
          />
          <label
            style={{
              fontSize: 12.5,
              color: C.sub,
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <input
              type="checkbox"
              checked={form.consent}
              onChange={(e) => setForm({ ...form, consent: e.target.checked })}
            />
            согласие на связь
          </label>
          <button
            onClick={add}
            className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 font-bold text-white"
            style={{ background: C.brandA, fontSize: 12.5 }}
          >
            <Plus size={13} /> Добавить
          </button>
        </div>
      )}

      <div
        className="rounded-2xl bg-white p-4"
        style={{ border: `1px solid ${C.border}` }}
      >
        {customers.length === 0 ? (
          <div style={{ color: C.faint, fontSize: 13 }}>
            Клиентов нет. Добавьте вручную или импортируйте Excel.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full" style={{ fontSize: 12.5 }}>
              <thead>
                <tr style={{ color: C.faint, textAlign: "right" }}>
                  <th
                    className="pb-2 pr-2 font-semibold"
                    style={{ textAlign: "left" }}
                  >
                    Клиент
                  </th>
                  <th
                    className="pb-2 pr-2 font-semibold"
                    style={{ textAlign: "left" }}
                  >
                    Сегмент
                  </th>
                  <th className="pb-2 pr-2 font-semibold">Покупок</th>
                  <th className="pb-2 pr-2 font-semibold">Сумма</th>
                  <th className="pb-2 pr-2 font-semibold">Дней назад</th>
                  <th className="pb-2 pr-2 font-semibold">RFM</th>
                  <th className="pb-2 font-semibold">Связь</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c.id} style={{ borderTop: `1px solid ${C.line}` }}>
                    <td
                      className="py-1.5 pr-2"
                      style={{ fontWeight: 600, color: C.ink }}
                    >
                      {c.name || "—"}
                      <span style={{ color: C.faint, fontWeight: 400 }}>
                        {c.phone ? ` · ${c.phone}` : ""}
                      </span>
                    </td>
                    <td
                      className="py-1.5 pr-2"
                      style={{
                        color: SEG_COLORS[c.segment] || C.sub,
                        fontWeight: 600,
                      }}
                    >
                      {(segments.find((s) => s.key === c.segment) || {})
                        .label || c.segment}
                    </td>
                    <td className="py-1.5 pr-2 text-right">
                      {money(c.orders)}
                    </td>
                    <td className="py-1.5 pr-2 text-right">
                      {money(c.totalSpent)}
                    </td>
                    <td className="py-1.5 pr-2 text-right">
                      {c.recencyDays == null ? "—" : money(c.recencyDays)}
                    </td>
                    <td
                      className="py-1.5 pr-2 text-right"
                      style={{ color: C.faint }}
                    >
                      {c.rfm}
                    </td>
                    <td
                      className="py-1.5"
                      style={{ display: "flex", alignItems: "center", gap: 8 }}
                    >
                      <span style={{ color: c.consent ? C.ok : C.faint }}>
                        {c.consent ? "да" : "нет"}
                      </span>
                      {canAdmin && (
                        <button
                          onClick={() => del(c.id)}
                          title="Удалить"
                          style={{ color: C.bad }}
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function CampaignsTab({ campaigns, reload, canEdit, notify, segments }) {
  const [form, setForm] = useState({
    name: "",
    segment: "at_risk",
    offer: "",
    channel: "manual",
  });
  const create = async () => {
    if (!form.name) {
      notify && notify("Введите название кампании");
      return;
    }
    try {
      await apiPost("/api/cvm/campaigns", form);
      setForm({ name: "", segment: "at_risk", offer: "", channel: "manual" });
      reload();
    } catch (e) {
      notify && notify(e.message || "Ошибка");
    }
  };
  const send = async (id) => {
    try {
      const out = await apiPost(`/api/cvm/campaigns/${id}/send`, {});
      notify && notify(`Кампания запущена: аудитория ${out.campaign.audience}`);
      reload();
    } catch (e) {
      notify && notify(e.message || "Ошибка");
    }
  };
  const inp = {
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    padding: "5px 8px",
    fontSize: 12.5,
  };
  const segLabel = (k) =>
    k === "all"
      ? "Вся база"
      : (segments.find((s) => s.key === k) || {}).label || k;
  return (
    <div className="space-y-3">
      {canEdit && (
        <div
          className="rounded-2xl bg-white p-3 flex flex-wrap items-center gap-2"
          style={{ border: `1px solid ${C.border}` }}
        >
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Название кампании"
            style={{ ...inp, width: 200 }}
          />
          <NiceSelect
            value={form.segment}
            onChange={(v) => setForm({ ...form, segment: v })}
            options={[
              { value: "all", label: "Вся база" },
              ...segments.map((s) => ({ value: s.key, label: s.label })),
            ]}
            width={200}
          />
          <input
            value={form.offer}
            onChange={(e) => setForm({ ...form, offer: e.target.value })}
            placeholder="Оффер (напр. −20% на возврат)"
            style={{ ...inp, width: 260 }}
          />
          <button
            onClick={create}
            className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 font-bold text-white"
            style={{ background: C.brandA, fontSize: 12.5 }}
          >
            <Plus size={13} /> Создать
          </button>
        </div>
      )}
      <div
        className="rounded-2xl bg-white p-4"
        style={{ border: `1px solid ${C.border}` }}
      >
        {campaigns.length === 0 ? (
          <div style={{ color: C.faint, fontSize: 13 }}>Кампаний пока нет.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full" style={{ fontSize: 12.5 }}>
              <thead>
                <tr style={{ color: C.faint, textAlign: "right" }}>
                  <th
                    className="pb-2 pr-2 font-semibold"
                    style={{ textAlign: "left" }}
                  >
                    Кампания
                  </th>
                  <th
                    className="pb-2 pr-2 font-semibold"
                    style={{ textAlign: "left" }}
                  >
                    Сегмент
                  </th>
                  <th
                    className="pb-2 pr-2 font-semibold"
                    style={{ textAlign: "left" }}
                  >
                    Оффер
                  </th>
                  <th className="pb-2 pr-2 font-semibold">Аудитория</th>
                  <th
                    className="pb-2 font-semibold"
                    style={{ textAlign: "left" }}
                  >
                    Статус
                  </th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id} style={{ borderTop: `1px solid ${C.line}` }}>
                    <td
                      className="py-1.5 pr-2"
                      style={{ fontWeight: 600, color: C.ink }}
                    >
                      {c.name}
                    </td>
                    <td className="py-1.5 pr-2" style={{ color: C.sub }}>
                      {segLabel(c.segment)}
                    </td>
                    <td className="py-1.5 pr-2" style={{ color: C.faint }}>
                      {c.offer || "—"}
                    </td>
                    <td className="py-1.5 pr-2 text-right">
                      {c.status === "sent" ? money(c.audience) : "—"}
                    </td>
                    <td
                      className="py-1.5"
                      style={{ display: "flex", alignItems: "center", gap: 8 }}
                    >
                      {c.status === "sent" ? (
                        <span style={{ color: C.ok }}>запущена</span>
                      ) : canEdit ? (
                        <button
                          onClick={() => send(c.id)}
                          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 font-semibold text-white"
                          style={{ background: C.brandA, fontSize: 12 }}
                        >
                          <Send size={12} /> Запустить
                        </button>
                      ) : (
                        <span style={{ color: C.faint }}>черновик</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ fontSize: 11, color: C.faint, marginTop: 8 }}>
          «Запустить» фиксирует аудиторию сегмента с согласием на связь и
          уведомляет команду. Персональная рассылка — по выгруженному списку
          через ваш канал (Telegram/SMS).
        </div>
      </div>
    </div>
  );
}
