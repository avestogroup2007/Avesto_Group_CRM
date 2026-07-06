import React, { useState, useEffect, useMemo, useReducer } from "react";
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
  Inbox,
  PlusCircle,
  BarChart3,
  Building2,
  Settings,
  Archive,
  Clock,
  Paperclip,
  MessageSquare,
  Star,
  X,
  CheckCircle2,
  RotateCcw,
  Play,
  Send,
  Bot,
  ChevronRight,
  ChevronDown,
  Filter,
  Download,
  Printer,
  ShieldCheck,
  AlertTriangle,
  Users,
  Power,
  Sparkles,
  Info,
  Award,
  Mic,
  AlertCircle,
  Camera,
  ListChecks,
  Server,
  Lock,
  Activity,
  TrendingUp,
  FileText,
  Wallet,
  Menu,
  CalendarDays,
  ArrowUp,
} from "lucide-react";
import Logo from "./Logo.jsx";
import IikoPanel from "./IikoPanel.jsx";
import { apiGet, apiPost, apiPatch } from "./api.js";

/* ============================================================================
   Avesto Group CRM System  (интерактивный прототип, MVP)
   Реализует 5 фаз заявок, роли Исполнитель/Контролёр, неизменяемый журнал,
   SLA-таймеры, смены, SOP-чек-листы, контроль бюджетов, ИИ-маршрутизацию,
   поиск аномалий, дашборд директора и личную аналитику сотрудника.
   ============================================================================ */

const FONT =
  "'Manrope', system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

// Дизайн-токены: высокий контраст, доступность для всех поколений (Этап 3).
// Плюс «жидкое стекло»: полупрозрачные матовые поверхности для хрома (боковое
// меню, шапка, нижняя навигация, модалки) поверх тёплого градиентного фона.
const C = {
  bg: "#F7F4EF",
  surface: "#FFFFFF",
  ink: "#1B1512",
  sub: "#5E5049",
  faint: "#A2938B",
  border: "#E7DFD4",
  line: "#F1EBE2",
  brandA: "#7B2D1F",
  brandB: "#C8892E",
  violet: "#7C3AED",
  ok: "#16A34A",
  warn: "#D97706",
  bad: "#DC2626",
  // Стеклянные поверхности (используются через классы .glass* в глобальном CSS).
  glass: "rgba(255,255,255,0.58)",
  glassStrong: "rgba(255,251,246,0.80)",
  glassBorder: "rgba(255,255,255,0.65)",
  glassShadow: "0 8px 32px rgba(74,38,22,0.10), 0 2px 8px rgba(74,38,22,0.06)",
  // Фирменный градиент для основных кнопок и акцентов.
  brandGrad: "linear-gradient(135deg, #8A3323 0%, #7B2D1F 55%, #5E2016 100%)",
};

// 5 фаз жизненного цикла заявки — каждая со своим цветом
const PHASES = [
  { n: 1, label: "Отправлено", color: "#2563EB", soft: "#EFF4FF" },
  { n: 2, label: "Просмотрено", color: "#7C3AED", soft: "#F5F0FE" },
  { n: 3, label: "В работе", color: "#EA580C", soft: "#FFF2E8" },
  { n: 4, label: "На проверке", color: "#DB2777", soft: "#FCEEF5" },
  { n: 5, label: "Завершено", color: "#16A34A", soft: "#E9F9EF" },
];

const ACTION_LABEL = {
  created: "Создал(а) заявку",
  viewed: "Просмотрел(а) задачу",
  start: "Взял(а) в работу",
  review: "Отправил(а) на проверку",
  done: "Принял(а) работу и завершил(а)",
  return: "Вернул(а) на доработку",
  comment: "Добавил(а) комментарий",
  step: "Выполнил(а) шаг",
};

const M = 60_000,
  H = 3_600_000,
  D = 86_400_000;
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const STORAGE_KEY = "avesto.crm.v10"; // реальные юрлица и филиалы Avesto — старые локальные данные игнорируются

/* ============================ ДВУЯЗЫЧНОСТЬ (RU / UZ) ======================== */
let LANG = "ru";
function syncLang(s) {
  LANG = (s && s.settings && s.settings.lang) || "ru";
}
const UZ = {
  // навигация / заголовки
  Входящие: "Kiruvchi",
  "Создать заявку": "Ariza yaratish",
  "Мои достижения": "Yutuqlarim",
  "Архив задач": "Vazifalar arxivi",
  Аналитика: "Tahlil",
  Оргструктура: "Tashkiliy tuzilma",
  "О системе": "Tizim haqida",
  "Админ-панель": "Admin panel",
  "Входящие задачи": "Kiruvchi vazifalar",
  "Аналитика — кабина директора": "Tahlil — direktor kabinasi",
  "Оргструктура и филиалы": "Tuzilma va filiallar",
  Создать: "Yaratish",
  Кабинет: "Kabinet",
  Архив: "Arxiv",
  Структура: "Tuzilma",
  Админка: "Admin",
  Ещё: "Yana",
  // фазы
  Отправлено: "Yuborilgan",
  Просмотрено: "Ko‘rilgan",
  "В работе": "Ishda",
  "На проверке": "Tekshiruvda",
  Завершено: "Yakunlangan",
  // роли
  Руководство: "Rahbariyat",
  Финансист: "Moliyachi",
  Управляющий: "Boshqaruvchi",
  Бухгалтер: "Buxgalter",
  "Сист. администратор": "Tizim admini",
  Сотрудник: "Xodim",
  // приоритеты
  Критический: "Kritik",
  Высокий: "Yuqori",
  Обычный: "Oddiy",
  // смена / профиль
  "Смена открыта": "Smena ochiq",
  "Открыть смену": "Smenani ochish",
  "Закрыть смену": "Smenani yopish",
  "Войти как (демо ролей):": "Sifatida kirish (demo):",
  // доска / карточки
  "Нет задач": "Vazifalar yo‘q",
  активных: "faol",
  "Исполнитель:": "Ijrochi:",
  "Контролёр:": "Nazoratchi:",
  "Исполнитель — кто делает": "Ijrochi — kim bajaradi",
  "Контролёр — кто следит": "Nazoratchi — kim kuzatadi",
  // создание
  "Простая заявка": "Oddiy ariza",
  "По шаблону": "Shablon bo‘yicha",
  "Что случилось?": "Nima bo‘ldi?",
  "Распознать (ИИ)": "Aniqlash (AI)",
  "Сказать задачу": "Vazifani aytish",
  "Опишите простыми словами — система сама определит филиал, категорию, срочность и назначит ответственных.":
    "Oddiy so‘zlar bilan yozing — tizim filial, turkum va shoshilinchlikni aniqlaydi va mas’ullarni tayinlaydi.",
  "Запустить процесс": "Jarayonni boshlash",
  "Запустить процесс по шаблону": "Shablon bo‘yicha jarayonni boshlash",
  // меню разделов
  "Все разделы": "Barcha bo‘limlar",
  "Рабочий прототип. Откройте задачу, где вы исполнитель или контролёр — фаза «Отправлено» сама станет «Просмотрено» (защита «я не видел»). Кнопки действий зависят от роли и открытой смены — переключайте роль через профиль справа вверху.":
    "Ishchi prototip. O‘zingiz ijrochi yoki nazoratchi bo‘lgan vazifani oching — «Yuborilgan» bosqichi avtomatik «Ko‘rilgan» bo‘ladi («ko‘rmadim» himoyasi). Tugmalar rol va ochiq smenaga bog‘liq — rolni yuqori o‘ngdagi profil orqali almashtiring.",
  // вкладки админки
  Сотрудники: "Xodimlar",
  Должности: "Lavozimlar",
  "Филиалы и бюджеты": "Filiallar va byudjet",
  "Отделы и доступ": "Bo‘limlar va ruxsat",
  Маршруты: "Marshrutlar",
  "SLA-нормативы": "SLA me’yorlari",
  Регламенты: "Reglamentlar",
  Система: "Tizim",
  "Добавить сотрудника": "Xodim qo‘shish",
  Добавить: "Qo‘shish",
  // учёт времени
  "Учёт времени": "Vaqt hisobi",
  "Учёт рабочего времени": "Ish vaqti hisobi",
  Время: "Vaqt",
  "Моё рабочее время": "Mening ish vaqtim",
  Сегодня: "Bugun",
  "За неделю": "Hafta uchun",
  "На смене": "Smenada",
  "Не на смене": "Smenada emas",
  "На смене сейчас": "Hozir smenada",
  "Часов за сегодня": "Bugungi soatlar",
  "Часов за неделю": "Haftalik soatlar",
  "Последние смены": "Oxirgi smenalar",
  "Пока нет закрытых смен": "Hozircha yopilgan smenalar yo‘q",
  // кассы
  Кассы: "Kassalar",
  "Кассы филиалов": "Filiallar kassalari",
  Месяц: "Oy",
  "Все филиалы": "Barcha filiallar",
  "Выручка за месяц": "Oylik tushum",
  Наличные: "Naqd pul",
  "Эквайринг (в банк)": "Ekvayring (bankka)",
  Расходы: "Xarajatlar",
  "Отчёт по кассе за день": "Kunlik kassa hisoboti",
  "уже есть — сохранение обновит": "allaqachon bor — saqlash yangilaydi",
  Дата: "Sana",
  "Фискальная выручка": "Fiskal tushum",
  "Нефискальная сумма": "Nofiskal summa",
  "Карты и онлайн": "Kartalar va onlayn",
  "Перечисление и прочее": "O‘tkazma va boshqalar",
  Перечисление: "O‘tkazma",
  "Чеков перечислением": "O‘tkazma cheklari soni",
  Долг: "Qarz",
  "Без оплат": "To‘lovsiz",
  "Расходы за день": "Kunlik xarajatlar",
  "Сумма по iiko": "iiko bo‘yicha summa",
  "Наличными всего": "Jami naqd",
  "Итого выручка": "Jami tushum",
  "Разница с iiko": "iiko bilan farq",
  "Сохранить отчёт по кассе": "Kassa hisobotini saqlash",
  "Отчёты за месяц": "Oylik hisobotlar",
  "Нет отчётов за выбранный период": "Tanlangan davr uchun hisobot yo‘q",
  Выручка: "Tushum",
  Эквайринг: "Ekvayring",
  "Перечисл.": "O‘tkazma",
  Разница: "Farq",
  "Выберите филиал": "Filialni tanlang",
  "Отчёт по кассе сохранён": "Kassa hisoboti saqlandi",
  "Отчёт удалён": "Hisobot o‘chirildi",
  Удалить: "O‘chirish",
  // кассы — периоды и доступ
  День: "Kun",
  Неделя: "Hafta",
  Год: "Yil",
  Период: "Davr",
  С: "Dan",
  По: "Gacha",
  "Неделя (любой день)": "Hafta (istalgan kun)",
  Печать: "Chop etish",
  "Выручка за период": "Davr tushumi",
  Итого: "Jami",
  "Итого за период": "Davr uchun jami",
  "Ваш филиал": "Sizning filial",
  "Отчёты за период": "Davr hisobotlari",
  "Обновить отчёт": "Hisobotni yangilash",
  ч: "soat",
  "Редактирование доступно ещё": "Tahrirlash yana mumkin",
  "Новый отчёт — заполните и сохраните":
    "Yangi hisobot — to‘ldiring va saqlang",
  "Редактирование закрыто: прошло больше 24 часов":
    "Tahrirlash yopiq: 24 soatdan oshdi",
  "Редактирование закрыто: с момента создания прошло более 24 часов. Изменения может внести только руководитель.":
    "Tahrirlash yopiq: yaratilganiga 24 soatdan oshdi. O‘zgartirishni faqat rahbar kirita oladi.",
  "Отчёт по кассам филиалов": "Filiallar kassalari hisoboti",
  "(суммы в сум)": "(summalar so‘mda)",
  "Разрешите всплывающие окна для печати":
    "Chop etish uchun qalqib chiquvchi oynalarga ruxsat bering",
  "Печать недоступна в этом окне": "Bu oynada chop etish mavjud emas",
  // кассы — статусы и подтверждение
  Статус: "Holat",
  Принято: "Qabul qilindi",
  Ожидает: "Kutilmoqda",
  Принять: "Qabul qilish",
  "Сдать отчёт": "Hisobotni topshirish",
  "Отчёт сдан и ожидает подтверждения":
    "Hisobot topshirildi va tasdiqlash kutilmoqda",
  "Отчёт подтверждён": "Hisobot tasdiqlandi",
  "Редактирование закрыто": "Tahrirlash yopiq",
  "Укажите комментарий к расхождению с iiko":
    "iiko bilan farq uchun izoh yozing",
  "Отчёт принят контролёром — редактирование закрыто.":
    "Hisobot nazoratchi tomonidan qabul qilindi — tahrirlash yopiq.",
  Принял: "Qabul qildi",
  "Срок сдачи истёк (после 12:00 следующего дня). Изменения может внести только контролёр.":
    "Topshirish muddati o‘tdi (ertangi kun 12:00 dan keyin). O‘zgartirishni faqat nazoratchi kirita oladi.",
  "Отчёт сдан. ": "Hisobot topshirildi. ",
  "Новый отчёт. ": "Yangi hisobot. ",
  "Вы контролёр — правки без ограничения по сроку.":
    "Siz nazoratchisiz — tuzatishlar muddatsiz.",
  "Правки принимаются до": "Tuzatishlar qabul qilinadi",
  Комментарий: "Izoh",
  "Причина расхождения с iiko, если есть":
    "iiko bilan farq sababi (agar bo‘lsa)",
  "При расхождении с iiko комментарий обязателен":
    "iiko bilan farq bo‘lsa izoh majburiy",
  "отчётов ожидают подтверждения": "hisobot tasdiqlashni kutmoqda",
  // кассы — расшифровка расходов
  "Расходы — на что потрачено": "Xarajatlar — nimaga sarflandi",
  "Например: закупка продуктов, хозтовары, мелкий ремонт":
    "Masalan: mahsulot xaridi, xo‘jalik buyumlari, mayda ta’mirlash",
  "При расходах комментарий обязателен": "Xarajat bo‘lsa izoh majburiy",
  "Укажите, на что были расходы": "Xarajat nimaga sarflanganini yozing",
  Примечание: "Izoh",
  // периоды как в iiko
  "За период": "Davr uchun",
  с: "dan",
  по: "gacha",
  "Открытый период": "Ochiq davr",
  "Текущая неделя": "Joriy hafta",
  "Текущий месяц": "Joriy oy",
  "Текущий год": "Joriy yil",
  Вчера: "Kecha",
  "Прошлая неделя": "O‘tgan hafta",
  "Прошлый месяц": "O‘tgan oy",
  "Прошлый год": "O‘tgan yil",
  "Другой…": "Boshqa…",
  // сейф и инкассация
  "Сейф филиала и передача денег": "Filial seyfi va pul topshirish",
  "выберите филиал вверху, чтобы видеть сейф и передавать деньги":
    "seyfni ko‘rish va pul topshirish uchun yuqorida filialni tanlang",
  "Остаток в сейфе": "Seyfdagi qoldiq",
  "В пути / на подтверждении": "Yo‘lda / tasdiqlashda",
  "Наличных поступило (всего)": "Kelib tushgan naqd (jami)",
  "Передано в офис (всего)": "Ofisga topshirilgan (jami)",
  "Передать в головной офис": "Bosh ofisga topshirish",
  "Через кого": "Kim orqali",
  "инкассатор, водитель, директор…": "inkassator, haydovchi, direktor…",
  Передать: "Topshirish",
  "Доступно к передаче": "Topshirish mumkin",
  "Передачи за период": "Davr uchun topshirishlar",
  "Передач за период нет": "Davr uchun topshirishlar yo‘q",
  через: "orqali",
  "Принято офисом": "Ofis qabul qildi",
  "В пути": "Yo‘lda",
  "Подтвердить приём": "Qabulni tasdiqlash",
  "Передача удалена": "Topshirish o‘chirildi",
  "Передача отправлена — ожидает подтверждения офиса":
    "Topshirish yuborildi — ofis tasdiqlashi kutilmoqda",
  "Приём денег подтверждён": "Pul qabul qilingani tasdiqlandi",
  "Укажите сумму передачи": "Topshirish summasini kiriting",
  "Сумма больше остатка в сейфе": "Summa seyf qoldig‘idan katta",
  "Укажите, через кого переданы деньги":
    "Pul kim orqali topshirilganini yozing",
  "передач денег в пути": "pul topshirish yo‘lda",
  // фото чеков
  "Фото чека / товара": "Chek / tovar fotosi",
  "по желанию, до 3 фото — доказательство расхода":
    "ixtiyoriy, 3 tagacha foto — xarajat isboti",
  "Фото добавлено": "Foto qo‘shildi",
  "Не удалось обработать фото": "Fotoni qayta ishlab bo‘lmadi",
  "Максимум 3 фото": "Ko‘pi bilan 3 ta foto",
  // календарь
  Январь: "Yanvar",
  Февраль: "Fevral",
  Март: "Mart",
  Апрель: "Aprel",
  Май: "May",
  Июнь: "Iyun",
  Июль: "Iyul",
  Август: "Avgust",
  Сентябрь: "Sentabr",
  Октябрь: "Oktabr",
  Ноябрь: "Noyabr",
  Декабрь: "Dekabr",
  Пн: "Du",
  Вт: "Se",
  Ср: "Cho",
  Чт: "Pa",
  Пт: "Ju",
  Сб: "Sha",
  Вс: "Ya",
  // аналитика продаж
  "Аналитика продаж": "Sotuv tahlili",
  Продажи: "Sotuv",
  "Средний чек": "O‘rtacha chek",
  "Количество чеков": "Cheklar soni",
  "Прошлый период": "O‘tgan davr",
  "к прошлому периоду": "o‘tgan davrga",
  "нет данных за прошлый период": "o‘tgan davr uchun ma’lumot yo‘q",
  "Динамика выручки": "Tushum dinamikasi",
  "Выручка по типам оплат": "To‘lov turlari bo‘yicha tushum",
  "ABC-анализ товаров": "Tovarlar ABC-tahlili",
  "A — основная выручка, C — аутсайдеры": "A — asosiy tushum, C — autsayderlar",
  Группа: "Guruh",
  "тов.": "tovar",
  Товар: "Tovar",
  "Кол-во": "Soni",
  Доля: "Ulush",
  "Накопит.": "Jami ulush",
  "Нет данных за выбранный период": "Tanlangan davr uchun ma’lumot yo‘q",
  шт: "dona",
  "Лучше всего продаются": "Eng ko‘p sotilgan",
  "Хуже всего продаются": "Eng kam sotilgan",
  "Выводы и рекомендации": "Xulosa va tavsiyalar",
  "Данные по товарам рассчитаны из дневной выручки касс. После подключения iiko здесь будет реальная номенклатура: блюда, количество и суммы по чекам.":
    "Tovar ma’lumotlari kunlik kassa tushumidan hisoblangan. iiko ulangach, bu yerda haqiqiy nomenklatura bo‘ladi: taomlar, soni va chek summalari.",
  "«Наличными всего» = фискальная + нефискальная. «Эквайринг» = Humo + Uzcard + Click + Payme + Uzum Tezkor + Yandex. «Итого выручка» = наличные + эквайринг + перечисление. «Разница с iiko» = итог минус сумма по iiko.":
    "«Jami naqd» = fiskal + nofiskal. «Ekvayring» = Humo + Uzcard + Click + Payme + Uzum Tezkor + Yandex. «Jami tushum» = naqd + ekvayring + o‘tkazma. «iiko bilan farq» = jami minus iiko summasi.",
  // детали задачи
  Описание: "Tavsif",
  Сумма: "Summa",
  Отдел: "Bo‘lim",
  Категория: "Turkum",
  Приоритет: "Muhimlik",
  Филиал: "Filial",
  "Юр. лицо": "Yuridik shaxs",
  Создана: "Yaratilgan",
  "Текущая фаза": "Joriy bosqich",
  "Журнал (неизменяемый)": "Jurnal (o‘zgarmas)",
  "Краткая суть (ИИ)": "Qisqacha mazmun (AI)",
};
const tr = (ru) => (LANG === "uz" ? UZ[ru] || ru : ru);

/* ---------------------------------- утилиты ------------------------------- */
function fmtDur(ms) {
  ms = Math.max(0, ms);
  const m = Math.round(ms / M);
  if (m < 60) return m + " мин";
  const h = Math.floor(m / 60),
    mm = m % 60;
  if (h < 24) return mm ? `${h} ч ${mm} мин` : `${h} ч`;
  const d = Math.floor(h / 24),
    hh = h % 24;
  return hh ? `${d} дн ${hh} ч` : `${d} дн`;
}
// Часовой пояс Узбекистана — даты/время считаем и показываем по Ташкенту.
const TZ = "Asia/Tashkent";
function fmtMoney(n) {
  return (n || 0).toLocaleString("ru-RU") + " сум";
}
// длительность рабочего времени: без «дней» (смена/сессия), для сводных карточек — только часы
const fmtWork = (ms) => {
  const m = Math.max(0, Math.round(ms / M));
  const h = Math.floor(m / 60),
    mm = m % 60;
  return h ? (mm ? `${h} ч ${mm} мин` : `${h} ч`) : `${mm} мин`;
};
const fmtWorkH = (ms) => `${Math.round(Math.max(0, ms) / H)} ч`;
const fmtSum = (n) => Math.round(n || 0).toLocaleString("ru-RU") + " сум";
function fmtDateTime(ms) {
  return new Date(ms).toLocaleString("ru-RU", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
function initials(name) {
  const p = (name || "?").trim().split(/\s+/);
  return ((p[0]?.[0] || "") + (p[1]?.[0] || "")).toUpperCase();
}
const AVATAR_COLORS = [
  "#2563EB",
  "#7C3AED",
  "#DB2777",
  "#EA580C",
  "#0891B2",
  "#16A34A",
  "#9333EA",
];
function avatarColor(id) {
  let s = 0;
  for (const ch of String(id)) s += ch.charCodeAt(0);
  return AVATAR_COLORS[s % AVATAR_COLORS.length];
}
// Статус SLA для задачи (Этап 2)
function slaInfo(t, now) {
  if (t.phase >= 5) return { tone: "done", text: "Завершено", color: C.faint };
  const left = t.slaDeadline - now;
  if (left <= 0)
    return {
      tone: "bad",
      text: "Просрочено на " + fmtDur(-left),
      color: C.bad,
    };
  if (left < H)
    return { tone: "warn", text: "Осталось " + fmtDur(left), color: C.warn };
  return { tone: "ok", text: "Осталось " + fmtDur(left), color: C.ok };
}
const lightTone = (rate) => (rate >= 90 ? C.ok : rate >= 80 ? C.warn : C.bad);

/* ----------------------------- оргструктура ------------------------------- */
// Реальные юрлица группы Avesto (из iiko / реквизитов).
const COMPANIES = [
  {
    id: 1,
    name: "«AVESTO CAFE» OK",
    inn: "309235475",
    address: "г. Самарканд, ул. Узбекистанский 37",
    bank: "ЧАКБ «Orient Finans»",
    bik: "01071",
    account: "20208000205484120001",
  },
  {
    id: 2,
    name: "«AVESTO SWEETS» OK",
    inn: "302553964",
    address: "г. Самарканд, ул. Наврузи 15",
    bank: "ЧАКБ «Orient Finans»",
    bik: "01071",
    account: "20208000900208609001",
  },
  {
    id: 3,
    name: "«INTERNATIONAL CATERING GROUP» MChJ",
    inn: "311869139",
    description: "Кейтеринг и выездное обслуживание мероприятий",
    address: "г. Самарканд, МФИ Бунёдкор, ул. Наврузи 15",
    bank: "ЧАКБ «Orient Finans»",
    bik: "01071",
    account: "20208000107192681001",
  },
];
// iikoDept — имя торгового предприятия (Department) в iikoServer,
// нужно для фильтра реальных продаж по конкретному филиалу.
const BRANCHES = [
  {
    id: 1,
    companyId: 1,
    name: "Avesto Cafe — Микрорайон",
    iikoDept: "Микрорайон",
  },
  {
    id: 2,
    companyId: 1,
    name: "Avesto Cafe — Узбекистанская",
    iikoDept: "Uzbekistanskaya",
  },
  {
    id: 3,
    companyId: 2,
    name: "Avesto Sweets — Аэропорт",
    iikoDept: "Aeroport",
  },
  {
    id: 4,
    companyId: 2,
    name: "Avesto Sweets — Наврузий цех",
    iikoDept: "Navruzi Цех",
  },
  {
    id: 5,
    companyId: 2,
    name: "Avesto Sweets — Наврузий Магазин",
    iikoDept: "Наврузи Магазин",
  },
  {
    id: 6,
    companyId: 3,
    name: "ICG — Кейтеринг (основной)",
    iikoDept: "Кейтеринг (основной)",
  },
];
// Месячные бюджетные лимиты по филиалам (Этап улучшений: контроль перерасхода)
const BRANCH_BUDGET = {
  1: 500000,
  2: 300000,
  3: 400000,
  4: 250000,
  5: 300000,
  6: 300000,
};

const USERS = [
  {
    id: "u1",
    name: "Соколов Д. А.",
    role: "director",
    pos: "Генеральный директор",
    level: 1,
    branchId: null,
    parentId: null,
  },
  {
    id: "u2",
    name: "Орлова Е. В.",
    role: "director",
    pos: "Операционный директор",
    level: 1,
    branchId: null,
    parentId: "u1",
  },
  {
    id: "u3",
    name: "Иванова М. П.",
    role: "finance",
    pos: "Финансист",
    level: 2,
    branchId: null,
    parentId: "u1",
  },
  {
    id: "u4",
    name: "Ахмедов И. О.",
    role: "manager",
    pos: "Управляющий филиалом",
    level: 2,
    branchId: 3,
    parentId: "u2",
  },
  {
    id: "u5",
    name: "Кузнецов П. С.",
    role: "manager",
    pos: "Управляющий филиалом",
    level: 2,
    branchId: 2,
    parentId: "u2",
  },
  {
    id: "u6",
    name: "Петров А. И.",
    role: "sysadmin",
    pos: "Системный администратор",
    level: 3,
    branchId: 3,
    parentId: "u4",
  },
  {
    id: "u7",
    name: "Смирнов В. Н.",
    role: "staff",
    pos: "Техник",
    level: 3,
    branchId: 2,
    parentId: "u5",
  },
  {
    id: "u8",
    name: "Васильева О. К.",
    role: "accountant",
    pos: "Бухгалтер",
    level: 3,
    branchId: 1,
    parentId: "u3",
  },
  {
    id: "u9",
    name: "Новиков Р. Т.",
    role: "staff",
    pos: "Линейный сотрудник",
    level: 4,
    branchId: 3,
    parentId: "u4",
  },
  {
    id: "u10",
    name: "Морозов А. Л.",
    role: "manager",
    pos: "Управляющий филиалом",
    level: 2,
    branchId: 4,
    parentId: "u2",
  },
  {
    id: "u11",
    name: "Зайцев К. В.",
    role: "staff",
    pos: "Техник",
    level: 3,
    branchId: 4,
    parentId: "u10",
  },
  {
    id: "u12",
    name: "Тошматов Ж. Б.",
    role: "staff",
    pos: "Заведующий складом",
    level: 3,
    branchId: 3,
    parentId: "u4",
  },
  {
    id: "u13",
    name: "Каримова Д. А.",
    role: "staff",
    pos: "Оператор iiko",
    level: 3,
    branchId: 3,
    parentId: "u4",
  },
  {
    id: "u14",
    name: "Сидорова Л. И.",
    role: "accountant",
    pos: "Старший бухгалтер",
    level: 2,
    branchId: 1,
    parentId: "u3",
  },
  {
    id: "u15",
    name: "Юсупова Г. М.",
    role: "finance",
    pos: "Главный бухгалтер",
    level: 2,
    branchId: null,
    parentId: "u3",
  },
];
const POSITIONS = [
  { id: "p1", title: "Генеральный директор", level: 1 },
  { id: "p2", title: "Операционный директор", level: 1 },
  { id: "p3", title: "Финансист", level: 2 },
  { id: "p4", title: "Управляющий филиалом", level: 2 },
  { id: "p5", title: "Бухгалтер", level: 3 },
  { id: "p6", title: "Системный администратор", level: 3 },
  { id: "p7", title: "Техник", level: 3 },
  { id: "p8", title: "Линейный сотрудник", level: 4 },
  { id: "p9", title: "Заведующий складом", level: 3 },
  { id: "p10", title: "Оператор iiko", level: 3 },
  { id: "p11", title: "Старший бухгалтер", level: 2 },
  { id: "p12", title: "Главный бухгалтер", level: 2 },
];
const DEFAULT_SLA = { Критический: 2, Высокий: 8, Обычный: 24 };
const SOP_STEPS = {
  "IT-поддержка": [
    "Диагностировать проблему",
    "Проверить питание и подключение",
    "Устранить сбой или заменить узел",
    "Проверить работу вместе с пользователем",
    "Прикрепить фото/скрин результата",
  ],
  "Ремонт оборудования": [
    "Осмотреть оборудование, зафиксировать неисправность",
    "Устранить неисправность",
    "Проверить работу после ремонта",
    "Прикрепить фотоотчёт (через камеру)",
  ],
  "Финансы / Закупка": [
    "Сверить сумму со счётом",
    "Проверить бюджетный лимит филиала",
    "Приложить скан счёта",
    "Дождаться согласования",
  ],
  Прочее: [
    "Выполнить задачу",
    "Зафиксировать результат",
    "Прикрепить подтверждение",
  ],
};
const DEFAULT_SOPS = Object.fromEntries(
  Object.entries(SOP_STEPS).map(([k, v]) => [
    k,
    { steps: v, requirePhoto: true },
  ]),
);

// Отделы (границы доступа). restricted = закрытый отдел: его задачи видны
// только сотрудникам этого отдела, финансам и высшему руководству.
const DEPARTMENTS = [
  { id: "d1", name: "Финансовый отдел", restricted: true },
  { id: "d2", name: "IT-отдел", restricted: false },
  { id: "d3", name: "Эксплуатация", restricted: false },
  { id: "d4", name: "Снабжение", restricted: false },
  { id: "d5", name: "Управление", restricted: false },
];
// Какой отдел отвечает за категорию задачи (используется при создании заявки)
const CAT_DEPT = {
  "IT-поддержка": "d2",
  "Ремонт оборудования": "d3",
  "Финансы / Закупка": "d1",
  Прочее: "d4",
};
// Привязка демо-сотрудников к отделам
const USER_DEPT = {
  u1: "d5",
  u2: "d5",
  u3: "d1",
  u4: "d5",
  u5: "d5",
  u6: "d2",
  u7: "d3",
  u8: "d1",
  u9: "d4",
  u10: "d5",
  u11: "d3",
  u12: "d4",
  u13: "d4",
  u14: "d1",
  u15: "d1",
};

// Шаблоны процессов (маршруты согласования) — упорядоченные шаги с ответственными.
const ROUTE_TEMPLATES = [
  {
    id: "r1",
    name: "Приёмка товара и оплата",
    category: "Финансы / Закупка",
    steps: [
      {
        title: "Приёмка товара",
        actor: "Заведующий складом",
        action: "Принял товар",
        photo: true,
        doc: false,
      },
      {
        title: "Приходная накладная",
        actor: "Оператор iiko",
        action: "Оформил приходную накладную",
        photo: false,
        doc: true,
        docLabel: "Приходная накладная",
      },
      {
        title: "Проверка оприходования",
        actor: "Старший бухгалтер",
        action: "Проверил оприходование",
        photo: false,
        doc: false,
        check: true,
      },
      {
        title: "Проверка и оплата",
        actor: "Главный бухгалтер",
        action: "Проверил всё и провёл оплату",
        photo: false,
        doc: true,
        docLabel: "Счёт-фактура",
        check: true,
        pay: true,
      },
    ],
  },
];
const routeById = (id) => ORG.routes.find((r) => r.id === id);
function assignByActor(actor, branchId) {
  const cands = ORG.users.filter((u) => u.pos === actor && u.active !== false);
  return (
    cands.find((u) => u.branchId === branchId) ||
    cands[0] ||
    ORG.users[0]
  )?.id;
}

// Живой реестр оргструктуры: редактируется в Админ-панели, читается хелперами.
let ORG = {
  companies: COMPANIES,
  branches: BRANCHES,
  positions: POSITIONS,
  users: USERS,
  departments: DEPARTMENTS,
  catDept: CAT_DEPT,
  routes: ROUTE_TEMPLATES,
  budgets: BRANCH_BUDGET,
  sla: DEFAULT_SLA,
  sops: DEFAULT_SOPS,
};
function syncOrg(s) {
  if (!s) return;
  ORG = {
    companies: s.companies || COMPANIES,
    branches: s.branches || BRANCHES,
    positions: s.positions || POSITIONS,
    users: s.users || USERS,
    departments: s.departments || DEPARTMENTS,
    catDept: s.catDept || CAT_DEPT,
    routes: s.routes || ROUTE_TEMPLATES,
    budgets: s.budgets || BRANCH_BUDGET,
    sla: s.sla || DEFAULT_SLA,
    sops: s.sops || DEFAULT_SOPS,
  };
}
const userById = (id) => ORG.users.find((u) => u.id === id);
const branchById = (id) => ORG.branches.find((b) => b.id === id);
const companyOfBranch = (id) => {
  const b = branchById(id);
  return b ? ORG.companies.find((c) => c.id === b.companyId) : null;
};
const deptById = (id) => ORG.departments.find((d) => d.id === id);
const deptForCategory = (cat) => ORG.catDept[cat] || "d4";
const budgetFor = (id) => ORG.budgets[id] || 0;
const slaFor = (pr) => (ORG.sla[pr] != null ? ORG.sla[pr] : 24);
const sopFor = (cat) =>
  ORG.sops[cat] || ORG.sops["Прочее"] || { steps: [], requirePhoto: false };

/* ----------------------------- демо-данные -------------------------------- */
const TASK_SPEC = [
  {
    t: "Не работает терминал оплаты",
    d: "Терминал безналичной оплаты не проводит платежи, на кассе скопилась очередь.",
    b: 3,
    e: "u6",
    c: "u4",
    ph: 3,
    cat: "IT-поддержка",
    pr: "Критический",
    slaH: -1,
    com: 2,
    att: 1,
    fav: true,
  },
  {
    t: "Протёк кондиционер в зале",
    d: "Кондиционер в главном зале течёт, есть риск порчи документов.",
    b: 3,
    e: "u6",
    c: "u4",
    ph: 4,
    cat: "Ремонт оборудования",
    pr: "Высокий",
    slaH: 1,
    com: 5,
    att: 2,
  },
  {
    t: "Заявка на закупку ТМЦ (бумага, картриджи)",
    d: "Нужно закупить бумагу А4 и картриджи для филиала.",
    b: 3,
    e: "u9",
    c: "u4",
    ph: 2,
    cat: "Финансы / Закупка",
    pr: "Обычный",
    slaH: 20,
    com: 1,
    att: 0,
    amount: 45000,
  },
  {
    t: "Счёт на оплату аренды помещения",
    d: "Поступил счёт на аренду за текущий месяц, требуется согласование.",
    b: 1,
    e: "u8",
    c: "u3",
    ph: 4,
    cat: "Финансы / Закупка",
    pr: "Высокий",
    slaH: 4,
    com: 3,
    att: 1,
    amount: 90000,
  },
  {
    t: "Сломался принтер, не печатает накладные",
    d: "Принтер на складе перестал печатать, накладные не выгружаются.",
    b: 2,
    e: "u7",
    c: "u5",
    ph: 1,
    cat: "IT-поддержка",
    pr: "Высокий",
    slaH: 8,
    com: 0,
    att: 0,
  },
  {
    t: "Ремонт холодильной витрины",
    d: "Витрина не держала температуру, вызывали мастера.",
    b: 2,
    e: "u7",
    c: "u5",
    ph: 5,
    cat: "Ремонт оборудования",
    pr: "Высокий",
    slaH: -40,
    com: 8,
    att: 3,
    amount: 150000,
  },
  {
    t: "Замена ламп освещения в зале",
    d: "Перегорели лампы, заменили на новые.",
    b: 3,
    e: "u9",
    c: "u4",
    ph: 5,
    cat: "Ремонт оборудования",
    pr: "Обычный",
    slaH: -50,
    com: 2,
    att: 1,
    amount: 8000,
  },
  {
    t: "Обновление кассового ПО",
    d: "Установили обновление кассовой программы на всех кассах.",
    b: 3,
    e: "u6",
    c: "u4",
    ph: 5,
    cat: "IT-поддержка",
    pr: "Обычный",
    slaH: -30,
    com: 4,
    att: 0,
  },
  {
    t: "Не открывается замок склада",
    d: "Заклинило замок на складе, нет доступа к товару.",
    b: 4,
    e: "u11",
    c: "u10",
    ph: 1,
    cat: "Ремонт оборудования",
    pr: "Критический",
    slaH: 2,
    com: 0,
    att: 0,
    amount: 5000,
  },
  {
    t: "Закупка оборудования для филиала",
    d: "Требуется закупка нового оборудования, счёт на согласовании.",
    b: 4,
    e: "u11",
    c: "u10",
    ph: 4,
    cat: "Финансы / Закупка",
    pr: "Высокий",
    slaH: 6,
    com: 2,
    att: 1,
    amount: 150000,
  },
  {
    t: "Авария: прорыв трубы, затопление",
    d: "Прорвало трубу в подсобном помещении, идёт затопление.",
    b: 4,
    e: "u11",
    c: "u10",
    ph: 3,
    cat: "Ремонт оборудования",
    pr: "Критический",
    slaH: -0.5,
    com: 6,
    att: 1,
    amount: 95000,
    fav: true,
  },
  {
    t: "Заявка на отпуск",
    d: "Прошу предоставить ежегодный оплачиваемый отпуск.",
    b: 3,
    e: "u9",
    c: "u4",
    ph: 2,
    cat: "Прочее",
    pr: "Обычный",
    slaH: 40,
    com: 0,
    att: 0,
  },
  {
    t: "Слетел роутер, нет интернета",
    d: "Пропал интернет на филиале, не работают онлайн-кассы.",
    b: 2,
    e: "u7",
    c: "u5",
    ph: 3,
    cat: "IT-поддержка",
    pr: "Высокий",
    slaH: 2,
    com: 3,
    att: 0,
  },
  {
    t: "Списание просроченных продуктов",
    d: "Списание партии просроченных продуктов по акту.",
    b: 3,
    e: "u9",
    c: "u4",
    ph: 5,
    cat: "Прочее",
    pr: "Обычный",
    slaH: -60,
    com: 1,
    att: 1,
    amount: 12000,
  },
  {
    t: "Ремонт кофемашины",
    d: "Кофемашина не варит кофе, требуется ремонт.",
    b: 4,
    e: "u11",
    c: "u10",
    ph: 5,
    cat: "Ремонт оборудования",
    pr: "Обычный",
    slaH: -20,
    com: 3,
    att: 1,
    amount: 30000,
  },
  {
    t: "Повторный ремонт кофемашины",
    d: "Кофемашина снова вышла из строя через неделю после ремонта.",
    b: 4,
    e: "u11",
    c: "u10",
    ph: 3,
    cat: "Ремонт оборудования",
    pr: "Высокий",
    slaH: 3,
    com: 2,
    att: 0,
    amount: 35000,
    overBudget: true,
  },
];

function makeSeed() {
  const now = Date.now();
  const tasks = TASK_SPEC.map((s, i) => {
    let createdAt;
    if (s.ph === 1) createdAt = now - (15 + (i % 5) * 5) * M;
    else if (s.ph === 2) createdAt = now - (1 + (i % 3)) * H;
    else if (s.ph === 3) createdAt = now - (1 + (i % 2)) * D;
    else if (s.ph === 4) createdAt = now - (2 + (i % 2)) * D;
    else createdAt = now - (5 + (i % 4)) * D;
    return {
      id: "t" + (i + 1),
      title: s.t,
      description: s.d,
      branchId: s.b,
      departmentId: CAT_DEPT[s.cat] || "d4",
      executorId: s.e,
      controllerId: s.c,
      createdBy: s.c,
      phase: s.ph,
      cat: s.cat,
      pr: s.pr,
      amount: s.amount || null,
      overBudget: !!s.overBudget,
      attachments: s.att || 0,
      favorite: !!s.fav,
      createdAt,
      slaDeadline: now + s.slaH * H,
      comments: Array.from({ length: s.com || 0 }, (_, k) => ({
        userId: k % 2 ? s.c : s.e,
        text: [
          "Принято в работу.",
          "Уточнил детали у поставщика.",
          "Жду подтверждения.",
          "Прикрепил фото.",
          "Готово, проверьте.",
          "Перепроверил ещё раз.",
        ][k % 6],
        at: createdAt + (k + 1) * 30 * M,
      })),
    };
  });

  const history = [];
  tasks.forEach((t, i) => {
    let prev = t.createdAt;
    const push = (userId, action, from, to, atRaw) => {
      const at = Math.min(Math.max(atRaw, prev + M), now - M);
      prev = at;
      history.push({ id: uid(), taskId: t.id, userId, action, from, to, at });
    };
    push(t.createdBy, "created", null, 1, t.createdAt);
    if (t.phase >= 2)
      push(t.executorId, "viewed", 1, 2, t.createdAt + (8 + (i % 5) * 3) * M);
    if (t.phase >= 3)
      push(t.executorId, "start", 2, 3, t.createdAt + (12 + (i % 4) * 4) * H);
    if (t.phase >= 4)
      push(t.executorId, "review", 3, 4, t.createdAt + (16 + (i % 4) * 3) * H);
    if (t.phase >= 5)
      push(t.controllerId, "done", 4, 5, t.createdAt + (40 + (i % 5) * 6) * H);
  });

  const openIds = ["u4", "u5", "u6", "u7", "u9", "u10", "u11"];
  const shifts = {};
  USERS.forEach((u) => {
    shifts[u.id] = {
      open: openIds.includes(u.id),
      openedAt: openIds.includes(u.id) ? now - 4 * H : null,
    };
  });

  // демо-табель: смены за прошедшие дни
  const timesheet = [];
  [
    "u4",
    "u5",
    "u6",
    "u7",
    "u8",
    "u9",
    "u10",
    "u11",
    "u12",
    "u13",
    "u14",
  ].forEach((id, k) => {
    for (let d = 1; d <= 4; d++) {
      const end = now - d * D + (2 - (k % 3)) * H;
      const dur = (8 + ((k + d) % 3)) * H + (k % 2 ? 30 * M : 0);
      timesheet.push({
        id: uid(),
        userId: id,
        start: end - dur,
        end,
        durationMs: dur,
      });
    }
  });

  // демо-отчёты по кассам филиалов
  const cashReports = [];
  const dstr = (ms) => {
    const dt = new Date(ms);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  };
  const BR_MGR = { 1: "u8", 2: "u5", 3: "u4", 4: "u10", 5: "u4" };
  const rnd = (base, p) => Math.round((base * p) / 1000) * 1000;
  [1, 2, 3, 4, 5].forEach((bId, bi) => {
    for (let d = 1; d <= 6; d++) {
      const base = 6_000_000 + bi * 1_400_000 + ((d * 37) % 9) * 300_000;
      const fiscal = rnd(base, 0.55),
        nonFiscal = rnd(base, 0.12);
      const humo = rnd(base, 0.11),
        uzcard = rnd(base, 0.07),
        click = rnd(base, 0.05),
        payme = rnd(base, 0.06);
      const uzumTezkor = d % 3 === 0 ? rnd(base, 0.02) : 0,
        yandex = d % 2 === 0 ? rnd(base, 0.03) : 0;
      const transfer = d % 4 === 0 ? rnd(base, 0.04) : 0,
        transferCount = transfer ? 1 + (d % 3) : 0;
      const expenses = rnd(base, 0.15),
        debt = d % 5 === 0 ? 200_000 : 0,
        noPay = d % 6 === 0 ? 150_000 : 0;
      const total =
        fiscal +
        nonFiscal +
        humo +
        uzcard +
        click +
        payme +
        uzumTezkor +
        yandex +
        transfer;
      const iiko = total + ((d % 3) - 1) * 50_000;
      const diff = total - iiko;
      const confirmed = d >= 3;
      cashReports.push({
        id: uid(),
        date: dstr(now - d * D),
        branchId: bId,
        userId: BR_MGR[bId],
        createdAt: now - d * D,
        status: confirmed ? "confirmed" : "submitted",
        submittedAt: now - d * D,
        confirmedAt: confirmed ? now - (d - 1) * D : undefined,
        confirmedBy: confirmed ? "u1" : undefined,
        comment:
          diff !== 0 ? "Расхождение по эквайрингу, уточняется у банка" : "",
        expensesNote: expenses
          ? [
              "Закупка продуктов на рынке",
              "Хозтовары и упаковка",
              "Мелкий ремонт оборудования",
              "Такси для доставки, вода",
            ][d % 4]
          : "",
        transfer,
        transferCount,
        fiscal,
        nonFiscal,
        humo,
        uzcard,
        click,
        payme,
        uzumTezkor,
        yandex,
        debt,
        noPay,
        expenses,
        iiko,
      });
    }
  });

  // демо-инкассации (передачи наличных в головной офис)
  const cashHandovers = [];
  [1, 2, 3, 4, 5].forEach((bId) => {
    const cashTotal = cashReports
      .filter((r) => r.branchId === bId)
      .reduce((a, r) => a + (r.fiscal || 0) + (r.nonFiscal || 0), 0);
    const part1 = Math.round((cashTotal * 0.6) / 1000) * 1000;
    const part2 = Math.round((cashTotal * 0.25) / 1000) * 1000;
    cashHandovers.push({
      id: uid(),
      branchId: bId,
      date: dstr(now - 3 * D),
      amount: part1,
      via: "Инкассатор банка",
      note: "",
      userId: BR_MGR[bId],
      createdAt: now - 3 * D,
      status: "received",
      receivedBy: "u1",
      receivedAt: now - 2 * D,
    });
    cashHandovers.push({
      id: uid(),
      branchId: bId,
      date: dstr(now - 1 * D),
      amount: part2,
      via: "Водитель офиса",
      note: "",
      userId: BR_MGR[bId],
      createdAt: now - 1 * D,
      status: "sent",
    });
  });

  return {
    tasks,
    history,
    shifts,
    timesheet,
    cashReports,
    cashHandovers,
    currentUserId: "u4",
    companies: COMPANIES.map((c) => ({ ...c })),
    branches: BRANCHES.map((b) => ({ ...b })),
    positions: POSITIONS.map((p) => ({ ...p })),
    users: USERS.map((u) => ({
      ...u,
      active: true,
      departmentId: USER_DEPT[u.id] || "d5",
    })),
    departments: DEPARTMENTS.map((d) => ({ ...d })),
    catDept: { ...CAT_DEPT },
    routes: ROUTE_TEMPLATES.map((r) => ({
      ...r,
      steps: r.steps.map((st) => ({ ...st })),
    })),
    budgets: { ...BRANCH_BUDGET },
    sla: { ...DEFAULT_SLA },
    sops: JSON.parse(JSON.stringify(DEFAULT_SOPS)),
    settings: {
      voiceInput: true,
      watermark: true,
      ipRestrict: false,
      lang: "ru",
    },
  };
}

/* ---------------- карта «когда задача вошла в фазу» (по журналу) ----------- */
function getEnter(history) {
  const enter = {};
  [...history]
    .sort((a, z) => a.at - z.at)
    .forEach((h) => {
      if (h.to == null) return;
      enter[h.taskId] = enter[h.taskId] || {};
      if (enter[h.taskId][h.to] == null) enter[h.taskId][h.to] = h.at;
    });
  return enter;
}

/* ----------------------------- бюджеты ------------------------------------ */
// Потрачено по филиалу за месяц (заявки в работе + завершённые с суммой)
function spentForBranch(tasks, branchId, now) {
  return tasks
    .filter(
      (t) =>
        t.branchId === branchId &&
        t.amount &&
        t.phase >= 2 &&
        now - t.createdAt < 30 * D,
    )
    .reduce((a, t) => a + t.amount, 0);
}

/* ---------------------- симуляция ИИ (Этап 4) ----------------------------- */
function aiParse(text) {
  const s = text.toLowerCase();
  const map = [
    ["север", 2],
    ["юг", 3],
    ["восток", 4],
    ["центр", 1],
  ];
  let branchId = 3;
  for (const [k, id] of map)
    if (s.includes(k)) {
      branchId = id;
      break;
    }
  let cat = "Прочее";
  if (
    /(терминал|принтер|компьютер|интернет|роутер|сервер|касс|по\b|программ|1с)/.test(
      s,
    )
  )
    cat = "IT-поддержка";
  else if (
    /(кондиционер|потек|потёк|течёт|течет|сломал|не работает|ремонт|замок|труб|витрин|лампа|освещ|затопл|кофемашин|холодильник)/.test(
      s,
    )
  )
    cat = "Ремонт оборудования";
  else if (
    /(счёт|счет|оплат|деньг|бюджет|закуп|аренд|инвойс|накладн|товар|пакет)/.test(
      s,
    )
  )
    cat = "Финансы / Закупка";
  let pr = "Обычный";
  if (
    /(срочно|критич|горит|авари|прорыв|сейчас|немедленно|очеред|заканчива)/.test(
      s,
    )
  )
    pr = "Критический";
  else if (/(сегодня|быстро|важно|высок)/.test(s)) pr = "Высокий";
  let amount = null;
  const mt = s.replace(/\s/g, "").match(/(\d{4,})(сум|so['’]?m|som|руб|р|₽)/i);
  if (mt) amount = parseInt(mt[1], 10);
  const slaH = slaFor(pr);
  return { branchId, cat, pr, amount, slaH };
}
function pickExecutor(branchId, cat) {
  const inB = ORG.users.filter(
    (u) => u.branchId === branchId && u.active !== false,
  );
  const want =
    cat === "IT-поддержка"
      ? ["Системный администратор", "Техник"]
      : cat === "Ремонт оборудования"
        ? ["Техник", "Системный администратор"]
        : cat.startsWith("Финансы")
          ? ["Бухгалтер", "Линейный сотрудник"]
          : ["Линейный сотрудник", "Техник"];
  for (const w of want) {
    const f = inB.find((u) => u.pos === w);
    if (f) return f.id;
  }
  const any = inB.find((u) => u.role === "staff" || u.role === "sysadmin");
  return any ? any.id : "u6";
}
function pickController(branchId) {
  const m = ORG.users.find(
    (u) =>
      u.role === "manager" && u.branchId === branchId && u.active !== false,
  );
  return m ? m.id : "u2";
}
function aiSummary(t) {
  const ex = userById(t.executorId),
    ct = userById(t.controllerId);
  const stage =
    t.phase >= 5
      ? "Задача завершена и принята контролёром."
      : t.phase === 4
        ? "Работа выполнена и ожидает финальной проверки контролёра."
        : t.phase === 3
          ? "Задача в активной работе у исполнителя."
          : "Задача зафиксирована, идёт реакция ответственных.";
  return (
    `Суть: ${t.title.toLowerCase()}. Категория — ${t.cat}, приоритет — ${t.pr}. ` +
    `Исполнитель — ${ex?.pos} (${ex?.name}), контроль — ${ct?.pos} (${ct?.name}). ` +
    `${stage} Обсуждений в карточке: ${t.comments.length}.`
  );
}
const VOICE_SAMPLES = [
  "На филиале Юг сломался терминал оплаты, очередь на кассе, срочно нужен мастер!",
  "На центральном складе заканчиваются фирменные пакеты, осталось две коробки, закажите ещё 500 штук",
  "На Севере не печатает принтер накладные, надо сегодня починить",
  "На Востоке опять потекла труба в подсобке, заливает, срочно",
];

/* ---------------- ИИ-ревизор: аномалии и системные инциденты --------------- */
function detectAnomalies(tasks, history, now) {
  const enter = getEnter(history);
  // средняя сумма по категории (для поиска ценовых аномалий)
  const sums = {},
    cnt = {};
  tasks.forEach((t) => {
    if (t.amount) {
      sums[t.cat] = (sums[t.cat] || 0) + t.amount;
      cnt[t.cat] = (cnt[t.cat] || 0) + 1;
    }
  });
  const avgCat = {};
  Object.keys(sums).forEach((k) => (avgCat[k] = sums[k] / cnt[k]));

  const flags = {}; // taskId -> [строки]
  tasks.forEach((t) => {
    const f = [];
    const m = enter[t.id] || {};
    if (
      t.phase >= 5 &&
      m[5] &&
      m[5] - t.createdAt < 5 * M &&
      t.slaDeadline - t.createdAt > H
    )
      f.push("Подозрительно быстрое закрытие (возможно фиктивно)");
    if (t.amount && avgCat[t.cat] && t.amount > 1.4 * avgCat[t.cat])
      f.push("Сумма на 40%+ выше средней по категории");
    if (t.overBudget) f.push("Превышение бюджета филиала");
    if (f.length) flags[t.id] = f;
  });

  // системные инциденты: 3+ задач одной категории на одном филиале за 30 дней
  const groups = {};
  tasks.forEach((t) => {
    if (now - t.createdAt > 30 * D) return;
    const key = t.branchId + "|" + t.cat;
    (groups[key] = groups[key] || []).push(t);
  });
  const incidents = Object.entries(groups)
    .filter(([, arr]) => arr.length >= 3)
    .map(([key, arr]) => {
      const [bid, cat] = key.split("|");
      return {
        branchId: +bid,
        cat,
        count: arr.length,
        total: arr.reduce((a, t) => a + (t.amount || 0), 0),
      };
    })
    .sort((a, z) => z.count - a.count);

  return { flags, incidents };
}

/* ------------------------------- reducer ---------------------------------- */
function hist(taskId, userId, action, from, to, note) {
  return {
    id: uid(),
    taskId,
    userId,
    action,
    from,
    to,
    at: Date.now(),
    note: note || null,
  };
}
function routePhase(step, len) {
  return step >= len ? 5 : step === 0 ? 1 : step === len - 1 ? 4 : 3;
}
function init() {
  return {
    ...makeSeed(),
    view: "inbox",
    selectedId: null,
    filters: { company: "all", branch: "all", period: "all" },
    hydrated: false,
  };
}
function reducer(s, a) {
  switch (a.type) {
    case "HYDRATE":
      return { ...s, ...a.data, hydrated: true };
    case "MARK_HYDRATED":
      return { ...s, hydrated: true };
    case "SET_VIEW":
      return { ...s, view: a.view, selectedId: null };
    case "SELECT": {
      const t = s.tasks.find((x) => x.id === a.id);
      let tasks = s.tasks,
        history = s.history;
      if (t && t.phase === 1 && !t.routeId) {
        const me = s.currentUserId;
        if (t.executorId === me || t.controllerId === me) {
          tasks = s.tasks.map((x) => (x.id === t.id ? { ...x, phase: 2 } : x));
          history = [...s.history, hist(t.id, me, "viewed", 1, 2)];
        }
      }
      return { ...s, tasks, history, selectedId: a.id };
    }
    case "CLOSE_TASK":
      return { ...s, selectedId: null };
    case "SET_USER":
      return {
        ...s,
        currentUserId: a.id,
        selectedId: null,
        filters: { company: "all", branch: "all", period: "all" },
      };
    case "TOGGLE_SHIFT": {
      const cur = s.shifts[a.id] || { open: false };
      const open = !cur.open;
      const now = Date.now();
      let timesheet = s.timesheet || [];
      if (!open && cur.openedAt) {
        timesheet = [
          {
            id: uid(),
            userId: a.id,
            start: cur.openedAt,
            end: now,
            durationMs: Math.max(0, now - cur.openedAt),
          },
          ...timesheet,
        ];
      }
      return {
        ...s,
        timesheet,
        shifts: { ...s.shifts, [a.id]: { open, openedAt: open ? now : null } },
      };
    }
    case "ADVANCE":
      return {
        ...s,
        tasks: s.tasks.map((x) => (x.id === a.id ? { ...x, phase: a.to } : x)),
        history: [
          ...s.history,
          hist(a.id, s.currentUserId, a.action, a.from, a.to),
        ],
      };
    case "TOGGLE_FAV":
      return {
        ...s,
        tasks: s.tasks.map((x) =>
          x.id === a.id ? { ...x, favorite: !x.favorite } : x,
        ),
      };
    case "ADD_COMMENT":
      return {
        ...s,
        tasks: s.tasks.map((x) =>
          x.id === a.id
            ? {
                ...x,
                comments: [
                  ...x.comments,
                  { userId: s.currentUserId, text: a.text, at: Date.now() },
                ],
              }
            : x,
        ),
        history: [
          ...s.history,
          hist(a.id, s.currentUserId, "comment", null, null),
        ],
      };
    case "CREATE_TASK":
      return {
        ...s,
        view: "inbox",
        selectedId: a.task.id,
        tasks: [a.task, ...s.tasks],
        history: [
          ...s.history,
          hist(a.task.id, a.task.createdBy, "created", null, 1),
        ],
      };
    case "SET_FILTER":
      return { ...s, filters: { ...s.filters, [a.key]: a.value } };
    case "ADD_USER":
      return { ...s, users: [...s.users, a.user] };
    case "UPDATE_USER":
      return {
        ...s,
        users: s.users.map((u) => (u.id === a.id ? { ...u, ...a.patch } : u)),
      };
    case "ADD_POSITION":
      return { ...s, positions: [...s.positions, a.position] };
    case "ADD_COMPANY":
      return { ...s, companies: [...s.companies, a.company] };
    case "ROUTE_ADVANCE": {
      const tasks = s.tasks.map((t) => {
        if (t.id !== a.id) return t;
        const ns = t.currentStep + 1;
        return {
          ...t,
          currentStep: ns,
          phase: routePhase(ns, t.steps.length),
          attachments: (t.attachments || 0) + (a.addAtt || 0),
        };
      });
      return {
        ...s,
        tasks,
        history: [
          ...s.history,
          hist(a.id, a.userId, "step", null, null, a.note),
        ],
      };
    }
    case "ROUTE_RETURN": {
      const tasks = s.tasks.map((t) => {
        if (t.id !== a.id) return t;
        const ns = Math.max(0, t.currentStep - 1);
        return { ...t, currentStep: ns, phase: routePhase(ns, t.steps.length) };
      });
      return {
        ...s,
        tasks,
        history: [
          ...s.history,
          hist(a.id, a.userId, "return", null, null, a.note),
        ],
      };
    }
    case "ADD_ROUTE":
      return { ...s, routes: [...s.routes, a.route] };
    case "UPDATE_ROUTE":
      return {
        ...s,
        routes: s.routes.map((r) => (r.id === a.id ? { ...r, ...a.patch } : r)),
      };
    case "ADD_DEPARTMENT":
      return { ...s, departments: [...s.departments, a.department] };
    case "UPDATE_DEPARTMENT":
      return {
        ...s,
        departments: s.departments.map((d) =>
          d.id === a.id ? { ...d, ...a.patch } : d,
        ),
      };
    case "SET_CATDEPT":
      return { ...s, catDept: { ...s.catDept, [a.category]: a.departmentId } };
    case "ADD_BRANCH":
      return {
        ...s,
        branches: [...s.branches, a.branch],
        budgets: { ...s.budgets, [a.branch.id]: a.branch.monthly || 0 },
      };
    case "SET_BUDGET":
      return { ...s, budgets: { ...s.budgets, [a.branchId]: a.value } };
    case "SET_SLA":
      return { ...s, sla: { ...s.sla, [a.priority]: a.hours } };
    case "SET_SOP":
      return {
        ...s,
        sops: {
          ...s.sops,
          [a.category]: { steps: a.steps, requirePhoto: a.requirePhoto },
        },
      };
    case "SET_SETTING":
      return { ...s, settings: { ...(s.settings || {}), [a.key]: a.value } };
    case "SAVE_CASH_REPORT": {
      const list = s.cashReports || [];
      const at = Date.now();
      const idx = list.findIndex(
        (r) => r.branchId === a.report.branchId && r.date === a.report.date,
      );
      const next =
        idx >= 0
          ? list.map((r, i) =>
              i === idx
                ? {
                    ...r,
                    ...a.report,
                    id: r.id,
                    createdAt: r.createdAt,
                    status: "submitted",
                    submittedAt: at,
                    updatedAt: at,
                  }
                : r,
            )
          : [
              {
                ...a.report,
                id: uid(),
                createdAt: at,
                status: "submitted",
                submittedAt: at,
              },
              ...list,
            ];
      return { ...s, cashReports: next };
    }
    case "CONFIRM_CASH_REPORT":
      return {
        ...s,
        cashReports: (s.cashReports || []).map((r) =>
          r.id === a.id
            ? {
                ...r,
                status: "confirmed",
                confirmedAt: Date.now(),
                confirmedBy: a.userId,
              }
            : r,
        ),
      };
    case "DELETE_CASH_REPORT":
      return {
        ...s,
        cashReports: (s.cashReports || []).filter((r) => r.id !== a.id),
      };
    case "ADD_HANDOVER":
      return {
        ...s,
        cashHandovers: [
          { ...a.handover, id: uid(), status: "sent", createdAt: Date.now() },
          ...(s.cashHandovers || []),
        ],
      };
    case "CONFIRM_HANDOVER":
      return {
        ...s,
        cashHandovers: (s.cashHandovers || []).map((h) =>
          h.id === a.id
            ? {
                ...h,
                status: "received",
                receivedBy: a.userId,
                receivedAt: Date.now(),
              }
            : h,
        ),
      };
    case "DELETE_HANDOVER":
      return {
        ...s,
        cashHandovers: (s.cashHandovers || []).filter((h) => h.id !== a.id),
      };
    case "RESET":
      return { ...init(), ...makeSeed(), hydrated: true, view: s.view };
    default:
      return s;
  }
}

/* --------------------- видимость задач по ролям (RBAC) -------------------- */
// Видимость задач = граница доступа по ОТДЕЛАМ.
// Правила: высшее руководство видит всё; свои задачи (исполнитель/контролёр)
// видны всегда; задачи своего отдела — видны; финансы видят денежные задачи
// и закрытые (финансовые) отделы; управляющий филиала видит НЕзакрытые задачи
// своего филиала. Чужой закрытый отдел (например, финансовый) — недоступен.
function visibleTasks(tasks, user) {
  if (user.role === "director") return tasks;
  const dept = user.departmentId;
  const restricted = new Set(
    ORG.departments.filter((d) => d.restricted).map((d) => d.id),
  );
  return tasks.filter((t) => {
    if (t.executorId === user.id || t.controllerId === user.id) return true; // своя задача
    if (t.assignees && t.assignees.includes(user.id)) return true; // участник маршрута
    if (dept != null && t.departmentId === dept) return true; // свой отдел
    if (
      (user.role === "finance" || user.role === "accountant") &&
      (t.amount || restricted.has(t.departmentId))
    )
      return true; // финконтроль
    if (
      user.role === "manager" &&
      t.branchId === user.branchId &&
      !restricted.has(t.departmentId)
    )
      return true; // свой филиал, кроме закрытых отделов
    return false;
  });
}
function applyFilters(tasks, f, now) {
  return tasks.filter((t) => {
    if (f.branch !== "all" && t.branchId !== +f.branch) return false;
    if (f.company !== "all") {
      const b = branchById(t.branchId);
      if (!b || b.companyId !== +f.company) return false;
    }
    if (f.period !== "all") {
      const span = f.period === "7" ? 7 * D : 30 * D;
      if (now - t.createdAt > span) return false;
    }
    return true;
  });
}

/* ----------------------------- персистентность ----------------------------- */
const store = {
  async load() {
    try {
      if (typeof window !== "undefined" && window.storage) {
        const r = await window.storage.get(STORAGE_KEY);
        return r ? JSON.parse(r.value) : null;
      }
    } catch (e) {}
    return null;
  },
  async save(data) {
    try {
      if (typeof window !== "undefined" && window.storage)
        await window.storage.set(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {}
  },
};

/* ----------------------------- мелкие компоненты --------------------------- */
function Avatar({ id, size = 28 }) {
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
function PhasePill({ phase, small }) {
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
function MiniRail({ phase }) {
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
function PhaseRail({ phase }) {
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
function Badge({ children, color = C.sub, bg = C.line }) {
  return (
    <span
      className="rounded-full font-semibold"
      style={{ background: bg, color, padding: "2px 9px", fontSize: 12 }}
    >
      {children}
    </span>
  );
}
function BigBtn({ children, color, icon: Icon, onClick, outline, disabled }) {
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
function Meta({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: C.faint, fontWeight: 600 }}>
        {label}
      </div>
      <div style={{ fontSize: 14, color: C.ink, fontWeight: 600 }}>{value}</div>
    </div>
  );
}
function Field({ label, children }) {
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
function Select({ value, onChange, options }) {
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
function Kpi({ label, value, tone }) {
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
function Ring({ value, label, color, size = 132 }) {
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

/* ------------------------------ карточка задачи ---------------------------- */
function TaskCard({ t, now, onOpen, onFav, anomaly }) {
  const p = PHASES[t.phase - 1];
  const sla = slaInfo(t, now);
  const b = branchById(t.branchId);
  return (
    <button
      onClick={() => onOpen(t.id)}
      className="relative w-full text-left rounded-2xl bg-white overflow-hidden transition focus:outline-none"
      style={{
        border: `1px solid ${C.border}`,
        boxShadow: "0 1px 2px rgba(15,23,42,.04)",
      }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.boxShadow = "0 8px 24px rgba(15,23,42,.10)")
      }
      onMouseLeave={(e) =>
        (e.currentTarget.style.boxShadow = "0 1px 2px rgba(15,23,42,.04)")
      }
    >
      <span
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 5,
          background: p.color,
        }}
      />
      <div className="p-3 pl-4">
        <div className="flex items-start justify-between gap-2">
          <h4
            className="font-bold leading-snug"
            style={{
              color: C.ink,
              fontSize: 15,
              overflowWrap: "break-word",
              minWidth: 0,
            }}
          >
            {t.title}
          </h4>
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onFav(t.id);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.stopPropagation();
                onFav(t.id);
              }
            }}
            className="shrink-0 -mr-1 -mt-1 p-1 rounded-lg"
            title="В избранное"
          >
            <Star
              size={18}
              fill={t.favorite ? "#FACC15" : "none"}
              color={t.favorite ? "#FACC15" : C.faint}
            />
          </span>
        </div>
        <div className="mt-1" style={{ fontSize: 13, color: C.sub }}>
          {b?.name} • {t.cat}
        </div>

        {anomaly && (
          <div
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg"
            style={{
              background: "#FEF2F2",
              color: C.bad,
              padding: "3px 8px",
              fontSize: 11.5,
              fontWeight: 600,
            }}
          >
            <AlertTriangle size={13} /> ИИ-ревизор: аномалия
          </div>
        )}

        <div className="mt-2.5 space-y-1.5" style={{ fontSize: 13 }}>
          <div
            className="flex items-center gap-2 min-w-0"
            style={{ color: C.sub }}
          >
            <Avatar id={t.executorId} size={22} />
            <span className="flex-1 min-w-0 truncate">
              <b style={{ color: C.ink, fontWeight: 600 }}>
                {tr("Исполнитель:")}
              </b>{" "}
              {userById(t.executorId)?.name}
            </span>
          </div>
          <div
            className="flex items-center gap-2 min-w-0"
            style={{ color: C.sub }}
          >
            <Avatar id={t.controllerId} size={22} />
            <span className="flex-1 min-w-0 truncate">
              <b style={{ color: C.ink, fontWeight: 600 }}>
                {tr("Контролёр:")}
              </b>{" "}
              {userById(t.controllerId)?.name}
            </span>
          </div>
        </div>

        <div className="mt-2.5">
          <MiniRail phase={t.phase} />
        </div>

        <div className="mt-2.5 flex items-center justify-between">
          <span
            className="inline-flex items-center gap-1.5 rounded-lg font-semibold"
            style={{
              fontSize: 12.5,
              color: sla.color,
              background: t.phase >= 5 ? C.line : sla.color + "14",
              padding: "3px 9px",
            }}
          >
            <Clock size={13} /> {sla.text}
          </span>
          <div
            className="flex items-center gap-3"
            style={{ color: C.faint, fontSize: 13 }}
          >
            <span className="inline-flex items-center gap-1">
              <MessageSquare size={14} /> {t.comments.length}
            </span>
            <span className="inline-flex items-center gap-1">
              <Paperclip size={14} /> {t.attachments}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}

/* ---------------------------- доска (Канбан) ------------------------------- */
function Board({ tasks, now, onOpen, onFav, flags }) {
  const counts = PHASES.map((p) => tasks.filter((t) => t.phase === p.n).length);
  const firstNonEmpty = (PHASES.find((p, i) => counts[i] > 0) || PHASES[0]).n;
  const [active, setActive] = useState(firstNonEmpty);
  const colCards = (n) => tasks.filter((t) => t.phase === n);
  const Cards = ({ n }) => {
    const col = colCards(n);
    if (col.length === 0)
      return (
        <div
          className="text-center py-6"
          style={{ color: C.faint, fontSize: 13 }}
        >
          {tr("Нет задач")}
        </div>
      );
    return (
      <>
        {col.map((t) => (
          <TaskCard
            key={t.id}
            t={t}
            now={now}
            onOpen={onOpen}
            onFav={onFav}
            anomaly={!!(flags && flags[t.id])}
          />
        ))}
      </>
    );
  };
  return (
    <>
      {/* Телефон/планшет: переключатель фаз + одна колонка (всё помещается, без горизонтальной прокрутки) */}
      <div className="xl:hidden">
        <div className="flex flex-wrap gap-1.5 pb-1">
          {PHASES.map((p, i) => {
            const on = active === p.n;
            return (
              <button
                key={p.n}
                onClick={() => setActive(p.n)}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-bold"
                style={{
                  background: on ? p.color : "#fff",
                  color: on ? "#fff" : C.ink,
                  border: `1px solid ${on ? p.color : C.border}`,
                  fontSize: 12.5,
                  whiteSpace: "nowrap",
                }}
              >
                <span
                  style={{
                    background: on ? "#fff" : p.color,
                    width: 8,
                    height: 8,
                    borderRadius: 99,
                  }}
                />
                {tr(p.label)}
                <span
                  className="rounded-full font-bold"
                  style={{
                    background: on ? "rgba(255,255,255,.25)" : p.soft,
                    color: on ? "#fff" : p.color,
                    fontSize: 11,
                    padding: "0 7px",
                  }}
                >
                  {counts[i]}
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-col gap-2.5 mt-1">
          <Cards n={active} />
        </div>
      </div>

      {/* Десктоп (xl+): 5 равных колонок во всю ширину — без горизонтального ползунка */}
      <div
        className="hidden xl:grid gap-3"
        style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))" }}
      >
        {PHASES.map((p, i) => (
          <div key={p.n} className="min-w-0">
            <div className="flex items-center gap-2 px-1 pb-2.5">
              <span
                className="shrink-0"
                style={{
                  background: p.color,
                  width: 10,
                  height: 10,
                  borderRadius: 99,
                }}
              />
              <span
                className="font-bold uppercase truncate"
                style={{ color: C.ink, fontSize: 11.5, letterSpacing: ".03em" }}
              >
                {tr(p.label)}
              </span>
              <span
                className="ml-auto shrink-0 rounded-full font-bold"
                style={{
                  background: p.soft,
                  color: p.color,
                  fontSize: 11.5,
                  padding: "1px 8px",
                }}
              >
                {counts[i]}
              </span>
            </div>
            <div
              className="flex flex-col gap-2.5 rounded-2xl p-2"
              style={{
                background: "#FBFCFE",
                border: `1px dashed ${C.border}`,
                minHeight: 120,
              }}
            >
              <Cards n={p.n} />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/* ----------------------------- деталь задачи ------------------------------- */
function TaskDetail({
  t,
  now,
  me,
  history,
  dispatch,
  notify,
  anomalyFlags,
  shiftOpen,
  onClose,
}) {
  const [comment, setComment] = useState("");
  const [summary, setSummary] = useState(null);
  const sop = sopFor(t.cat);
  const steps = sop.steps;
  const needPhoto = sop.requirePhoto;
  const [checks, setChecks] = useState(() => steps.map(() => false));
  const [photoTaken, setPhotoTaken] = useState(false);

  const isExec = t.executorId === me.id;
  const isCtrl = t.controllerId === me.id;
  const sla = slaInfo(t, now);
  const b = branchById(t.branchId);
  const co = companyOfBranch(t.branchId);
  const log = history
    .filter((h) => h.taskId === t.id)
    .sort((a, z) => a.at - z.at);
  const allChecked = checks.every(Boolean);
  const canFinish = allChecked && (!needPhoto || photoTaken);

  const act = (action, from, to, msg) => {
    dispatch({ type: "ADVANCE", id: t.id, action, from, to });
    notify(msg);
  };

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end"
      style={{
        background: "rgba(30,16,10,.42)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
      }}
      onClick={onClose}
    >
      <div
        className="h-full w-full bg-white overflow-y-auto fade-up"
        style={{ maxWidth: 560, boxShadow: "-24px 0 60px rgba(30,16,10,.22)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="sticky top-0 z-10 bg-white px-5 py-4 flex items-start justify-between gap-3"
          style={{ borderBottom: `1px solid ${C.border}` }}
        >
          <div className="min-w-0">
            <div
              className="flex items-center gap-2 mb-1"
              style={{ fontSize: 12.5, color: C.faint }}
            >
              <span>Заявка #{t.id.replace("t", "")}</span>
              <ChevronRight size={13} />
              <span className="truncate">{b?.name}</span>
            </div>
            <h2
              className="font-extrabold leading-tight"
              style={{ color: C.ink, fontSize: 18, overflowWrap: "break-word" }}
            >
              {t.title}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl shrink-0"
            style={{ background: C.line }}
            title="Закрыть"
          >
            <X size={18} color={C.sub} />
          </button>
        </div>

        <div className="px-5 py-5 space-y-5">
          <div
            className="rounded-2xl p-4"
            style={{ background: "#FBFCFE", border: `1px solid ${C.border}` }}
          >
            {t.routeId ? (
              <StepRail steps={t.steps} current={t.currentStep} />
            ) : (
              <PhaseRail phase={t.phase} />
            )}
          </div>

          {anomalyFlags && anomalyFlags.length > 0 && (
            <div
              className="rounded-2xl p-4"
              style={{ background: "#FEF2F2", border: `1px solid #FECACA` }}
            >
              <div
                className="flex items-center gap-2 font-bold mb-1.5"
                style={{ color: C.bad, fontSize: 14 }}
              >
                <AlertTriangle size={16} /> ИИ-ревизор обнаружил аномалии
              </div>
              <ul
                className="space-y-1"
                style={{ fontSize: 13, color: "#991B1B" }}
              >
                {anomalyFlags.map((f, i) => (
                  <li key={i}>• {f}</li>
                ))}
              </ul>
            </div>
          )}

          {/* блок ответственности */}
          <div
            className="rounded-2xl p-4 space-y-3"
            style={{ border: `1px solid ${C.border}` }}
          >
            {t.routeId ? (
              <RouteResp t={t} />
            ) : (
              <>
                <RespRow
                  id={t.executorId}
                  role={tr("Исполнитель — кто делает")}
                />
                <RespRow
                  id={t.controllerId}
                  role={tr("Контролёр — кто следит")}
                />
              </>
            )}
            <div
              className="flex items-center gap-2 rounded-xl px-3 py-2"
              style={{
                background: t.phase >= 5 ? C.line : sla.color + "14",
                color: sla.color,
                fontSize: 14,
                fontWeight: 700,
              }}
            >
              <Clock size={16} /> Срок (SLA): {sla.text}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3" style={{ fontSize: 13.5 }}>
            <Meta label={tr("Юр. лицо")} value={co?.name} />
            <Meta label={tr("Филиал")} value={b?.name} />
            <Meta label={tr("Категория")} value={t.cat} />
            <Meta
              label={tr("Отдел")}
              value={
                <span className="inline-flex items-center gap-1.5">
                  {deptById(t.departmentId)?.name || "—"}
                  {deptById(t.departmentId)?.restricted && (
                    <Lock size={12} color={C.bad} />
                  )}
                </span>
              }
            />
            <Meta label={tr("Приоритет")} value={tr(t.pr)} />
            <Meta label={tr("Создана")} value={fmtDateTime(t.createdAt)} />
            <Meta
              label={tr("Текущая фаза")}
              value={<PhasePill phase={t.phase} small />}
            />
          </div>

          <div>
            <div
              style={{
                fontSize: 12.5,
                color: C.faint,
                fontWeight: 600,
                marginBottom: 4,
              }}
            >
              {tr("Описание")}
            </div>
            <p style={{ fontSize: 14.5, color: C.ink, lineHeight: 1.55 }}>
              {t.description}
            </p>
          </div>

          {t.amount != null && (
            <div
              className="rounded-xl px-4 py-3"
              style={{ background: "#FBFCFE", border: `1px solid ${C.border}` }}
            >
              <div style={{ fontSize: 12.5, color: C.faint, fontWeight: 600 }}>
                Доп. поля (JSONB)
              </div>
              <div style={{ fontSize: 16, color: C.ink, fontWeight: 700 }}>
                {tr("Сумма")}: {fmtMoney(t.amount)}
              </div>
              {t.overBudget && (
                <div
                  className="mt-1 inline-flex items-center gap-1.5"
                  style={{ fontSize: 12.5, color: C.bad, fontWeight: 600 }}
                >
                  <Wallet size={14} /> Превышен бюджет филиала — требуется
                  одобрение финансиста
                </div>
              )}
            </div>
          )}

          {t.routeId && (
            <RouteFlow
              t={t}
              me={me}
              shiftOpen={shiftOpen}
              dispatch={dispatch}
              notify={notify}
            />
          )}

          {/* SOP чек-лист в фазе «В работе» для исполнителя */}
          {!t.routeId && isExec && t.phase === 3 && (
            <div
              className="rounded-2xl p-4"
              style={{ border: `1px solid ${C.border}` }}
            >
              <div
                className="flex items-center gap-2 font-bold mb-1"
                style={{ color: C.ink, fontSize: 15 }}
              >
                <ListChecks size={17} color={PHASES[2].color} /> Регламент
                (SOP): отметьте все шаги
              </div>
              <div style={{ fontSize: 12.5, color: C.sub, marginBottom: 10 }}>
                Кнопка «Выполнил» разблокируется только после всех шагов и фото.
              </div>
              <div className="space-y-2">
                {steps.map((st, i) => (
                  <label
                    key={i}
                    className="flex items-start gap-2.5 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={checks[i]}
                      onChange={() =>
                        setChecks((c) => c.map((v, k) => (k === i ? !v : v)))
                      }
                      style={{
                        width: 18,
                        height: 18,
                        marginTop: 1,
                        accentColor: PHASES[2].color,
                      }}
                    />
                    <span
                      style={{
                        fontSize: 14,
                        color: checks[i] ? C.faint : C.ink,
                        textDecoration: checks[i] ? "line-through" : "none",
                      }}
                    >
                      {st}
                    </span>
                  </label>
                ))}
              </div>
              {needPhoto && (
                <>
                  <button
                    onClick={() => {
                      setPhotoTaken(true);
                      notify("Фото сделано сейчас — метаданные проверены");
                    }}
                    className="mt-3 inline-flex items-center gap-2 rounded-xl px-3 py-2 font-semibold"
                    style={
                      photoTaken
                        ? {
                            background: "#E9F9EF",
                            color: C.ok,
                            border: `1px solid ${C.ok}`,
                          }
                        : { background: C.line, color: C.ink }
                    }
                  >
                    <Camera size={16} />{" "}
                    {photoTaken
                      ? "Фотоотчёт прикреплён"
                      : "Сделать фото (камера)"}
                  </button>
                  {!photoTaken && (
                    <div
                      style={{ fontSize: 11.5, color: C.faint, marginTop: 6 }}
                    >
                      Загрузка старого фото из галереи блокируется — нужен
                      снимок в реальном времени.
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* действия по ролям */}
          {!t.routeId && t.phase < 5 && (isExec || isCtrl) && !shiftOpen && (
            <div
              className="rounded-xl px-3 py-2.5 flex items-center gap-2"
              style={{
                background: "#FEF2F2",
                color: C.bad,
                fontSize: 13,
                border: `1px solid #FECACA`,
              }}
            >
              <Lock size={15} /> Смена закрыта — по регламенту безопасности
              доступен только просмотр. Откройте смену, чтобы менять статус.
            </div>
          )}
          {!t.routeId && t.phase < 5 && (isExec || isCtrl) && shiftOpen && (
            <div className="space-y-2">
              <div style={{ fontSize: 12.5, color: C.faint, fontWeight: 600 }}>
                Доступные действия для вашей роли
              </div>
              {isExec && (t.phase === 1 || t.phase === 2) && (
                <BigBtn
                  color={PHASES[2].color}
                  icon={Play}
                  onClick={() =>
                    act("start", t.phase, 3, "Задача взята в работу")
                  }
                >
                  Взять в работу
                </BigBtn>
              )}
              {isExec && t.phase === 3 && (
                <BigBtn
                  color={PHASES[3].color}
                  icon={Send}
                  disabled={!canFinish}
                  onClick={() =>
                    act("review", 3, 4, "Отправлено на проверку контролёру")
                  }
                >
                  {canFinish
                    ? "Выполнил — отправить на проверку"
                    : "Завершите чек-лист и фото"}
                </BigBtn>
              )}
              {isCtrl && t.phase === 4 && (
                <div className="grid grid-cols-1 gap-2">
                  <BigBtn
                    color={PHASES[4].color}
                    icon={CheckCircle2}
                    onClick={() =>
                      act("done", 4, 5, "Работа принята, задача завершена")
                    }
                  >
                    Принять и завершить
                  </BigBtn>
                  <BigBtn
                    color={C.warn}
                    icon={RotateCcw}
                    outline
                    onClick={() =>
                      act("return", 4, 3, "Возвращено исполнителю на доработку")
                    }
                  >
                    Вернуть на доработку
                  </BigBtn>
                </div>
              )}
              {((isExec && t.phase === 4) || (isCtrl && t.phase < 4)) && (
                <div
                  className="rounded-xl px-3 py-2.5 flex items-center gap-2"
                  style={{ background: C.line, color: C.sub, fontSize: 13 }}
                >
                  <Info size={15} /> Сейчас ход за{" "}
                  {isCtrl ? "исполнителем" : "контролёром"}. Кнопка появится на
                  нужной фазе.
                </div>
              )}
            </div>
          )}
          {!t.routeId && !isExec && !isCtrl && (
            <div
              className="rounded-xl px-3 py-2.5 flex items-center gap-2"
              style={{ background: C.line, color: C.sub, fontSize: 13 }}
            >
              <ShieldCheck size={15} /> Режим наблюдателя: вы видите задачу, но
              не назначены исполнителем или контролёром.
            </div>
          )}

          {/* AI саммари */}
          <div
            className="rounded-2xl p-4"
            style={{ border: `1px solid ${C.border}`, background: "#FBFCFE" }}
          >
            <button
              onClick={() => setSummary(aiSummary(t))}
              className="inline-flex items-center gap-2 rounded-xl px-3 py-2 font-bold text-white"
              style={{
                background: `linear-gradient(90deg, ${C.violet}, ${C.brandA})`,
                fontSize: 14,
              }}
            >
              <Bot size={16} /> {tr("Краткая суть (ИИ)")}
            </button>
            {summary && (
              <p
                className="mt-3"
                style={{ fontSize: 14, color: C.ink, lineHeight: 1.55 }}
              >
                {summary}
              </p>
            )}
          </div>

          {/* обсуждение */}
          <div>
            <div
              className="font-bold mb-2"
              style={{ color: C.ink, fontSize: 15 }}
            >
              {tr("Обсуждение")} ({t.comments.length})
            </div>
            <div className="space-y-3">
              {t.comments.map((c, i) => (
                <div key={i} className="flex gap-2.5">
                  <Avatar id={c.userId} size={28} />
                  <div
                    className="rounded-xl px-3 py-2 flex-1"
                    style={{ background: C.line }}
                  >
                    <div
                      style={{ fontSize: 13, fontWeight: 700, color: C.ink }}
                    >
                      {userById(c.userId)?.name}
                    </div>
                    <div style={{ fontSize: 14, color: C.ink }}>{c.text}</div>
                    <div
                      style={{ fontSize: 11.5, color: C.faint, marginTop: 2 }}
                    >
                      {fmtDateTime(c.at)}
                    </div>
                  </div>
                </div>
              ))}
              {t.comments.length === 0 && (
                <div style={{ fontSize: 13, color: C.faint }}>
                  Пока нет сообщений.
                </div>
              )}
            </div>
            <div className="mt-3 flex gap-2">
              <input
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && comment.trim()) {
                    dispatch({
                      type: "ADD_COMMENT",
                      id: t.id,
                      text: comment.trim(),
                    });
                    setComment("");
                  }
                }}
                placeholder="Написать сообщение…"
                className="flex-1 rounded-xl px-3 py-2.5 focus:outline-none"
                style={{
                  border: `1px solid ${C.border}`,
                  fontSize: 14,
                  color: C.ink,
                }}
              />
              <button
                onClick={() => {
                  if (comment.trim()) {
                    dispatch({
                      type: "ADD_COMMENT",
                      id: t.id,
                      text: comment.trim(),
                    });
                    setComment("");
                  }
                }}
                className="px-4 rounded-xl font-bold text-white"
                style={{ background: C.brandA, fontSize: 14 }}
              >
                Отправить
              </button>
            </div>
          </div>

          {/* неизменяемый журнал */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck size={16} color={C.ok} />
              <span
                className="font-bold"
                style={{ color: C.ink, fontSize: 15 }}
              >
                {tr("Журнал (неизменяемый)")}
              </span>
            </div>
            <div style={{ fontSize: 12, color: C.faint, marginBottom: 10 }}>
              Записи нельзя удалить или отредактировать — защита от споров «я не
              видел».
            </div>
            <div className="relative pl-5">
              <span
                style={{
                  position: "absolute",
                  left: 6,
                  top: 4,
                  bottom: 4,
                  width: 2,
                  background: C.border,
                }}
              />
              <div className="space-y-3.5">
                {log.map((h) => {
                  const dot = h.to ? PHASES[h.to - 1].color : C.faint;
                  return (
                    <div key={h.id} className="relative">
                      <span
                        style={{
                          position: "absolute",
                          left: -19,
                          top: 4,
                          width: 11,
                          height: 11,
                          borderRadius: 99,
                          background: dot,
                          boxShadow: "0 0 0 3px #fff",
                        }}
                      />
                      <div style={{ fontSize: 13.5, color: C.ink }}>
                        <b style={{ fontWeight: 700 }}>
                          {userById(h.userId)?.name}
                        </b>{" "}
                        — {ACTION_LABEL[h.action] || h.action}
                        {h.note && (
                          <span style={{ color: C.sub }}>: {h.note}</span>
                        )}
                        {h.from && h.to && (
                          <span style={{ color: C.sub }}>
                            {" "}
                            ({h.from}→{h.to})
                          </span>
                        )}
                      </div>
                      <div
                        style={{
                          fontSize: 11.5,
                          color: C.faint,
                          fontFamily: "ui-monospace, monospace",
                        }}
                      >
                        {fmtDateTime(h.at)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
function RespRow({ id, role }) {
  const u = userById(id);
  return (
    <div className="flex items-center gap-3 min-w-0">
      <div className="shrink-0">
        <Avatar id={id} size={40} />
      </div>
      <div className="min-w-0">
        <div style={{ fontSize: 12.5, color: C.faint, fontWeight: 600 }}>
          {role}
        </div>
        <div style={{ fontSize: 15, color: C.ink, fontWeight: 700 }}>
          {u?.name}
        </div>
        <div style={{ fontSize: 13, color: C.sub }}>{u?.pos}</div>
      </div>
    </div>
  );
}

/* --------------------------- создание заявки ------------------------------- */
function CreateTask({ me, tasks, now, dispatch, notify, voiceEnabled }) {
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState(null);

  const recognize = (raw) => {
    const input = raw != null ? raw : text;
    if (!input.trim()) return;
    const p = aiParse(input);
    setParsed({
      ...p,
      executorId: pickExecutor(p.branchId, p.cat),
      controllerId: pickController(p.branchId),
    });
  };
  const voice = () => {
    const sample =
      VOICE_SAMPLES[Math.floor(Math.random() * VOICE_SAMPLES.length)];
    setText(sample);
    recognize(sample);
    notify(
      "Демонстрация голосового ввода (реальная версия — распознавание речи)",
    );
  };

  const budget =
    parsed && parsed.amount
      ? (() => {
          const spent = spentForBranch(tasks, parsed.branchId, now);
          const limit = budgetFor(parsed.branchId);
          return { spent, limit, over: spent + parsed.amount > limit };
        })()
      : null;

  const create = () => {
    const over = !!(budget && budget.over);
    const ctrl = over ? "u3" : parsed.controllerId; // при перерасходе — на финансиста
    const task = {
      id: "t" + uid().slice(0, 6),
      title: text.trim().split("\n")[0].slice(0, 70),
      description: text.trim(),
      branchId: parsed.branchId,
      executorId: parsed.executorId,
      controllerId: ctrl,
      createdBy: me.id,
      phase: 1,
      cat: parsed.cat,
      pr: parsed.pr,
      amount: parsed.amount || null,
      overBudget: over,
      departmentId: deptForCategory(parsed.cat),
      attachments: 0,
      favorite: false,
      createdAt: now,
      slaDeadline: now + parsed.slaH * H,
      comments: [],
    };
    dispatch({ type: "CREATE_TASK", task });
    notify(
      over
        ? "Заявка создана и направлена финансисту (превышение бюджета)"
        : "Заявка создана и направлена исполнителю",
    );
    setText("");
    setParsed(null);
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div
        className="rounded-2xl bg-white p-6"
        style={{ border: `1px solid ${C.border}` }}
      >
        <div className="flex items-center gap-2 mb-1">
          <Sparkles size={20} color={C.violet} />
          <h2 className="font-extrabold" style={{ color: C.ink, fontSize: 20 }}>
            {tr("Что случилось?")}
          </h2>
        </div>
        <p style={{ fontSize: 14, color: C.sub, marginBottom: 14 }}>
          {tr(
            "Опишите простыми словами — система сама определит филиал, категорию, срочность и назначит ответственных.",
          )}
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          placeholder="Например: «На филиале Юг сломался терминал оплаты, очередь на кассе, срочно!»"
          className="w-full rounded-xl px-4 py-3 focus:outline-none resize-none"
          style={{
            border: `1px solid ${C.border}`,
            fontSize: 15,
            color: C.ink,
            lineHeight: 1.5,
          }}
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={() => recognize()}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 font-bold text-white"
            style={{
              background: `linear-gradient(90deg, ${C.violet}, ${C.brandA})`,
              fontSize: 14.5,
            }}
          >
            <Bot size={17} /> {tr("Распознать (ИИ)")}
          </button>
          {voiceEnabled && (
            <button
              onClick={voice}
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 font-bold"
              style={{ background: C.line, color: C.ink, fontSize: 14.5 }}
              title="Демонстрация голосового ввода"
            >
              <Mic size={17} /> {tr("Сказать задачу")}
            </button>
          )}
        </div>

        {parsed && (
          <div
            className="mt-5 rounded-2xl p-4 space-y-3"
            style={{ background: "#FBFCFE", border: `1px solid ${C.border}` }}
          >
            <div style={{ fontSize: 12.5, color: C.faint, fontWeight: 700 }}>
              ИИ распознал — проверьте и при необходимости поправьте:
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Филиал">
                <Select
                  value={parsed.branchId}
                  onChange={(v) =>
                    setParsed({
                      ...parsed,
                      branchId: +v,
                      executorId: pickExecutor(+v, parsed.cat),
                      controllerId: pickController(+v),
                    })
                  }
                  options={ORG.branches.map((b) => ({
                    value: b.id,
                    label: b.name,
                  }))}
                />
              </Field>
              <Field label="Категория">
                <Select
                  value={parsed.cat}
                  onChange={(v) =>
                    setParsed({
                      ...parsed,
                      cat: v,
                      executorId: pickExecutor(parsed.branchId, v),
                    })
                  }
                  options={[
                    "IT-поддержка",
                    "Ремонт оборудования",
                    "Финансы / Закупка",
                    "Прочее",
                  ].map((x) => ({ value: x, label: x }))}
                />
              </Field>
              <Field label="Приоритет">
                <Select
                  value={parsed.pr}
                  onChange={(v) =>
                    setParsed({ ...parsed, pr: v, slaH: slaFor(v) })
                  }
                  options={["Критический", "Высокий", "Обычный"].map((x) => ({
                    value: x,
                    label: tr(x),
                  }))}
                />
              </Field>
              <Field label="Срок (SLA)">
                <div
                  className="rounded-lg px-3 py-2"
                  style={{
                    background: "#fff",
                    border: `1px solid ${C.border}`,
                    fontSize: 14,
                    color: C.ink,
                  }}
                >
                  {parsed.slaH} ч
                </div>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="flex items-center gap-2">
                <Avatar id={parsed.executorId} size={30} />
                <div>
                  <div style={{ fontSize: 11.5, color: C.faint }}>
                    Исполнитель
                  </div>
                  <div
                    style={{ fontSize: 13.5, fontWeight: 700, color: C.ink }}
                  >
                    {userById(parsed.executorId)?.name}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Avatar
                  id={budget && budget.over ? "u3" : parsed.controllerId}
                  size={30}
                />
                <div>
                  <div style={{ fontSize: 11.5, color: C.faint }}>
                    Контролёр
                  </div>
                  <div
                    style={{ fontSize: 13.5, fontWeight: 700, color: C.ink }}
                  >
                    {
                      userById(
                        budget && budget.over ? "u3" : parsed.controllerId,
                      )?.name
                    }
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap pt-1">
              <span style={{ fontSize: 12.5, color: C.faint }}>Отдел:</span>
              <Badge color={C.brandA} bg="#EFF4FF">
                {deptById(deptForCategory(parsed.cat))?.name}
              </Badge>
              {deptById(deptForCategory(parsed.cat))?.restricted && (
                <Badge color={C.bad} bg="#FEECEC">
                  закрытый — видят только отдел и руководство
                </Badge>
              )}
            </div>

            {parsed.amount != null && (
              <div
                className="rounded-xl px-3 py-2.5"
                style={{
                  background: "#fff",
                  border: `1px solid ${budget.over ? "#FECACA" : C.border}`,
                }}
              >
                <div
                  className="flex items-center gap-1.5 font-bold mb-1"
                  style={{ fontSize: 13, color: budget.over ? C.bad : C.ink }}
                >
                  <Wallet size={15} /> Бюджет филиала «
                  {branchById(parsed.branchId)?.name}»
                </div>
                <div style={{ fontSize: 12.5, color: C.sub }}>
                  Лимит: {fmtMoney(budget.limit)} · Потрачено:{" "}
                  {fmtMoney(budget.spent)} · Эта заявка:{" "}
                  {fmtMoney(parsed.amount)}
                </div>
                {budget.over && (
                  <div
                    className="mt-1.5"
                    style={{ fontSize: 12.5, color: C.bad, fontWeight: 600 }}
                  >
                    ⚠ Превышение лимита — заявка уйдёт на ручное одобрение
                    финансисту.
                  </div>
                )}
              </div>
            )}

            <button
              onClick={create}
              className="w-full mt-1 rounded-xl py-3 font-bold text-white"
              style={{
                background: C.brandA,
                fontSize: 15,
                boxShadow: `0 6px 16px ${C.brandA}33`,
              }}
            >
              Создать заявку
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* --------------------------- расчёт аналитики ------------------------------ */
function computeAnalytics(tasks, history, now) {
  const enter = getEnter(history);
  const ids = new Set(tasks.map((t) => t.id));

  const funnel = [];
  for (let p = 1; p <= 4; p++) {
    const durs = [];
    tasks.forEach((t) => {
      const m = enter[t.id];
      if (m && m[p] != null && m[p + 1] != null) durs.push(m[p + 1] - m[p]);
    });
    const avg = durs.length ? durs.reduce((a, b) => a + b, 0) / durs.length : 0;
    funnel.push({ from: p, to: p + 1, avg, count: durs.length });
  }
  const maxAvg = Math.max(1, ...funnel.map((f) => f.avg));
  const bottleneckIdx = funnel.reduce(
    (best, f, i) => (f.avg > funnel[best].avg ? i : best),
    0,
  );

  const execIds = [...new Set(tasks.map((t) => t.executorId))];
  const eff = execIds
    .map((id) => {
      const own = tasks.filter((t) => t.executorId === id);
      let overdue = 0;
      const reactions = [];
      own.forEach((t) => {
        const m = enter[t.id] || {};
        if (m[2] != null) reactions.push(m[2] - t.createdAt);
        if (t.phase >= 5) {
          if ((m[5] || 0) > t.slaDeadline) overdue++;
        } else if (now > t.slaDeadline) overdue++;
      });
      const total = own.length;
      const rate = total ? Math.round(((total - overdue) / total) * 100) : 100;
      const avgReact = reactions.length
        ? reactions.reduce((a, b) => a + b, 0) / reactions.length
        : 0;
      return { id, total, overdue, rate, avgReact };
    })
    .sort((a, z) => z.rate - a.rate);

  const byBranch = {};
  tasks.forEach((t) => {
    if (t.amount) byBranch[t.branchId] = (byBranch[t.branchId] || 0) + t.amount;
  });
  const fin = Object.entries(byBranch)
    .map(([bid, value]) => ({ name: branchById(+bid)?.name, value }))
    .sort((a, z) => z.value - a.value);
  const toPay = tasks
    .filter((t) => t.phase === 4 && t.amount)
    .reduce((a, t) => a + t.amount, 0);

  const overdueAll = tasks.filter(
    (t) => t.phase < 5 && now > t.slaDeadline,
  ).length;
  const slaRate = tasks.length
    ? Math.round(((tasks.length - overdueAll) / tasks.length) * 100)
    : 100;

  return {
    funnel,
    maxAvg,
    bottleneckIdx,
    eff,
    fin,
    toPay,
    active: tasks.filter((t) => t.phase < 5).length,
    overdueAll,
    done: tasks.filter((t) => t.phase >= 5).length,
    slaRate,
  };
}

/* ----------------------- кабина директора (Этап 5) ------------------------- */
function Analytics({ tasks, history, now, filters, dispatch, role, notify }) {
  const a = useMemo(
    () => computeAnalytics(tasks, history, now),
    [tasks, history, now],
  );
  const { incidents } = useMemo(
    () => detectAnomalies(tasks, history, now),
    [tasks, history, now],
  );
  const canFilter = role === "director" || role === "finance";

  const exportCsv = () => {
    const rows = [
      [
        "ФИО",
        "Должность",
        "Всего",
        "Просрочено",
        "Ср. реакция (мин)",
        "Рейтинг %",
      ],
    ];
    a.eff.forEach((e) => {
      const u = userById(e.id);
      rows.push([
        u?.name,
        u?.pos,
        e.total,
        e.overdue,
        Math.round(e.avgReact / M),
        e.rate,
      ]);
    });
    const csv = "\uFEFF" + rows.map((r) => r.join(";")).join("\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "effektivnost.csv";
    link.click();
    URL.revokeObjectURL(url);
    notify("CSV-файл выгружен");
  };

  return (
    <div className="space-y-5">
      <div
        className="rounded-2xl bg-white p-4 flex flex-wrap items-center gap-3"
        style={{ border: `1px solid ${C.border}` }}
      >
        <span
          className="inline-flex items-center gap-1.5 font-bold"
          style={{ color: C.ink, fontSize: 13.5 }}
        >
          <Filter size={16} /> Фильтр:
        </span>
        {canFilter ? (
          <>
            <Select
              value={filters.company}
              onChange={(v) =>
                dispatch({ type: "SET_FILTER", key: "company", value: v })
              }
              options={[
                { value: "all", label: "Все юр. лица" },
                ...ORG.companies.map((c) => ({ value: c.id, label: c.name })),
              ]}
            />
            <Select
              value={filters.branch}
              onChange={(v) =>
                dispatch({ type: "SET_FILTER", key: "branch", value: v })
              }
              options={[
                { value: "all", label: "Все филиалы" },
                ...ORG.branches.map((b) => ({ value: b.id, label: b.name })),
              ]}
            />
            <Select
              value={filters.period}
              onChange={(v) =>
                dispatch({ type: "SET_FILTER", key: "period", value: v })
              }
              options={[
                { value: "all", label: "Всё время" },
                { value: "30", label: "30 дней" },
                { value: "7", label: "7 дней" },
              ]}
            />
          </>
        ) : (
          <span style={{ fontSize: 13, color: C.sub }}>
            Аналитика по вашей зоне ответственности.
          </span>
        )}
        <div className="ml-auto flex gap-2">
          <button
            onClick={exportCsv}
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 font-semibold"
            style={{
              border: `1px solid ${C.border}`,
              color: C.ink,
              fontSize: 13,
            }}
          >
            <Download size={15} /> CSV
          </button>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 font-semibold"
            style={{
              border: `1px solid ${C.border}`,
              color: C.ink,
              fontSize: 13,
            }}
          >
            <Printer size={15} /> Печать
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div
          className="rounded-2xl bg-white p-4 flex items-center justify-center"
          style={{ border: `1px solid ${C.border}` }}
        >
          <Ring
            value={a.slaRate}
            label="Соблюдение SLA по сети"
            color={lightTone(a.slaRate)}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 lg:col-span-3">
          <Kpi label="Активных задач" value={a.active} tone={C.brandA} />
          <Kpi
            label="Просрочено по SLA"
            value={a.overdueAll}
            tone={a.overdueAll > 0 ? C.bad : C.ok}
          />
          <Kpi label="Завершено" value={a.done} tone={C.ok} />
        </div>
      </div>

      {/* воронка */}
      <div
        className="rounded-2xl bg-white p-5"
        style={{ border: `1px solid ${C.border}` }}
      >
        <h3 className="font-bold mb-1" style={{ color: C.ink, fontSize: 17 }}>
          Воронка процессов: где «застревают» задачи
        </h3>
        <p style={{ fontSize: 13, color: C.sub, marginBottom: 16 }}>
          Среднее время перехода между фазами по неизменяемому журналу.
        </p>
        <div className="space-y-3.5">
          {a.funnel.map((f, i) => {
            const isBottle = i === a.bottleneckIdx && f.avg > 0;
            const w = Math.max(6, (f.avg / a.maxAvg) * 100);
            const color = PHASES[f.to - 1].color;
            return (
              <div key={i}>
                <div
                  className="flex items-center justify-between mb-1"
                  style={{ fontSize: 13.5 }}
                >
                  <span style={{ color: C.ink, fontWeight: 600 }}>
                    Фаза {f.from} ({PHASES[f.from - 1].label}) → {f.to} (
                    {PHASES[f.to - 1].label})
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <b style={{ color: isBottle ? C.bad : C.ink }}>
                      {f.avg ? fmtDur(f.avg) : "—"}
                    </b>
                    {isBottle && (
                      <Badge color={C.bad} bg="#FEECEC">
                        Узкое место
                      </Badge>
                    )}
                  </span>
                </div>
                <div
                  className="rounded-full"
                  style={{ height: 12, background: C.line }}
                >
                  <div
                    className="rounded-full"
                    style={{
                      width: w + "%",
                      height: 12,
                      background: isBottle ? C.bad : color,
                      transition: "width .4s",
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* инциденты (ИИ-ревизор) */}
      {incidents.length > 0 && (
        <div
          className="rounded-2xl bg-white p-5"
          style={{ border: `1px solid ${C.border}` }}
        >
          <div className="flex items-center gap-2 mb-1">
            <Activity size={18} color={C.bad} />
            <h3 className="font-bold" style={{ color: C.ink, fontSize: 17 }}>
              Карта инцидентов (системные сбои)
            </h3>
          </div>
          <p style={{ fontSize: 13, color: C.sub, marginBottom: 12 }}>
            ИИ объединяет повторяющиеся проблемы в один инцидент — повод для
            управленческого решения.
          </p>
          <div className="space-y-2.5">
            {incidents.map((inc, i) => (
              <div
                key={i}
                className="rounded-xl px-4 py-3 flex items-center gap-3"
                style={{ background: "#FEF2F2", border: `1px solid #FECACA` }}
              >
                <AlertTriangle size={18} color={C.bad} />
                <div className="flex-1">
                  <div
                    style={{ fontSize: 14, fontWeight: 700, color: "#991B1B" }}
                  >
                    Филиал «{branchById(inc.branchId)?.name}» · {inc.cat}
                  </div>
                  <div style={{ fontSize: 12.5, color: C.sub }}>
                    {inc.count} заявок за 30 дней
                    {inc.total ? ` · затраты ${fmtMoney(inc.total)}` : ""}.
                    Рекомендация ИИ: устранить причину, а не латать.
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* эффективность */}
        <div
          className="rounded-2xl bg-white p-5"
          style={{ border: `1px solid ${C.border}` }}
        >
          <h3 className="font-bold mb-3" style={{ color: C.ink, fontSize: 17 }}>
            Эффективность исполнителей
          </h3>
          <div>
            <table className="w-full" style={{ fontSize: 13 }}>
              <thead>
                <tr style={{ color: C.faint, textAlign: "left" }}>
                  <th className="pb-2 font-semibold">Сотрудник</th>
                  <th className="pb-2 font-semibold text-center">Всего</th>
                  <th className="pb-2 font-semibold text-center">Просроч.</th>
                  <th className="pb-2 font-semibold text-center">Реакция</th>
                  <th className="pb-2 font-semibold text-right">Рейтинг</th>
                </tr>
              </thead>
              <tbody>
                {a.eff.map((e) => {
                  const u = userById(e.id);
                  return (
                    <tr key={e.id} style={{ borderTop: `1px solid ${C.line}` }}>
                      <td className="py-2.5">
                        <div className="flex items-center gap-2">
                          <Avatar id={e.id} size={26} />
                          <div>
                            <div style={{ color: C.ink, fontWeight: 600 }}>
                              {u?.name}
                            </div>
                            <div style={{ color: C.faint, fontSize: 11.5 }}>
                              {u?.pos}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="text-center" style={{ color: C.ink }}>
                        {e.total}
                      </td>
                      <td
                        className="text-center"
                        style={{
                          color: e.overdue ? C.bad : C.sub,
                          fontWeight: e.overdue ? 700 : 400,
                        }}
                      >
                        {e.overdue}
                      </td>
                      <td className="text-center" style={{ color: C.sub }}>
                        {e.avgReact ? fmtDur(e.avgReact) : "—"}
                      </td>
                      <td className="text-right">
                        <span
                          className="font-bold"
                          style={{ color: lightTone(e.rate) }}
                        >
                          {e.rate}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* финансы */}
        <div
          className="rounded-2xl bg-white p-5"
          style={{ border: `1px solid ${C.border}` }}
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold" style={{ color: C.ink, fontSize: 17 }}>
              Затраты по филиалам
            </h3>
            <div className="text-right">
              <div style={{ fontSize: 11.5, color: C.faint }}>
                К выплате (на согласовании)
              </div>
              <div
                className="font-extrabold"
                style={{ color: C.violet, fontSize: 16 }}
              >
                {fmtMoney(a.toPay)}
              </div>
            </div>
          </div>
          {a.fin.length === 0 ? (
            <div
              className="py-10 text-center"
              style={{ color: C.faint, fontSize: 13 }}
            >
              Нет финансовых данных в выборке.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart
                data={a.fin}
                margin={{ top: 10, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#EDF1F7"
                  vertical={false}
                />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 13, fill: C.sub }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v) => v / 1000 + "к"}
                  tick={{ fontSize: 12, fill: C.faint }}
                  axisLine={false}
                  tickLine={false}
                  width={42}
                />
                <Tooltip
                  formatter={(v) => fmtMoney(v)}
                  cursor={{ fill: "#F1F5F9" }}
                  contentStyle={{
                    borderRadius: 12,
                    border: `1px solid ${C.border}`,
                    fontSize: 13,
                  }}
                />
                <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                  {a.fin.map((d, i) => (
                    <Cell key={i} fill={i === 0 ? C.brandA : "#93C5FD"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}

/* ----------------- личная аналитика «Мои достижения» ----------------------- */
function PersonalAchievements({ me, tasks, history, shift, now }) {
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

  if (total === 0) {
    return (
      <div
        className="rounded-2xl bg-white p-6"
        style={{ border: `1px solid ${C.border}` }}
      >
        <div className="flex items-center gap-3 mb-2">
          <Avatar id={me.id} size={48} />
          <div>
            <div
              className="font-extrabold"
              style={{ color: C.ink, fontSize: 19 }}
            >
              {me.name}
            </div>
            <div style={{ color: C.sub, fontSize: 14 }}>{me.pos}</div>
          </div>
        </div>
        <p style={{ color: C.sub, fontSize: 14 }}>
          Личная аналитика собирается по задачам, где вы — исполнитель. Войдите
          как исполнитель (например, «Петров А. И.» или «Зайцев К. В.») через
          меню профиля, чтобы увидеть экран достижений.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* шапка */}
      <div
        className="rounded-2xl bg-white p-5 flex flex-wrap items-center gap-4"
        style={{ border: `1px solid ${C.border}` }}
      >
        <Avatar id={me.id} size={52} />
        <div className="flex-1">
          <div
            className="font-extrabold"
            style={{ color: C.ink, fontSize: 20 }}
          >
            {me.name}
          </div>
          <div style={{ color: C.sub, fontSize: 14 }}>
            {me.pos}
            {me.branchId ? ` · Филиал «${branchById(me.branchId)?.name}»` : ""}
          </div>
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

/* ------------------------------ оргструктура ------------------------------- */
function OrgStructure() {
  return (
    <div className="space-y-5">
      {ORG.companies.map((co) => (
        <div
          key={co.id}
          className="rounded-2xl bg-white p-5"
          style={{ border: `1px solid ${C.border}` }}
        >
          <div className="flex items-center gap-2 mb-1">
            <Building2 size={18} color={C.brandA} />
            <h3
              className="font-extrabold"
              style={{ color: C.ink, fontSize: 18 }}
            >
              {co.name}
            </h3>
            <Badge>ИНН {co.inn}</Badge>
          </div>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
            {ORG.branches
              .filter((b) => b.companyId === co.id)
              .map((b) => {
                const staff = ORG.users
                  .filter((u) => u.branchId === b.id && u.active !== false)
                  .sort((a, z) => a.level - z.level);
                return (
                  <div
                    key={b.id}
                    className="rounded-xl p-4"
                    style={{
                      background: "#FBFCFE",
                      border: `1px solid ${C.border}`,
                    }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div
                        className="font-bold"
                        style={{ color: C.ink, fontSize: 15 }}
                      >
                        Филиал «{b.name}»
                      </div>
                      <Badge color={C.violet} bg="#F5F0FE">
                        Бюджет: {fmtMoney(budgetFor(b.id))}/мес
                      </Badge>
                    </div>
                    <div className="space-y-2">
                      {staff.length === 0 && (
                        <div style={{ fontSize: 13, color: C.faint }}>
                          Без сотрудников
                        </div>
                      )}
                      {staff.map((u) => (
                        <div
                          key={u.id}
                          className="flex items-center gap-2.5 min-w-0"
                          style={{ paddingLeft: (u.level - 1) * 12 }}
                        >
                          <Avatar id={u.id} size={28} />
                          <div className="min-w-0">
                            <div
                              style={{
                                fontSize: 13.5,
                                color: C.ink,
                                fontWeight: 600,
                              }}
                            >
                              {u.name}
                            </div>
                            <div style={{ fontSize: 12, color: C.sub }}>
                              {u.pos}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      ))}
      <div
        className="rounded-2xl bg-white p-5"
        style={{ border: `1px solid ${C.border}` }}
      >
        <div className="font-bold mb-2" style={{ color: C.ink, fontSize: 15 }}>
          Руководство (видит все филиалы)
        </div>
        <div className="flex flex-wrap gap-4">
          {ORG.users
            .filter((u) => u.branchId === null && u.active !== false)
            .map((u) => (
              <div key={u.id} className="flex items-center gap-2.5">
                <Avatar id={u.id} size={32} />
                <div>
                  <div style={{ fontSize: 14, color: C.ink, fontWeight: 600 }}>
                    {u.name}
                  </div>
                  <div style={{ fontSize: 12.5, color: C.sub }}>{u.pos}</div>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------- архив ------------------------------------ */
function ArchiveView({ tasks, onOpen }) {
  const done = tasks
    .filter((t) => t.phase >= 5)
    .sort((a, z) => z.createdAt - a.createdAt);
  return (
    <div
      className="rounded-2xl bg-white p-3"
      style={{ border: `1px solid ${C.border}` }}
    >
      {done.length === 0 && (
        <div className="py-10 text-center" style={{ color: C.faint }}>
          В архиве пока нет завершённых задач.
        </div>
      )}
      {done.map((t) => (
        <button
          key={t.id}
          onClick={() => onOpen(t.id)}
          className="w-full text-left flex items-start gap-3 px-3 py-3 rounded-xl"
          style={{ borderBottom: `1px solid ${C.line}` }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#F8FAFC")}
          onMouseLeave={(e) =>
            (e.currentTarget.style.background = "transparent")
          }
        >
          <CheckCircle2
            size={18}
            color={C.ok}
            className="shrink-0"
            style={{ marginTop: 2 }}
          />
          <div className="flex-1 min-w-0">
            <div
              className="font-semibold"
              style={{
                color: C.ink,
                fontSize: 14.5,
                overflowWrap: "break-word",
              }}
            >
              {t.title}
            </div>
            <div
              className="truncate"
              style={{ fontSize: 12.5, color: C.sub, marginTop: 1 }}
            >
              {branchById(t.branchId)?.name} • {t.cat}
              {t.amount ? ` • ${fmtMoney(t.amount)}` : ""}
            </div>
            <div style={{ fontSize: 11.5, color: C.faint, marginTop: 2 }}>
              {new Date(t.createdAt).toLocaleDateString("ru-RU", {
                timeZone: TZ,
              })}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

/* ------------------------------ о системе ---------------------------------- */
function StatusBadge({ ok }) {
  return ok ? (
    <Badge color={C.ok} bg="#E9F9EF">
      Работает в прототипе
    </Badge>
  ) : (
    <Badge color={C.brandA} bg="#EFF4FF">
      Бэкенд · дорожная карта
    </Badge>
  );
}
function AboutView() {
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

/* ------------------------------ кассы филиалов ----------------------------- */
const cashCalc = (r) => {
  const cash = (r.fiscal || 0) + (r.nonFiscal || 0);
  const acq =
    (r.humo || 0) +
    (r.uzcard || 0) +
    (r.click || 0) +
    (r.payme || 0) +
    (r.uzumTezkor || 0) +
    (r.yandex || 0);
  const total = cash + acq + (r.transfer || 0);
  return { cash, acq, total, diff: total - (r.iiko || 0) };
};
// «Сегодня» по Ташкенту (UTC+5) — не зависит от часового пояса устройства.
const ymdNow = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
const ymNow = () => ymdNow().slice(0, 7);
// ВАЖНО: поле объявлено на уровне модуля (не внутри CashRegisterView),
// иначе React пересоздаёт input на каждый символ и он теряет фокус.
// сжатие фото чека/товара до ~900px jpeg (для хранения в прототипе)
const compressPhoto = (file) =>
  new Promise((resolve, reject) => {
    const rd = new FileReader();
    rd.onload = () => {
      const img = new Image();
      img.onload = () => {
        try {
          const max = 900;
          let w = img.width,
            h = img.height;
          if (Math.max(w, h) > max) {
            const k = max / Math.max(w, h);
            w = Math.round(w * k);
            h = Math.round(h * k);
          }
          const cv = document.createElement("canvas");
          cv.width = w;
          cv.height = h;
          cv.getContext("2d").drawImage(img, 0, 0, w, h);
          resolve(cv.toDataURL("image/jpeg", 0.55));
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = reject;
      img.src = rd.result;
    };
    rd.onerror = reject;
    rd.readAsDataURL(file);
  });

// Стандартный дропдаун системы (нативный <select> нельзя стилизовать внутри —
// список рисует ОС, поэтому ключевые места используют этот компонент).
function NiceSelect({
  label,
  value,
  options,
  onChange,
  disabled,
  width,
  placeholder,
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
            style={{ position: "fixed", inset: 0, zIndex: 59 }}
          />
          <div
            className="rounded-2xl bg-white py-1.5"
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              left: 0,
              minWidth: "100%",
              width: "max-content",
              maxWidth: "min(280px, calc(100vw - 32px))",
              zIndex: 60,
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
function NiceDate({ label, value, onChange, min, max, disabled, width }) {
  const [open, setOpen] = useState(false);
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
            style={{ position: "fixed", inset: 0, zIndex: 59 }}
          />
          <div
            className="rounded-2xl bg-white p-3"
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              left: 0,
              zIndex: 60,
              width: 268,
              maxWidth: "calc(100vw - 32px)",
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

function CashNumField({ label, value, disabled, onChange }) {
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

function CashRegisterView({ s, me, dispatch, notify, branchScope }) {
  const branches = s.branches || [];
  const isMgr = me.role === "manager";
  const isController = ["director", "finance", "sysadmin"].includes(me.role); // контролёр / аудитор — все филиалы, подтверждение
  const canEditForm = isMgr || isController;
  const myBranch = me.branchId || (branches[0] && branches[0].id) || 1;
  const fBranch = isMgr ? myBranch : branchScope || 0; // 0 = все (общий охват из шапки)
  const H24 = 24 * H;
  const deadlineTs = (dateStr) => {
    const d = new Date(dateStr + "T00:00:00");
    d.setDate(d.getDate() + 1);
    d.setHours(12, 0, 0, 0);
    return d.getTime();
  };
  const pad = (n) => String(n).padStart(2, "0");
  const ymd = (d) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const dm = (s0) => s0.split("-").reverse().join(".");

  // ---------- период просмотра (как в iiko: пресеты + с/по) ----------
  const shiftD = (base, days) => {
    const d = new Date(base + "T00:00:00");
    d.setDate(d.getDate() + days);
    return ymd(d);
  };
  const monday = (base) => {
    const d = new Date(base + "T00:00:00");
    const wd = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - wd);
    return ymd(d);
  };
  const presetRange = (p) => {
    const today = ymdNow();
    const y = today.slice(0, 4);
    const m = today.slice(0, 7);
    if (p === "open") return { from: "2000-01-01", to: today };
    if (p === "today") return { from: today, to: today };
    if (p === "yesterday") {
      const d = shiftD(today, -1);
      return { from: d, to: d };
    }
    if (p === "curWeek")
      return { from: monday(today), to: shiftD(monday(today), 6) };
    if (p === "prevWeek") {
      const mo = shiftD(monday(today), -7);
      return { from: mo, to: shiftD(mo, 6) };
    }
    if (p === "curMonth") {
      const last = new Date(+y, +m.slice(5, 7), 0).getDate();
      return { from: `${m}-01`, to: `${m}-${pad(last)}` };
    }
    if (p === "prevMonth") {
      const d = new Date(+y, +m.slice(5, 7) - 2, 1);
      const mm = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
      const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      return { from: `${mm}-01`, to: `${mm}-${pad(last)}` };
    }
    if (p === "curYear") return { from: `${y}-01-01`, to: `${y}-12-31` };
    if (p === "prevYear") {
      const py = +y - 1;
      return { from: `${py}-01-01`, to: `${py}-12-31` };
    }
    return null; // custom
  };
  const PERIOD_PRESETS = [
    ["open", "Открытый период"],
    ["today", "Сегодня"],
    ["curWeek", "Текущая неделя"],
    ["curMonth", "Текущий месяц"],
    ["curYear", "Текущий год"],
    ["yesterday", "Вчера"],
    ["prevWeek", "Прошлая неделя"],
    ["prevMonth", "Прошлый месяц"],
    ["prevYear", "Прошлый год"],
    ["custom", "Другой…"],
  ];
  const [preset, setPreset] = useState("curMonth");
  const initR = presetRange("curMonth");
  const [from, setFrom] = useState(initR.from);
  const [to, setTo] = useState(initR.to);
  const pickPreset = (p) => {
    setPreset(p);
    const r = presetRange(p);
    if (r) {
      setFrom(r.from);
      setTo(r.to);
    }
  };

  const range = { from, to };

  const scope = (s.cashReports || []).filter(
    (r) =>
      r.date >= range.from &&
      r.date <= range.to &&
      (isMgr
        ? r.branchId === myBranch
        : fBranch
          ? r.branchId === fBranch
          : true),
  );
  const sorted = [...scope].sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : a.branchId - b.branchId,
  );
  const sum = (f) => scope.reduce((a, r) => a + (r[f] || 0), 0);
  const agg = scope.reduce(
    (o, r) => {
      const c = cashCalc(r);
      o.total += c.total;
      o.cash += c.cash;
      o.acq += c.acq;
      o.diff += c.diff;
      return o;
    },
    { total: 0, cash: 0, acq: 0, diff: 0 },
  );

  const periodLabel = `${tr((PERIOD_PRESETS.find(([k]) => k === preset) || [])[1] || "Период")}: ${dm(from)} — ${dm(to)}`;
  const branchLabel = isMgr
    ? branchById(myBranch)?.name || ""
    : fBranch
      ? branchById(fBranch)?.name || ""
      : tr("Все филиалы");

  // ---------- форма отчёта (управляющие) ----------
  const blank = {
    date: ymdNow(),
    branchId: myBranch,
    transfer: 0,
    transferCount: 0,
    fiscal: 0,
    nonFiscal: 0,
    humo: 0,
    uzcard: 0,
    click: 0,
    payme: 0,
    uzumTezkor: 0,
    yandex: 0,
    debt: 0,
    noPay: 0,
    expenses: 0,
    iiko: 0,
    comment: "",
    expensesNote: "",
    expensePhotos: [],
  };
  const [form, setForm] = useState({ ...blank });
  const existing = (s.cashReports || []).find(
    (r) => r.date === form.date && r.branchId === form.branchId,
  );
  useEffect(() => {
    const ex = (s.cashReports || []).find(
      (r) => r.date === form.date && r.branchId === form.branchId,
    );
    if (ex)
      setForm((f) => ({ ...blank, ...ex, date: f.date, branchId: f.branchId }));
    else setForm((f) => ({ ...blank, date: f.date, branchId: f.branchId }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.date, form.branchId, s.cashReports]);
  // при смене пользователя/роли синхронизируем филиал формы со своим
  useEffect(() => {
    if (isMgr) {
      setForm((f) =>
        f.branchId === myBranch ? f : { ...f, branchId: myBranch },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.id]);

  const dl = deadlineTs(form.date);
  const pastDeadline = Date.now() > dl;
  const isConfirmed = !!existing && existing.status === "confirmed";
  const editable = !isConfirmed && (isController || (isMgr && !pastDeadline));
  const dlStr = new Date(dl).toLocaleString("ru-RU", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const setNum = (k, v) => {
    if (!editable) return;
    setForm((f) => ({
      ...f,
      [k]: Math.max(0, parseInt(String(v).replace(/[^\d]/g, "") || "0", 10)),
    }));
  };
  const live = cashCalc(form);

  const save = () => {
    if (!editable) {
      notify(tr("Редактирование закрыто"));
      return;
    }
    if (!form.branchId) {
      notify(tr("Выберите филиал"));
      return;
    }
    if (live.diff !== 0 && !(form.comment || "").trim()) {
      notify(tr("Укажите комментарий к расхождению с iiko"));
      return;
    }
    if ((form.expenses || 0) > 0 && !(form.expensesNote || "").trim()) {
      notify(tr("Укажите, на что были расходы"));
      return;
    }
    dispatch({ type: "SAVE_CASH_REPORT", report: { ...form, userId: me.id } });
    notify(tr("Отчёт сдан и ожидает подтверждения"));
  };
  const confirmReport = (id) => {
    dispatch({ type: "CONFIRM_CASH_REPORT", id, userId: me.id });
    notify(tr("Отчёт подтверждён"));
  };

  // ---------- сейф филиала и инкассация ----------
  const allHandovers = s.cashHandovers || [];
  const safeStat = (bId) => {
    const cashIn = (s.cashReports || [])
      .filter((r) => r.branchId === bId)
      .reduce((a, r) => a + (r.fiscal || 0) + (r.nonFiscal || 0), 0);
    const hs = allHandovers.filter((h) => h.branchId === bId);
    const sent = hs.reduce((a, h) => a + (h.amount || 0), 0);
    const inTransit = hs
      .filter((h) => h.status === "sent")
      .reduce((a, h) => a + (h.amount || 0), 0);
    return { cashIn, sent, inTransit, balance: cashIn - sent };
  };
  const safeBranchId = isMgr ? myBranch : fBranch || 0;
  const safe = safeBranchId ? safeStat(safeBranchId) : null;
  const hoScope = allHandovers.filter(
    (h) =>
      h.date >= range.from &&
      h.date <= range.to &&
      (isMgr
        ? h.branchId === myBranch
        : fBranch
          ? h.branchId === fBranch
          : true),
  );
  const hoSorted = [...hoScope].sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
  );
  const hoWaiting = allHandovers.filter(
    (h) => h.status === "sent" && (isMgr ? h.branchId === myBranch : true),
  ).length;
  const [ho, setHo] = useState({ amount: 0, via: "", note: "" });
  const sendHandover = () => {
    const amt = ho.amount || 0;
    if (!safeBranchId) {
      notify(tr("Выберите филиал"));
      return;
    }
    if (amt <= 0) {
      notify(tr("Укажите сумму передачи"));
      return;
    }
    if (safe && amt > safe.balance) {
      notify(tr("Сумма больше остатка в сейфе"));
      return;
    }
    if (!(ho.via || "").trim()) {
      notify(tr("Укажите, через кого переданы деньги"));
      return;
    }
    dispatch({
      type: "ADD_HANDOVER",
      handover: {
        branchId: safeBranchId,
        date: ymdNow(),
        amount: amt,
        via: ho.via.trim(),
        note: (ho.note || "").trim(),
        userId: me.id,
      },
    });
    setHo({ amount: 0, via: "", note: "" });
    notify(tr("Передача отправлена — ожидает подтверждения офиса"));
  };
  const confirmHandover = (id) => {
    dispatch({ type: "CONFIRM_HANDOVER", id, userId: me.id });
    notify(tr("Приём денег подтверждён"));
  };
  const canDelHo = (h) =>
    isController
      ? true
      : isMgr && h.branchId === myBranch && h.status === "sent";

  // ---------- фото чеков к расходам ----------
  const [viewPhoto, setViewPhoto] = useState(null);
  const addPhotos = async (files) => {
    if (!editable) return;
    const cur = form.expensePhotos || [];
    const room = Math.max(0, 3 - cur.length);
    const list = Array.from(files || []).slice(0, room);
    if (!list.length) {
      if (room === 0) notify(tr("Максимум 3 фото"));
      return;
    }
    try {
      const added = [];
      for (const f of list)
        added.push({ id: uid(), dataUrl: await compressPhoto(f) });
      setForm((fm) => ({
        ...fm,
        expensePhotos: [...(fm.expensePhotos || []), ...added],
      }));
      notify(tr("Фото добавлено"));
    } catch (e) {
      notify(tr("Не удалось обработать фото"));
    }
  };
  const delPhoto = (id) =>
    setForm((fm) => ({
      ...fm,
      expensePhotos: (fm.expensePhotos || []).filter((x) => x.id !== id),
    }));

  // ---------- печать ----------
  const printReport = () => {
    const nf = (n) => Math.round(n || 0).toLocaleString("ru-RU");
    const esc = (t) =>
      String(t || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    const bcol = isMgr ? "" : "<th>" + tr("Филиал") + "</th>";
    const head =
      "<tr><th>" +
      tr("Дата") +
      "</th>" +
      bcol +
      "<th class=n>" +
      tr("Выручка") +
      "</th><th class=n>" +
      tr("Наличные") +
      "</th><th class=n>" +
      tr("Эквайринг") +
      "</th><th class=n>" +
      tr("Перечисл.") +
      "</th><th class=n>" +
      tr("Долг") +
      "</th><th class=n>" +
      tr("Без оплат") +
      "</th><th class=n>" +
      tr("Расходы") +
      "</th><th class=n>" +
      tr("Разница") +
      "</th><th>" +
      tr("Примечание") +
      "</th></tr>";
    const body = sorted
      .map((r) => {
        const c = cashCalc(r);
        const bc = isMgr
          ? ""
          : "<td>" + esc(branchById(r.branchId)?.name || "") + "</td>";
        const note = [
          r.expensesNote ? tr("Расходы") + ": " + r.expensesNote : "",
          r.comment || "",
        ]
          .filter(Boolean)
          .join("; ");
        return (
          "<tr><td>" +
          dm(r.date) +
          "</td>" +
          bc +
          "<td class=n>" +
          nf(c.total) +
          "</td><td class=n>" +
          nf(c.cash) +
          "</td><td class=n>" +
          nf(c.acq) +
          "</td><td class=n>" +
          (r.transfer
            ? nf(r.transfer) +
              (r.transferCount ? " (" + r.transferCount + ")" : "")
            : "—") +
          "</td><td class=n>" +
          (r.debt ? nf(r.debt) : "—") +
          "</td><td class=n>" +
          (r.noPay ? nf(r.noPay) : "—") +
          "</td><td class=n>" +
          nf(r.expenses) +
          "</td><td class=n>" +
          (c.diff === 0 ? "0" : (c.diff > 0 ? "+" : "") + nf(c.diff)) +
          "</td><td class=note>" +
          esc(note) +
          "</td></tr>"
        );
      })
      .join("");
    const totCol = isMgr ? "" : "<td></td>";
    const tot =
      "<tr class=tot><td>" +
      tr("Итого") +
      "</td>" +
      totCol +
      "<td class=n>" +
      nf(agg.total) +
      "</td><td class=n>" +
      nf(agg.cash) +
      "</td><td class=n>" +
      nf(agg.acq) +
      "</td><td class=n>" +
      nf(sum("transfer")) +
      "</td><td class=n>" +
      nf(sum("debt")) +
      "</td><td class=n>" +
      nf(sum("noPay")) +
      "</td><td class=n>" +
      nf(sum("expenses")) +
      "</td><td class=n>" +
      nf(agg.diff) +
      "</td><td></td></tr>";
    const html =
      "<html><head><meta charset='utf-8'><title>" +
      tr("Отчёт по кассам филиалов") +
      "</title><style>body{font-family:Arial,sans-serif;padding:24px;color:#111}h1{font-size:18px;margin:0}.meta{color:#555;font-size:13px;margin:6px 0 2px}table{border-collapse:collapse;width:100%;font-size:12px;margin-top:12px}th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}td.n,th.n{text-align:right;white-space:nowrap}td.note{font-size:11px;color:#444;max-width:220px}tr.tot td{font-weight:bold;background:#f3f4f6}</style></head><body><h1>" +
      tr("Отчёт по кассам филиалов") +
      "</h1><div class=meta>" +
      periodLabel +
      " · " +
      branchLabel +
      "</div><div class=meta>" +
      tr("(суммы в сум)") +
      "</div><table><thead>" +
      head +
      "</thead><tbody>" +
      body +
      tot +
      "</tbody></table></body></html>";
    try {
      const w = window.open("", "_blank");
      if (!w) {
        notify(tr("Разрешите всплывающие окна для печати"));
        return;
      }
      w.document.write(html);
      w.document.close();
      w.focus();
      setTimeout(() => {
        try {
          w.print();
        } catch (e) {}
      }, 350);
    } catch (e) {
      notify(tr("Печать недоступна в этом окне"));
    }
  };

  // ---------- ui-хелперы ----------
  const inpCls = "w-full rounded-xl px-3 py-2 mt-1";
  const inpSt = {
    border: `1px solid ${C.border}`,
    fontSize: 14,
    background: "#fff",
    color: C.ink,
  };
  const inp = (label, k) => (
    <CashNumField
      key={k}
      label={label}
      value={form[k]}
      disabled={!editable}
      onChange={(v) => setNum(k, v)}
    />
  );
  const Box = ({ label, value, color, bg }) => (
    <div
      className="rounded-xl px-3 py-2.5"
      style={{ background: bg || "#F8FAFC", border: `1px solid ${C.border}` }}
    >
      <div style={{ fontSize: 11, color: C.faint, fontWeight: 600 }}>
        {label}
      </div>
      <div
        className="font-extrabold"
        style={{
          fontSize: 15,
          color: color || C.ink,
          overflowWrap: "break-word",
          lineHeight: 1.15,
        }}
      >
        {fmtSum(value)}
      </div>
    </div>
  );
  const KPI = ({ label, value, color }) => (
    <div
      className="rounded-2xl bg-white p-4"
      style={{ border: `1px solid ${C.border}` }}
    >
      <div style={{ fontSize: 12, color: C.faint, fontWeight: 600 }}>
        {label}
      </div>
      <div
        className="font-extrabold mt-0.5"
        style={{
          fontSize: 18,
          color: color || C.ink,
          overflowWrap: "break-word",
          lineHeight: 1.15,
        }}
      >
        {fmtSum(value)}
      </div>
    </div>
  );
  const canDelete = (r) =>
    r.status !== "confirmed" &&
    (isController ||
      (isMgr && r.branchId === myBranch && Date.now() <= deadlineTs(r.date)));
  const StatusBadge = ({ st }) => (
    <span
      className="rounded-full font-semibold"
      style={{
        fontSize: 11,
        padding: "2px 8px",
        whiteSpace: "nowrap",
        background: st === "confirmed" ? "#E9F9EF" : "#FEF3C7",
        color: st === "confirmed" ? C.ok : "#92400E",
      }}
    >
      {st === "confirmed" ? `✓ ${tr("Принято")}` : tr("Ожидает")}
    </span>
  );
  const waiting = scope.filter((r) => r.status !== "confirmed").length;

  return (
    <div className="space-y-5 max-w-5xl">
      {/* период + фильтры + печать (как в iiko) */}
      <div
        className="rounded-2xl bg-white p-3.5"
        style={{ border: `1px solid ${C.border}` }}
      >
        <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
          <NiceSelect
            label={tr("За период")}
            value={preset}
            onChange={(v) => pickPreset(v)}
            width={188}
            options={PERIOD_PRESETS.map(([k, l]) => ({
              value: k,
              label: tr(l),
            }))}
          />
          <NiceDate
            label={tr("с")}
            value={from}
            onChange={(v) => {
              setFrom(v);
              setPreset("custom");
            }}
            width={134}
          />
          <NiceDate
            label={tr("по")}
            value={to}
            onChange={(v) => {
              setTo(v);
              setPreset("custom");
            }}
            width={134}
          />
          <button
            onClick={printReport}
            className="inline-flex items-center gap-2 rounded-xl px-4 font-semibold"
            style={{
              border: `1px solid ${C.border}`,
              color: C.ink,
              fontSize: 13,
              background: "#fff",
              height: 40,
            }}
          >
            <Printer size={16} /> {tr("Печать")}
          </button>
        </div>
        {isMgr && (
          <div className="mt-2" style={{ fontSize: 12, color: C.faint }}>
            {tr("Ваш филиал")}:{" "}
            <b style={{ color: C.sub }}>{branchById(myBranch)?.name}</b>
          </div>
        )}
      </div>

      {/* итоги за период */}
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}
      >
        <KPI label={tr("Выручка за период")} value={agg.total} color={C.ink} />
        <KPI label={tr("Наличные")} value={agg.cash} color={C.brandA} />
        <KPI
          label={tr("Эквайринг (в банк)")}
          value={agg.acq}
          color={C.violet}
        />
        <KPI
          label={tr("Перечисление")}
          value={sum("transfer")}
          color={C.brandB}
        />
        <KPI label={tr("Расходы")} value={sum("expenses")} color={C.bad} />
      </div>

      {/* сейф филиала и инкассация */}
      <div
        className="rounded-2xl bg-white p-4 sm:p-5"
        style={{ border: `1px solid ${C.border}` }}
      >
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <Lock size={17} color={C.brandA} />
          <h3 className="font-bold" style={{ color: C.ink, fontSize: 16 }}>
            {tr("Сейф филиала и передача денег")}
          </h3>
          {!isMgr && !fBranch && (
            <span style={{ fontSize: 12, color: C.faint }}>
              {tr(
                "выберите филиал вверху, чтобы видеть сейф и передавать деньги",
              )}
            </span>
          )}
        </div>

        {safe && (
          <div
            className="grid gap-3 mb-4"
            style={{
              gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
            }}
          >
            <div
              className="rounded-xl px-3 py-2.5"
              style={{ background: "#EFF4FF", border: `1px solid ${C.border}` }}
            >
              <div style={{ fontSize: 11, color: C.faint, fontWeight: 600 }}>
                {tr("Остаток в сейфе")}
              </div>
              <div
                className="font-extrabold"
                style={{
                  fontSize: 16,
                  color: safe.balance >= 0 ? C.ink : C.bad,
                  overflowWrap: "break-word",
                }}
              >
                {fmtSum(safe.balance)}
              </div>
            </div>
            <div
              className="rounded-xl px-3 py-2.5"
              style={{ background: "#FEF3C7", border: `1px solid ${C.border}` }}
            >
              <div style={{ fontSize: 11, color: "#92400E", fontWeight: 600 }}>
                {tr("В пути / на подтверждении")}
              </div>
              <div
                className="font-extrabold"
                style={{
                  fontSize: 16,
                  color: "#92400E",
                  overflowWrap: "break-word",
                }}
              >
                {fmtSum(safe.inTransit)}
              </div>
            </div>
            <div
              className="rounded-xl px-3 py-2.5"
              style={{ background: "#F8FAFC", border: `1px solid ${C.border}` }}
            >
              <div style={{ fontSize: 11, color: C.faint, fontWeight: 600 }}>
                {tr("Наличных поступило (всего)")}
              </div>
              <div
                className="font-extrabold"
                style={{
                  fontSize: 16,
                  color: C.sub,
                  overflowWrap: "break-word",
                }}
              >
                {fmtSum(safe.cashIn)}
              </div>
            </div>
            <div
              className="rounded-xl px-3 py-2.5"
              style={{ background: "#E9F9EF", border: `1px solid ${C.border}` }}
            >
              <div style={{ fontSize: 11, color: "#065F46", fontWeight: 600 }}>
                {tr("Передано в офис (всего)")}
              </div>
              <div
                className="font-extrabold"
                style={{
                  fontSize: 16,
                  color: C.ok,
                  overflowWrap: "break-word",
                }}
              >
                {fmtSum(safe.sent)}
              </div>
            </div>
          </div>
        )}

        {safe && (isMgr || isController) && (
          <div
            className="rounded-xl p-3 mb-4"
            style={{ background: "#FBFCFE", border: `1px dashed ${C.border}` }}
          >
            <div
              className="font-bold mb-2"
              style={{ color: C.sub, fontSize: 13 }}
            >
              {tr("Передать в головной офис")}
            </div>
            <div className="flex flex-wrap items-end gap-2.5">
              <div style={{ width: 160 }}>
                <CashNumField
                  label={tr("Сумма")}
                  value={ho.amount}
                  disabled={false}
                  onChange={(v) =>
                    setHo((o) => ({
                      ...o,
                      amount: Math.max(
                        0,
                        parseInt(String(v).replace(/[^\d]/g, "") || "0", 10),
                      ),
                    }))
                  }
                />
              </div>
              <div style={{ flex: "1 1 180px", minWidth: 150 }}>
                <label style={{ fontSize: 12, color: C.sub, fontWeight: 600 }}>
                  {tr("Через кого")}
                </label>
                <input
                  value={ho.via}
                  onChange={(e) =>
                    setHo((o) => ({ ...o, via: e.target.value }))
                  }
                  placeholder={tr("инкассатор, водитель, директор…")}
                  className="w-full rounded-xl px-3 py-2 mt-1"
                  style={inpSt}
                />
              </div>
              <div style={{ flex: "1 1 180px", minWidth: 150 }}>
                <label style={{ fontSize: 12, color: C.sub, fontWeight: 600 }}>
                  {tr("Примечание")}
                </label>
                <input
                  value={ho.note}
                  onChange={(e) =>
                    setHo((o) => ({ ...o, note: e.target.value }))
                  }
                  placeholder="—"
                  className="w-full rounded-xl px-3 py-2 mt-1"
                  style={inpSt}
                />
              </div>
              <button
                onClick={sendHandover}
                className="inline-flex items-center gap-2 rounded-xl px-4 font-bold text-white"
                style={{ background: C.brandA, fontSize: 13.5, height: 40 }}
              >
                <Send size={15} /> {tr("Передать")}
              </button>
            </div>
            {safe && (
              <div className="mt-2" style={{ fontSize: 12, color: C.faint }}>
                {tr("Доступно к передаче")}:{" "}
                <b style={{ color: C.sub }}>{fmtSum(safe.balance)}</b>
              </div>
            )}
          </div>
        )}

        <div className="font-bold mb-2" style={{ color: C.sub, fontSize: 13 }}>
          {tr("Передачи за период")}
        </div>
        {hoSorted.length === 0 && (
          <div style={{ fontSize: 13, color: C.faint }}>
            {tr("Передач за период нет")}
          </div>
        )}
        <div className="space-y-1.5">
          {hoSorted.map((h) => (
            <div
              key={h.id}
              className="flex items-center gap-2 flex-wrap py-1.5"
              style={{ borderBottom: `1px solid ${C.line}` }}
            >
              <span
                style={{
                  fontSize: 13,
                  color: C.ink,
                  fontWeight: 700,
                  whiteSpace: "nowrap",
                }}
              >
                {dm(h.date)}
              </span>
              {!isMgr && (
                <span
                  className="truncate"
                  style={{ fontSize: 12.5, color: C.sub, maxWidth: 90 }}
                >
                  {branchById(h.branchId)?.name}
                </span>
              )}
              <span
                style={{
                  fontSize: 13.5,
                  color: C.ink,
                  fontWeight: 800,
                  whiteSpace: "nowrap",
                }}
              >
                {fmtSum(h.amount)}
              </span>
              <span
                className="min-w-0 truncate"
                style={{ fontSize: 12.5, color: C.sub, flex: "1 1 120px" }}
              >
                {tr("через")}: {h.via}
                {h.note ? ` · ${h.note}` : ""}
              </span>
              <span
                className="rounded-full font-semibold shrink-0"
                style={{
                  fontSize: 11,
                  padding: "2px 8px",
                  whiteSpace: "nowrap",
                  background: h.status === "received" ? "#E9F9EF" : "#FEF3C7",
                  color: h.status === "received" ? C.ok : "#92400E",
                }}
              >
                {h.status === "received"
                  ? `✓ ${tr("Принято офисом")}`
                  : tr("В пути")}
              </span>
              {isController && h.status === "sent" && (
                <button
                  onClick={() => confirmHandover(h.id)}
                  className="rounded-lg px-2 py-1 font-semibold shrink-0"
                  style={{ background: C.ok, color: "#fff", fontSize: 11 }}
                >
                  {tr("Подтвердить приём")}
                </button>
              )}
              {canDelHo(h) && (
                <button
                  onClick={() => {
                    dispatch({ type: "DELETE_HANDOVER", id: h.id });
                    notify(tr("Передача удалена"));
                  }}
                  className="p-1 rounded-lg shrink-0"
                  style={{ color: C.bad }}
                  title={tr("Удалить")}
                >
                  <X size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* форма — только управляющие */}
      {canEditForm && (
        <div
          className="rounded-2xl bg-white p-4 sm:p-5"
          style={{ border: `1px solid ${C.border}` }}
        >
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <Wallet size={18} color={C.brandA} />
            <h3 className="font-bold" style={{ color: C.ink, fontSize: 16 }}>
              {tr("Отчёт по кассе за день")}
            </h3>
          </div>
          {isConfirmed ? (
            <div
              className="rounded-xl px-3 py-2 mb-4 flex items-start gap-2"
              style={{ background: "#E9F9EF", border: "1px solid #A7F3D0" }}
            >
              <CheckCircle2 size={15} color={C.ok} style={{ marginTop: 1 }} />
              <span style={{ fontSize: 12.5, color: "#065F46" }}>
                {tr("Отчёт принят контролёром — редактирование закрыто.")}
                {existing?.confirmedBy
                  ? ` ${tr("Принял")}: ${userById(existing.confirmedBy)?.name || ""}`
                  : ""}
              </span>
            </div>
          ) : isMgr && pastDeadline ? (
            <div
              className="rounded-xl px-3 py-2 mb-4 flex items-start gap-2"
              style={{ background: "#FEF2F2", border: "1px solid #FECACA" }}
            >
              <Lock size={15} color={C.bad} style={{ marginTop: 1 }} />
              <span style={{ fontSize: 12.5, color: "#991B1B" }}>
                {tr(
                  "Срок сдачи истёк (после 12:00 следующего дня). Изменения может внести только контролёр.",
                )}
              </span>
            </div>
          ) : (
            <div
              className="mb-4 flex items-start gap-2"
              style={{ fontSize: 12.5, color: C.faint }}
            >
              <Clock size={14} style={{ marginTop: 1 }} />
              <span>
                {existing ? tr("Отчёт сдан. ") : tr("Новый отчёт. ")}
                {isController
                  ? tr("Вы контролёр — правки без ограничения по сроку.")
                  : `${tr("Правки принимаются до")} ${dlStr}`}
              </span>
            </div>
          )}

          <div
            className="grid gap-3 mb-4"
            style={{
              gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
            }}
          >
            <NiceDate
              label={tr("Дата")}
              value={form.date}
              max={ymdNow()}
              onChange={(v) => setForm((f) => ({ ...f, date: v }))}
            />
            <div>
              <label
                style={{
                  fontSize: 12,
                  color: C.sub,
                  fontWeight: 600,
                  display: "block",
                  marginBottom: 4,
                }}
              >
                {tr("Филиал")}
              </label>
              <NiceSelect
                value={form.branchId}
                disabled={isMgr}
                onChange={(v) => setForm((f) => ({ ...f, branchId: +v }))}
                options={branches.map((b) => ({ value: b.id, label: b.name }))}
              />
            </div>
          </div>

          <div
            className="font-bold mb-2"
            style={{ color: C.sub, fontSize: 13 }}
          >
            {tr("Наличные")}
          </div>
          <div
            className="grid gap-3 mb-4"
            style={{
              gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
            }}
          >
            {inp(tr("Фискальная выручка"), "fiscal")}
            {inp(tr("Нефискальная сумма"), "nonFiscal")}
          </div>

          <div
            className="font-bold mb-2"
            style={{ color: C.sub, fontSize: 13 }}
          >
            {tr("Карты и онлайн")}
          </div>
          <div
            className="grid gap-3 mb-4"
            style={{
              gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
            }}
          >
            {inp("Humo Card", "humo")}
            {inp("Uzcard", "uzcard")}
            {inp("Click", "click")}
            {inp("Payme", "payme")}
            {inp("Uzum Tezkor", "uzumTezkor")}
            {inp("Yandex Еда", "yandex")}
          </div>

          <div
            className="font-bold mb-2"
            style={{ color: C.sub, fontSize: 13 }}
          >
            {tr("Перечисление и прочее")}
          </div>
          <div
            className="grid gap-3 mb-4"
            style={{
              gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
            }}
          >
            {inp(tr("Перечисление"), "transfer")}
            {inp(tr("Чеков перечислением"), "transferCount")}
            {inp(tr("Долг"), "debt")}
            {inp(tr("Без оплат"), "noPay")}
            {inp(tr("Расходы за день"), "expenses")}
            {inp(tr("Сумма по iiko"), "iiko")}
          </div>

          {(form.expenses || 0) > 0 && (
            <div className="mb-4">
              <label style={{ fontSize: 12, color: C.sub, fontWeight: 600 }}>
                {tr("Расходы — на что потрачено")}{" "}
                <span style={{ color: C.bad }}>*</span>
              </label>
              <textarea
                value={form.expensesNote || ""}
                disabled={!editable}
                rows={2}
                onChange={(e) =>
                  setForm((f) => ({ ...f, expensesNote: e.target.value }))
                }
                placeholder={tr(
                  "Например: закупка продуктов, хозтовары, мелкий ремонт",
                )}
                className="w-full rounded-xl px-3 py-2 mt-1"
                style={{
                  ...inpSt,
                  resize: "vertical",
                  background: editable ? "#fff" : "#F1F5F9",
                  color: editable ? C.ink : C.sub,
                }}
              />
              {!(form.expensesNote || "").trim() && (
                <div style={{ fontSize: 12, color: C.bad, marginTop: 4 }}>
                  {tr("При расходах комментарий обязателен")}
                </div>
              )}
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                {(form.expensePhotos || []).map((ph) => (
                  <div key={ph.id} className="relative">
                    <img
                      src={ph.dataUrl}
                      alt=""
                      onClick={() => setViewPhoto(ph.dataUrl)}
                      style={{
                        width: 56,
                        height: 56,
                        objectFit: "cover",
                        borderRadius: 10,
                        border: `1px solid ${C.border}`,
                        cursor: "zoom-in",
                      }}
                    />
                    {editable && (
                      <button
                        onClick={() => delPhoto(ph.id)}
                        className="absolute flex items-center justify-center"
                        style={{
                          top: -6,
                          right: -6,
                          width: 18,
                          height: 18,
                          borderRadius: 99,
                          background: C.bad,
                          color: "#fff",
                          fontSize: 11,
                          lineHeight: 1,
                        }}
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
                {editable && (form.expensePhotos || []).length < 3 && (
                  <label
                    className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 font-semibold"
                    style={{
                      border: `1px dashed ${C.border}`,
                      color: C.sub,
                      fontSize: 12.5,
                      cursor: "pointer",
                    }}
                  >
                    <Camera size={15} /> {tr("Фото чека / товара")}
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      style={{ display: "none" }}
                      onChange={(e) => {
                        addPhotos(e.target.files);
                        e.target.value = "";
                      }}
                    />
                  </label>
                )}
                <span style={{ fontSize: 11.5, color: C.faint }}>
                  {tr("по желанию, до 3 фото — доказательство расхода")}
                </span>
              </div>
            </div>
          )}

          <div
            className="grid gap-3 mb-4"
            style={{
              gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
            }}
          >
            <Box
              label={tr("Наличными всего")}
              value={live.cash}
              color={C.brandA}
            />
            <Box
              label={tr("Эквайринг (в банк)")}
              value={live.acq}
              color={C.violet}
            />
            <Box
              label={tr("Итого выручка")}
              value={live.total}
              color={C.ink}
              bg="#EFF4FF"
            />
            <Box
              label={tr("Разница с iiko")}
              value={live.diff}
              color={live.diff === 0 ? C.ok : C.bad}
              bg={live.diff === 0 ? "#E9F9EF" : "#FEF2F2"}
            />
          </div>

          <div className="mb-4">
            <label style={{ fontSize: 12, color: C.sub, fontWeight: 600 }}>
              {tr("Комментарий")}{" "}
              {live.diff !== 0 && <span style={{ color: C.bad }}>*</span>}
            </label>
            <textarea
              value={form.comment || ""}
              disabled={!editable}
              rows={2}
              onChange={(e) =>
                setForm((f) => ({ ...f, comment: e.target.value }))
              }
              placeholder={tr("Причина расхождения с iiko, если есть")}
              className="w-full rounded-xl px-3 py-2 mt-1"
              style={{
                ...inpSt,
                resize: "vertical",
                background: editable ? "#fff" : "#F1F5F9",
                color: editable ? C.ink : C.sub,
              }}
            />
            {live.diff !== 0 && !(form.comment || "").trim() && (
              <div style={{ fontSize: 12, color: C.bad, marginTop: 4 }}>
                {tr("При расхождении с iiko комментарий обязателен")}
              </div>
            )}
          </div>

          <button
            onClick={save}
            disabled={!editable}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 font-bold text-white"
            style={{
              background: editable ? C.brandA : C.line,
              color: editable ? "#fff" : C.faint,
              fontSize: 14,
              cursor: editable ? "pointer" : "not-allowed",
            }}
          >
            <CheckCircle2 size={16} />{" "}
            {existing ? tr("Обновить отчёт") : tr("Сдать отчёт")}
          </button>
        </div>
      )}

      {/* отчёты за период */}
      <div
        className="rounded-2xl bg-white p-4 sm:p-5"
        style={{ border: `1px solid ${C.border}` }}
      >
        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <h3 className="font-bold" style={{ color: C.ink, fontSize: 16 }}>
            {tr("Отчёты за период")}
          </h3>
          <span style={{ fontSize: 12.5, color: C.faint }}>
            {periodLabel} · {branchLabel}
          </span>
        </div>
        {isController && (waiting > 0 || hoWaiting > 0) && (
          <div
            className="rounded-xl px-3 py-2 mb-3 flex items-center gap-2"
            style={{ background: "#FEF3C7", border: "1px solid #FDE68A" }}
          >
            <AlertTriangle size={15} color="#92400E" />
            <span style={{ fontSize: 12.5, color: "#92400E", fontWeight: 600 }}>
              {waiting} {tr("отчётов ожидают подтверждения")}
              {hoWaiting > 0
                ? ` · ${hoWaiting} ${tr("передач денег в пути")}`
                : ""}
            </span>
          </div>
        )}
        {sorted.length === 0 && (
          <div style={{ fontSize: 13, color: C.faint }}>
            {tr("Нет отчётов за выбранный период")}
          </div>
        )}

        {sorted.length > 0 && (
          <div className="hidden lg:block">
            <table
              className="w-full cash-table"
              style={{ borderCollapse: "collapse", fontSize: 13 }}
            >
              <thead>
                <tr style={{ color: C.faint, textAlign: "right" }}>
                  <th className="py-2" style={{ textAlign: "left" }}>
                    {tr("Дата")}
                  </th>
                  {!isMgr && (
                    <th style={{ textAlign: "left" }}>{tr("Филиал")}</th>
                  )}
                  <th>{tr("Выручка")}</th>
                  <th>{tr("Наличные")}</th>
                  <th>{tr("Эквайринг")}</th>
                  <th>{tr("Перечисл.")}</th>
                  <th>{tr("Долг")}</th>
                  <th>{tr("Без оплат")}</th>
                  <th>{tr("Расходы")}</th>
                  <th>{tr("Разница")}</th>
                  <th style={{ textAlign: "left" }}>{tr("Статус")}</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => {
                  const c = cashCalc(r);
                  return (
                    <tr
                      key={r.id}
                      style={{
                        borderTop: `1px solid ${C.line}`,
                        textAlign: "right",
                      }}
                    >
                      <td
                        className="py-2"
                        style={{
                          textAlign: "left",
                          color: C.ink,
                          fontWeight: 600,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {dm(r.date)}
                      </td>
                      {!isMgr && (
                        <td
                          style={{
                            textAlign: "left",
                            color: C.sub,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {branchById(r.branchId)?.name}
                        </td>
                      )}
                      <td
                        style={{
                          color: C.ink,
                          fontWeight: 700,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {fmtSum(c.total)}
                      </td>
                      <td style={{ color: C.sub, whiteSpace: "nowrap" }}>
                        {fmtSum(c.cash)}
                      </td>
                      <td style={{ color: C.sub, whiteSpace: "nowrap" }}>
                        {fmtSum(c.acq)}
                      </td>
                      <td style={{ color: C.sub, whiteSpace: "nowrap" }}>
                        {r.transfer
                          ? `${fmtSum(r.transfer)}${r.transferCount ? ` (${r.transferCount})` : ""}`
                          : "—"}
                      </td>
                      <td
                        style={{
                          color: r.debt ? C.warn : C.faint,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {r.debt ? fmtSum(r.debt) : "—"}
                      </td>
                      <td
                        style={{
                          color: r.noPay ? C.warn : C.faint,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {r.noPay ? fmtSum(r.noPay) : "—"}
                      </td>
                      <td
                        title={r.expensesNote || ""}
                        style={{
                          color: C.bad,
                          whiteSpace: "nowrap",
                          textDecoration: r.expensesNote
                            ? "underline dotted"
                            : "none",
                          textUnderlineOffset: 3,
                          cursor: r.expensesNote ? "help" : "default",
                        }}
                      >
                        {fmtSum(r.expenses)}
                      </td>
                      <td
                        style={{
                          color: c.diff === 0 ? C.ok : C.bad,
                          fontWeight: 700,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {c.diff === 0
                          ? "✓ 0"
                          : (c.diff > 0 ? "+" : "") + fmtSum(c.diff)}
                      </td>
                      <td style={{ textAlign: "left", whiteSpace: "nowrap" }}>
                        <div className="flex items-center gap-1.5">
                          <StatusBadge st={r.status} />
                          {r.comment ? (
                            <span
                              title={r.comment}
                              style={{ display: "inline-flex" }}
                            >
                              <MessageSquare size={13} color={C.warn} />
                            </span>
                          ) : null}
                          {(r.expensePhotos || []).length > 0 && (
                            <button
                              onClick={() =>
                                setViewPhoto(r.expensePhotos[0].dataUrl)
                              }
                              className="inline-flex items-center gap-0.5"
                              style={{
                                color: C.brandA,
                                fontSize: 11,
                                fontWeight: 700,
                              }}
                              title={tr("Фото чека / товара")}
                            >
                              <Camera size={13} />
                              {r.expensePhotos.length}
                            </button>
                          )}
                          {isController && r.status !== "confirmed" && (
                            <button
                              onClick={() => confirmReport(r.id)}
                              className="rounded-lg px-2 py-1 font-semibold"
                              style={{
                                background: C.ok,
                                color: "#fff",
                                fontSize: 11,
                              }}
                            >
                              {tr("Принять")}
                            </button>
                          )}
                          {canDelete(r) && (
                            <button
                              onClick={() => {
                                dispatch({
                                  type: "DELETE_CASH_REPORT",
                                  id: r.id,
                                });
                                notify(tr("Отчёт удалён"));
                              }}
                              className="p-1 rounded-lg"
                              style={{ color: C.bad }}
                              title={tr("Удалить")}
                            >
                              <X size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                <tr
                  style={{
                    borderTop: `2px solid ${C.border}`,
                    textAlign: "right",
                    background: "#F8FAFC",
                  }}
                >
                  <td
                    className="py-2"
                    style={{ textAlign: "left", color: C.ink, fontWeight: 800 }}
                  >
                    {tr("Итого")}
                  </td>
                  {!isMgr && <td></td>}
                  <td
                    style={{
                      color: C.ink,
                      fontWeight: 800,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {fmtSum(agg.total)}
                  </td>
                  <td
                    style={{
                      color: C.ink,
                      fontWeight: 700,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {fmtSum(agg.cash)}
                  </td>
                  <td
                    style={{
                      color: C.ink,
                      fontWeight: 700,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {fmtSum(agg.acq)}
                  </td>
                  <td
                    style={{
                      color: C.ink,
                      fontWeight: 700,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {fmtSum(sum("transfer"))}
                  </td>
                  <td
                    style={{
                      color: C.ink,
                      fontWeight: 700,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {fmtSum(sum("debt"))}
                  </td>
                  <td
                    style={{
                      color: C.ink,
                      fontWeight: 700,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {fmtSum(sum("noPay"))}
                  </td>
                  <td
                    style={{
                      color: C.bad,
                      fontWeight: 700,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {fmtSum(sum("expenses"))}
                  </td>
                  <td
                    style={{
                      color: agg.diff === 0 ? C.ok : C.bad,
                      fontWeight: 800,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {agg.diff === 0
                      ? "✓ 0"
                      : (agg.diff > 0 ? "+" : "") + fmtSum(agg.diff)}
                  </td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* карточки — мобильный */}
        <div className="lg:hidden space-y-2.5">
          {sorted.map((r) => {
            const c = cashCalc(r);
            const cell = (l, v, col) => (
              <div>
                <div
                  style={{ fontSize: 10.5, color: C.faint, fontWeight: 600 }}
                >
                  {l}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: col || C.ink,
                    fontWeight: 700,
                    overflowWrap: "break-word",
                  }}
                >
                  {v}
                </div>
              </div>
            );
            return (
              <div
                key={r.id}
                className="rounded-xl px-3 py-3"
                style={{
                  background: "#FBFCFE",
                  border: `1px solid ${C.border}`,
                }}
              >
                <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                  <div
                    className="font-bold"
                    style={{ color: C.ink, fontSize: 14 }}
                  >
                    {dm(r.date)} · {branchById(r.branchId)?.name}
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <StatusBadge st={r.status} />
                    <span
                      className="rounded-full font-semibold"
                      style={{
                        fontSize: 11.5,
                        padding: "2px 9px",
                        whiteSpace: "nowrap",
                        background: c.diff === 0 ? "#E9F9EF" : "#FEF2F2",
                        color: c.diff === 0 ? C.ok : C.bad,
                      }}
                    >
                      {tr("Разница")}:{" "}
                      {c.diff === 0
                        ? "0"
                        : (c.diff > 0 ? "+" : "") + fmtSum(c.diff)}
                    </span>
                    {isController && r.status !== "confirmed" && (
                      <button
                        onClick={() => confirmReport(r.id)}
                        className="rounded-lg px-2 py-1 font-semibold"
                        style={{
                          background: C.ok,
                          color: "#fff",
                          fontSize: 11,
                        }}
                      >
                        {tr("Принять")}
                      </button>
                    )}
                    {canDelete(r) && (
                      <button
                        onClick={() => {
                          dispatch({ type: "DELETE_CASH_REPORT", id: r.id });
                          notify(tr("Отчёт удалён"));
                        }}
                        className="p-1 rounded-lg"
                        style={{ color: C.bad }}
                      >
                        <X size={15} />
                      </button>
                    )}
                  </div>
                </div>
                <div
                  className="grid gap-2"
                  style={{
                    gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))",
                  }}
                >
                  {cell(tr("Выручка"), fmtSum(c.total))}
                  {cell(tr("Наличные"), fmtSum(c.cash), C.brandA)}
                  {cell(tr("Эквайринг"), fmtSum(c.acq), C.violet)}
                  {r.transfer
                    ? cell(
                        tr("Перечисл."),
                        fmtSum(r.transfer) +
                          (r.transferCount ? ` (${r.transferCount})` : ""),
                      )
                    : null}
                  {r.debt ? cell(tr("Долг"), fmtSum(r.debt), C.warn) : null}
                  {r.noPay
                    ? cell(tr("Без оплат"), fmtSum(r.noPay), C.warn)
                    : null}
                  {cell(tr("Расходы"), fmtSum(r.expenses), C.bad)}
                </div>
                {r.expensesNote ? (
                  <div
                    className="flex items-start gap-1.5"
                    style={{ fontSize: 12, color: C.sub, marginTop: 8 }}
                  >
                    <Wallet size={13} style={{ marginTop: 1, flexShrink: 0 }} />
                    <span>
                      {tr("Расходы")}: {r.expensesNote}
                    </span>
                  </div>
                ) : null}
                {r.comment ? (
                  <div
                    className="flex items-start gap-1.5"
                    style={{
                      fontSize: 12,
                      color: C.warn,
                      marginTop: r.expensesNote ? 4 : 8,
                    }}
                  >
                    <MessageSquare
                      size={13}
                      style={{ marginTop: 1, flexShrink: 0 }}
                    />
                    <span>{r.comment}</span>
                  </div>
                ) : null}
                {(r.expensePhotos || []).length > 0 && (
                  <div
                    className="flex gap-1.5 flex-wrap"
                    style={{ marginTop: 6 }}
                  >
                    {r.expensePhotos.map((ph) => (
                      <img
                        key={ph.id}
                        src={ph.dataUrl}
                        alt=""
                        onClick={() => setViewPhoto(ph.dataUrl)}
                        style={{
                          width: 44,
                          height: 44,
                          objectFit: "cover",
                          borderRadius: 8,
                          border: `1px solid ${C.border}`,
                          cursor: "zoom-in",
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {sorted.length > 0 && (
            <div
              className="rounded-xl px-3 py-3"
              style={{ background: "#EFF4FF", border: `1px solid ${C.border}` }}
            >
              <div
                className="font-extrabold mb-2"
                style={{ color: C.ink, fontSize: 14 }}
              >
                {tr("Итого за период")}
              </div>
              <div
                className="grid gap-2"
                style={{
                  gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))",
                }}
              >
                <div>
                  <div
                    style={{ fontSize: 10.5, color: C.faint, fontWeight: 600 }}
                  >
                    {tr("Выручка")}
                  </div>
                  <div style={{ fontSize: 13, color: C.ink, fontWeight: 800 }}>
                    {fmtSum(agg.total)}
                  </div>
                </div>
                <div>
                  <div
                    style={{ fontSize: 10.5, color: C.faint, fontWeight: 600 }}
                  >
                    {tr("Наличные")}
                  </div>
                  <div style={{ fontSize: 13, color: C.ink, fontWeight: 700 }}>
                    {fmtSum(agg.cash)}
                  </div>
                </div>
                <div>
                  <div
                    style={{ fontSize: 10.5, color: C.faint, fontWeight: 600 }}
                  >
                    {tr("Эквайринг")}
                  </div>
                  <div style={{ fontSize: 13, color: C.ink, fontWeight: 700 }}>
                    {fmtSum(agg.acq)}
                  </div>
                </div>
                <div>
                  <div
                    style={{ fontSize: 10.5, color: C.faint, fontWeight: 600 }}
                  >
                    {tr("Расходы")}
                  </div>
                  <div style={{ fontSize: 13, color: C.bad, fontWeight: 700 }}>
                    {fmtSum(sum("expenses"))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <p style={{ fontSize: 12.5, color: C.faint, lineHeight: 1.5 }}>
        {tr(
          "«Наличными всего» = фискальная + нефискальная. «Эквайринг» = Humo + Uzcard + Click + Payme + Uzum Tezkor + Yandex. «Итого выручка» = наличные + эквайринг + перечисление. «Разница с iiko» = итог минус сумма по iiko.",
        )}
      </p>

      {viewPhoto && (
        <div
          onClick={() => setViewPhoto(null)}
          className="fixed inset-0 flex items-center justify-center p-4"
          style={{
            background: "rgba(15,23,42,.8)",
            zIndex: 90,
            cursor: "zoom-out",
          }}
        >
          <img
            src={viewPhoto}
            alt=""
            style={{
              maxWidth: "94vw",
              maxHeight: "88vh",
              borderRadius: 14,
              boxShadow: "0 20px 60px rgba(0,0,0,.5)",
            }}
          />
        </div>
      )}
    </div>
  );
}

/* --------------------------- аналитика продаж ------------------------------ */
// Каталог для аналитики. При подключении iiko заменяется реальной номенклатурой.
const PRODUCT_CATALOG = [
  { id: "p1", name: "Капучино", cat: "Кофе", price: 22000, w: 10 },
  { id: "p2", name: "Латте", cat: "Кофе", price: 25000, w: 9 },
  { id: "p3", name: "Американо", cat: "Кофе", price: 18000, w: 7 },
  { id: "p4", name: "Эспрессо", cat: "Кофе", price: 15000, w: 4 },
  { id: "p5", name: "Круассан", cat: "Выпечка", price: 20000, w: 8 },
  { id: "p6", name: "Самса", cat: "Выпечка", price: 15000, w: 9 },
  { id: "p7", name: "Слойка с сыром", cat: "Выпечка", price: 18000, w: 5 },
  { id: "p8", name: "Чизкейк", cat: "Десерты", price: 38000, w: 6 },
  { id: "p9", name: "Медовик", cat: "Десерты", price: 32000, w: 6 },
  { id: "p10", name: "Тирамису", cat: "Десерты", price: 40000, w: 4 },
  { id: "p11", name: "Эклер", cat: "Десерты", price: 22000, w: 5 },
  { id: "p12", name: "Плов", cat: "Горячее", price: 45000, w: 7 },
  { id: "p13", name: "Лагман", cat: "Горячее", price: 42000, w: 5 },
  { id: "p14", name: "Сэндвич", cat: "Горячее", price: 30000, w: 5 },
  { id: "p15", name: "Смузи", cat: "Напитки", price: 28000, w: 3 },
  { id: "p16", name: "Свежий сок", cat: "Напитки", price: 24000, w: 4 },
];
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function rand01(seed) {
  let x = hashStr(seed);
  x = (Math.imul(x, 1103515245) + 12345) >>> 0;
  return (x % 100000) / 100000;
}
// продажи товаров за конкретный день+филиал, распределённые из дневной выручки
function dayProductSales(dateStr, branchId, revenue) {
  if (!revenue || revenue <= 0) return [];
  const j = PRODUCT_CATALOG.map(
    (p) => p.w * (0.55 + 0.9 * rand01(dateStr + "|" + branchId + "|" + p.id)),
  );
  const tw = j.reduce((a, b) => a + b, 0) || 1;
  return PRODUCT_CATALOG.map((p, i) => {
    const qty = Math.max(0, Math.round(((j[i] / tw) * revenue) / p.price));
    return { id: p.id, name: p.name, cat: p.cat, qty, sum: qty * p.price };
  }).filter((x) => x.qty > 0);
}
// количество чеков за день+филиал (детерминированно; средний чек ~45–75к)
function dayChecks(dateStr, branchId, revenue) {
  if (!revenue || revenue <= 0) return 0;
  const avg =
    45000 + Math.round(rand01("chk|" + dateStr + "|" + branchId) * 30000);
  return Math.max(1, Math.round(revenue / avg));
}

// Состояние, сохраняемое в localStorage — переживает обновление страницы.
function usePersisted(key, initial) {
  const [v, setV] = useState(() => {
    try {
      if (typeof localStorage !== "undefined") {
        const raw = localStorage.getItem(key);
        if (raw != null) return JSON.parse(raw);
      }
    } catch {
      /* игнорируем битые значения */
    }
    return initial;
  });
  useEffect(() => {
    try {
      if (typeof localStorage !== "undefined")
        localStorage.setItem(key, JSON.stringify(v));
    } catch {
      /* приватный режим и т.п. — просто не сохраняем */
    }
  }, [key, v]);
  return [v, setV];
}

// Живые продажи из iiko (OLAP) за период [from,to], опц. по филиалу (department).
// status: loading | ok | empty | off (iiko не настроен) | error.
function useIikoSales({ from, to, department }) {
  const [state, setState] = useState({ status: "loading" });
  useEffect(() => {
    let alive = true;
    setState({ status: "loading" });
    apiPost("/api/iiko/olap", { from, to, department: department || undefined })
      .then((res) => {
        if (!alive) return;
        const arr = (v) => (Array.isArray(v) ? v : []);
        const byDay = arr(res?.byDay);
        const byPay = arr(res?.byPay);
        const byDish = arr(res?.byDish);
        const byGroups = arr(res?.byGroups);
        const byHour = arr(res?.byHour);
        const byStaff = arr(res?.byStaff);
        const byHourDish = arr(res?.byHourDish);
        const num = (v) => {
          const n = Number(v);
          return Number.isFinite(n) ? n : 0;
        };
        // Выручка со скидкой (фактически оплачено); запасной — без скидки.
        const rev = (r) => num(r["DishDiscountSumInt"] ?? r["DishSumInt"]);
        // По дням.
        const dayMap = {};
        byDay.forEach((r) => {
          // OpenDate.Typed приходит как "2014.01.01" — приводим к ISO.
          const raw = r["OpenDate.Typed"] || r["OpenDate"] || r["Date"] || "";
          const key = String(raw).slice(0, 10).replace(/\./g, "-");
          if (!key) return;
          if (!dayMap[key]) dayMap[key] = { revenue: 0, qty: 0 };
          dayMap[key].revenue += rev(r);
          dayMap[key].qty += num(r["DishAmountInt"]);
        });
        const days = Object.keys(dayMap)
          .sort()
          .map((d) => ({
            date: d,
            revenue: dayMap[d].revenue,
            qty: dayMap[d].qty,
          }));
        const total = days.reduce((a, d) => a + d.revenue, 0);
        // Количество чеков — сумма уникальных заказов по всем строкам.
        const checks = byDay.reduce((a, r) => a + num(r["UniqOrderId"]), 0);
        // По типам оплат.
        const payMap = {};
        byPay.forEach((r) => {
          const name = r["PayTypes"] || "—";
          payMap[name] = (payMap[name] || 0) + rev(r);
        });
        const pay = Object.entries(payMap)
          .map(([name, value]) => ({ name, value }))
          .filter((p) => p.value > 0)
          .sort((a, b) => b.value - a.value);
        // По блюдам.
        const dishMap = {};
        byDish.forEach((r) => {
          const name = r["DishName"] || "—";
          if (!dishMap[name]) dishMap[name] = { name, qty: 0, sum: 0 };
          dishMap[name].sum += rev(r);
          dishMap[name].qty += num(r["DishAmountInt"]);
        });
        const products = Object.values(dishMap).sort((a, b) => b.sum - a.sum);
        // Детальные строки групп (все три уровня + блюдо) — для агрегации по
        // уровням и раскрытия группы до блюд (drill-down).
        const groupRows = byGroups.map((r) => ({
          g1: r["DishGroup.TopParent"] || "—",
          g2: r["DishGroup.SecondParent"] || "—",
          g3: r["DishGroup.ThirdParent"] || "—",
          name: r["DishName"] || "—",
          sum: rev(r),
          qty: num(r["DishAmountInt"]),
        }));
        const aggBy = (field) => {
          const m = {};
          groupRows.forEach((r) => {
            const name = r[field] || "—";
            if (!m[name]) m[name] = { name, qty: 0, sum: 0 };
            m[name].sum += r.sum;
            m[name].qty += r.qty;
          });
          return Object.values(m).sort((a, b) => b.sum - a.sum);
        };
        const group1 = aggBy("g1");
        const group2 = aggBy("g2");
        const group3 = aggBy("g3");
        // По часам открытия заказа (0–23): выручка, чеки, средний чек.
        const hourMap = {};
        byHour.forEach((r) => {
          const h = parseInt(
            String(r["HourOpen"] ?? r["Hour"] ?? "").replace(/[^\d]/g, ""),
            10,
          );
          if (!Number.isFinite(h)) return;
          if (!hourMap[h]) hourMap[h] = { revenue: 0, checks: 0, qty: 0 };
          hourMap[h].revenue += rev(r);
          hourMap[h].checks += num(r["UniqOrderId"]);
          hourMap[h].qty += num(r["DishAmountInt"]);
        });
        const hours = Array.from({ length: 24 }, (_, h) => {
          const m = hourMap[h] || { revenue: 0, checks: 0, qty: 0 };
          return {
            hour: h,
            revenue: m.revenue,
            checks: m.checks,
            qty: m.qty,
            avg: m.checks ? m.revenue / m.checks : 0,
          };
        });
        // Активность персонала: кто чаще открывает заказы (по официанту).
        const staffMap = {};
        byStaff.forEach((r) => {
          const name = r["OrderWaiter"] || r["Waiter"] || r["Cashier"] || "—";
          if (!staffMap[name]) staffMap[name] = { name, checks: 0, revenue: 0 };
          staffMap[name].checks += num(r["UniqOrderId"]);
          staffMap[name].revenue += rev(r);
        });
        const staff = Object.values(staffMap)
          .filter((x) => x.name && x.name !== "—")
          .sort((a, b) => b.checks - a.checks);
        // Блюда по часам: hour -> отсортированный список {name, qty, sum} —
        // чтобы по клику на час показать, что продавалось в этот час.
        const hourDishMap = {};
        byHourDish.forEach((r) => {
          const h = parseInt(
            String(r["HourOpen"] ?? "").replace(/[^\d]/g, ""),
            10,
          );
          if (!Number.isFinite(h)) return;
          const name = r["DishName"] || "—";
          if (!hourDishMap[h]) hourDishMap[h] = {};
          if (!hourDishMap[h][name])
            hourDishMap[h][name] = { name, qty: 0, sum: 0 };
          hourDishMap[h][name].qty += num(r["DishAmountInt"]);
          hourDishMap[h][name].sum += rev(r);
        });
        const hourProducts = {};
        Object.keys(hourDishMap).forEach((h) => {
          hourProducts[h] = Object.values(hourDishMap[h]).sort(
            (a, b) => b.sum - a.sum,
          );
        });
        setState({
          status: days.length ? "ok" : "empty",
          days,
          total,
          checks,
          pay,
          products,
          group1,
          group2,
          group3,
          groupRows,
          hours,
          staff,
          hourProducts,
        });
      })
      .catch((e) => {
        if (!alive) return;
        const msg = (e && e.message) || "";
        if (/configured|не настро/i.test(msg)) setState({ status: "off" });
        else setState({ status: "error", error: msg });
      });
    return () => {
      alive = false;
    };
  }, [from, to, department]);
  return state;
}

// Отчёт о прибылях и убытках (ОПиУ) из iiko — тянется по требованию (тяжёлый
// отчёт по балансам), поэтому только когда открыта вкладка.
function useIikoPnl({ from, to, department, enabled }) {
  const [state, setState] = useState({ status: "idle" });
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    setState({ status: "loading" });
    apiPost("/api/iiko/pnl", { from, to, department: department || undefined })
      .then((res) => {
        if (alive) setState({ status: "ok", data: res });
      })
      .catch((e) => {
        if (!alive) return;
        const msg = (e && e.message) || "";
        if (/configured|не настро/i.test(msg)) setState({ status: "off" });
        else setState({ status: "error", error: msg });
      });
    return () => {
      alive = false;
    };
  }, [from, to, department, enabled]);
  return state;
}

// Подозрительные операции (удаления/сторно заказов + крупные скидки в разрезе
// сотрудников) — тянем только при открытой вкладке.
function useIikoRisky({ from, to, department, enabled }) {
  const [state, setState] = useState({ status: "idle" });
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    setState({ status: "loading" });
    apiPost("/api/iiko/risky", {
      from,
      to,
      department: department || undefined,
    })
      .then((res) => {
        if (alive) setState({ status: "ok", data: res });
      })
      .catch((e) => {
        if (!alive) return;
        const msg = (e && e.message) || "";
        if (/configured|не настро/i.test(msg)) setState({ status: "off" });
        else setState({ status: "error", error: msg });
      });
    return () => {
      alive = false;
    };
  }, [from, to, department, enabled]);
  return state;
}

// Рендер отчёта по подозрительным операциям: удаления/сторно заказов и крупные
// скидки в разрезе сотрудников. Данные приходят из iiko (OLAP).
function RiskyView({ data }) {
  const t = data.totals || {};
  const deletions = data.deletions || [];
  const discounts = data.discounts || [];
  const pctThreshold = Math.round((data.discountPct || 0.3) * 100);
  const Card = ({ children }) => (
    <div
      className="rounded-2xl bg-white p-4 sm:p-5"
      style={{ border: `1px solid ${C.border}` }}
    >
      {children}
    </div>
  );
  const maxDel = Math.max(...deletions.map((x) => x.count), 1);
  const maxDisc = Math.max(...discounts.map((x) => x.discount), 1);
  return (
    <div className="space-y-4">
      {/* Сводка */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          ["Удалённых заказов", t.delCount || 0],
          ["Сумма удалений", fmtSum(t.delSum || 0)],
          ["Сумма скидок", fmtSum(t.discountSum || 0)],
          [`Сотрудников с высокой скидкой (>${pctThreshold}%)`, t.flagged || 0],
        ].map(([label, value], i) => (
          <div
            key={i}
            className="rounded-2xl bg-white p-3"
            style={{ border: `1px solid ${C.border}` }}
          >
            <div style={{ fontSize: 11.5, color: C.faint, marginBottom: 4 }}>
              {label}
            </div>
            <div style={{ fontSize: 17, fontWeight: 700, color: C.ink }}>
              {value}
            </div>
          </div>
        ))}
      </div>

      {/* Удаления/сторно заказов */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold" style={{ color: C.ink, fontSize: 15 }}>
            Удаления и сторно заказов
          </h3>
          <span style={{ fontSize: 12, color: C.faint }}>● данные из iiko</span>
        </div>
        {deletions.length ? (
          <div className="space-y-1">
            {deletions.slice(0, 30).map((x, i) => (
              <div
                key={x.name}
                className="flex items-center gap-2"
                style={{ fontSize: 12 }}
              >
                <div style={{ width: 22, color: C.faint }}>{i + 1}.</div>
                <div
                  style={{
                    flex: 1,
                    minWidth: 80,
                    color: C.ink,
                    fontWeight: 600,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {x.name}
                </div>
                <div
                  style={{
                    width: 120,
                    background: "#F1EBE1",
                    borderRadius: 6,
                    height: 14,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${Math.round((x.count / maxDel) * 100)}%`,
                      background: "#C0392B",
                      height: "100%",
                    }}
                  />
                </div>
                <div style={{ width: 74, textAlign: "right", color: C.ink }}>
                  {x.count} зак.
                </div>
                <div style={{ width: 120, textAlign: "right", color: C.sub }}>
                  {fmtSum(x.sum)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ fontSize: 13, color: C.faint }}>
            Удалённых или сторнированных заказов за период не найдено.
          </p>
        )}
      </Card>

      {/* Крупные скидки */}
      <Card>
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-bold" style={{ color: C.ink, fontSize: 15 }}>
            Скидки в разрезе сотрудников
          </h3>
          <span style={{ fontSize: 12, color: C.faint }}>● данные из iiko</span>
        </div>
        <p style={{ fontSize: 12, color: C.sub, marginBottom: 10 }}>
          Красным отмечены сотрудники, у которых доля скидки превышает{" "}
          {pctThreshold}% оборота.
        </p>
        {discounts.length ? (
          <div className="space-y-1">
            {discounts.slice(0, 30).map((x, i) => (
              <div
                key={x.name}
                className="flex items-center gap-2"
                style={{ fontSize: 12 }}
              >
                <div style={{ width: 22, color: C.faint }}>{i + 1}.</div>
                <div
                  style={{
                    flex: 1,
                    minWidth: 80,
                    color: x.flagged ? "#C0392B" : C.ink,
                    fontWeight: 600,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {x.name}
                </div>
                <div
                  style={{
                    width: 120,
                    background: "#F1EBE1",
                    borderRadius: 6,
                    height: 14,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${Math.round((x.discount / maxDisc) * 100)}%`,
                      background: x.flagged ? "#C0392B" : "#C99A6A",
                      height: "100%",
                    }}
                  />
                </div>
                <div
                  style={{
                    width: 54,
                    textAlign: "right",
                    color: x.flagged ? "#C0392B" : C.sub,
                    fontWeight: x.flagged ? 700 : 400,
                  }}
                >
                  {(x.share * 100).toFixed(1)}%
                </div>
                <div style={{ width: 120, textAlign: "right", color: C.sub }}>
                  {fmtSum(x.discount)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ fontSize: 13, color: C.faint }}>
            Скидок за период не найдено.
          </p>
        )}
      </Card>
    </div>
  );
}

// Рендер ОПиУ: разделы и статьи приходят из iiko (по типам счетов), проценты
// считаются к выручке.
function PnlView({ data }) {
  const t = data.totals || {};
  const rev = t.revenue || 1;
  const pct = (v) => `${((v / rev) * 100).toFixed(2)}%`;
  const flat = (lines) => {
    const out = [];
    const walk = (arr, level) =>
      (arr || []).forEach((n) => {
        out.push({ n, level });
        if (n.children && n.children.length) walk(n.children, level + 1);
      });
    walk(lines, 0);
    return out;
  };
  const Row = ({ label, value, level = 0, bold, big, color, top }) => (
    <div
      className="flex items-center justify-between gap-2"
      style={{
        fontSize: big ? 15 : 13.5,
        fontWeight: bold ? 700 : 400,
        color: color || C.ink,
        padding: big ? "8px 0" : "3px 0",
        paddingLeft: 8 + level * 16,
        borderTop: top ? `1px solid ${C.line}` : "none",
      }}
    >
      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
        {label}
      </span>
      <span style={{ display: "flex", gap: 12, flexShrink: 0 }}>
        <span style={{ width: 130, textAlign: "right" }}>{fmtSum(value)}</span>
        <span style={{ width: 56, textAlign: "right", color: C.faint }}>
          {pct(value)}
        </span>
      </span>
    </div>
  );
  const section = (typeKey, title, itogo) => {
    const sec = (data.sections && data.sections[typeKey]) || { lines: [] };
    if (!sec.lines.length && !sec.total) return null;
    return (
      <div>
        <div
          style={{
            fontSize: 13.5,
            fontWeight: 700,
            color: C.sub,
            padding: "8px 0 2px",
          }}
        >
          {title}
        </div>
        {flat(sec.lines).map((x, i) => (
          <Row key={i} label={x.n.name} value={x.n.value} level={x.level + 1} />
        ))}
        <Row label={itogo} value={sec.total} bold top />
      </div>
    );
  };
  const hasData = Object.values(t).some((v) => v);
  return (
    <div
      className="rounded-2xl bg-white p-4 sm:p-5"
      style={{ border: `1px solid ${C.border}` }}
    >
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-bold" style={{ color: C.ink, fontSize: 15 }}>
          Отчёт о прибылях и убытках
        </h3>
        <span style={{ fontSize: 12, color: C.faint }}>● данные из iiko</span>
      </div>
      <p style={{ fontSize: 12, color: C.sub, marginBottom: 10 }}>
        {data.departmentResolved
          ? `Филиал: ${data.departmentResolved}`
          : "Вся корпорация (для сверки с iiko выберите филиал вверху — по всей сети суммируются внутренние передачи)"}
      </p>
      {!hasData ? (
        <div>
          <p style={{ fontSize: 13, color: C.faint }}>
            Нет данных за период (или требуется настройка полей ответа iiko).
          </p>
          {data.diagnostics ? (
            <details style={{ marginTop: 10 }}>
              <summary
                style={{ fontSize: 12.5, color: C.sub, cursor: "pointer" }}
              >
                Диагностика (прислать для настройки)
              </summary>
              <pre
                style={{
                  marginTop: 8,
                  padding: 10,
                  background: "#F7F4EF",
                  borderRadius: 10,
                  border: `1px solid ${C.line}`,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  fontSize: 11,
                }}
              >
                {`счетов: ${data.diagnostics.accounts}, балансы к/н: ${data.diagnostics.balEndRows}/${data.diagnostics.balStartRows}`}
                {data.diagnostics.accSample
                  ? "\n\n[accounts]\n" + data.diagnostics.accSample
                  : ""}
                {data.diagnostics.balSample
                  ? "\n\n[balance]\n" + data.diagnostics.balSample
                  : ""}
              </pre>
            </details>
          ) : null}
        </div>
      ) : (
        <div>
          {section("INCOME", "Выручка", "Итого Выручка")}
          {section(
            "COST_OF_GOODS_SOLD",
            "Себестоимость",
            "Итого Себестоимость",
          )}
          <Row label="Валовая прибыль" value={t.grossProfit} bold top />
          {section("EXPENSES", "Расходы", "Итого Расходы")}
          <Row
            label="Прибыль от основной деятельности"
            value={t.operatingProfit}
            bold
            top
          />
          {section("OTHER_INCOME", "Прочие доходы", "Итого Прочие доходы")}
          {section("OTHER_EXPENSES", "Прочие расходы", "Итого Прочие расходы")}
          <Row
            label="ИТОГО ЧИСТАЯ ПРИБЫЛЬ"
            value={t.netProfit}
            bold
            big
            top
            color={t.netProfit >= 0 ? C.ok : C.bad}
          />
        </div>
      )}
    </div>
  );
}

// Финансовый анализ ОПиУ: по цифрам отчёта строим оценку состояния бизнеса
// точки, ключевые показатели (маржи, доли затрат), проблемы и рекомендации.
// Правила детерминированные (без ИИ-ключа) и опираются на бенчмарки общепита,
// поэтому переносятся на любую базу без настройки.
function PnlAnalysis({ data }) {
  const t = (data && data.totals) || {};
  const rev = t.revenue || 0;
  if (!rev) return null;
  const r = (v) => v / rev; // доля к выручке
  const gm = r(t.grossProfit || 0); // валовая маржа
  const om = r(t.operatingProfit || 0); // операционная маржа
  const nm = r(t.netProfit || 0); // чистая маржа
  const food = r(t.cogs || 0); // доля себестоимости (фудкост)
  const opex = r(t.expenses || 0); // доля операционных расходов
  const p1 = (v) => `${(v * 100).toFixed(1)}%`;

  // Крупнейшая статья расходов (верхний уровень раздела «Расходы»).
  const expLines = (data.sections && data.sections.EXPENSES) || { lines: [] };
  const topExp = [...(expLines.lines || [])]
    .filter((x) => x && x.value > 0)
    .sort((a, b) => b.value - a.value)[0];

  // Бенчмарки общепита (кафе/ресторан): фудкост 25–35%, чистая маржа 8–15%.
  const good = C.ok;
  const warn = "#B7791F";
  const bad = C.bad;
  const foodTone = food <= 0.35 ? good : food <= 0.42 ? warn : bad;
  const opexTone = opex <= 0.35 ? good : opex <= 0.5 ? warn : bad;
  const nmTone = nm < 0 ? bad : nm < 0.05 ? warn : nm < 0.12 ? C.brandA : good;

  // Общая оценка состояния точки.
  let verdict, verdictTone, verdictText;
  if ((t.netProfit || 0) < 0) {
    verdict = "Убыток";
    verdictTone = bad;
    verdictText =
      "Точка работает в минус: расходы превышают доходы. Нужен план сокращения затрат и роста выручки.";
  } else if (nm < 0.05) {
    verdict = "Низкая прибыльность";
    verdictTone = warn;
    verdictText =
      "Бизнес прибыльный, но маржа очень тонкая — небольшое падение выручки уводит точку в минус.";
  } else if (nm < 0.12) {
    verdict = "Умеренная прибыльность";
    verdictTone = C.brandA;
    verdictText =
      "Точка устойчиво прибыльна. Есть резерв роста маржи за счёт контроля затрат.";
  } else {
    verdict = "Здоровое состояние";
    verdictTone = good;
    verdictText =
      "Показатели здоровые. Можно реинвестировать прибыль в развитие точки и маркетинг.";
  }

  // Проблемы (по правилам).
  const problems = [];
  if ((t.netProfit || 0) < 0)
    problems.push(
      `Чистый убыток ${fmtSum(t.netProfit)}. Операционная деятельность не покрывает расходы.`,
    );
  if (food > 0.42)
    problems.push(
      `Себестоимость ${p1(food)} выручки — выше нормы (для общепита 25–35%). Вероятны завышенные закупки, большие списания или недоучёт порций.`,
    );
  else if (food > 0.35)
    problems.push(
      `Себестоимость ${p1(food)} — у верхней границы нормы; есть резерв на оптимизации закупок и порционирования.`,
    );
  if (opex > 0.5)
    problems.push(
      `Операционные расходы ${p1(opex)} выручки — очень высокие. Крупнейшие статьи (аренда, ФОТ, коммуналка) требуют пересмотра.`,
    );
  if (nm >= 0 && nm < 0.05)
    problems.push(
      `Чистая маржа всего ${p1(nm)} — запас прочности минимальный.`,
    );
  if (
    (t.otherExpenses || 0) > (t.operatingProfit || 0) &&
    (t.operatingProfit || 0) > 0
  )
    problems.push(
      `Прочие расходы (${fmtSum(t.otherExpenses)}) съедают почти всю операционную прибыль — проверьте их природу.`,
    );
  if (topExp && topExp.value > (t.revenue || 0) * 0.25)
    problems.push(
      `Одна статья расходов — «${topExp.name}» (${fmtSum(topExp.value)}, ${p1(r(topExp.value))}) — очень весома; контролируйте её отдельно.`,
    );

  // Рекомендации / направления.
  const recs = [];
  if (food > 0.35)
    recs.push(
      "Пересмотреть закупочные цены и поставщиков, ввести контроль списаний и порций. Сверьтесь с отчётом «Подозрительные операции» по удалениям и скидкам.",
    );
  if (opex > 0.4)
    recs.push(
      "Разобрать крупнейшие статьи в разделе «Расходы» выше и сократить необязательные; пересмотреть условия аренды и график смен под фактическую загрузку.",
    );
  if ((t.netProfit || 0) < 0)
    recs.push(
      "Сфокусироваться на выручке: средний чек, допродажи, загрузка в пиковые часы (см. «Аналитика продаж → По времени») и работа с меню по ABC.",
    );
  if (nm >= 0.12)
    recs.push(
      "Состояние сильное — рассмотрите масштабирование успешных практик этой точки на другие филиалы.",
    );
  if (!recs.length)
    recs.push(
      "Удерживать текущие показатели; точечно работать над средним чеком и составом меню (ABC-анализ).",
    );

  const Tile = ({ label, value, tone, hint }) => (
    <div
      className="rounded-2xl bg-white p-3"
      style={{ border: `1px solid ${C.border}` }}
    >
      <div style={{ fontSize: 11.5, color: C.faint, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color: tone || C.ink }}>
        {value}
      </div>
      {hint ? (
        <div style={{ fontSize: 10.5, color: C.faint, marginTop: 2 }}>
          {hint}
        </div>
      ) : null}
    </div>
  );

  return (
    <div
      className="rounded-2xl p-4 sm:p-5 mt-4"
      style={{
        background: "linear-gradient(135deg, #F3F7FF, #FBF6FF)",
        border: `1px solid ${C.border}`,
      }}
    >
      <div className="flex items-center gap-2 mb-1">
        <Sparkles size={18} color={C.violet} />
        <h3 className="font-bold" style={{ color: C.ink, fontSize: 15 }}>
          Финансовый анализ
        </h3>
      </div>
      <p style={{ fontSize: 12, color: C.sub, marginBottom: 12 }}>
        {data.departmentResolved
          ? `Оценка по филиалу: ${data.departmentResolved}`
          : "Оценка по всей корпорации (для точечного анализа выберите филиал вверху)"}
      </p>

      {/* Ключевые показатели */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-3">
        <Tile
          label="Валовая маржа"
          value={p1(gm)}
          tone={gm >= 0.6 ? good : warn}
          hint="норма 65–75%"
        />
        <Tile
          label="Операционная маржа"
          value={p1(om)}
          tone={om >= 0.1 ? good : warn}
        />
        <Tile
          label="Чистая маржа"
          value={p1(nm)}
          tone={nmTone}
          hint="норма 8–15%"
        />
        <Tile
          label="Доля себестоимости"
          value={p1(food)}
          tone={foodTone}
          hint="норма 25–35%"
        />
        <Tile label="Доля расходов" value={p1(opex)} tone={opexTone} />
      </div>

      {/* Общая оценка */}
      <div
        className="rounded-xl p-3 mb-3 flex items-start gap-2.5"
        style={{ background: "#fff", border: `1px solid ${C.border}` }}
      >
        <Activity size={18} color={verdictTone} style={{ marginTop: 1 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: verdictTone }}>
            {verdict}
          </div>
          <div style={{ fontSize: 12.5, color: C.sub, marginTop: 2 }}>
            {verdictText}
          </div>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        {/* Проблемы */}
        <div
          className="rounded-xl p-3"
          style={{ background: "#fff", border: `1px solid ${C.border}` }}
        >
          <div className="flex items-center gap-1.5 mb-2">
            <AlertTriangle size={15} color={bad} />
            <span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>
              Проблемы и риски
            </span>
          </div>
          {problems.length ? (
            <ul style={{ margin: 0, paddingLeft: 16 }}>
              {problems.map((x, i) => (
                <li
                  key={i}
                  style={{ fontSize: 12.5, color: C.sub, marginBottom: 5 }}
                >
                  {x}
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ fontSize: 12.5, color: C.faint }}>
              Критичных отклонений по цифрам не выявлено.
            </p>
          )}
        </div>

        {/* Рекомендации */}
        <div
          className="rounded-xl p-3"
          style={{ background: "#fff", border: `1px solid ${C.border}` }}
        >
          <div className="flex items-center gap-1.5 mb-2">
            <TrendingUp size={15} color={C.ok} />
            <span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>
              Рекомендации и направления
            </span>
          </div>
          <ul style={{ margin: 0, paddingLeft: 16 }}>
            {recs.map((x, i) => (
              <li
                key={i}
                style={{ fontSize: 12.5, color: C.sub, marginBottom: 5 }}
              >
                {x}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <p style={{ fontSize: 10.5, color: C.faint, marginTop: 10 }}>
        Анализ построен автоматически по цифрам отчёта и отраслевым нормам
        общепита; используйте как ориентир, а не как готовое решение.
      </p>
    </div>
  );
}

function SalesAnalytics({ s, me, branchScope, mode = "analytics" }) {
  const isReports = mode === "reports";
  const branches = s.branches || [];
  const isMgr = me.role === "manager";
  const myBranch = me.branchId || (branches[0] && branches[0].id) || 1;
  const pad = (n) => String(n).padStart(2, "0");
  const ymd = (d) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const toD = (x) => new Date(x + "T00:00:00");
  const addDays = (x, n) => {
    const d = toD(x);
    d.setDate(d.getDate() + n);
    return ymd(d);
  };
  const monday = (x) => {
    const d = toD(x);
    const wd = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - wd);
    return ymd(d);
  };
  const dm = (x) => x.split("-").reverse().join(".");
  const today = ymdNow();

  const PRESETS = [
    ["today", "Сегодня"],
    ["yesterday", "Вчера"],
    ["curWeek", "Текущая неделя"],
    ["prevWeek", "Прошлая неделя"],
    ["curMonth", "Текущий месяц"],
    ["prevMonth", "Прошлый месяц"],
    ["curYear", "Текущий год"],
    ["custom", "Другой…"],
  ];
  const rangeOf = (p) => {
    const y = today.slice(0, 4),
      m = today.slice(0, 7);
    if (p === "today") return { from: today, to: today };
    if (p === "yesterday") {
      const d = addDays(today, -1);
      return { from: d, to: d };
    }
    if (p === "curWeek")
      return { from: monday(today), to: addDays(monday(today), 6) };
    if (p === "prevWeek") {
      const mo = addDays(monday(today), -7);
      return { from: mo, to: addDays(mo, 6) };
    }
    if (p === "curMonth") {
      const last = new Date(+y, +m.slice(5, 7), 0).getDate();
      return { from: `${m}-01`, to: `${m}-${pad(last)}` };
    }
    if (p === "prevMonth") {
      const d = new Date(+y, +m.slice(5, 7) - 2, 1);
      const mm = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
      const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      return { from: `${mm}-01`, to: `${mm}-${pad(last)}` };
    }
    if (p === "curYear") return { from: `${y}-01-01`, to: `${y}-12-31` };
    return null;
  };
  const init = rangeOf("prevMonth");
  // Фильтры аналитики запоминаются между обновлениями страницы.
  const [preset, setPreset] = usePersisted("avesto.sales.preset", "prevMonth");
  const [from, setFrom] = usePersisted("avesto.sales.from", init.from);
  const [to, setTo] = usePersisted("avesto.sales.to", init.to);
  const fBranch = isMgr ? myBranch : branchScope || 0;
  // Живые продажи из iiko: по выбранному филиалу (его Department) или по всем.
  const selBranchObj = branchById(fBranch || 0);
  const selDept = fBranch && selBranchObj ? selBranchObj.iikoDept : null;
  const live = useIikoSales({ from, to, department: selDept });
  const liveOn = live.status === "ok";
  const pick = (p) => {
    setPreset(p);
    const r = rangeOf(p);
    if (r) {
      setFrom(r.from);
      setTo(r.to);
    }
  };
  // Разделили экран на «Аналитику» (оперативные срезы) и «Отчёты» (формальные
  // отчёты вроде ОПиУ). Набор вкладок зависит от режима.
  const ANALYTICS_REPORTS = [
    ["revenue", "Динамика выручки"],
    ["time", "По времени"],
    ["pay", "Оплаты"],
    ["dishes", "Блюда"],
    ["abc", "ABC"],
    ["staff", "Персонал"],
    ["insights", "Выводы"],
  ];
  const REPORT_REPORTS = [
    ["pnl", "Прибыль / убыток"],
    ["risky", "Подозрительные операции"],
  ];
  const REPORTS = isReports ? REPORT_REPORTS : ANALYTICS_REPORTS;
  const [tab, setTab] = usePersisted(
    isReports ? "avesto.reports.tab" : "avesto.sales.tab",
    isReports ? "pnl" : "revenue",
  );
  // Если сохранённая вкладка не из текущего набора (после разделения экранов) —
  // сбрасываем на первую доступную.
  useEffect(() => {
    if (!REPORTS.some(([k]) => k === tab)) setTab(REPORTS[0][0]);
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps
  const [abcMode, setAbcMode] = usePersisted("avesto.sales.abcMode", "dish"); // dish | g1 | g2 | g3
  const [dishSort, setDishSort] = usePersisted("avesto.sales.dishSort", "sum"); // sum | qty
  const [abcDrill, setAbcDrill] = useState(null); // раскрытая группа (имя)
  const [openHour, setOpenHour] = useState(null); // раскрытый час (вкладка «По времени»)

  const inScope = (r, a, b) =>
    r.date >= a &&
    r.date <= b &&
    (isMgr ? r.branchId === myBranch : fBranch ? r.branchId === fBranch : true);
  const reports = (s.cashReports || []).filter((r) => inScope(r, from, to));
  const nDays = Math.max(1, Math.round((toD(to) - toD(from)) / 86400000) + 1);
  const prevTo = addDays(from, -1),
    prevFrom = addDays(from, -nDays);
  const prevReports = (s.cashReports || []).filter((r) =>
    inScope(r, prevFrom, prevTo),
  );

  const rev = (list) => list.reduce((a, r) => a + cashCalc(r).total, 0);
  const revenue = rev(reports),
    prevRevenue = rev(prevReports);
  const growth = prevRevenue
    ? ((revenue - prevRevenue) / prevRevenue) * 100
    : null;
  const checksOf = (list) =>
    list.reduce(
      (a, r) => a + dayChecks(r.date, r.branchId, cashCalc(r).total),
      0,
    );
  const checks = checksOf(reports),
    prevChecks = checksOf(prevReports);
  const avgCheck = checks ? Math.round(revenue / checks) : 0;
  const prevAvg = prevChecks ? Math.round(prevRevenue / prevChecks) : 0;
  const avgGrowth = prevAvg ? ((avgCheck - prevAvg) / prevAvg) * 100 : null;

  const pay = reports.reduce(
    (o, r) => {
      o.cash += (r.fiscal || 0) + (r.nonFiscal || 0);
      o.humo += r.humo || 0;
      o.uzcard += r.uzcard || 0;
      o.click += r.click || 0;
      o.payme += r.payme || 0;
      o.uzum += r.uzumTezkor || 0;
      o.yandex += r.yandex || 0;
      o.transfer += r.transfer || 0;
      return o;
    },
    {
      cash: 0,
      humo: 0,
      uzcard: 0,
      click: 0,
      payme: 0,
      uzum: 0,
      yandex: 0,
      transfer: 0,
    },
  );
  // Цвет для типа оплаты: по известным названиям, иначе — из палитры по кругу.
  const PAY_COLORS = {
    налич: C.brandA,
    humo: "#7C3AED",
    uzcard: C.violet,
    click: C.brandB,
    payme: "#0EA5E9",
    uzum: C.ok,
    yandex: "#F59E0B",
    перечисл: C.warn,
    карт: C.violet,
  };
  const PAY_FALLBACK = [
    C.brandA,
    C.brandB,
    C.violet,
    C.ok,
    C.warn,
    "#0EA5E9",
    "#7C3AED",
    "#F59E0B",
    C.faint,
  ];
  const payColor = (name, i) => {
    const k = String(name).toLowerCase();
    for (const key in PAY_COLORS) if (k.includes(key)) return PAY_COLORS[key];
    return PAY_FALLBACK[i % PAY_FALLBACK.length];
  };
  const demoPayRows = [
    ["Наличные", pay.cash, C.brandA],
    ["Humo", pay.humo, "#7C3AED"],
    ["Uzcard", pay.uzcard, C.violet],
    ["Click", pay.click, C.brandB],
    ["Payme", pay.payme, "#0EA5E9"],
    ["Uzum Tezkor", pay.uzum, C.ok],
    ["Yandex Еда", pay.yandex, "#F59E0B"],
    ["Перечисление", pay.transfer, C.warn],
  ]
    .filter((r) => r[1] > 0)
    .sort((a, b) => b[1] - a[1]);
  // Живые оплаты из iiko (если есть) — иначе демо.
  const payRows =
    liveOn && live.pay && live.pay.length
      ? live.pay.map((p, i) => [p.name, p.value, payColor(p.name, i)])
      : demoPayRows;
  const payTotal = payRows.reduce((a, r) => a + r[1], 0) || 1;

  // динамика по дням
  const dayMap = {};
  reports.forEach((r) => {
    dayMap[r.date] = (dayMap[r.date] || 0) + cashCalc(r).total;
  });
  const series = Object.keys(dayMap)
    .sort()
    .map((d) => ({
      label: d.slice(8) + "." + d.slice(5, 7),
      day: d,
      revenue: dayMap[d],
    }));

  // Если iiko отдал живые продажи — показываем их вместо демо-данных.
  const displayRevenue = liveOn ? live.total : revenue;
  const displayChecks = liveOn ? live.checks || 0 : checks;
  const displayAvg = liveOn
    ? displayChecks
      ? Math.round(displayRevenue / displayChecks)
      : 0
    : avgCheck;
  const displaySeries = liveOn
    ? live.days.map((d) => ({
        label: d.date.slice(8) + "." + d.date.slice(5, 7),
        day: d.date,
        revenue: d.revenue,
      }))
    : series;

  // товары + ABC
  const pm = {};
  reports.forEach((r) =>
    dayProductSales(r.date, r.branchId, cashCalc(r).total).forEach((ps) => {
      if (!pm[ps.id])
        pm[ps.id] = { name: ps.name, cat: ps.cat, qty: 0, sum: 0 };
      pm[ps.id].qty += ps.qty;
      pm[ps.id].sum += ps.sum;
    }),
  );
  const demoProducts = Object.values(pm).sort((a, b) => b.sum - a.sum);
  // Живые блюда из iiko (если есть) — иначе демо.
  const products =
    liveOn && live.products && live.products.length
      ? live.products.map((p) => ({
          name: p.name,
          cat: "",
          qty: p.qty,
          sum: p.sum,
        }))
      : demoProducts;
  // Продажи по часам (0–23) из iiko — для вкладки «По времени».
  const liveHours = liveOn && live.hours ? live.hours : null;
  // Блюда по часам (для раскрытия по клику на час).
  const liveHourProducts =
    liveOn && live.hourProducts ? live.hourProducts : null;
  // Активность персонала из iiko — для вкладки «Персонал».
  const liveStaff = liveOn && live.staff ? live.staff : null;
  // ОПиУ — тянем только при открытой вкладке «Прибыль / убыток».
  const pnl = useIikoPnl({
    from,
    to,
    department: selDept,
    enabled: tab === "pnl",
  });
  // Подозрительные операции — тянем только при открытой вкладке.
  const risky = useIikoRisky({
    from,
    to,
    department: selDept,
    enabled: tab === "risky",
  });
  // Список блюд, отсортированный для вкладки «Блюда»: по выручке или по
  // количеству («что чаще покупают»).
  const dishRows = [...products].sort((a, b) =>
    dishSort === "qty" ? b.qty - a.qty : b.sum - a.sum,
  );
  const dishTop = dishRows.slice(0, 5);
  const dishBottom = dishRows.slice(-5).reverse();
  // Раскладка ABC (доля, накопит., группа) на любом списке {name,qty,sum}.
  const withAbc = (list) => {
    const total = list.reduce((a, p) => a + p.sum, 0) || 1;
    let c = 0;
    return list.map((p) => {
      const share = p.sum / total;
      c += share;
      return {
        ...p,
        share,
        cum: c,
        abc: c <= 0.8 ? "A" : c <= 0.95 ? "B" : "C",
      };
    });
  };
  const abcProducts = withAbc(products);
  const top = abcProducts.slice(0, 5);
  const bottom = abcProducts.slice(-5).reverse();
  const abcColor = (g) =>
    g === "A"
      ? { bg: "#E9F9EF", fg: C.ok }
      : g === "B"
        ? { bg: "#FEF3C7", fg: "#92400E" }
        : { bg: "#F1F5F9", fg: C.faint };
  // ABC можно смотреть по блюдам или по группам блюд 1/2/3 (если iiko отдал их).
  const groupLists = liveOn
    ? { g1: live.group1, g2: live.group2, g3: live.group3 }
    : {};
  const hasGroups = ["g1", "g2", "g3"].some(
    (k) => groupLists[k] && groupLists[k].length,
  );
  const isGroupMode = abcMode !== "dish";
  // Раскрытие группы (drill-down) до блюд внутри неё.
  let abcSource;
  if (!isGroupMode) {
    abcSource = abcProducts;
  } else if (abcDrill) {
    const m = {};
    (live.groupRows || [])
      .filter((r) => r[abcMode] === abcDrill)
      .forEach((r) => {
        if (!m[r.name]) m[r.name] = { name: r.name, qty: 0, sum: 0 };
        m[r.name].sum += r.sum;
        m[r.name].qty += r.qty;
      });
    abcSource = Object.values(m).sort((a, b) => b.sum - a.sum);
  } else {
    abcSource = groupLists[abcMode] || [];
  }
  const abcRows = isGroupMode ? withAbc(abcSource) : abcProducts;
  // В группах строки-группы кликабельны (раскрываются), блюда — нет.
  const abcClickable = isGroupMode && !abcDrill;
  const abcTotal = abcRows.reduce((a, p) => a + p.sum, 0) || 1;
  const abcCount = (g) => abcRows.filter((p) => p.abc === g).length;
  const abcSum = (g) =>
    abcRows.filter((p) => p.abc === g).reduce((a, p) => a + p.sum, 0);

  // рекомендации
  const insights = [];
  if (!liveOn && growth != null)
    insights.push(
      growth >= 0
        ? `Выручка выросла на ${growth.toFixed(1)}% к прошлому периоду — держим темп.`
        : `Выручка снизилась на ${Math.abs(growth).toFixed(1)}% — стоит усилить продвижение.`,
    );
  if (liveOn)
    insights.push(
      `Выручка за период: ${fmtSum(displayRevenue)}${displayChecks ? ` · ${displayChecks.toLocaleString("ru-RU")} чеков` : ""} (данные из iiko).`,
    );
  if (top[0])
    insights.push(
      `Лидер продаж: ${top[0].name} — ${fmtSum(top[0].sum)} (${(top[0].share * 100).toFixed(0)}% выручки).`,
    );
  const cItems = abcProducts.filter((p) => p.abc === "C");
  if (cItems.length)
    insights.push(
      `Аутсайдеры (группа C): ${cItems
        .slice(0, 4)
        .map((p) => p.name)
        .join(", ")} — рассмотрите акции или замену в меню.`,
    );
  if (displayAvg)
    insights.push(
      `Средний чек ${fmtSum(displayAvg)}${!liveOn && avgGrowth != null ? ` (${avgGrowth >= 0 ? "+" : ""}${avgGrowth.toFixed(1)}% к прошлому периоду)` : ""}.`,
    );
  if (payRows[0])
    insights.push(
      `Основной способ оплаты: ${payRows[0][0]} — ${((payRows[0][1] / payTotal) * 100).toFixed(0)}% оплат.`,
    );

  const inpSt = {
    border: `1px solid ${C.border}`,
    fontSize: 13.5,
    background: "#fff",
    color: C.ink,
  };
  const KPI = ({ label, value, sub, tone }) => (
    <div
      className="rounded-2xl bg-white p-4"
      style={{ border: `1px solid ${C.border}` }}
    >
      <div style={{ fontSize: 12, color: C.faint, fontWeight: 600 }}>
        {label}
      </div>
      <div
        className="font-extrabold mt-0.5"
        style={{
          fontSize: 19,
          color: C.ink,
          overflowWrap: "break-word",
          lineHeight: 1.15,
        }}
      >
        {value}
      </div>
      {sub != null && (
        <div
          style={{
            fontSize: 12,
            marginTop: 2,
            fontWeight: 700,
            color: tone === "up" ? C.ok : tone === "down" ? C.bad : C.faint,
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );
  const growthSub = (g) =>
    g == null
      ? { s: tr("нет данных за прошлый период"), t: "flat" }
      : {
          s: `${g >= 0 ? "▲ +" : "▼ "}${g.toFixed(1)}% ${tr("к прошлому периоду")}`,
          t: g >= 0 ? "up" : "down",
        };
  const gr = growthSub(growth);
  const agr = growthSub(avgGrowth);

  return (
    <div className="space-y-5 max-w-5xl">
      {/* проверка подключения iiko */}
      <IikoPanel />

      {/* период + филиал */}
      <div
        className="rounded-2xl bg-white p-3.5"
        style={{ border: `1px solid ${C.border}` }}
      >
        <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
          <NiceSelect
            label={tr("За период")}
            value={preset}
            onChange={(v) => pick(v)}
            width={180}
            options={PRESETS.map(([k, l]) => ({ value: k, label: tr(l) }))}
          />
          <NiceDate
            label={tr("с")}
            value={from}
            onChange={(v) => {
              setFrom(v);
              setPreset("custom");
            }}
            width={134}
          />
          <NiceDate
            label={tr("по")}
            value={to}
            onChange={(v) => {
              setTo(v);
              setPreset("custom");
            }}
            width={134}
          />
        </div>
        {isMgr && (
          <div className="mt-2" style={{ fontSize: 12, color: C.faint }}>
            {tr("Ваш филиал")}:{" "}
            <b style={{ color: C.sub }}>{branchById(myBranch)?.name}</b>
          </div>
        )}
        {/* статус живых данных iiko */}
        {live.status === "loading" && (
          <div className="mt-2" style={{ fontSize: 12, color: C.faint }}>
            Загрузка данных из iiko…
          </div>
        )}
        {live.status === "ok" && (
          <div
            className="mt-2"
            style={{ fontSize: 12, color: C.ok, fontWeight: 700 }}
          >
            ● Данные из iiko
            {selDept ? ` · ${selBranchObj?.name}` : " · все точки"}
          </div>
        )}
        {live.status === "empty" && (
          <div className="mt-2" style={{ fontSize: 12, color: C.faint }}>
            iiko: продаж за период нет — показаны демо-данные.
          </div>
        )}
        {live.status === "error" && (
          <div className="mt-2" style={{ fontSize: 12, color: C.warn }}>
            iiko недоступен ({live.error}) — показаны демо-данные.
          </div>
        )}
      </div>

      {/* KPI */}
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}
      >
        <KPI
          label={tr("Выручка за период")}
          value={fmtSum(displayRevenue)}
          sub={liveOn ? "● данные из iiko" : gr.s}
          tone={liveOn ? "up" : gr.t}
        />
        <KPI
          label={tr("Средний чек")}
          value={fmtSum(displayAvg)}
          sub={liveOn ? "● данные из iiko" : agr.s}
          tone={liveOn ? "up" : agr.t}
        />
        <KPI
          label={tr("Количество чеков")}
          value={displayChecks.toLocaleString("ru-RU")}
          sub={
            liveOn
              ? "● данные из iiko"
              : prevChecks
                ? `${checks - prevChecks >= 0 ? "▲ +" : "▼ "}${checks - prevChecks} ${tr("к прошлому периоду")}`
                : null
          }
          tone={liveOn ? "up" : checks - prevChecks >= 0 ? "up" : "down"}
        />
        <KPI
          label={tr("Прошлый период")}
          value={fmtSum(prevRevenue)}
          sub={`${dm(prevFrom)} — ${dm(prevTo)}`}
        />
      </div>

      {/* переключатель отчётов */}
      <div
        className="rounded-2xl bg-white p-1.5 flex gap-1 overflow-x-auto"
        style={{ border: `1px solid ${C.border}` }}
      >
        {REPORTS.map(([k, l]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className="rounded-xl px-3.5 py-2 font-bold whitespace-nowrap shrink-0"
            style={{
              fontSize: 13.5,
              background: tab === k ? C.brandA : "transparent",
              color: tab === k ? "#fff" : C.sub,
            }}
          >
            {tr(l)}
          </button>
        ))}
      </div>

      {/* пустое состояние активной вкладки */}
      {((tab === "revenue" && !displaySeries.length) ||
        (tab === "pay" && !payRows.length) ||
        (tab === "dishes" && !products.length) ||
        (tab === "insights" && !insights.length)) && (
        <div
          className="rounded-2xl bg-white p-5"
          style={{
            border: `1px solid ${C.border}`,
            fontSize: 13,
            color: C.faint,
          }}
        >
          {tr("Нет данных за выбранный период")}
        </div>
      )}

      {/* динамика выручки */}
      {tab === "revenue" && displaySeries.length > 0 && (
        <div
          className="rounded-2xl bg-white p-4 sm:p-5"
          style={{ border: `1px solid ${C.border}` }}
        >
          <h3 className="font-bold mb-3" style={{ color: C.ink, fontSize: 16 }}>
            {tr("Динамика выручки")}
            {liveOn && (
              <span
                style={{
                  fontSize: 12,
                  color: C.ok,
                  fontWeight: 700,
                  marginLeft: 8,
                }}
              >
                ● iiko
              </span>
            )}
          </h3>
          <div style={{ width: "100%", height: 240 }}>
            <ResponsiveContainer>
              <BarChart
                data={displaySeries}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke={C.line}
                  vertical={false}
                />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: C.faint }}
                  tickLine={false}
                  axisLine={{ stroke: C.line }}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: C.faint }}
                  tickLine={false}
                  axisLine={false}
                  width={54}
                  tickFormatter={(v) => (v / 1000000).toFixed(1) + "M"}
                />
                <Tooltip
                  formatter={(v) => fmtSum(v)}
                  labelStyle={{ color: C.ink }}
                  contentStyle={{
                    borderRadius: 12,
                    border: `1px solid ${C.border}`,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="revenue" radius={[6, 6, 0, 0]}>
                  {displaySeries.map((e, i) => (
                    <Cell key={i} fill={C.brandA} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* продажи по времени (по часам) */}
      {tab === "time" && (
        <div
          className="rounded-2xl bg-white p-4 sm:p-5"
          style={{ border: `1px solid ${C.border}` }}
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold" style={{ color: C.ink, fontSize: 15 }}>
              Продажи по времени (по часам)
            </h3>
            {liveOn && (
              <span style={{ fontSize: 12, color: C.faint }}>
                ● данные из iiko
              </span>
            )}
          </div>
          {liveHours && liveHours.some((h) => h.revenue > 0) ? (
            (() => {
              const active = liveHours.filter(
                (h) => h.revenue > 0 || h.checks > 0,
              );
              const maxRev = Math.max(...active.map((h) => h.revenue), 1);
              const peak = active.reduce(
                (a, h) => (h.revenue > a.revenue ? h : a),
                active[0],
              );
              return (
                <div>
                  <p style={{ fontSize: 12.5, color: C.sub, marginBottom: 10 }}>
                    Пиковый час: <b>{pad(peak.hour)}:00</b> —{" "}
                    {fmtSum(peak.revenue)}
                  </p>
                  <div className="space-y-1">
                    {active.map((h) => {
                      const isOpen = openHour === h.hour;
                      const dishes =
                        (liveHourProducts && liveHourProducts[h.hour]) || [];
                      return (
                        <div key={h.hour}>
                          <div
                            onClick={() => setOpenHour(isOpen ? null : h.hour)}
                            className="flex items-center gap-2"
                            style={{ fontSize: 12, cursor: "pointer" }}
                            title="Показать, что продавалось в этот час"
                          >
                            <div style={{ width: 14, color: C.brandA }}>
                              {isOpen ? "▾" : "▸"}
                            </div>
                            <div style={{ width: 46, color: C.sub }}>
                              {pad(h.hour)}:00
                            </div>
                            <div
                              style={{
                                flex: 1,
                                minWidth: 60,
                                background: "#F1EBE1",
                                borderRadius: 6,
                                height: 16,
                                overflow: "hidden",
                              }}
                            >
                              <div
                                style={{
                                  width: `${Math.round((h.revenue / maxRev) * 100)}%`,
                                  background:
                                    h.hour === peak.hour ? C.brandA : "#C99A6A",
                                  height: "100%",
                                }}
                              />
                            </div>
                            <div
                              style={{
                                width: 108,
                                textAlign: "right",
                                color: C.ink,
                              }}
                            >
                              {fmtSum(h.revenue)}
                            </div>
                            <div
                              style={{
                                width: 64,
                                textAlign: "right",
                                color: C.faint,
                              }}
                            >
                              {h.checks} чек.
                            </div>
                            <div
                              style={{
                                width: 110,
                                textAlign: "right",
                                color: C.sub,
                              }}
                            >
                              ср. {fmtSum(h.avg)}
                            </div>
                          </div>
                          {isOpen && (
                            <div
                              style={{
                                margin: "4px 0 8px 60px",
                                padding: "8px 10px",
                                background: "#F7F4EF",
                                border: `1px solid ${C.line}`,
                                borderRadius: 10,
                              }}
                            >
                              {dishes.length === 0 ? (
                                <div style={{ fontSize: 12, color: C.faint }}>
                                  Нет детализации по блюдам за этот час.
                                </div>
                              ) : (
                                <div className="space-y-0.5">
                                  <div
                                    style={{
                                      fontSize: 11.5,
                                      color: C.faint,
                                      marginBottom: 4,
                                    }}
                                  >
                                    Блюда за {pad(h.hour)}:00–{pad(h.hour)}:59 (
                                    {dishes.length}):
                                  </div>
                                  {dishes.slice(0, 50).map((d, i) => (
                                    <div
                                      key={i}
                                      className="flex items-center justify-between gap-2"
                                      style={{ fontSize: 12 }}
                                    >
                                      <span style={{ color: C.ink }}>
                                        {d.name}
                                      </span>
                                      <span
                                        style={{
                                          color: C.sub,
                                          whiteSpace: "nowrap",
                                        }}
                                      >
                                        {d.qty} шт · {fmtSum(d.sum)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()
          ) : (
            <p style={{ fontSize: 13, color: C.faint }}>
              Данные по времени доступны при подключении к iiko (реальные
              продажи по часам за выбранный период).
            </p>
          )}
        </div>
      )}

      {/* выручка по типам оплат */}
      {tab === "pay" && payRows.length > 0 && (
        <div
          className="rounded-2xl bg-white p-4 sm:p-5"
          style={{ border: `1px solid ${C.border}` }}
        >
          <h3 className="font-bold mb-3" style={{ color: C.ink, fontSize: 16 }}>
            {tr("Выручка по типам оплат")}
          </h3>
          <div className="space-y-2.5">
            {payRows.map(([name, val, col]) => {
              const share = (val / payTotal) * 100;
              return (
                <div key={name}>
                  <div
                    className="flex items-center justify-between gap-2"
                    style={{ fontSize: 13 }}
                  >
                    <span style={{ color: C.ink, fontWeight: 600 }}>
                      {name}
                    </span>
                    <span style={{ color: C.sub, whiteSpace: "nowrap" }}>
                      {fmtSum(val)} ·{" "}
                      <b style={{ color: C.ink }}>{share.toFixed(1)}%</b>
                    </span>
                  </div>
                  <div
                    style={{
                      height: 8,
                      borderRadius: 6,
                      background: C.line,
                      marginTop: 4,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${share}%`,
                        height: "100%",
                        background: col,
                        borderRadius: 6,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ABC-анализ */}
      {tab === "abc" && (
        <div
          className="rounded-2xl bg-white p-4 sm:p-5"
          style={{ border: `1px solid ${C.border}` }}
        >
          <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
            <h3 className="font-bold" style={{ color: C.ink, fontSize: 16 }}>
              {tr("ABC-анализ")}
            </h3>
            <span style={{ fontSize: 12, color: C.faint }}>
              {tr("A — основная выручка, C — аутсайдеры")}
            </span>
          </div>
          {/* переключатель разреза ABC: блюда / группы 1–3 (если iiko отдал группы) */}
          {hasGroups && (
            <div
              className="inline-flex rounded-xl p-1 mb-3 overflow-x-auto"
              style={{ border: `1px solid ${C.border}`, background: "#fff" }}
            >
              {[
                ["dish", "Блюда"],
                ["g1", "Группа 1"],
                ["g2", "Группа 2"],
                ["g3", "Группа 3"],
              ].map(([k, l]) => (
                <button
                  key={k}
                  onClick={() => {
                    setAbcMode(k);
                    setAbcDrill(null);
                  }}
                  className="rounded-lg px-3 py-1.5 font-bold whitespace-nowrap"
                  style={{
                    fontSize: 12.5,
                    background: abcMode === k ? C.brandA : "transparent",
                    color: abcMode === k ? "#fff" : C.sub,
                  }}
                >
                  {tr(l)}
                </button>
              ))}
            </div>
          )}
          {/* хлебные крошки / раскрытая группа */}
          {isGroupMode && !abcDrill && hasGroups && (
            <div className="mb-2" style={{ fontSize: 12, color: C.faint }}>
              {tr("Нажмите на группу, чтобы раскрыть ABC блюд внутри неё")}
            </div>
          )}
          {isGroupMode && abcDrill && (
            <div className="mb-3 flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setAbcDrill(null)}
                className="rounded-lg px-3 py-1.5 font-bold"
                style={{
                  fontSize: 12.5,
                  border: `1px solid ${C.border}`,
                  color: C.sub,
                  background: "#fff",
                }}
              >
                ← {tr("К группам")}
              </button>
              <span style={{ fontSize: 13, color: C.ink, fontWeight: 700 }}>
                {tr("Группа")}: {abcDrill}
              </span>
            </div>
          )}
          <div className="flex flex-wrap gap-2 mb-3">
            {["A", "B", "C"].map((g) => {
              const c = abcColor(g);
              return (
                <div
                  key={g}
                  className="rounded-xl px-3 py-2"
                  style={{ background: c.bg, minWidth: 128 }}
                >
                  <div style={{ fontSize: 12, color: c.fg, fontWeight: 800 }}>
                    {tr("Группа")} {g} · {abcCount(g)}{" "}
                    {abcMode !== "dish" ? tr("гр.") : tr("тов.")}
                  </div>
                  <div
                    style={{ fontSize: 13.5, color: C.ink, fontWeight: 700 }}
                  >
                    {fmtSum(abcSum(g))} ·{" "}
                    {((abcSum(g) / abcTotal) * 100).toFixed(0)}%
                  </div>
                </div>
              );
            })}
          </div>
          {abcRows.length > 0 ? (
            <div className="hidden md:block">
              <table
                className="w-full"
                style={{ borderCollapse: "collapse", fontSize: 13 }}
              >
                <thead>
                  <tr style={{ color: C.faint, textAlign: "right" }}>
                    <th className="py-2" style={{ textAlign: "left" }}>
                      {abcClickable ? tr("Группа") : tr("Товар")}
                    </th>
                    <th style={{ textAlign: "left" }}>{tr("Категория")}</th>
                    <th>{tr("Кол-во")}</th>
                    <th>{tr("Выручка")}</th>
                    <th>{tr("Доля")}</th>
                    <th>{tr("Накопит.")}</th>
                    <th>ABC</th>
                  </tr>
                </thead>
                <tbody>
                  {abcRows.map((p, i) => {
                    const c = abcColor(p.abc);
                    return (
                      <tr
                        key={i}
                        onClick={() => abcClickable && setAbcDrill(p.name)}
                        style={{
                          borderTop: `1px solid ${C.line}`,
                          textAlign: "right",
                          cursor: abcClickable ? "pointer" : "default",
                        }}
                      >
                        <td
                          className="py-2"
                          style={{
                            textAlign: "left",
                            color: abcClickable ? C.brandA : C.ink,
                            fontWeight: 600,
                          }}
                        >
                          {abcClickable ? "▸ " : ""}
                          {p.name}
                        </td>
                        <td style={{ textAlign: "left", color: C.sub }}>
                          {p.cat || ""}
                        </td>
                        <td style={{ color: C.sub, whiteSpace: "nowrap" }}>
                          {p.qty}
                        </td>
                        <td
                          style={{
                            color: C.ink,
                            fontWeight: 700,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {fmtSum(p.sum)}
                        </td>
                        <td style={{ color: C.sub }}>
                          {(p.share * 100).toFixed(1)}%
                        </td>
                        <td style={{ color: C.faint }}>
                          {(p.cum * 100).toFixed(0)}%
                        </td>
                        <td>
                          <span
                            className="rounded-full font-bold"
                            style={{
                              fontSize: 11,
                              padding: "2px 8px",
                              background: c.bg,
                              color: c.fg,
                            }}
                          >
                            {p.abc}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: C.faint }}>
              {tr("Нет данных за выбранный период")}
            </div>
          )}

          {/* мобильные карточки */}
          <div className="md:hidden space-y-2">
            {abcRows.map((p, i) => {
              const c = abcColor(p.abc);
              return (
                <div
                  key={i}
                  onClick={() => abcClickable && setAbcDrill(p.name)}
                  className="flex items-center gap-2 rounded-xl px-3 py-2.5 flex-wrap"
                  style={{
                    background: "#FBFCFE",
                    border: `1px solid ${C.border}`,
                    cursor: abcClickable ? "pointer" : "default",
                  }}
                >
                  <span
                    className="rounded-full font-bold shrink-0"
                    style={{
                      fontSize: 11,
                      padding: "2px 8px",
                      background: c.bg,
                      color: c.fg,
                    }}
                  >
                    {p.abc}
                  </span>
                  <div className="min-w-0" style={{ flex: "1 1 120px" }}>
                    <div
                      className="truncate"
                      style={{
                        fontSize: 13.5,
                        color: abcClickable ? C.brandA : C.ink,
                        fontWeight: 700,
                      }}
                    >
                      {abcClickable ? "▸ " : ""}
                      {p.name}
                    </div>
                    <div style={{ fontSize: 11.5, color: C.faint }}>
                      {p.cat ? `${p.cat} · ` : ""}
                      {p.qty} {tr("шт")}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div
                      style={{
                        fontSize: 13,
                        color: C.ink,
                        fontWeight: 700,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {fmtSum(p.sum)}
                    </div>
                    <div style={{ fontSize: 11.5, color: C.sub }}>
                      {(p.share * 100).toFixed(1)}%
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* топ и аутсайдеры */}
      {tab === "dishes" && products.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span style={{ fontSize: 13, color: C.sub }}>Сортировка:</span>
            {[
              ["sum", "по выручке"],
              ["qty", "по количеству"],
            ].map(([k, l]) => (
              <button
                key={k}
                onClick={() => setDishSort(k)}
                className="rounded-lg px-3 py-1.5 font-semibold"
                style={{
                  fontSize: 12.5,
                  background: dishSort === k ? C.brandA : "#fff",
                  color: dishSort === k ? "#fff" : C.sub,
                  border: `1px solid ${dishSort === k ? C.brandA : C.line}`,
                }}
              >
                {l}
              </button>
            ))}
            <span style={{ fontSize: 12, color: C.faint }}>
              {dishSort === "qty"
                ? "что покупают чаще всего"
                : "что приносит больше выручки"}
            </span>
          </div>
          <div
            className="grid gap-4"
            style={{
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            }}
          >
            <div
              className="rounded-2xl bg-white p-4 sm:p-5"
              style={{ border: `1px solid ${C.border}` }}
            >
              <h3
                className="font-bold mb-2"
                style={{ color: C.ok, fontSize: 15 }}
              >
                ▲{" "}
                {dishSort === "qty"
                  ? tr("Чаще всего покупают")
                  : tr("Лучше всего продаются")}
              </h3>
              {dishTop.map((p, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-2 py-1.5"
                  style={{
                    borderBottom:
                      i < dishTop.length - 1 ? `1px solid ${C.line}` : "none",
                  }}
                >
                  <span style={{ fontSize: 13, color: C.ink, fontWeight: 600 }}>
                    {i + 1}. {p.name}
                  </span>
                  <span
                    style={{ fontSize: 13, color: C.sub, whiteSpace: "nowrap" }}
                  >
                    {fmtSum(p.sum)} · {p.qty} {tr("шт")}
                  </span>
                </div>
              ))}
            </div>
            <div
              className="rounded-2xl bg-white p-4 sm:p-5"
              style={{ border: `1px solid ${C.border}` }}
            >
              <h3
                className="font-bold mb-2"
                style={{ color: C.bad, fontSize: 15 }}
              >
                ▼{" "}
                {dishSort === "qty"
                  ? tr("Реже всего покупают")
                  : tr("Хуже всего продаются")}
              </h3>
              {dishBottom.map((p, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-2 py-1.5"
                  style={{
                    borderBottom:
                      i < dishBottom.length - 1
                        ? `1px solid ${C.line}`
                        : "none",
                  }}
                >
                  <span style={{ fontSize: 13, color: C.ink, fontWeight: 600 }}>
                    {p.name}
                  </span>
                  <span
                    style={{ fontSize: 13, color: C.sub, whiteSpace: "nowrap" }}
                  >
                    {fmtSum(p.sum)} · {p.qty} {tr("шт")}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* активность персонала */}
      {tab === "staff" && (
        <div
          className="rounded-2xl bg-white p-4 sm:p-5"
          style={{ border: `1px solid ${C.border}` }}
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold" style={{ color: C.ink, fontSize: 15 }}>
              Активность персонала (кто чаще открывает заказы)
            </h3>
            {liveOn && (
              <span style={{ fontSize: 12, color: C.faint }}>
                ● данные из iiko
              </span>
            )}
          </div>
          {liveStaff && liveStaff.length > 0 ? (
            (() => {
              const maxChecks = Math.max(...liveStaff.map((x) => x.checks), 1);
              return (
                <div>
                  <p style={{ fontSize: 12.5, color: C.sub, marginBottom: 10 }}>
                    Самый активный: <b>{liveStaff[0].name}</b> —{" "}
                    {liveStaff[0].checks} заказ.
                  </p>
                  <div className="space-y-1">
                    {liveStaff.slice(0, 20).map((x, i) => (
                      <div
                        key={x.name}
                        className="flex items-center gap-2"
                        style={{ fontSize: 12 }}
                      >
                        <div style={{ width: 22, color: C.faint }}>
                          {i + 1}.
                        </div>
                        <div
                          style={{
                            flex: 1,
                            minWidth: 80,
                            color: C.ink,
                            fontWeight: 600,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {x.name}
                        </div>
                        <div
                          style={{
                            width: 120,
                            background: "#F1EBE1",
                            borderRadius: 6,
                            height: 14,
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              width: `${Math.round((x.checks / maxChecks) * 100)}%`,
                              background: i === 0 ? C.brandA : "#C99A6A",
                              height: "100%",
                            }}
                          />
                        </div>
                        <div
                          style={{
                            width: 74,
                            textAlign: "right",
                            color: C.ink,
                          }}
                        >
                          {x.checks} зак.
                        </div>
                        <div
                          style={{
                            width: 120,
                            textAlign: "right",
                            color: C.sub,
                          }}
                        >
                          {fmtSum(x.revenue)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()
          ) : (
            <p style={{ fontSize: 13, color: C.faint }}>
              Активность персонала доступна при подключении к iiko (число
              заказов по сотруднику за период).
            </p>
          )}
        </div>
      )}

      {/* отчёт о прибылях и убытках */}
      {tab === "pnl" && (
        <div>
          {pnl.status === "loading" && (
            <div
              className="rounded-2xl bg-white p-5"
              style={{
                border: `1px solid ${C.border}`,
                fontSize: 13,
                color: C.faint,
              }}
            >
              Загрузка отчёта из iiko…
            </div>
          )}
          {pnl.status === "off" && (
            <div
              className="rounded-2xl bg-white p-5"
              style={{
                border: `1px solid ${C.border}`,
                fontSize: 13,
                color: C.faint,
              }}
            >
              Интеграция iiko не настроена.
            </div>
          )}
          {pnl.status === "error" && (
            <div
              className="rounded-2xl bg-white p-5"
              style={{ border: `1px solid ${C.border}`, fontSize: 13 }}
            >
              <span style={{ color: "#B23" }}>
                Не удалось получить отчёт: {pnl.error}
              </span>
            </div>
          )}
          {pnl.status === "ok" && (
            <>
              <PnlView data={pnl.data} />
              <PnlAnalysis data={pnl.data} />
            </>
          )}
        </div>
      )}

      {/* подозрительные операции */}
      {tab === "risky" && (
        <div>
          {risky.status === "loading" && (
            <div
              className="rounded-2xl bg-white p-5"
              style={{
                border: `1px solid ${C.border}`,
                fontSize: 13,
                color: C.faint,
              }}
            >
              Загрузка данных из iiko…
            </div>
          )}
          {risky.status === "off" && (
            <div
              className="rounded-2xl bg-white p-5"
              style={{
                border: `1px solid ${C.border}`,
                fontSize: 13,
                color: C.faint,
              }}
            >
              Интеграция iiko не настроена.
            </div>
          )}
          {risky.status === "error" && (
            <div
              className="rounded-2xl bg-white p-5"
              style={{ border: `1px solid ${C.border}`, fontSize: 13 }}
            >
              <span style={{ color: "#B23" }}>
                Не удалось получить данные: {risky.error}
              </span>
            </div>
          )}
          {risky.status === "ok" && <RiskyView data={risky.data} />}
        </div>
      )}

      {/* рекомендации */}
      {tab === "insights" && insights.length > 0 && (
        <div
          className="rounded-2xl p-4 sm:p-5"
          style={{
            background: "linear-gradient(135deg, #EFF4FF, #F5F3FF)",
            border: `1px solid ${C.border}`,
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <Bot size={18} color={C.violet} />
            <h3 className="font-bold" style={{ color: C.ink, fontSize: 16 }}>
              {tr("Выводы и рекомендации")}
            </h3>
          </div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {insights.map((t, i) => (
              <li
                key={i}
                style={{ fontSize: 13.5, color: C.sub, lineHeight: 1.6 }}
              >
                {t}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p style={{ fontSize: 12, color: C.faint, lineHeight: 1.5 }}>
        {tr(
          "Данные по товарам рассчитаны из дневной выручки касс. После подключения iiko здесь будет реальная номенклатура: блюда, количество и суммы по чекам.",
        )}
      </p>
    </div>
  );
}

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

/* ------------------------- навигация и шапка ------------------------------- */
const NAV = [
  { key: "inbox", label: "Входящие", icon: Inbox, roles: "all" },
  { key: "create", label: "Создать заявку", icon: PlusCircle, roles: "all" },
  { key: "me", label: "Мои достижения", icon: Award, roles: "all" },
  { key: "archive", label: "Архив задач", icon: Archive, roles: "all" },
  {
    key: "analytics",
    label: "Аналитика",
    icon: BarChart3,
    roles: ["director", "finance", "manager", "accountant", "sysadmin"],
  },
  {
    key: "time",
    label: "Учёт времени",
    icon: Clock,
    roles: ["director", "finance", "manager", "accountant", "sysadmin"],
  },
  {
    key: "cash",
    label: "Кассы",
    icon: Wallet,
    roles: ["director", "finance", "manager", "accountant", "sysadmin"],
  },
  {
    key: "sales",
    label: "Аналитика продаж",
    icon: TrendingUp,
    roles: ["director", "finance", "manager", "accountant", "sysadmin"],
  },
  {
    key: "reports",
    label: "Отчёты",
    icon: FileText,
    roles: ["director", "finance", "manager", "accountant", "sysadmin"],
  },
  { key: "org", label: "Оргструктура", icon: Building2, roles: "all" },
  { key: "about", label: "О системе", icon: Info, roles: "all" },
  { key: "admin", label: "Админ-панель", icon: Settings, roles: ["sysadmin"] },
];
const navAllowed = (item, role) =>
  item.roles === "all" || item.roles.includes(role);
const VIEW_TITLE = {
  inbox: "Входящие задачи",
  create: "Создать заявку",
  me: "Мои достижения",
  archive: "Архив задач",
  analytics: "Аналитика — кабина директора",
  time: "Учёт рабочего времени",
  cash: "Кассы филиалов",
  sales: "Аналитика продаж",
  reports: "Отчёты",
  org: "Оргструктура и филиалы",
  about: "О системе",
  admin: "Админ-панель",
};

// Кнопка «Наверх»: появляется только когда страница прокручена вниз (по
// необходимости), плавно возвращает к началу. На мобильных поднята над нижней
// навигацией. Скролл идёт по окну (боковое меню зафиксировано).
function ScrollTopButton() {
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

function Sidebar({ view, setView, role }) {
  const items = NAV.filter((n) => navAllowed(n, role));
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
            Avesto Group
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
        {items.map((n) => {
          const active = view === n.key;
          return (
            <button
              key={n.key}
              onClick={() => setView(n.key)}
              className={`nav-item flex items-center gap-3 rounded-xl px-3 py-3 text-left${active ? " nav-item-active" : ""}`}
              style={{
                background: active ? C.brandGrad : "transparent",
                color: active ? "#fff" : C.ink,
                fontWeight: active ? 700 : 600,
                fontSize: 14.5,
                boxShadow: active ? "0 6px 18px rgba(123,45,31,.30)" : "none",
              }}
            >
              <n.icon size={20} color={active ? "#fff" : C.sub} /> {tr(n.label)}
            </button>
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
// Короткие подписи для нижней панели (узкие экраны)
const NAV_SHORT = {
  inbox: "Входящие",
  create: "Создать",
  me: "Кабинет",
  archive: "Архив",
  analytics: "Аналитика",
  time: "Время",
  cash: "Кассы",
  sales: "Продажи",
  org: "Структура",
  about: "О системе",
  admin: "Админка",
};

function BottomNav({ view, setView, role, onMore }) {
  const items = NAV.filter((n) => navAllowed(n, role));
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

function MoreSheet({ open, onClose, items, view, setView }) {
  if (!open) return null;
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
        <div className="grid grid-cols-1 gap-2">
          {items.map((n) => {
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
          })}
        </div>
      </div>
    </div>
  );
}
function TopBar({ me, shift, dispatch, onToggleShift, authUser, onLogout }) {
  const [open, setOpen] = useState(false);
  return (
    <header
      className="topbar-h glass-chrome px-4 md:px-6 py-2 flex flex-wrap items-center gap-3 sticky top-0"
      style={{
        minHeight: 65,
        borderBottom: `1px solid ${C.glassBorder}`,
        boxShadow: "0 4px 20px rgba(74,38,22,.05)",
        zIndex: 20,
      }}
    >
      <button
        onClick={onToggleShift}
        className="inline-flex items-center gap-2 rounded-xl px-3.5 py-2.5 font-bold transition"
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
          <Users size={16} color={C.faint} />
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
                  {authUser.name} · {authUser.role}
                </div>
              </div>
            )}
            <div
              className="px-2 py-1.5"
              style={{ fontSize: 12, color: C.faint, fontWeight: 700 }}
            >
              {tr("Войти как (демо ролей):")}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {ORG.users
                .filter((u) => u.active !== false)
                .map((u) => (
                  <button
                    key={u.id}
                    onClick={() => {
                      dispatch({ type: "SET_USER", id: u.id });
                      setOpen(false);
                    }}
                    className="w-full flex items-center gap-2.5 rounded-xl px-2 py-2 text-left"
                    style={{
                      background: u.id === me.id ? C.line : "transparent",
                    }}
                  >
                    <Avatar id={u.id} size={30} />
                    <div className="flex-1 min-w-0">
                      <div
                        className="truncate"
                        style={{
                          fontSize: 13.5,
                          fontWeight: 600,
                          color: C.ink,
                        }}
                      >
                        {u.name}
                      </div>
                      <div
                        className="truncate"
                        style={{ fontSize: 12, color: C.sub }}
                      >
                        {u.pos}
                        {u.branchId ? ` · ${branchById(u.branchId)?.name}` : ""}
                      </div>
                    </div>
                    {u.id === me.id && (
                      <CheckCircle2
                        size={16}
                        color={C.brandA}
                        className="shrink-0"
                      />
                    )}
                  </button>
                ))}
            </div>
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
    </header>
  );
}

/* ------------------------------ приложение --------------------------------- */
export default function App({ authUser, onLogout }) {
  const [s, dispatch] = useReducer(reducer, undefined, init);
  const [now, setNow] = useState(Date.now());
  const [toast, setToast] = useState(null);
  const [hint, setHint] = useState(true);
  const [moreOpen, setMoreOpen] = useState(false);
  const notify = (m) => setToast(m);

  useEffect(() => {
    let live = true;
    store.load().then((data) => {
      if (!live) return;
      if (data && data.tasks) dispatch({ type: "HYDRATE", data });
      else dispatch({ type: "MARK_HYDRATED" });
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!s.hydrated) return;
    store.save({
      tasks: s.tasks,
      history: s.history,
      shifts: s.shifts,
      timesheet: s.timesheet,
      cashReports: s.cashReports,
      cashHandovers: s.cashHandovers,
      currentUserId: s.currentUserId,
      companies: s.companies,
      branches: s.branches,
      positions: s.positions,
      users: s.users,
      budgets: s.budgets,
      sla: s.sla,
      sops: s.sops,
      settings: s.settings,
      departments: s.departments,
      catDept: s.catDept,
      routes: s.routes,
      // Запоминаем и выбор пользователя: текущую страницу и фильтры,
      // чтобы после обновления ничего не сбрасывалось.
      view: s.view,
      filters: s.filters,
    });
  }, [
    s.hydrated,
    s.tasks,
    s.history,
    s.shifts,
    s.timesheet,
    s.cashReports,
    s.cashHandovers,
    s.currentUserId,
    s.companies,
    s.branches,
    s.positions,
    s.users,
    s.budgets,
    s.sla,
    s.sops,
    s.settings,
    s.departments,
    s.catDept,
    s.routes,
    s.view,
    s.filters,
  ]);

  // Реальный вход: роль приходит с сервера — открываем приложение под ролью
  // (демо-пользователь той же роли ведёт демо-данные до переноса данных на сервер).
  useEffect(() => {
    if (!authUser || !s.hydrated) return;
    const demo = USERS.find((u) => u.role === authUser.role) || USERS[0];
    if (s.currentUserId !== demo.id)
      dispatch({ type: "SET_USER", id: demo.id });
  }, [authUser, s.hydrated]); // eslint-disable-line

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 20000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  syncOrg(s);
  syncLang(s);
  const me = userById(s.currentUserId) || USERS[0];
  const myShift = s.shifts[s.currentUserId] || { open: false };
  // Единый охват по филиалу: старший (руководство/финансы/сисадмин) выбирает любой;
  // сотрудник филиала «привязан» к своему и видит только его данные.
  const canPickBranch = ["director", "finance", "sysadmin"].includes(me.role);
  const branchScope = canPickBranch
    ? s.settings?.branchScope || 0
    : me.branchId || 0;
  const scoped = useMemo(
    () => visibleTasks(s.tasks, me),
    [s.tasks, me, s.departments, s.routes],
  );
  const branchScoped = useMemo(
    () =>
      branchScope ? scoped.filter((t) => t.branchId === branchScope) : scoped,
    [scoped, branchScope],
  );
  const filtered = useMemo(
    () => applyFilters(branchScoped, s.filters, now),
    [branchScoped, s.filters, now],
  );
  const { flags } = useMemo(
    () => detectAnomalies(s.tasks, s.history, now),
    [s.tasks, s.history, now],
  );
  const selected = s.selectedId
    ? s.tasks.find((t) => t.id === s.selectedId)
    : null;

  useEffect(() => {
    const item = NAV.find((n) => n.key === s.view);
    if (item && !navAllowed(item, me.role))
      dispatch({ type: "SET_VIEW", view: "inbox" });
  }, [me.role]); // eslint-disable-line

  const onOpen = (id) => dispatch({ type: "SELECT", id });
  const setView = (v) => dispatch({ type: "SET_VIEW", view: v });

  return (
    <div
      style={{
        minHeight: "100vh",
        fontFamily: FONT,
        color: C.ink,
        // Тёплый «мешевый» градиент бренда как фон под стеклянными поверхностями.
        background:
          "radial-gradient(1200px 620px at 8% -12%, rgba(200,137,46,0.16), transparent 60%)," +
          "radial-gradient(1000px 720px at 102% -6%, rgba(123,45,31,0.12), transparent 55%)," +
          "radial-gradient(1100px 900px at 50% 118%, rgba(124,58,237,0.06), transparent 60%)," +
          "linear-gradient(180deg, #FBF8F3 0%, #F5EFE6 100%)",
        backgroundAttachment: "fixed",
      }}
    >
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap');
        *{box-sizing:border-box} button{font-family:inherit;cursor:pointer} select{font-family:inherit}
        ::-webkit-scrollbar{height:9px;width:9px}
        ::-webkit-scrollbar-thumb{background:rgba(123,45,31,.28);border-radius:9px;border:2px solid transparent;background-clip:padding-box}
        ::-webkit-scrollbar-thumb:hover{background:rgba(123,45,31,.42);background-clip:padding-box}
        ::selection{background:rgba(200,137,46,.28)}
        button:focus-visible{outline:2px solid ${C.brandA};outline-offset:2px}
        /* Плавные микровзаимодействия */
        button{transition:background-color .18s ease,color .18s ease,box-shadow .2s ease,border-color .18s ease,transform .12s ease,opacity .18s ease}
        button:active:not(:disabled){transform:translateY(1px)}
        a{transition:color .18s ease}
        /* Жидкое стекло: матовые полупрозрачные поверхности хрома */
        .glass{background:${C.glass};-webkit-backdrop-filter:blur(18px) saturate(150%);backdrop-filter:blur(18px) saturate(150%);border:1px solid ${C.glassBorder}}
        .glass-chrome{background:${C.glassStrong};-webkit-backdrop-filter:blur(22px) saturate(160%);backdrop-filter:blur(22px) saturate(160%)}
        /* Мягкая «премиальная» тень для карточек (кроме уже затенённых поповеров) */
        .rounded-2xl.bg-white:not(.shadow-xl):not(.shadow-lg):not(.shadow-2xl){
          box-shadow:0 1px 2px rgba(74,38,22,.04),0 10px 26px rgba(74,38,22,.06);
          transition:box-shadow .22s ease,transform .22s ease}
        /* Утилита приподнимания при наведении (для кликабельных карточек) */
        .lift{transition:transform .22s ease,box-shadow .22s ease}
        .lift:hover{transform:translateY(-2px);box-shadow:0 16px 34px rgba(74,38,22,.12)}
        .nav-item:not(.nav-item-active):hover{background:rgba(123,45,31,.07)!important}
        @keyframes glassFadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
        .fade-up{animation:glassFadeUp .34s cubic-bezier(.22,.61,.36,1) both}
        @media(prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
        select{appearance:none;-webkit-appearance:none;-moz-appearance:none;
          background-image:url("data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394A3B8' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E") !important;
          background-repeat:no-repeat !important;background-position:right 12px center !important;background-size:14px !important;
          padding-right:34px !important;border-radius:12px;cursor:pointer}
        select:focus-visible{outline:2px solid ${C.brandA};outline-offset:2px}
        input[type=date],input[type=month]{border-radius:12px}
        .cash-table th,.cash-table td{padding-left:16px}
        .cash-table th:first-child,.cash-table td:first-child{padding-left:0}
        @media(min-width:768px){.desk-shift{margin-left:250px}}`}</style>

      <div className="flex" style={{ minHeight: "100vh" }}>
        <Sidebar view={s.view} setView={setView} role={me.role} />
        <div className="flex-1 min-w-0 flex flex-col desk-shift">
          <TopBar
            me={me}
            shift={myShift}
            dispatch={dispatch}
            authUser={authUser}
            onLogout={onLogout}
            onToggleShift={() => {
              dispatch({ type: "TOGGLE_SHIFT", id: me.id });
              notify(
                myShift.open
                  ? "Смена закрыта"
                  : "Смена открыта — задачи доступны",
              );
            }}
          />

          <main
            key={s.view}
            className="flex-1 p-4 md:p-6 pb-28 md:pb-6 fade-up"
          >
            <div className="flex items-center flex-wrap gap-x-3 gap-y-2 mb-4">
              <h1
                className="font-extrabold"
                style={{
                  color: C.ink,
                  fontSize: 24,
                  overflowWrap: "break-word",
                }}
              >
                {tr(VIEW_TITLE[s.view] || "")}
              </h1>
              {s.view === "inbox" && (
                <span
                  style={{
                    fontSize: 13.5,
                    color: C.faint,
                    whiteSpace: "nowrap",
                  }}
                >
                  {filtered.filter((t) => t.phase < 5).length} {tr("активных")}
                </span>
              )}
              {[
                "inbox",
                "archive",
                "analytics",
                "time",
                "cash",
                "sales",
                "reports",
              ].includes(s.view) && (
                <div className="ml-auto flex items-center gap-2">
                  {canPickBranch ? (
                    <NiceSelect
                      value={branchScope}
                      width={186}
                      onChange={(v) =>
                        dispatch({
                          type: "SET_SETTING",
                          key: "branchScope",
                          value: +v,
                        })
                      }
                      options={[
                        { value: 0, label: tr("Все филиалы") },
                        ...(s.branches || []).map((b) => ({
                          value: b.id,
                          label: b.name,
                        })),
                      ]}
                    />
                  ) : me.branchId ? (
                    <span
                      className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2"
                      style={{
                        border: `1px solid ${C.border}`,
                        background: "#fff",
                        fontSize: 13,
                        fontWeight: 700,
                        color: C.ink,
                      }}
                    >
                      <Building2 size={14} color={C.faint} />{" "}
                      {branchById(me.branchId)?.name}
                    </span>
                  ) : null}
                </div>
              )}
            </div>

            {s.view === "inbox" && hint && (
              <div
                className="mb-4 rounded-xl px-4 py-3 flex items-start gap-2.5"
                style={{ background: "#EFF4FF", border: `1px solid #BFDBFE` }}
              >
                <Info size={17} color={C.brandA} style={{ marginTop: 1 }} />
                <div style={{ fontSize: 13.5, color: "#1E3A8A", flex: 1 }}>
                  {tr(
                    "Рабочий прототип. Откройте задачу, где вы исполнитель или контролёр — фаза «Отправлено» сама станет «Просмотрено» (защита «я не видел»). Кнопки действий зависят от роли и открытой смены — переключайте роль через профиль справа вверху.",
                  )}
                </div>
                <button
                  onClick={() => setHint(false)}
                  className="p-1 rounded-lg"
                  style={{ color: C.brandA }}
                >
                  <X size={16} />
                </button>
              </div>
            )}

            {s.view === "inbox" && (
              <Board
                tasks={filtered}
                now={now}
                onOpen={onOpen}
                onFav={(id) => dispatch({ type: "TOGGLE_FAV", id })}
                flags={flags}
              />
            )}
            {s.view === "create" && (
              <CreatePage me={me} s={s} dispatch={dispatch} notify={notify} />
            )}
            {s.view === "me" && (
              <PersonalAchievements
                me={me}
                tasks={s.tasks}
                history={s.history}
                shift={myShift}
                now={now}
              />
            )}
            {s.view === "archive" && (
              <ArchiveView tasks={scoped} onOpen={onOpen} />
            )}
            {s.view === "analytics" &&
              navAllowed(
                { roles: NAV.find((n) => n.key === "analytics").roles },
                me.role,
              ) && (
                <Analytics
                  tasks={filtered}
                  history={s.history}
                  now={now}
                  filters={s.filters}
                  dispatch={dispatch}
                  role={me.role}
                  notify={notify}
                />
              )}
            {s.view === "time" &&
              navAllowed(
                { roles: NAV.find((n) => n.key === "time").roles },
                me.role,
              ) && (
                <TimesheetView
                  s={s}
                  me={me}
                  now={now}
                  branchScope={branchScope}
                />
              )}
            {s.view === "cash" &&
              navAllowed(
                { roles: NAV.find((n) => n.key === "cash").roles },
                me.role,
              ) && (
                <CashRegisterView
                  s={s}
                  me={me}
                  dispatch={dispatch}
                  notify={notify}
                  branchScope={branchScope}
                />
              )}
            {s.view === "sales" &&
              navAllowed(
                { roles: NAV.find((n) => n.key === "sales").roles },
                me.role,
              ) && (
                <SalesAnalytics
                  s={s}
                  me={me}
                  branchScope={branchScope}
                  mode="analytics"
                />
              )}
            {s.view === "reports" &&
              navAllowed(
                { roles: NAV.find((n) => n.key === "reports").roles },
                me.role,
              ) && (
                <SalesAnalytics
                  s={s}
                  me={me}
                  branchScope={branchScope}
                  mode="reports"
                />
              )}
            {s.view === "org" && <OrgStructure />}
            {s.view === "about" && <AboutView />}
            {s.view === "admin" && me.role === "sysadmin" && (
              <AdminPanel s={s} dispatch={dispatch} notify={notify} />
            )}
          </main>
        </div>
      </div>

      <ScrollTopButton />

      <BottomNav
        view={s.view}
        setView={setView}
        role={me.role}
        onMore={() => setMoreOpen(true)}
      />
      <MoreSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        items={NAV.filter((n) => navAllowed(n, me.role))}
        view={s.view}
        setView={setView}
      />

      {selected && (
        <TaskDetail
          t={selected}
          now={now}
          me={me}
          history={s.history}
          dispatch={dispatch}
          notify={notify}
          anomalyFlags={flags[selected.id]}
          shiftOpen={myShift.open}
          onClose={() => dispatch({ type: "CLOSE_TASK" })}
          key={selected.id}
        />
      )}

      {toast && (
        <div
          className="fixed left-1/2 bottom-24 md:bottom-6 z-50"
          style={{ transform: "translateX(-50%)" }}
        >
          <div
            className="rounded-xl px-4 py-3 text-white font-semibold shadow-xl"
            style={{ background: C.ink, fontSize: 14 }}
          >
            {toast}
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================================
   АДМИН-ПАНЕЛЬ  (настройка системы, управление персоналом и бизнесом)
   ============================================================================ */
const ROLE_OPTS = [
  ["director", "Руководство"],
  ["finance", "Финансист"],
  ["manager", "Управляющий"],
  ["accountant", "Бухгалтер"],
  ["sysadmin", "Сист. администратор"],
  ["staff", "Сотрудник"],
];

function AdInput({ label, value, onChange, placeholder, type = "text" }) {
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
function AdToggle({ label, hint, checked, onChange }) {
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
function AdCard({ title, children, desc }) {
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

// Предпросмотр списка сотрудников из iiko (шаг 1: только чтение). iiko —
// источник правды по кадрам; на следующем шаге отсюда будем импортировать
// учётные записи, назначать права и авто-блокировать уволенных.
function IikoStaffPreview() {
  const [st, setSt] = useState({
    status: "idle",
    employees: [],
    count: 0,
    error: "",
    sample: "",
    rawFirst: "",
    deptRawFirst: "",
  });
  const [sync, setSync] = useState({ status: "idle", error: "", result: null });
  const runSync = async () => {
    setSync({ status: "loading", error: "", result: null });
    try {
      const result = await apiPost("/api/iiko/employees/sync", {});
      setSync({ status: "ok", error: "", result });
    } catch (e) {
      setSync({ status: "error", error: e.message || "Ошибка", result: null });
    }
  };
  const load = async () => {
    setSt((p) => ({ ...p, status: "loading", error: "" }));
    try {
      const data = await apiGet("/api/iiko/employees");
      const employees = data.employees || [];
      setSt({
        status: "ok",
        employees,
        count: data.count ?? employees.length,
        error: "",
        sample: data.sample || "",
        rawFirst: data.rawFirst || "",
        deptRawFirst: data.deptRawFirst || "",
      });
    } catch (e) {
      setSt({
        status: "error",
        employees: [],
        count: 0,
        error: e.message || "Ошибка запроса",
        sample: "",
      });
    }
  };
  const loading = st.status === "loading";
  return (
    <AdCard
      title="Сотрудники из iiko"
      desc="iiko — источник правды по кадрам. «Загрузить из iiko» — предпросмотр. «Синхронизировать в систему» — завести/обновить учётные записи в базе: вход по логину из iiko, уволенных в iiko система блокирует автоматически."
    >
      <div className="flex flex-wrap gap-2">
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 font-bold text-white"
          style={{
            background: C.brandA,
            fontSize: 14.5,
            opacity: loading ? 0.6 : 1,
          }}
        >
          <Users size={17} />
          {loading ? "Загрузка…" : "Загрузить из iiko"}
        </button>
        <button
          onClick={runSync}
          disabled={sync.status === "loading"}
          className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 font-bold"
          style={{
            background: "#fff",
            color: C.brandA,
            border: `1.5px solid ${C.brandA}`,
            fontSize: 14.5,
            opacity: sync.status === "loading" ? 0.6 : 1,
          }}
        >
          <Users size={17} />
          {sync.status === "loading"
            ? "Синхронизация…"
            : "Синхронизировать в систему"}
        </button>
      </div>

      {sync.status === "ok" && sync.result && (
        <p style={{ color: "#2C7", fontSize: 13, marginTop: 10 }}>
          Синхронизировано: создано <b>{sync.result.created}</b>, обновлено{" "}
          <b>{sync.result.updated}</b>, заблокировано (уволены в iiko){" "}
          <b>{sync.result.blocked}</b> из <b>{sync.result.total}</b>.
        </p>
      )}
      {sync.status === "error" && (
        <p style={{ color: "#B23", fontSize: 13, marginTop: 10 }}>
          Ошибка синхронизации: {sync.error}
        </p>
      )}

      {st.status === "error" && (
        <p style={{ color: "#B23", fontSize: 13, marginTop: 12 }}>
          Не удалось получить сотрудников: {st.error}
        </p>
      )}

      {st.status === "ok" && (
        <div style={{ marginTop: 12 }}>
          <p style={{ fontSize: 13, color: C.sub, marginBottom: 8 }}>
            Найдено сотрудников: <b>{st.count}</b>
          </p>
          {st.rawFirst ? (
            <details style={{ marginBottom: 12 }}>
              <summary
                style={{
                  fontSize: 12.5,
                  color: C.sub,
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                Структура ответа iiko (для отладки) — раскрыть и прислать
              </summary>
              <pre
                style={{
                  marginTop: 8,
                  padding: 10,
                  background: "#F7F4EF",
                  borderRadius: 10,
                  border: `1px solid ${C.line}`,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  fontSize: 11,
                }}
              >
                {st.rawFirst}
                {st.deptRawFirst
                  ? "\n\n--- Справочник подразделений ---\n" + st.deptRawFirst
                  : ""}
              </pre>
            </details>
          ) : null}
          {st.count > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full" style={{ fontSize: 13 }}>
                <thead>
                  <tr style={{ color: C.faint, textAlign: "left" }}>
                    <th className="pb-2 font-semibold">ФИО</th>
                    <th className="pb-2 font-semibold">Должность (iiko)</th>
                    <th className="pb-2 font-semibold">Подразделения</th>
                    <th className="pb-2 font-semibold text-center">Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {st.employees.map((e, i) => (
                    <tr
                      key={e.iikoId || i}
                      style={{
                        borderTop: `1px solid ${C.line}`,
                        opacity: e.deleted ? 0.5 : 1,
                      }}
                    >
                      <td
                        className="py-2 pr-2"
                        style={{ color: C.ink, fontWeight: 600 }}
                      >
                        {e.name || "—"}
                        {e.code ? (
                          <span style={{ color: C.faint, fontWeight: 400 }}>
                            {" "}
                            · таб. {e.code}
                          </span>
                        ) : null}
                      </td>
                      <td className="py-2 pr-2" style={{ color: C.sub }}>
                        {e.position || "—"}
                      </td>
                      <td className="py-2 pr-2" style={{ color: C.sub }}>
                        {(e.departmentNames || e.departmentCodes || []).join(
                          ", ",
                        ) || "—"}
                      </td>
                      <td className="py-2 text-center">
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: e.deleted ? "#B23" : "#2C7",
                          }}
                        >
                          {e.deleted ? "Уволен" : "Активен"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: C.sub }}>
              iiko вернул пустой список. Образец ответа (для уточнения формата):
              <pre
                style={{
                  marginTop: 8,
                  padding: 10,
                  background: "#F7F4EF",
                  borderRadius: 10,
                  border: `1px solid ${C.line}`,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  fontSize: 11.5,
                }}
              >
                {st.sample || "(пусто)"}
              </pre>
            </div>
          )}
        </div>
      )}
    </AdCard>
  );
}

// Управление учётными записями сотрудников из iiko (права доступа): роль и
// доступ ко входу. Уволенные в iiko заблокированы автоматически.
function IikoStaffAccounts() {
  const [st, setSt] = useState({ status: "idle", list: [], error: "" });
  const load = async () => {
    setSt((p) => ({ ...p, status: "loading", error: "" }));
    try {
      const data = await apiGet("/api/iiko/employees/db");
      setSt({ status: "ok", list: data.employees || [], error: "" });
    } catch (e) {
      setSt({ status: "error", list: [], error: e.message || "Ошибка" });
    }
  };
  const patch = async (id, body) => {
    setSt((p) => ({
      ...p,
      list: p.list.map((u) => (u.id === id ? { ...u, ...body } : u)),
    }));
    try {
      await apiPatch(`/api/iiko/employees/${id}`, body);
    } catch {
      load(); // при ошибке перечитываем актуальное состояние
    }
  };
  const roleOpts = ROLE_OPTS.map(([value, label]) => ({
    value,
    label: tr(label),
  }));
  return (
    <AdCard
      title="Учётные записи из iiko — права доступа"
      desc="Роль и доступ ко входу реальных сотрудников. Уволенные в iiko заблокированы автоматически. Сначала синхронизируйте, затем «Загрузить учётные записи»."
    >
      <button
        onClick={load}
        disabled={st.status === "loading"}
        className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 font-bold text-white"
        style={{
          background: C.brandA,
          fontSize: 14.5,
          opacity: st.status === "loading" ? 0.6 : 1,
        }}
      >
        <Users size={17} />
        {st.status === "loading" ? "Загрузка…" : "Загрузить учётные записи"}
      </button>

      {st.status === "error" && (
        <p style={{ color: "#B23", fontSize: 13, marginTop: 12 }}>
          Не удалось загрузить: {st.error}
        </p>
      )}

      {st.status === "ok" && (
        <div style={{ marginTop: 12 }}>
          <p style={{ fontSize: 13, color: C.sub, marginBottom: 8 }}>
            Учётных записей: <b>{st.list.length}</b>
          </p>
          {st.list.length === 0 ? (
            <p style={{ fontSize: 13, color: C.sub }}>
              Пока пусто — нажмите «Синхронизировать в систему» выше.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full" style={{ fontSize: 13 }}>
                <thead>
                  <tr style={{ color: C.faint, textAlign: "left" }}>
                    <th className="pb-2 font-semibold">Сотрудник</th>
                    <th className="pb-2 font-semibold">Должность</th>
                    <th className="pb-2 font-semibold">Филиал</th>
                    <th className="pb-2 font-semibold">Роль (доступ)</th>
                    <th className="pb-2 font-semibold text-center">Вход</th>
                  </tr>
                </thead>
                <tbody>
                  {st.list.map((u) => (
                    <tr
                      key={u.id}
                      style={{
                        borderTop: `1px solid ${C.line}`,
                        opacity: u.active ? 1 : 0.5,
                      }}
                    >
                      <td
                        className="py-2 pr-2"
                        style={{ color: C.ink, fontWeight: 600 }}
                      >
                        {u.displayName || "—"}
                        {u.login ? (
                          <span style={{ color: C.faint, fontWeight: 400 }}>
                            {" "}
                            · {u.login}
                          </span>
                        ) : null}
                      </td>
                      <td className="py-2 pr-2" style={{ color: C.sub }}>
                        {u.position || "—"}
                      </td>
                      <td className="py-2 pr-2" style={{ color: C.sub }}>
                        {u.iikoDepartment || "—"}
                      </td>
                      <td className="py-2 pr-2" style={{ minWidth: 160 }}>
                        <Select
                          value={u.role}
                          onChange={(v) => patch(u.id, { role: v })}
                          options={roleOpts}
                        />
                      </td>
                      <td className="py-2 text-center">
                        {u.iikoDeleted ? (
                          <span
                            style={{
                              fontSize: 12,
                              fontWeight: 700,
                              color: "#B23",
                            }}
                          >
                            Уволен в iiko
                          </span>
                        ) : (
                          <button
                            onClick={() => patch(u.id, { active: !u.active })}
                            className="rounded-lg px-2.5 py-1 font-semibold"
                            style={{
                              fontSize: 12,
                              border: `1px solid ${C.line}`,
                              background: u.active ? "#EAF7EE" : "#FDECEC",
                              color: u.active ? "#2C7" : "#B23",
                            }}
                          >
                            {u.active ? "Разрешён" : "Заблокирован"}
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
      )}
    </AdCard>
  );
}

function AdminStaff({ s, dispatch, notify }) {
  const blank = {
    name: "",
    role: "staff",
    positionId: s.positions[0]?.id || "",
    departmentId: s.departments[0]?.id || "",
    branchId: "",
    parentId: "",
    phone: "",
    tg: "",
  };
  const [f, setF] = useState(blank);
  const branchOpts = [
    { value: "", label: "— без филиала —" },
    ...s.branches.map((b) => ({ value: b.id, label: b.name })),
  ];
  const deptOpts = s.departments.map((d) => ({ value: d.id, label: d.name }));
  const posOpts = s.positions.map((p) => ({
    value: p.id,
    label: `${p.title} · ур.${p.level}`,
  }));
  const mgrOpts = [
    { value: "", label: "— без руководителя —" },
    ...s.users
      .filter((u) => u.active !== false)
      .map((u) => ({ value: u.id, label: `${u.name}` })),
  ];

  const add = () => {
    if (!f.name.trim()) {
      notify("Укажите ФИО сотрудника");
      return;
    }
    const pos = s.positions.find((p) => p.id === f.positionId);
    const user = {
      id: "u" + uid().slice(0, 5),
      name: f.name.trim(),
      role: f.role,
      pos: pos ? pos.title : "Сотрудник",
      level: pos ? pos.level : 4,
      branchId: f.branchId === "" ? null : +f.branchId,
      parentId: f.parentId === "" ? null : f.parentId,
      departmentId: f.departmentId || null,
      tg_chat_id: f.tg || null,
      active: true,
    };
    dispatch({ type: "ADD_USER", user });
    notify("Сотрудник добавлен");
    setF(blank);
  };

  return (
    <div className="space-y-5">
      <AdCard
        title="Добавить сотрудника"
        desc="Новый сотрудник появится в оргструктуре, в назначении задач и переключателе ролей."
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <AdInput
            label="ФИО"
            value={f.name}
            onChange={(v) => setF({ ...f, name: v })}
            placeholder="Иванов И. И."
          />
          <Field label="Роль">
            <Select
              value={f.role}
              onChange={(v) => setF({ ...f, role: v })}
              options={ROLE_OPTS.map(([value, label]) => ({
                value,
                label: tr(label),
              }))}
            />
          </Field>
          <Field label="Должность">
            <Select
              value={f.positionId}
              onChange={(v) => setF({ ...f, positionId: v })}
              options={posOpts}
            />
          </Field>
          <Field label="Филиал">
            <Select
              value={f.branchId}
              onChange={(v) => setF({ ...f, branchId: v })}
              options={branchOpts}
            />
          </Field>
          <Field label="Руководитель (эскалация)">
            <Select
              value={f.parentId}
              onChange={(v) => setF({ ...f, parentId: v })}
              options={mgrOpts}
            />
          </Field>
          <Field label="Отдел (граница доступа)">
            <Select
              value={f.departmentId}
              onChange={(v) => setF({ ...f, departmentId: v })}
              options={deptOpts}
            />
          </Field>
          <AdInput
            label="Telegram ID (для бота)"
            value={f.tg}
            onChange={(v) => setF({ ...f, tg: v })}
            placeholder="123456789"
          />
        </div>
        <button
          onClick={add}
          className="mt-4 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 font-bold text-white"
          style={{ background: C.brandA, fontSize: 14.5 }}
        >
          <PlusCircle size={17} /> {tr("Добавить сотрудника")}
        </button>
      </AdCard>

      <IikoStaffPreview />

      <IikoStaffAccounts />

      <AdCard
        title={`Сотрудники (${s.users.length})`}
        desc="Меняйте роль и филиал прямо в таблице. Уволенных — деактивируйте: история их задач сохраняется."
      >
        <div className="hidden lg:block">
          <table className="w-full" style={{ fontSize: 13 }}>
            <thead>
              <tr style={{ color: C.faint, textAlign: "left" }}>
                <th className="pb-2 font-semibold">Сотрудник</th>
                <th className="pb-2 font-semibold">Роль</th>
                <th className="pb-2 font-semibold">Филиал</th>
                <th className="pb-2 font-semibold">Отдел</th>
                <th className="pb-2 font-semibold text-center">Статус</th>
              </tr>
            </thead>
            <tbody>
              {s.users.map((u) => (
                <tr
                  key={u.id}
                  style={{
                    borderTop: `1px solid ${C.line}`,
                    opacity: u.active === false ? 0.5 : 1,
                  }}
                >
                  <td className="py-2.5 pr-2">
                    <div className="flex items-center gap-2">
                      <Avatar id={u.id} size={28} />
                      <div>
                        <div style={{ color: C.ink, fontWeight: 600 }}>
                          {u.name}
                        </div>
                        <div style={{ color: C.faint, fontSize: 11.5 }}>
                          {u.pos}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="py-2.5 pr-2" style={{ minWidth: 150 }}>
                    <Select
                      value={u.role}
                      onChange={(v) =>
                        dispatch({
                          type: "UPDATE_USER",
                          id: u.id,
                          patch: { role: v },
                        })
                      }
                      options={ROLE_OPTS.map(([value, label]) => ({
                        value,
                        label: tr(label),
                      }))}
                    />
                  </td>
                  <td className="py-2.5 pr-2" style={{ minWidth: 130 }}>
                    <Select
                      value={u.branchId == null ? "" : u.branchId}
                      onChange={(v) =>
                        dispatch({
                          type: "UPDATE_USER",
                          id: u.id,
                          patch: { branchId: v === "" ? null : +v },
                        })
                      }
                      options={branchOpts}
                    />
                  </td>
                  <td className="py-2.5 pr-2" style={{ minWidth: 150 }}>
                    <Select
                      value={u.departmentId || ""}
                      onChange={(v) =>
                        dispatch({
                          type: "UPDATE_USER",
                          id: u.id,
                          patch: { departmentId: v || null },
                        })
                      }
                      options={deptOpts}
                    />
                  </td>
                  <td className="py-2.5 text-center">
                    <button
                      onClick={() =>
                        dispatch({
                          type: "UPDATE_USER",
                          id: u.id,
                          patch: { active: u.active === false },
                        })
                      }
                      className="rounded-lg px-2.5 py-1.5 font-semibold"
                      style={
                        u.active === false
                          ? { background: "#FEECEC", color: C.bad }
                          : { background: "#E9F9EF", color: C.ok }
                      }
                    >
                      {u.active === false ? "Неактивен" : "Активен"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="lg:hidden space-y-2.5">
          {s.users.map((u) => (
            <div
              key={u.id}
              className="rounded-xl p-3"
              style={{
                background: "#FBFCFE",
                border: `1px solid ${C.border}`,
                opacity: u.active === false ? 0.55 : 1,
              }}
            >
              <div className="flex items-center gap-2.5">
                <Avatar id={u.id} size={32} />
                <div className="flex-1 min-w-0">
                  <div
                    className="truncate"
                    style={{ color: C.ink, fontWeight: 700, fontSize: 14 }}
                  >
                    {u.name}
                  </div>
                  <div
                    className="truncate"
                    style={{ color: C.faint, fontSize: 12 }}
                  >
                    {u.pos}
                  </div>
                </div>
                <button
                  onClick={() =>
                    dispatch({
                      type: "UPDATE_USER",
                      id: u.id,
                      patch: { active: u.active === false },
                    })
                  }
                  className="shrink-0 rounded-lg px-2.5 py-1.5 font-semibold"
                  style={
                    u.active === false
                      ? { background: "#FEECEC", color: C.bad, fontSize: 12.5 }
                      : { background: "#E9F9EF", color: C.ok, fontSize: 12.5 }
                  }
                >
                  {u.active === false ? "Неактивен" : "Активен"}
                </button>
              </div>
              <div className="mt-2.5 space-y-2">
                <Field label="Роль">
                  <Select
                    value={u.role}
                    onChange={(v) =>
                      dispatch({
                        type: "UPDATE_USER",
                        id: u.id,
                        patch: { role: v },
                      })
                    }
                    options={ROLE_OPTS.map(([value, label]) => ({
                      value,
                      label: tr(label),
                    }))}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Филиал">
                    <Select
                      value={u.branchId == null ? "" : u.branchId}
                      onChange={(v) =>
                        dispatch({
                          type: "UPDATE_USER",
                          id: u.id,
                          patch: { branchId: v === "" ? null : +v },
                        })
                      }
                      options={branchOpts}
                    />
                  </Field>
                  <Field label="Отдел">
                    <Select
                      value={u.departmentId || ""}
                      onChange={(v) =>
                        dispatch({
                          type: "UPDATE_USER",
                          id: u.id,
                          patch: { departmentId: v || null },
                        })
                      }
                      options={deptOpts}
                    />
                  </Field>
                </div>
              </div>
            </div>
          ))}
        </div>
      </AdCard>
    </div>
  );
}

function AdminPositions({ s, dispatch, notify }) {
  const [title, setTitle] = useState("");
  const [level, setLevel] = useState("3");
  const add = () => {
    if (!title.trim()) {
      notify("Укажите название должности");
      return;
    }
    dispatch({
      type: "ADD_POSITION",
      position: {
        id: "p" + uid().slice(0, 4),
        title: title.trim(),
        level: +level,
      },
    });
    notify("Должность добавлена");
    setTitle("");
  };
  return (
    <div className="space-y-5">
      <AdCard
        title="Добавить должность"
        desc="Уровень задаёт иерархию для эскалации: 1 — высшая, 4 — линейный персонал."
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <AdInput
            label="Название"
            value={title}
            onChange={setTitle}
            placeholder="Старший техник"
          />
          <Field label="Уровень иерархии">
            <Select
              value={level}
              onChange={setLevel}
              options={[1, 2, 3, 4].map((n) => ({
                value: n,
                label: `Уровень ${n}`,
              }))}
            />
          </Field>
          <button
            onClick={add}
            className="rounded-xl px-4 py-2.5 font-bold text-white"
            style={{ background: C.brandA, fontSize: 14.5 }}
          >
            Добавить
          </button>
        </div>
      </AdCard>
      <AdCard title={`Должности (${s.positions.length})`}>
        <div className="space-y-2">
          {s.positions
            .sort((a, z) => a.level - z.level)
            .map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-xl px-4 py-2.5"
                style={{
                  background: "#FBFCFE",
                  border: `1px solid ${C.border}`,
                }}
              >
                <span style={{ fontSize: 14, color: C.ink, fontWeight: 600 }}>
                  {p.title}
                </span>
                <Badge color={C.violet} bg="#F5F0FE">
                  Уровень {p.level}
                </Badge>
              </div>
            ))}
        </div>
      </AdCard>
    </div>
  );
}

function AdminBranches({ s, dispatch, notify }) {
  const [bc, setBc] = useState(String(s.companies[0]?.id || ""));
  const [bn, setBn] = useState("");
  const [bb, setBb] = useState("300000");
  const [cn, setCn] = useState("");
  const [ci, setCi] = useState("");
  const addBranch = () => {
    if (!bn.trim()) {
      notify("Укажите название филиала");
      return;
    }
    const id = Math.max(0, ...s.branches.map((b) => b.id)) + 1;
    dispatch({
      type: "ADD_BRANCH",
      branch: { id, companyId: +bc, name: bn.trim(), monthly: +bb || 0 },
    });
    notify("Филиал добавлен");
    setBn("");
  };
  const addCompany = () => {
    if (!cn.trim()) {
      notify("Укажите название юр. лица");
      return;
    }
    const id = Math.max(0, ...s.companies.map((c) => c.id)) + 1;
    dispatch({
      type: "ADD_COMPANY",
      company: { id, name: cn.trim(), inn: ci.trim() },
    });
    notify("Юр. лицо добавлено");
    setCn("");
    setCi("");
  };
  return (
    <div className="space-y-5">
      <AdCard title="Юр. лица и филиалы">
        {s.companies.map((co) => (
          <div key={co.id} className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <Building2 size={16} color={C.brandA} />
              <span style={{ fontWeight: 700, color: C.ink }}>{co.name}</span>
              <Badge>ИНН {co.inn || "—"}</Badge>
            </div>
            <div className="space-y-2">
              {s.branches
                .filter((b) => b.companyId === co.id)
                .map((b) => (
                  <div
                    key={b.id}
                    className="flex items-center gap-3 rounded-xl px-4 py-2.5"
                    style={{
                      background: "#FBFCFE",
                      border: `1px solid ${C.border}`,
                    }}
                  >
                    <span
                      className="flex-1"
                      style={{ fontSize: 14, color: C.ink, fontWeight: 600 }}
                    >
                      Филиал «{b.name}»
                    </span>
                    <span style={{ fontSize: 12.5, color: C.faint }}>
                      Бюджет/мес:
                    </span>
                    <input
                      type="number"
                      value={s.budgets[b.id] || 0}
                      onChange={(e) =>
                        dispatch({
                          type: "SET_BUDGET",
                          branchId: b.id,
                          value: +e.target.value || 0,
                        })
                      }
                      className="rounded-lg px-2 py-1.5 focus:outline-none"
                      style={{
                        border: `1px solid ${C.border}`,
                        fontSize: 13.5,
                        color: C.ink,
                        width: 130,
                      }}
                    />
                    <span style={{ fontSize: 13, color: C.sub }}>сум</span>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </AdCard>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <AdCard title="Добавить филиал">
          <div className="space-y-3">
            <Field label="Юр. лицо">
              <Select
                value={bc}
                onChange={setBc}
                options={s.companies.map((c) => ({
                  value: c.id,
                  label: c.name,
                }))}
              />
            </Field>
            <AdInput
              label="Название филиала"
              value={bn}
              onChange={setBn}
              placeholder="Запад"
            />
            <AdInput
              label="Месячный бюджет, сум"
              type="number"
              value={bb}
              onChange={setBb}
            />
            <button
              onClick={addBranch}
              className="rounded-xl px-4 py-2.5 font-bold text-white"
              style={{ background: C.brandA, fontSize: 14.5 }}
            >
              Добавить филиал
            </button>
          </div>
        </AdCard>
        <AdCard title="Добавить юр. лицо">
          <div className="space-y-3">
            <AdInput
              label="Название"
              value={cn}
              onChange={setCn}
              placeholder="ООО «Новая сеть»"
            />
            <AdInput
              label="ИНН"
              value={ci}
              onChange={setCi}
              placeholder="7700000000"
            />
            <button
              onClick={addCompany}
              className="rounded-xl px-4 py-2.5 font-bold text-white"
              style={{ background: C.brandA, fontSize: 14.5 }}
            >
              Добавить юр. лицо
            </button>
          </div>
        </AdCard>
      </div>
    </div>
  );
}

function AdminSla({ s, dispatch }) {
  return (
    <AdCard
      title="SLA-нормативы (часы на решение)"
      desc="Сколько времени даётся на задачу по приоритету. ИИ применяет это при создании заявок."
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {["Критический", "Высокий", "Обычный"].map((p) => (
          <Field key={p} label={p}>
            <input
              type="number"
              min="1"
              value={s.sla[p] ?? 24}
              onChange={(e) =>
                dispatch({
                  type: "SET_SLA",
                  priority: p,
                  hours: +e.target.value || 1,
                })
              }
              className="w-full rounded-xl px-3 py-2 focus:outline-none"
              style={{
                border: `1px solid ${C.border}`,
                fontSize: 15,
                color: C.ink,
                fontWeight: 700,
              }}
            />
          </Field>
        ))}
      </div>
    </AdCard>
  );
}

function AdSop({ cat, sop, dispatch, notify }) {
  const [text, setText] = useState(sop.steps.join("\n"));
  const [photo, setPhoto] = useState(sop.requirePhoto);
  const save = () => {
    const steps = text
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean);
    dispatch({ type: "SET_SOP", category: cat, steps, requirePhoto: photo });
    notify(`Регламент «${cat}» сохранён`);
  };
  return (
    <AdCard title={cat}>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={Math.max(3, text.split("\n").length)}
        className="w-full rounded-xl px-3 py-2 focus:outline-none resize-y"
        style={{
          border: `1px solid ${C.border}`,
          fontSize: 13.5,
          color: C.ink,
          lineHeight: 1.5,
        }}
      />
      <div style={{ fontSize: 11.5, color: C.faint, marginTop: 4 }}>
        Каждый шаг — с новой строки.
      </div>
      <div className="flex items-center justify-between mt-3">
        <label
          className="flex items-center gap-2 cursor-pointer"
          style={{ fontSize: 13.5, color: C.ink }}
        >
          <input
            type="checkbox"
            checked={photo}
            onChange={() => setPhoto((p) => !p)}
            style={{ width: 18, height: 18, accentColor: C.brandA }}
          />{" "}
          Требовать фотоотчёт
        </label>
        <button
          onClick={save}
          className="rounded-xl px-4 py-2 font-bold text-white"
          style={{ background: C.brandA, fontSize: 13.5 }}
        >
          Сохранить
        </button>
      </div>
    </AdCard>
  );
}
function AdminSops({ s, dispatch, notify }) {
  return (
    <div className="space-y-4">
      <div style={{ fontSize: 13.5, color: C.sub }}>
        Регламенты (SOP) — это чек-листы, которые исполнитель обязан выполнить в
        фазе «В работе» перед сдачей задачи.
      </div>
      {Object.keys(s.sops).map((cat) => (
        <AdSop
          key={cat}
          cat={cat}
          sop={s.sops[cat]}
          dispatch={dispatch}
          notify={notify}
        />
      ))}
    </div>
  );
}

function AdminSystem({ s, dispatch, notify }) {
  const set = (k, v) => dispatch({ type: "SET_SETTING", key: k, value: v });
  const cfg = s.settings || {};
  return (
    <div className="space-y-4">
      <AdCard title="Настройки системы">
        <div className="space-y-3">
          <AdToggle
            label="Голосовой ввод задач"
            hint="Кнопка «Сказать задачу» в форме создания"
            checked={cfg.voiceInput !== false}
            onChange={(v) => set("voiceInput", v)}
          />
          <AdToggle
            label="Водяные знаки на экспорте"
            hint="ФИО и ID сотрудника на выгрузках (защита от утечек)"
            checked={!!cfg.watermark}
            onChange={(v) => set("watermark", v)}
          />
          <AdToggle
            label="Ограничение по IP / VPN"
            hint="Доступ к финансам и админке только из офиса"
            checked={!!cfg.ipRestrict}
            onChange={(v) => set("ipRestrict", v)}
          />
        </div>
      </AdCard>
      <AdCard
        title="Демо-данные"
        desc="Сбросить задачи, журнал, смены и оргструктуру к исходному состоянию."
      >
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
      </AdCard>
    </div>
  );
}

function AdminPanel({ s, dispatch, notify }) {
  const [tab, setTab] = useState("staff");
  const tabs = [
    ["staff", "Сотрудники", Users],
    ["positions", "Должности", Award],
    ["branches", "Филиалы и бюджеты", Building2],
    ["departments", "Отделы и доступ", Lock],
    ["routes", "Маршруты", Send],
    ["sla", "SLA-нормативы", Clock],
    ["sops", "Регламенты", ListChecks],
    ["system", "Система", Settings],
  ];
  return (
    <div className="space-y-5">
      <div
        className="rounded-2xl bg-white p-2 flex flex-wrap gap-1.5"
        style={{ border: `1px solid ${C.border}` }}
      >
        {tabs.map(([k, label, Icon]) => {
          const active = tab === k;
          return (
            <button
              key={k}
              onClick={() => setTab(k)}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 font-semibold"
              style={{
                background: active ? C.brandA : "transparent",
                color: active ? "#fff" : C.ink,
                fontSize: 13.5,
                whiteSpace: "nowrap",
              }}
            >
              <Icon size={16} color={active ? "#fff" : C.sub} /> {tr(label)}
            </button>
          );
        })}
      </div>
      {tab === "staff" && (
        <AdminStaff s={s} dispatch={dispatch} notify={notify} />
      )}
      {tab === "positions" && (
        <AdminPositions s={s} dispatch={dispatch} notify={notify} />
      )}
      {tab === "branches" && (
        <AdminBranches s={s} dispatch={dispatch} notify={notify} />
      )}
      {tab === "departments" && (
        <AdminDepartments s={s} dispatch={dispatch} notify={notify} />
      )}
      {tab === "routes" && (
        <AdminRoutes s={s} dispatch={dispatch} notify={notify} />
      )}
      {tab === "sla" && <AdminSla s={s} dispatch={dispatch} />}
      {tab === "sops" && (
        <AdminSops s={s} dispatch={dispatch} notify={notify} />
      )}
      {tab === "system" && (
        <AdminSystem s={s} dispatch={dispatch} notify={notify} />
      )}
    </div>
  );
}

function AdminDepartments({ s, dispatch, notify }) {
  const [name, setName] = useState("");
  const [restricted, setRestricted] = useState(false);
  const add = () => {
    if (!name.trim()) {
      notify("Укажите название отдела");
      return;
    }
    dispatch({
      type: "ADD_DEPARTMENT",
      department: {
        id: "d" + uid().slice(0, 4),
        name: name.trim(),
        restricted,
      },
    });
    notify("Отдел добавлен");
    setName("");
    setRestricted(false);
  };
  const cats = Object.keys(s.catDept);
  return (
    <div className="space-y-5">
      <AdCard
        title="Отделы и доступ к данным"
        desc="«Закрытый» отдел = его задачи видят только сотрудники этого отдела, финансы и высшее руководство. Например, задачи финансового отдела недоступны посторонним."
      >
        <div className="space-y-2">
          {s.departments.map((d) => (
            <div
              key={d.id}
              className="flex items-center gap-3 rounded-xl px-4 py-2.5"
              style={{ background: "#FBFCFE", border: `1px solid ${C.border}` }}
            >
              <input
                value={d.name}
                onChange={(e) =>
                  dispatch({
                    type: "UPDATE_DEPARTMENT",
                    id: d.id,
                    patch: { name: e.target.value },
                  })
                }
                className="flex-1 rounded-lg px-2 py-1.5 focus:outline-none"
                style={{
                  border: `1px solid ${C.border}`,
                  fontSize: 14,
                  color: C.ink,
                  fontWeight: 600,
                }}
              />
              <button
                onClick={() =>
                  dispatch({
                    type: "UPDATE_DEPARTMENT",
                    id: d.id,
                    patch: { restricted: !d.restricted },
                  })
                }
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-semibold"
                style={
                  d.restricted
                    ? { background: "#FEECEC", color: C.bad }
                    : { background: C.line, color: C.sub }
                }
              >
                <Lock size={14} /> {d.restricted ? "Закрытый" : "Открытый"}
              </button>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end mt-4">
          <AdInput
            label="Новый отдел"
            value={name}
            onChange={setName}
            placeholder="Отдел маркетинга"
          />
          <label
            className="flex items-center gap-2 cursor-pointer"
            style={{ fontSize: 13.5, color: C.ink, paddingBottom: 8 }}
          >
            <input
              type="checkbox"
              checked={restricted}
              onChange={() => setRestricted((r) => !r)}
              style={{ width: 18, height: 18, accentColor: C.bad }}
            />{" "}
            Закрытый (приватный)
          </label>
          <button
            onClick={add}
            className="rounded-xl px-4 py-2.5 font-bold text-white"
            style={{ background: C.brandA, fontSize: 14.5 }}
          >
            Добавить отдел
          </button>
        </div>
      </AdCard>

      <AdCard
        title="Маршрутизация: категория → отдел"
        desc="К какому отделу относится задача каждой категории. От этого зависит, кто её увидит."
      >
        <div className="space-y-2">
          {cats.map((cat) => (
            <div
              key={cat}
              className="flex items-center gap-3 rounded-xl px-4 py-2.5"
              style={{ background: "#FBFCFE", border: `1px solid ${C.border}` }}
            >
              <span
                className="flex-1"
                style={{ fontSize: 14, color: C.ink, fontWeight: 600 }}
              >
                {cat}
              </span>
              <ChevronRight size={16} color={C.faint} />
              <div style={{ minWidth: 200 }}>
                <Select
                  value={s.catDept[cat]}
                  onChange={(v) =>
                    dispatch({
                      type: "SET_CATDEPT",
                      category: cat,
                      departmentId: v,
                    })
                  }
                  options={s.departments.map((d) => ({
                    value: d.id,
                    label: d.name + (d.restricted ? " 🔒" : ""),
                  }))}
                />
              </div>
            </div>
          ))}
        </div>
      </AdCard>
    </div>
  );
}

/* ============================================================================
   МНОГОШАГОВЫЕ МАРШРУТЫ (процессы согласования)
   ============================================================================ */
function StepRail({ steps, current }) {
  return (
    <div className="flex flex-wrap items-stretch gap-1.5">
      {steps.map((st, i) => {
        const done = i < current,
          active = i === current;
        const color = done ? C.ok : active ? C.brandA : "#94A3B8";
        const bg = done ? "#E9F9EF" : active ? "#EFF4FF" : "#F1F5F9";
        return (
          <div
            key={i}
            className="rounded-xl px-2.5 py-2"
            style={{
              background: bg,
              border: `1px solid ${active ? C.brandA : C.border}`,
              minWidth: 104,
              flex: "1 1 104px",
            }}
          >
            <div
              className="flex items-center gap-1.5"
              style={{ fontSize: 10.5, color, fontWeight: 800 }}
            >
              {done ? (
                <CheckCircle2 size={13} />
              ) : (
                <span
                  style={{
                    width: 15,
                    height: 15,
                    borderRadius: 99,
                    background: color,
                    color: "#fff",
                    fontSize: 9.5,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 800,
                  }}
                >
                  {i + 1}
                </span>
              )}
              ШАГ {i + 1}
            </div>
            <div
              style={{
                fontSize: 12,
                color: C.ink,
                fontWeight: 700,
                marginTop: 3,
                lineHeight: 1.2,
              }}
            >
              {st.title}
            </div>
            <div style={{ fontSize: 10.5, color: C.faint, marginTop: 1 }}>
              {st.actor}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RouteResp({ t }) {
  if (t.currentStep >= t.steps.length) {
    return (
      <div
        className="flex items-center gap-2 rounded-xl px-3 py-2.5"
        style={{
          background: "#E9F9EF",
          color: C.ok,
          fontSize: 14,
          fontWeight: 700,
        }}
      >
        <CheckCircle2 size={18} /> Процесс завершён — проверки пройдены, оплата
        проведена
      </div>
    );
  }
  const st = t.steps[t.currentStep];
  const who = userById(t.assignees[t.currentStep]);
  return (
    <div className="flex items-center gap-3 min-w-0">
      <Avatar id={t.assignees[t.currentStep]} size={38} />
      <div className="flex-1 min-w-0">
        <div style={{ fontSize: 11.5, color: C.faint, fontWeight: 600 }}>
          Шаг {t.currentStep + 1} из {t.steps.length} · {st.title}
        </div>
        <div
          className="truncate"
          style={{ fontSize: 14.5, color: C.ink, fontWeight: 700 }}
        >
          {who?.name}{" "}
          <span style={{ color: C.sub, fontWeight: 500 }}>— {st.actor}</span>
        </div>
      </div>
    </div>
  );
}

function RouteFlow({ t, me, shiftOpen, dispatch, notify }) {
  const len = t.steps.length;
  const done = t.currentStep >= len;
  const idx = t.currentStep;
  const step = done ? null : t.steps[idx];
  const [photo, setPhoto] = useState(false);
  const [doc, setDoc] = useState(false);
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    setPhoto(false);
    setDoc(false);
    setChecked(false);
  }, [t.id, t.currentStep]);

  if (done) {
    return (
      <div
        className="rounded-2xl p-5 text-center"
        style={{ background: "#E9F9EF", border: `1px solid ${C.ok}` }}
      >
        <CheckCircle2 size={30} color={C.ok} style={{ margin: "0 auto" }} />
        <div className="font-bold mt-2" style={{ color: C.ok, fontSize: 16 }}>
          Процесс завершён
        </div>
        <div style={{ fontSize: 13.5, color: C.sub, marginTop: 2 }}>
          Товар принят, накладная оформлена и проверена, счёт-фактура сверена,
          оплата проведена.
        </div>
      </div>
    );
  }

  const who = userById(t.assignees[idx]);
  const isMine = t.assignees[idx] === me.id;
  const gateOk =
    (!step.photo || photo) && (!step.doc || doc) && (!step.check || checked);

  return (
    <div
      className="rounded-2xl p-4"
      style={{ border: `2px solid ${C.brandA}`, background: "#FBFDFF" }}
    >
      <div
        className="flex items-center gap-2 mb-1"
        style={{ fontSize: 12, color: C.brandA, fontWeight: 800 }}
      >
        <Send size={14} /> ТЕКУЩИЙ ШАГ {idx + 1} / {len}
      </div>
      <div className="font-bold" style={{ color: C.ink, fontSize: 16 }}>
        {step.title}
      </div>
      <div style={{ fontSize: 13, color: C.sub, marginBottom: 12 }}>
        Ответственный: <b>{who?.name}</b> · {step.actor}
      </div>

      {isMine ? (
        <div className="space-y-2.5">
          {step.photo && (
            <button
              onClick={() => {
                setPhoto(true);
                notify("Фотоотчёт прикреплён (снимок с камеры)");
              }}
              className="w-full flex items-center justify-between rounded-xl px-3.5 py-2.5 font-semibold"
              style={
                photo
                  ? {
                      background: "#E9F9EF",
                      color: C.ok,
                      border: `1px solid ${C.ok}`,
                    }
                  : { background: C.line, color: C.ink }
              }
            >
              <span className="inline-flex items-center gap-2">
                <Camera size={16} /> Фотоотчёт приёмки товара
              </span>
              {photo ? (
                <CheckCircle2 size={16} />
              ) : (
                <span style={{ fontSize: 12.5, color: C.faint }}>
                  обязательно
                </span>
              )}
            </button>
          )}
          {step.doc && (
            <button
              onClick={() => {
                setDoc(true);
                notify(`Документ прикреплён: ${step.docLabel || "документ"}`);
              }}
              className="w-full flex items-center justify-between rounded-xl px-3.5 py-2.5 font-semibold"
              style={
                doc
                  ? {
                      background: "#E9F9EF",
                      color: C.ok,
                      border: `1px solid ${C.ok}`,
                    }
                  : { background: C.line, color: C.ink }
              }
            >
              <span className="inline-flex items-center gap-2">
                <Paperclip size={16} /> {step.docLabel || "Документ"}
              </span>
              {doc ? (
                <CheckCircle2 size={16} />
              ) : (
                <span style={{ fontSize: 12.5, color: C.faint }}>
                  обязательно
                </span>
              )}
            </button>
          )}
          {step.check && (
            <label
              className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 cursor-pointer"
              style={{ background: C.line, color: C.ink, fontSize: 14 }}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => setChecked((v) => !v)}
                style={{ width: 18, height: 18, accentColor: C.brandA }}
              />
              {step.pay
                ? "Сверил фотоотчёт, накладную и счёт-фактуру — всё верно"
                : "Проверил — оформлено и оприходовано верно"}
            </label>
          )}
          {step.pay && t.amount != null && (
            <div
              className="rounded-xl px-3.5 py-2.5"
              style={{
                background: "#F5F0FE",
                border: "1px solid #E4D9FB",
                fontSize: 14,
                color: C.violet,
                fontWeight: 700,
              }}
            >
              <Wallet size={15} style={{ display: "inline", marginRight: 6 }} />{" "}
              К оплате: {fmtMoney(t.amount)}
            </div>
          )}

          {!shiftOpen ? (
            <div
              className="flex items-center gap-2 rounded-xl px-3.5 py-2.5"
              style={{
                background: "#FFF7ED",
                color: C.warn,
                fontSize: 13.5,
                fontWeight: 600,
              }}
            >
              <Lock size={15} /> Откройте смену, чтобы выполнить шаг.
            </div>
          ) : (
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                disabled={!gateOk}
                onClick={() =>
                  dispatch({
                    type: "ROUTE_ADVANCE",
                    id: t.id,
                    userId: me.id,
                    note: `${step.title}: ${step.action}`,
                    addAtt: (step.photo ? 1 : 0) + (step.doc ? 1 : 0),
                  })
                }
                className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 font-bold text-white"
                style={{
                  background: gateOk
                    ? step.pay
                      ? C.violet
                      : C.brandA
                    : "#C7CDD6",
                  fontSize: 14.5,
                }}
              >
                {step.pay ? <Wallet size={17} /> : <Send size={17} />}{" "}
                {step.action}
              </button>
              {step.check && idx > 0 && (
                <button
                  onClick={() =>
                    dispatch({
                      type: "ROUTE_RETURN",
                      id: t.id,
                      userId: me.id,
                      note: `Возврат с шага «${step.title}»`,
                    })
                  }
                  className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 font-bold"
                  style={{
                    background: "#FEECEC",
                    color: C.bad,
                    fontSize: 14.5,
                  }}
                >
                  <RotateCcw size={16} /> Вернуть на доработку
                </button>
              )}
              {!gateOk && (
                <span
                  style={{ fontSize: 12, color: C.faint, alignSelf: "center" }}
                >
                  Прикрепите обязательные вложения, чтобы продолжить.
                </span>
              )}
            </div>
          )}
        </div>
      ) : (
        <div
          className="flex items-center gap-2 rounded-xl px-3.5 py-2.5"
          style={{
            background: "#EFF4FF",
            color: C.brandA,
            fontSize: 13.5,
            fontWeight: 600,
          }}
        >
          <Clock size={15} /> Ожидается действие: {who?.name} ({step.actor}). Вы
          — участник процесса и видите его ход.
        </div>
      )}
    </div>
  );
}

function RouteCreate({ me, s, dispatch, notify }) {
  const [rid, setRid] = useState(s.routes[0]?.id || "");
  const route = s.routes.find((r) => r.id === rid) || s.routes[0];
  const [branch, setBranch] = useState(
    String(me.branchId || s.branches[0]?.id || ""),
  );
  const [supplier, setSupplier] = useState("");
  const [goods, setGoods] = useState("");
  const [amount, setAmount] = useState("");
  const [picks, setPicks] = useState({});
  useEffect(() => {
    const def = {};
    (route?.steps || []).forEach((st, i) => {
      def[i] = assignByActor(st.actor, +branch);
    });
    setPicks(def);
  }, [rid, branch]);

  const create = () => {
    if (!route) {
      notify("Нет шаблонов маршрутов");
      return;
    }
    const steps = route.steps.map((st) => ({ ...st }));
    if (steps.length === 0) {
      notify("В маршруте нет шагов");
      return;
    }
    const assignees = steps.map(
      (st, i) => picks[i] || assignByActor(st.actor, +branch),
    );
    const now = Date.now();
    const task = {
      id: "t" + uid().slice(0, 6),
      title: `Приёмка: ${goods.trim() || "товар"} от ${supplier.trim() || "поставщика"}`,
      description: `Поставщик: ${supplier.trim() || "—"}. Принятый товар: ${goods.trim() || "—"}.`,
      branchId: +branch,
      departmentId: deptForCategory(route.category),
      cat: route.category,
      pr: "Обычный",
      amount: amount ? +amount : null,
      overBudget: false,
      createdBy: me.id,
      createdAt: now,
      slaDeadline: now + slaFor("Обычный") * H,
      attachments: 0,
      favorite: false,
      comments: [],
      routeId: route.id,
      routeName: route.name,
      steps,
      assignees,
      currentStep: 0,
      phase: 1,
      executorId: assignees[0],
      controllerId: assignees[assignees.length - 1],
    };
    dispatch({ type: "CREATE_TASK", task });
    notify("Процесс запущен — задача создана");
    setSupplier("");
    setGoods("");
    setAmount("");
  };

  const userOpts = s.users
    .filter((u) => u.active !== false)
    .map((u) => ({ value: u.id, label: `${u.name} · ${u.pos}` }));
  const inp = { border: `1px solid ${C.border}`, fontSize: 14.5, color: C.ink };

  return (
    <div
      className="rounded-2xl bg-white p-6"
      style={{ border: `1px solid ${C.border}` }}
    >
      <h2
        className="font-extrabold mb-1"
        style={{ color: C.ink, fontSize: 19 }}
      >
        {tr("Запустить процесс по шаблону")}
      </h2>
      <p style={{ fontSize: 14, color: C.sub, marginBottom: 16 }}>
        Задача пройдёт по шагам маршрута: каждый участник выполняет свой шаг
        строго по очереди, с обязательными вложениями.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Шаблон процесса">
          <Select
            value={rid}
            onChange={setRid}
            options={s.routes.map((r) => ({ value: r.id, label: r.name }))}
          />
        </Field>
        <Field label="Филиал">
          <Select
            value={branch}
            onChange={setBranch}
            options={s.branches.map((b) => ({ value: b.id, label: b.name }))}
          />
        </Field>
        <Field label="Поставщик">
          <input
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
            placeholder="ООО «Поставщик»"
            className="w-full rounded-xl px-3 py-2.5 focus:outline-none"
            style={inp}
          />
        </Field>
        <Field label="Что приняли">
          <input
            value={goods}
            onChange={(e) => setGoods(e.target.value)}
            placeholder="Продукты, упаковка…"
            className="w-full rounded-xl px-3 py-2.5 focus:outline-none"
            style={inp}
          />
        </Field>
        <Field label="Сумма к оплате, сум">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            className="w-full rounded-xl px-3 py-2.5 focus:outline-none"
            style={inp}
          />
        </Field>
      </div>

      <div
        className="mt-4 rounded-xl p-3"
        style={{ background: "#FBFCFE", border: `1px solid ${C.border}` }}
      >
        <div
          style={{
            fontSize: 12.5,
            color: C.faint,
            fontWeight: 700,
            marginBottom: 8,
          }}
        >
          УЧАСТНИКИ ШАГОВ (можно переназначить)
        </div>
        <div className="space-y-2">
          {(route?.steps || []).map((st, i) => (
            <div key={i} className="flex items-center gap-2 flex-wrap">
              <span
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 99,
                  background: C.brandA,
                  color: "#fff",
                  fontSize: 11,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 800,
                }}
              >
                {i + 1}
              </span>
              <span
                style={{
                  fontSize: 13,
                  color: C.ink,
                  fontWeight: 600,
                  minWidth: 150,
                }}
              >
                {st.title}
              </span>
              <span style={{ fontSize: 11.5, color: C.faint }}>{st.actor}</span>
              {st.photo && (
                <Badge color={C.ok} bg="#E9F9EF">
                  📷 фото
                </Badge>
              )}
              {st.doc && (
                <Badge color={C.violet} bg="#F5F0FE">
                  📄 {st.docLabel || "документ"}
                </Badge>
              )}
              {st.pay && (
                <Badge color={C.violet} bg="#F5F0FE">
                  💳 оплата
                </Badge>
              )}
              <div style={{ minWidth: 220, flex: 1 }}>
                <Select
                  value={picks[i] || ""}
                  onChange={(v) => setPicks({ ...picks, [i]: v })}
                  options={userOpts}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={create}
        className="mt-4 inline-flex items-center gap-2 rounded-xl px-5 py-3 font-bold text-white"
        style={{
          background: `linear-gradient(90deg, ${C.violet}, ${C.brandA})`,
          fontSize: 15,
        }}
      >
        <Send size={18} /> {tr("Запустить процесс")}
      </button>
    </div>
  );
}

function CreatePage({ me, s, dispatch, notify }) {
  const [mode, setMode] = useState("simple");
  const tabs = [
    ["simple", "Простая заявка", Sparkles],
    ["process", "По шаблону", ListChecks],
  ];
  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div
        className="rounded-2xl bg-white p-2 flex gap-2"
        style={{ border: `1px solid ${C.border}` }}
      >
        {tabs.map(([k, label, Icon]) => {
          const active = mode === k;
          return (
            <button
              key={k}
              onClick={() => setMode(k)}
              className="flex-1 min-w-0 inline-flex items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 font-bold"
              style={{
                background: active ? C.brandA : "transparent",
                color: active ? "#fff" : C.ink,
                fontSize: 13.5,
                lineHeight: 1.15,
                textAlign: "center",
              }}
            >
              <Icon
                size={16}
                color={active ? "#fff" : C.sub}
                className="shrink-0"
              />{" "}
              <span style={{ overflowWrap: "break-word" }}>{tr(label)}</span>
            </button>
          );
        })}
      </div>
      {mode === "simple" && (
        <CreateTask
          me={me}
          tasks={s.tasks}
          now={Date.now()}
          dispatch={dispatch}
          notify={notify}
          voiceEnabled={s.settings?.voiceInput !== false}
        />
      )}
      {mode === "process" && (
        <RouteCreate me={me} s={s} dispatch={dispatch} notify={notify} />
      )}
    </div>
  );
}

function AdRoute({ route, s, dispatch, notify }) {
  const [title, setTitle] = useState("");
  const [actor, setActor] = useState(s.positions[0]?.title || "");
  const [action, setAction] = useState("");
  const [photo, setPhoto] = useState(false);
  const [doc, setDoc] = useState(false);
  const addStep = () => {
    if (!title.trim()) {
      notify("Укажите название шага");
      return;
    }
    const steps = [
      ...route.steps,
      {
        title: title.trim(),
        actor,
        action: action.trim() || "Выполнил шаг",
        photo,
        doc,
        check: !photo && !doc,
      },
    ];
    dispatch({ type: "UPDATE_ROUTE", id: route.id, patch: { steps } });
    notify("Шаг добавлен");
    setTitle("");
    setAction("");
    setPhoto(false);
    setDoc(false);
  };
  const delStep = (i) =>
    dispatch({
      type: "UPDATE_ROUTE",
      id: route.id,
      patch: { steps: route.steps.filter((_, j) => j !== i) },
    });
  return (
    <div
      className="rounded-xl p-3"
      style={{ background: "#FBFCFE", border: `1px solid ${C.border}` }}
    >
      <div className="flex items-center gap-2 mb-2">
        <ListChecks size={16} color={C.brandA} />
        <span style={{ fontWeight: 700, color: C.ink }}>{route.name}</span>
        <Badge>{route.category}</Badge>
      </div>
      <div className="space-y-1.5 mb-3">
        {route.steps.map((st, i) => (
          <div
            key={i}
            className="flex items-center gap-2 flex-wrap rounded-lg px-3 py-2"
            style={{ background: "#fff", border: `1px solid ${C.line}` }}
          >
            <span
              style={{
                width: 18,
                height: 18,
                borderRadius: 99,
                background: C.brandA,
                color: "#fff",
                fontSize: 11,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 800,
              }}
            >
              {i + 1}
            </span>
            <span style={{ fontSize: 13, color: C.ink, fontWeight: 600 }}>
              {st.title}
            </span>
            <span style={{ fontSize: 11.5, color: C.faint }}>· {st.actor}</span>
            {st.photo && (
              <Badge color={C.ok} bg="#E9F9EF">
                📷
              </Badge>
            )}
            {st.doc && (
              <Badge color={C.violet} bg="#F5F0FE">
                📄
              </Badge>
            )}
            {st.check && (
              <Badge color={C.brandA} bg="#EFF4FF">
                ✔
              </Badge>
            )}
            {st.pay && (
              <Badge color={C.violet} bg="#F5F0FE">
                💳
              </Badge>
            )}
            <button
              onClick={() => delStep(i)}
              className="ml-auto"
              title="Удалить шаг"
            >
              <X size={14} color={C.faint} />
            </button>
          </div>
        ))}
        {route.steps.length === 0 && (
          <div style={{ fontSize: 12.5, color: C.faint }}>
            Шагов пока нет — добавьте ниже.
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 items-end">
        <AdInput
          label="Название шага"
          value={title}
          onChange={setTitle}
          placeholder="Проверка договора"
        />
        <Field label="Ответственный (должность)">
          <Select
            value={actor}
            onChange={setActor}
            options={s.positions.map((p) => ({
              value: p.title,
              label: p.title,
            }))}
          />
        </Field>
        <AdInput
          label="Действие (кнопка)"
          value={action}
          onChange={setAction}
          placeholder="Проверил и согласовал"
        />
        <div className="flex items-center gap-3 pb-1">
          <label
            className="flex items-center gap-1.5 cursor-pointer"
            style={{ fontSize: 13, color: C.ink }}
          >
            <input
              type="checkbox"
              checked={photo}
              onChange={() => setPhoto((v) => !v)}
              style={{ width: 16, height: 16, accentColor: C.brandA }}
            />{" "}
            фото
          </label>
          <label
            className="flex items-center gap-1.5 cursor-pointer"
            style={{ fontSize: 13, color: C.ink }}
          >
            <input
              type="checkbox"
              checked={doc}
              onChange={() => setDoc((v) => !v)}
              style={{ width: 16, height: 16, accentColor: C.brandA }}
            />{" "}
            документ
          </label>
          <button
            onClick={addStep}
            className="ml-auto rounded-lg px-3 py-2 font-bold text-white"
            style={{ background: C.brandA, fontSize: 13.5 }}
          >
            + шаг
          </button>
        </div>
      </div>
    </div>
  );
}

function AdminRoutes({ s, dispatch, notify }) {
  const [name, setName] = useState("");
  const [cat, setCat] = useState(Object.keys(s.catDept)[0] || "Прочее");
  const addRoute = () => {
    if (!name.trim()) {
      notify("Укажите название маршрута");
      return;
    }
    dispatch({
      type: "ADD_ROUTE",
      route: {
        id: "r" + uid().slice(0, 4),
        name: name.trim(),
        category: cat,
        steps: [],
      },
    });
    notify("Маршрут добавлен");
    setName("");
  };
  return (
    <div className="space-y-5">
      <AdCard
        title="Шаблоны процессов (маршруты)"
        desc="Маршрут — последовательность шагов с ответственными. Задача проходит шаги строго по очереди; на каждом шаге можно требовать фото и/или документ."
      >
        <div className="space-y-4">
          {s.routes.map((r) => (
            <AdRoute
              key={r.id}
              route={r}
              s={s}
              dispatch={dispatch}
              notify={notify}
            />
          ))}
        </div>
      </AdCard>
      <AdCard title="Добавить маршрут">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <AdInput
            label="Название"
            value={name}
            onChange={setName}
            placeholder="Согласование договора"
          />
          <Field label="Категория">
            <Select
              value={cat}
              onChange={setCat}
              options={Object.keys(s.catDept).map((c) => ({
                value: c,
                label: c,
              }))}
            />
          </Field>
          <button
            onClick={addRoute}
            className="rounded-xl px-4 py-2.5 font-bold text-white"
            style={{ background: C.brandA, fontSize: 14.5 }}
          >
            Добавить маршрут
          </button>
        </div>
      </AdCard>
    </div>
  );
}
