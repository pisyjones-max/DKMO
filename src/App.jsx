import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Home as HomeIcon, Target, Image as ImageIcon, SlidersHorizontal, Users,
  Plus, Trash2, Check, ChevronRight, Download, Share2, RefreshCw, X,
} from "lucide-react";
import { ensureNotificationPermission, rescheduleDailyCountdown, notifyMilestone } from "./notifications.js";
import { shareImage, downloadBlob } from "./share.js";
import { celebrate } from "./haptics.js";
import LifeGridView from "./LifeGrid.jsx";
import { syncWidgetData } from "./widgetSync.js";
import QRCode from "qrcode";
import Friends from "./Friends.jsx";
import { APP_INSTALL_URL } from "./constants.js";

/* ---------- Design tokens ----------
Bg:      #0A0A0A   Card: #151515   Border: rgba(245,245,240,0.12)
Text:    #F5F5F0   Muted: rgba(245,245,240,0.55)
Accent:  #C8FF00 (кислотный лайм)   Danger: #FF4D4D
Display: Archivo Black / Body: Inter / Data: IBM Plex Mono
------------------------------------- */
const BG = "#0A0A0A";
const CARD = "#151515";
const CARD2 = "#1D1D1D";
const BORDER = "rgba(245,245,240,0.12)";
const TEXT = "#F5F5F0";
const MUTED = "rgba(245,245,240,0.55)";
const ACCENT = "#C8FF00";
const DANGER = "#FF4D4D";

const FONT_LINK =
  "https://fonts.googleapis.com/css2?family=Archivo+Black&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap";

function useFonts() {
  useEffect(() => {
    if (!document.getElementById("dkmo-fonts")) {
      const link = document.createElement("link");
      link.id = "dkmo-fonts";
      link.rel = "stylesheet";
      link.href = FONT_LINK;
      document.head.appendChild(link);
    }
  }, []);
}

/* ---------- Storage ---------- */
async function loadState() {
  try {
    const raw = localStorage.getItem("dkmo:state");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
async function saveState(state) {
  try {
    localStorage.setItem("dkmo:state", JSON.stringify(state));
  } catch (e) {
    console.error("storage failed", e);
  }
}

const DEFAULT_STATE = {
  onboarded: false,
  birthDate: null, // "YYYY-MM-DD"
  endAge: 50,
  goals: [], // {id, text, done, createdAt, subtasks:[{id,text,done}], rewardGranted, rewardId}
  notifyHour: 10, // час ежедневного уведомления, 0-23
  streak: { count: 0, lastOpenDate: null },
  displayName: null, // имя для раздела "Друзья", не связано с birthDate
};

const TAUNTS = [
  "НЕ ПРОСРЫВАЙ.",
  "МОЛОДОСТЬ НЕ БЕСКОНЕЧНА. ЗАТО БУТЕРБРОД ЕЩЁ МОЖНО СЪЕСТЬ.",
  "ВРЕМЕНИ ДОСТАТОЧНО. НО НЕ БЕСКОНЕЧНО.",
  "СЧИТАЕМ ЧЕСТНО.",
  "ОДНИМ ДНЁМ МЕНЬШЕ — ОДНИМ ДЕЛОМ БЛИЖЕ.",
  "НЕ ОТКЛАДЫВАЙ ЖИЗНЬ.",
];

// Переводим абстрактное число дней в понятные вещи — приём в духе
// Spotify Wrapped: сухая цифра сама по себе ничего не значит, а вот
// "это N воскресений" считывается мгновенно.
const COMPARISON_GENERATORS = [
  (d) => `Это ${Math.floor(d / 7).toLocaleString("ru-RU")} воскресений`,
  (d) => `Это примерно ${Math.floor(d / 29.5).toLocaleString("ru-RU")} полнолуний`,
  (d) => `Это ${(d / 1461).toFixed(1)} циклов Олимпийских игр`,
  (d) => `Это ${Math.floor(d / 91).toLocaleString("ru-RU")} смен времён года`,
  (d) => `Это ${Math.floor(d / 42).toLocaleString("ru-RU")} стрижек, если раз в 6 недель`,
  (d) => `Это ${Math.floor(d / 30).toLocaleString("ru-RU")} зарплат, если раз в месяц`,
  (d) => `Это ${Math.floor(d / 365).toLocaleString("ru-RU")} дней рождения`,
];

function getGreeting(now) {
  const h = now.getHours();
  if (h < 5) return "Ты не спишь, а время идёт.";
  if (h < 11) return "Доброе утро. Ещё один день в счёт.";
  if (h < 17) return "Середина дня — не теряй его.";
  if (h < 23) return "Вечер. Что успел сегодня?";
  return "Поздняя ночь. Время не делает перерывов.";
}

const GOAL_SUGGESTIONS = [
  "Купить дом", "Путешествовать", "Заработать 10 млн", "Научиться играть на гитаре",
  "Уехать в другую страну", "Сделать свой бизнес", "Влюбиться", "Родить ребёнка",
  "Построить мастерскую", "Снять фильм", "Увидеть океан", "Написать книгу",
];

// Готовые шаги для целей-подсказок — чтобы прогресс ощущался сразу,
// а не только когда пользователь сам придумает разбивку.
const GOAL_TEMPLATES = {
  "Купить дом": ["Накопить на первый взнос", "Выбрать район", "Посмотреть 10 вариантов", "Оформить ипотеку"],
  "Путешествовать": ["Выбрать страну", "Купить билеты", "Забронировать жильё", "Полететь"],
  "Заработать 10 млн": ["Составить финансовый план", "Найти доп. источник дохода", "Накопить первый миллион", "Дойти до цели"],
  "Научиться играть на гитаре": ["Купить гитару", "Выучить 3 аккорда", "Сыграть песню целиком", "Сыграть при друзьях"],
  "Уехать в другую страну": ["Выбрать страну", "Оформить документы", "Найти жильё", "Переехать"],
  "Сделать свой бизнес": ["Придумать идею", "Составить план", "Запустить первую версию", "Найти первого клиента"],
  "Влюбиться": ["Обновить анкету", "Пригласить кого-то на свидание", "Второе свидание", "Сказать, что чувствуешь"],
  "Родить ребёнка": ["Поговорить с партнёром", "Проверить здоровье", "Подготовить всё для малыша", "Родить"],
  "Построить мастерскую": ["Найти место", "Купить инструменты", "Сделать первую вещь", "Обустроить всё"],
  "Снять фильм": ["Написать сценарий", "Собрать команду", "Отснять материал", "Смонтировать"],
  "Увидеть океан": ["Выбрать побережье", "Купить билет", "Доехать", "Зайти в воду"],
  "Написать книгу": ["Придумать сюжет", "Написать первую главу", "Дописать черновик", "Издать или опубликовать"],
};

// ⚠️ ШАБЛОН ПРОГРАММЫ НАГРАД. Это заглушки для демонстрации механики —
// названия партнёров намеренно обобщены и НЕ являются реальными брендами
// или действующими промокодами. Прежде чем публиковать приложение,
// договоритесь с реальными магазинами и замените поля brand/discount/code/url
// ниже на настоящие. Больше в коде менять не нужно — вся логика выдачи,
// показа и истории наград уже работает с этим массивом.
const REWARDS = [
  { id: "r1", emoji: "🌸", title: "Скидка на парфюм", brand: "Партнёр — парфюмерия", discount: "-15%", code: "DKMO-YOUTH15", url: "" },
  { id: "r2", emoji: "☕", title: "Кофе в подарок", brand: "Партнёр — кофейня", discount: "1 напиток бесплатно", code: "DKMO-COFFEE", url: "" },
  { id: "r3", emoji: "👟", title: "Скидка на одежду", brand: "Партнёр — магазин одежды", discount: "-10%", code: "DKMO-STYLE10", url: "" },
  { id: "r4", emoji: "📚", title: "Скидка на книги", brand: "Партнёр — книжный магазин", discount: "-20%", code: "DKMO-READ20", url: "" },
  { id: "r5", emoji: "💪", title: "Пробная тренировка", brand: "Партнёр — фитнес-клуб", discount: "Бесплатное занятие", code: "DKMO-MOVE", url: "" },
  { id: "r6", emoji: "✈️", title: "Скидка на путешествие", brand: "Партнёр — турагентство", discount: "-5%", code: "DKMO-GO5", url: "" },
  { id: "r7", emoji: "🎬", title: "Билет в кино", brand: "Партнёр — кинотеатр", discount: "2-й билет в подарок", code: "DKMO-MOVIE2", url: "" },
];

// Выдаём награду, стараясь не повторять уже полученные пользователем
function pickReward(existingGoals) {
  const used = existingGoals.filter((g) => g.rewardId).map((g) => g.rewardId);
  const available = REWARDS.filter((r) => !used.includes(r.id));
  const pool = available.length ? available : REWARDS;
  return pool[Math.floor(Math.random() * pool.length)];
}

/* ---------- Date math ---------- */
function addYears(date, years) {
  const d = new Date(date);
  d.setFullYear(d.getFullYear() + years);
  return d;
}
function daysBetween(a, b) {
  return Math.ceil((b.getTime() - a.getTime()) / 86400000);
}

function computeCounters(birthDateStr, endAge, now) {
  const birth = new Date(birthDateStr + "T00:00:00");
  const daysLived = Math.max(0, Math.floor((now - birth) / 86400000));

  const endDate = addYears(birth, endAge);
  const date50 = addYears(birth, 50);
  const date60 = addYears(birth, 60);

  const daysUntilEnd = Math.max(0, daysBetween(now, endDate));
  const daysUntil50 = daysBetween(now, date50);
  const daysUntil60 = daysBetween(now, date60);

  const yearEnd = new Date(now.getFullYear() + 1, 0, 1);
  const daysUntilYearEnd = Math.max(0, daysBetween(now, yearEnd));

  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const msLeftToday = todayEnd - now;
  const hoursLeftToday = Math.floor(msLeftToday / 3600000);
  const minutesLeftToday = Math.floor((msLeftToday % 3600000) / 60000);

  let ageYears = now.getFullYear() - birth.getFullYear();
  const hadBirthday =
    now.getMonth() > birth.getMonth() ||
    (now.getMonth() === birth.getMonth() && now.getDate() >= birth.getDate());
  if (!hadBirthday) ageYears -= 1;

  const totalYouthMs = Math.max(1, endDate - birth);
  const usedMs = Math.min(totalYouthMs, Math.max(0, now - birth));
  const progress = usedMs / totalYouthMs;

  return {
    daysLived, daysUntilEnd, daysUntil50, daysUntil60, daysUntilYearEnd,
    hoursLeftToday, minutesLeftToday, ageYears, progress, endDate, birth,
  };
}

function useCounters(birthDate, endAge) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);
  return useMemo(() => {
    if (!birthDate) return null;
    return computeCounters(birthDate, endAge, now);
  }, [birthDate, endAge, now]);
}

// Живые тикающие часы "сколько осталось до конца текущих суток" — обновляются
// каждую секунду. Живёт отдельно от useCounters, чтобы не дёргать перерисовку
// всего приложения (вкладки "Цели"/"Карточки"/"Настройки") каждую секунду —
// тикает только пока открыт этот компонент (обычно только "Главная").
function useLiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const msLeft = todayEnd - now;
  const totalSeconds = Math.max(0, Math.floor(msLeft / 1000));
  return {
    hours: Math.floor(totalSeconds / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}
function pad2(n) {
  return String(n).padStart(2, "0");
}

// Цифра не просто появляется, а "доскручивается" — приём из финтех-приложений
// (Stripe, Robinhood), делает интерфейс живым вместо статичной таблицы.
function useCountUp(target) {
  const [display, setDisplay] = useState(target ?? 0);
  const prevRef = useRef(target);
  useEffect(() => {
    if (target == null) return;
    const start = prevRef.current ?? target;
    prevRef.current = target;
    if (start === target) {
      setDisplay(target);
      return;
    }
    const startTime = performance.now();
    const duration = 700;
    let raf;
    function tick(now) {
      const t = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(start + (target - start) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return display;
}


/* ---------- Shared UI bits ---------- */
const h1 = { fontFamily: "'Archivo Black'", fontSize: 30, fontWeight: 400, letterSpacing: -0.5, color: TEXT, margin: 0 };
const label = { fontFamily: "Inter", fontSize: 12, fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase", color: MUTED };
const btnPrimary = {
  background: ACCENT, color: "#0A0A0A", border: "none", padding: "16px 22px", borderRadius: 14,
  fontFamily: "Inter", fontWeight: 700, fontSize: 15, display: "inline-flex", alignItems: "center",
  gap: 8, cursor: "pointer", width: "100%", justifyContent: "center",
};
const btnGhost = {
  background: "transparent", color: TEXT, border: `1px solid ${BORDER}`, padding: "14px 20px", borderRadius: 14,
  fontFamily: "Inter", fontWeight: 600, fontSize: 14, display: "inline-flex", alignItems: "center",
  gap: 8, cursor: "pointer", width: "100%", justifyContent: "center",
};
const inputStyle = {
  width: "100%", background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14,
  color: TEXT, fontFamily: "Inter", fontSize: 16, boxSizing: "border-box",
};

/* ---------- Onboarding ---------- */
function Onboarding({ onComplete }) {
  const [step, setStep] = useState(0);
  const [birthDate, setBirthDate] = useState("");
  const [endAge, setEndAge] = useState(50);

  const maxDate = new Date().toISOString().slice(0, 10);

  return (
    <div style={{ minHeight: "100vh", background: BG, display: "flex", flexDirection: "column", justifyContent: "center", padding: 28, fontFamily: "Inter", boxSizing: "border-box" }}>
      <div style={{ maxWidth: 420, width: "100%", margin: "0 auto" }}>
        {step === 0 && (
          <div>
            <div style={{ ...label, color: ACCENT, marginBottom: 14 }}>ДКМО</div>
            <h1 style={{ ...h1, fontSize: 34, lineHeight: 1.15, marginBottom: 18 }}>
              ДО КОНЦА МОЛОДОСТИ ОСТАЛОСЬ
            </h1>
            <p style={{ color: MUTED, fontSize: 15, lineHeight: 1.6, marginBottom: 36 }}>
              Ты не знаешь, сколько тебе осталось быть молодым.
              Мы просто предлагаем считать.
            </p>
            <button style={btnPrimary} onClick={() => setStep(1)}>
              Начать считать <ChevronRight size={18} />
            </button>
          </div>
        )}

        {step === 1 && (
          <div>
            <div style={{ ...label, marginBottom: 10 }}>Шаг 1 из 2</div>
            <h1 style={{ ...h1, marginBottom: 8 }}>Когда ты родился?</h1>
            <p style={{ color: MUTED, fontSize: 14, marginBottom: 20 }}>Это останется только на этом телефоне.</p>
            <input
              type="date"
              value={birthDate}
              max={maxDate}
              onChange={(e) => setBirthDate(e.target.value)}
              style={{ ...inputStyle, colorScheme: "dark" }}
            />
            <button
              style={{ ...btnPrimary, marginTop: 20, opacity: birthDate ? 1 : 0.4 }}
              disabled={!birthDate}
              onClick={() => setStep(2)}
            >
              Дальше <ChevronRight size={18} />
            </button>
          </div>
        )}

        {step === 2 && (
          <div>
            <div style={{ ...label, marginBottom: 10 }}>Шаг 2 из 2</div>
            <h1 style={{ ...h1, marginBottom: 8 }}>До какого возраста молодость?</h1>
            <p style={{ color: MUTED, fontSize: 14, marginBottom: 20 }}>Выбери свою границу. Можно изменить позже в настройках.</p>
            <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
              {[40, 50, 60].map((a) => (
                <button
                  key={a}
                  onClick={() => setEndAge(a)}
                  style={{
                    flex: 1, padding: "16px 0", borderRadius: 14, cursor: "pointer",
                    fontFamily: "'IBM Plex Mono'", fontWeight: 600, fontSize: 18,
                    background: endAge === a ? ACCENT : CARD,
                    color: endAge === a ? "#0A0A0A" : TEXT,
                    border: `1px solid ${endAge === a ? ACCENT : BORDER}`,
                  }}
                >
                  {a}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
              <span style={{ color: MUTED, fontSize: 13 }}>Свой возраст:</span>
              <input
                type="number"
                min={18}
                max={99}
                value={endAge}
                onChange={(e) => setEndAge(Number(e.target.value) || 50)}
                style={{ ...inputStyle, width: 90, padding: 10, fontFamily: "'IBM Plex Mono'" }}
              />
            </div>
            <button
              style={btnPrimary}
              onClick={() => onComplete({ birthDate, endAge })}
            >
              Начать отсчёт
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Progress bar ---------- */
function YouthBar({ progress }) {
  const p = Math.max(0, Math.min(1, progress));
  return (
    <div style={{ height: 8, width: "100%", background: CARD, borderRadius: 4, overflow: "hidden", border: `1px solid ${BORDER}` }}>
      <div style={{ height: "100%", width: `${p * 100}%`, background: ACCENT, transition: "width 0.6s ease" }} />
    </div>
  );
}

function ProgressMini({ value }) {
  const p = Math.max(0, Math.min(1, value));
  return (
    <div style={{ height: 4, width: "100%", background: CARD2, borderRadius: 2, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${p * 100}%`, background: ACCENT, transition: "width 0.4s ease" }} />
    </div>
  );
}

/* ---------- Reward modal ---------- */
function StreakModal({ count, onClose }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(10,10,10,0.94)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ maxWidth: 320, width: "100%", background: CARD, border: `1px solid ${BORDER}`, borderRadius: 24, padding: 28, textAlign: "center" }}>
        <div style={{ fontSize: 44, marginBottom: 10 }}>🔥</div>
        <div style={{ fontFamily: "'Archivo Black'", fontSize: 26, color: ACCENT, marginBottom: 8 }}>{count} ДНЕЙ ПОДРЯД</div>
        <div style={{ color: MUTED, fontSize: 14, marginBottom: 22 }}>Не останавливайся.</div>
        <button onClick={onClose} style={btnPrimary}>Дальше</button>
      </div>
    </div>
  );
}

function RewardModal({ goalText, reward, onClose }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(reward.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // буфер обмена недоступен — код всё равно виден на экране, просто не скопируется автоматически
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(10,10,10,0.94)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ maxWidth: 340, width: "100%", background: CARD, border: `1px solid ${BORDER}`, borderRadius: 24, padding: 28, textAlign: "center", position: "relative" }}>
        <button onClick={onClose} style={{ position: "absolute", top: 14, right: 14, background: "none", border: "none", cursor: "pointer", padding: 4 }}>
          <X size={20} color={MUTED} />
        </button>

        <div style={{ fontSize: 46, marginBottom: 10 }}>{reward.emoji}</div>
        <div style={{ ...label, color: ACCENT, marginBottom: 8 }}>ЦЕЛЬ ДОСТИГНУТА</div>
        <div style={{ fontFamily: "'Archivo Black'", fontSize: 19, color: TEXT, marginBottom: 6, lineHeight: 1.3 }}>{goalText}</div>
        <div style={{ color: MUTED, fontSize: 13, marginBottom: 22 }}>Держи подарок от партнёра</div>

        <div style={{ background: CARD2, borderRadius: 16, padding: 18, marginBottom: 18, textAlign: "left" }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: TEXT, marginBottom: 2 }}>{reward.title}</div>
          <div style={{ color: MUTED, fontSize: 12, marginBottom: 10 }}>{reward.brand}</div>
          <div style={{ fontFamily: "'Archivo Black'", fontSize: 21, color: ACCENT, marginBottom: 14 }}>{reward.discount}</div>
          <div
            onClick={copy}
            style={{ background: "#0A0A0A", border: `1px dashed ${ACCENT}`, borderRadius: 10, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
          >
            <span style={{ fontFamily: "'IBM Plex Mono'", fontSize: 15, color: TEXT, letterSpacing: 1 }}>{reward.code}</span>
            <span style={{ color: ACCENT, fontSize: 11, fontWeight: 700 }}>{copied ? "СКОПИРОВАНО" : "КОПИРОВАТЬ"}</span>
          </div>
        </div>

        <button onClick={onClose} style={btnPrimary}>Отлично</button>
      </div>
    </div>
  );
}

/* ---------- Stat card ---------- */
function StatCard({ title, value, unit }) {
  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: "16px 16px" }}>
      <div style={{ ...label, marginBottom: 8, fontSize: 11 }}>{title}</div>
      <div style={{ fontFamily: "'IBM Plex Mono'", fontWeight: 600, fontSize: 24, color: TEXT }}>
        {value}
        {unit && <span style={{ fontSize: 13, opacity: 0.5, marginLeft: 4 }}>{unit}</span>}
      </div>
    </div>
  );
}

/* ---------- Home ---------- */
function Home({ state, counters, onGoToCards, onGoToLifeGrid }) {
  const [taunt, setTaunt] = useState(() => TAUNTS[Math.floor(Math.random() * TAUNTS.length)]);
  const [compareIdx, setCompareIdx] = useState(() => Math.floor(Math.random() * COMPARISON_GENERATORS.length));
  const clock = useLiveClock();
  const [greeting] = useState(() => getGreeting(new Date()));
  const animatedDays = useCountUp(counters?.daysUntilEnd);
  if (!counters) return null;

  const streak = state.streak?.count || 0;
  const compareText = COMPARISON_GENERATORS[compareIdx](counters.daysUntilEnd);

  return (
    <div style={{ padding: "24px 20px 110px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ ...label, color: ACCENT }}>ДКМО</div>
        {streak > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 5, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 20, padding: "5px 11px" }}>
            <span style={{ fontSize: 13 }}>🔥</span>
            <span style={{ fontFamily: "'IBM Plex Mono'", fontSize: 12, fontWeight: 600, color: TEXT }}>{streak}</span>
          </div>
        )}
      </div>

      <div style={{ color: MUTED, fontSize: 13, marginBottom: 14, fontFamily: "Inter" }}>{greeting}</div>

      <div style={{ ...label, marginBottom: 6 }}>До конца молодости осталось</div>
      <div style={{ fontFamily: "'Archivo Black'", fontSize: 64, lineHeight: 1, color: TEXT, marginBottom: 8, wordBreak: "break-word" }}>
        {animatedDays.toLocaleString("ru-RU")}
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
        <span style={{ fontFamily: "'IBM Plex Mono'", fontWeight: 600, fontSize: 22, color: ACCENT, letterSpacing: 1 }}>
          {pad2(clock.hours)}:{pad2(clock.minutes)}:{pad2(clock.seconds)}
        </span>
        <span style={{ ...label, fontSize: 11 }}>до конца суток</span>
      </div>
      <div style={{ ...label, marginBottom: 18 }}>дней · тебе {counters.ageYears}</div>

      <YouthBar progress={counters.progress} />

      <button
        onClick={() => setCompareIdx((i) => (i + 1) % COMPARISON_GENERATORS.length)}
        style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: 0, marginTop: 14 }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6, color: MUTED, fontSize: 13, fontFamily: "Inter" }}>
          <span>{compareText}</span>
          <RefreshCw size={12} style={{ opacity: 0.5, flexShrink: 0 }} />
        </div>
      </button>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 18 }}>
        <StatCard title="Прожито дней" value={counters.daysLived.toLocaleString("ru-RU")} />
        <StatCard title="До конца года" value={counters.daysUntilYearEnd} unit="дн." />
        <StatCard title="До 50" value={counters.daysUntil50 > 0 ? counters.daysUntil50.toLocaleString("ru-RU") : "уже прошло"} />
        <StatCard title="До 60" value={counters.daysUntil60 > 0 ? counters.daysUntil60.toLocaleString("ru-RU") : "уже прошло"} />
        <StatCard title="Сегодня осталось" value={`${counters.hoursLeftToday}ч ${counters.minutesLeftToday}м`} />
        <StatCard title="Целей поставлено" value={state.goals.length} />
      </div>

      <button
        onClick={onGoToLifeGrid}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", marginTop: 12,
          background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: "16px 18px", cursor: "pointer",
        }}
      >
        <div style={{ textAlign: "left" }}>
          <div style={{ fontFamily: "Inter", fontWeight: 700, fontSize: 14, color: TEXT, marginBottom: 2 }}>Жизнь в неделях</div>
          <div style={{ color: MUTED, fontSize: 12 }}>Каждый квадрат — неделя. Наглядно и жёстко.</div>
        </div>
        <ChevronRight size={18} color={ACCENT} style={{ flexShrink: 0 }} />
      </button>

      <div style={{ marginTop: 12, padding: 16, borderRadius: 16, background: CARD2, border: `1px solid ${BORDER}` }}>
        <div style={{ fontFamily: "Inter", fontWeight: 700, fontSize: 13, letterSpacing: 0.5, color: ACCENT, marginBottom: 6 }}>
          {taunt}
        </div>
        <div style={{ color: MUTED, fontSize: 13, lineHeight: 1.5 }}>
          У тебя есть время. Но не бесконечно.
        </div>
      </div>

      <button onClick={onGoToCards} style={{ ...btnPrimary, marginTop: 20 }}>
        <Share2 size={17} /> Поделиться числом
      </button>
    </div>
  );
}

/* ---------- Goals ---------- */
function Goals({ state, onAdd, onToggle, onDelete, onAddSubtask, onToggleSubtask, onDeleteSubtask }) {
  const [text, setText] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [subtaskDrafts, setSubtaskDrafts] = useState({});
  const done = state.goals.filter((g) => g.done).length;

  const submit = () => {
    const t = text.trim();
    if (!t) return;
    onAdd(t);
    setText("");
  };

  const submitSubtask = (goalId) => {
    const t = (subtaskDrafts[goalId] || "").trim();
    if (!t) return;
    onAddSubtask(goalId, t);
    setSubtaskDrafts((d) => ({ ...d, [goalId]: "" }));
  };

  const earnedGoals = state.goals.filter((g) => g.rewardGranted);

  return (
    <div style={{ padding: "24px 20px 110px" }}>
      <h1 style={{ ...h1, marginBottom: 4 }}>ПОКА ЕСТЬ ВРЕМЯ</h1>
      <div style={{ ...label, marginBottom: 20 }}>{done} из {state.goals.length} сделано · выполнил цель — получи подарок</div>

      <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Что хочешь успеть?"
          style={inputStyle}
        />
        <button onClick={submit} style={{ background: ACCENT, border: "none", borderRadius: 12, width: 52, flexShrink: 0, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Plus size={22} color="#0A0A0A" />
        </button>
      </div>

      {state.goals.length === 0 && (
        <div style={{ marginBottom: 22 }}>
          <div style={{ ...label, marginBottom: 10 }}>Например — сразу с шагами</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {GOAL_SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => onAdd(s, GOAL_TEMPLATES[s] || [])}
                style={{ background: CARD, border: `1px solid ${BORDER}`, color: TEXT, borderRadius: 20, padding: "8px 14px", fontSize: 13, cursor: "pointer", fontFamily: "Inter" }}
              >
                + {s}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {[...state.goals].reverse().map((g) => {
          const hasSubtasks = g.subtasks && g.subtasks.length > 0;
          const doneCount = hasSubtasks ? g.subtasks.filter((st) => st.done).length : 0;
          const isExpanded = expanded === g.id;

          return (
            <div key={g.id} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: "12px 14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <button
                  onClick={() => !hasSubtasks && onToggle(g.id)}
                  style={{
                    width: 26, height: 26, borderRadius: 8, flexShrink: 0, cursor: hasSubtasks ? "default" : "pointer",
                    background: g.done ? ACCENT : "transparent", border: `1px solid ${g.done ? ACCENT : BORDER}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  {g.done && <Check size={16} color="#0A0A0A" />}
                </button>

                <div
                  style={{ flex: 1, cursor: hasSubtasks ? "pointer" : "default" }}
                  onClick={() => hasSubtasks && setExpanded(isExpanded ? null : g.id)}
                >
                  <span style={{ fontFamily: "Inter", fontSize: 14, color: g.done ? MUTED : TEXT, textDecoration: g.done ? "line-through" : "none" }}>
                    {g.text}
                  </span>
                  {hasSubtasks && (
                    <div style={{ ...label, fontSize: 11, marginTop: 3 }}>{doneCount}/{g.subtasks.length} шагов</div>
                  )}
                </div>

                {g.rewardGranted && <span style={{ fontSize: 16 }}>🎁</span>}

                <button onClick={() => setExpanded(isExpanded ? null : g.id)} style={{ background: "none", border: "none", cursor: "pointer", opacity: 0.5, padding: 4 }}>
                  <ChevronRight size={16} color={TEXT} style={{ transform: isExpanded ? "rotate(90deg)" : "none", transition: "transform 0.2s" }} />
                </button>
                <button onClick={() => onDelete(g.id)} style={{ background: "none", border: "none", cursor: "pointer", opacity: 0.5, padding: 4 }}>
                  <Trash2 size={16} color={TEXT} />
                </button>
              </div>

              {hasSubtasks && (
                <div style={{ marginTop: 10 }}>
                  <ProgressMini value={doneCount / g.subtasks.length} />
                </div>
              )}

              {isExpanded && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${BORDER}`, display: "flex", flexDirection: "column", gap: 8 }}>
                  {(g.subtasks || []).map((st) => (
                    <div key={st.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <button
                        onClick={() => onToggleSubtask(g.id, st.id)}
                        style={{
                          width: 20, height: 20, borderRadius: 6, flexShrink: 0, cursor: "pointer",
                          background: st.done ? ACCENT : "transparent", border: `1px solid ${st.done ? ACCENT : BORDER}`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}
                      >
                        {st.done && <Check size={12} color="#0A0A0A" />}
                      </button>
                      <span style={{ flex: 1, fontFamily: "Inter", fontSize: 13, color: st.done ? MUTED : TEXT, textDecoration: st.done ? "line-through" : "none" }}>
                        {st.text}
                      </span>
                      <button onClick={() => onDeleteSubtask(g.id, st.id)} style={{ background: "none", border: "none", cursor: "pointer", opacity: 0.4, padding: 2 }}>
                        <X size={13} color={TEXT} />
                      </button>
                    </div>
                  ))}

                  <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
                    <input
                      value={subtaskDrafts[g.id] || ""}
                      onChange={(e) => setSubtaskDrafts((d) => ({ ...d, [g.id]: e.target.value }))}
                      onKeyDown={(e) => e.key === "Enter" && submitSubtask(g.id)}
                      placeholder="Добавить шаг"
                      style={{ ...inputStyle, padding: 9, fontSize: 13 }}
                    />
                    <button
                      onClick={() => submitSubtask(g.id)}
                      style={{ background: CARD2, border: `1px solid ${BORDER}`, borderRadius: 8, width: 36, flexShrink: 0, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                    >
                      <Plus size={14} color={TEXT} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {earnedGoals.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <div style={{ ...label, marginBottom: 10 }}>Твои награды</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {earnedGoals.map((g) => {
              const reward = REWARDS.find((r) => r.id === g.rewardId);
              if (!reward) return null;
              return (
                <div key={g.id} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "10px 12px", display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 20 }}>{reward.emoji}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: TEXT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{reward.title}</div>
                    <div style={{ fontSize: 11, color: MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{reward.brand}</div>
                  </div>
                  <span style={{ fontFamily: "'IBM Plex Mono'", fontSize: 12, color: ACCENT, flexShrink: 0 }}>{reward.code}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Card / wallpaper generator ---------- */
const FORMATS = {
  story: { w: 1080, h: 1920, label: "Сторис", cta: true },
  post: { w: 1080, h: 1080, label: "Пост", cta: true },
  wallpaperPhone: { w: 1080, h: 2340, label: "Обои телефон", cta: false },
  wallpaperDesktop: { w: 1920, h: 1080, label: "Обои десктоп", cta: false },
};

async function drawCard(canvas, fmt, { days, taunt, dateStr }) {
  const { w, h, cta } = FORMATS[fmt];
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");

  try {
    await document.fonts.load(`900 100px 'Archivo Black'`);
    await document.fonts.load(`600 40px 'Inter'`);
    await document.fonts.load(`600 40px 'IBM Plex Mono'`);
  } catch {}

  // bg
  ctx.fillStyle = "#0A0A0A";
  ctx.fillRect(0, 0, w, h);

  // thin frame
  const pad = w * 0.045;
  ctx.strokeStyle = "#C8FF00";
  ctx.lineWidth = Math.max(2, w * 0.0035);
  ctx.strokeRect(pad, pad, w - pad * 2, h - pad * 2);

  const cx = w / 2;
  const isWide = w > h;

  ctx.textAlign = "center";

  // Eyebrow label
  ctx.fillStyle = "#C8FF00";
  ctx.font = `700 ${w * 0.026}px Inter`;
  const eyebrowY = isWide ? h * 0.28 : h * 0.24;
  ctx.fillText("Д К М О", cx, eyebrowY);

  // Main label
  ctx.fillStyle = "#F5F5F0";
  ctx.font = `700 ${w * 0.032}px Inter`;
  const labelY = eyebrowY + w * 0.06;
  wrapText(ctx, "ДО КОНЦА МОЛОДОСТИ ОСТАЛОСЬ", cx, labelY, w * 0.8, w * 0.04);

  // Big number
  ctx.fillStyle = "#F5F5F0";
  const numFontSize = isWide ? w * 0.14 : w * 0.22;
  ctx.font = `400 ${numFontSize}px 'Archivo Black'`;
  const numY = isWide ? h * 0.56 : h * 0.46;
  ctx.fillText(days.toLocaleString("ru-RU"), cx, numY);

  ctx.fillStyle = "#C8FF00";
  ctx.font = `700 ${w * 0.032}px Inter`;
  ctx.fillText("ДНЕЙ", cx, numY + w * 0.05);

  if (cta) {
    const isPost = fmt === "post";
    const ctaY = isPost ? h * 0.68 : h * 0.74;

    ctx.fillStyle = "#F5F5F0";
    ctx.font = `700 ${w * 0.045}px 'Archivo Black'`;
    ctx.fillText("А У ТЕБЯ?", cx, ctaY);

    // QR-код на страницу установки — усиливает вирусный цикл из концепции:
    // человек видит карточку у друга, сканирует, ставит приложение сам.
    try {
      const qrSize = isPost ? w * 0.1 : w * 0.15;
      const qrDataUrl = await QRCode.toDataURL(APP_INSTALL_URL, {
        margin: 0,
        width: Math.round(qrSize * 2), // рендерим с запасом резкости, вписываем меньшим размером
        color: { dark: "#F5F5F0", light: "#0A0A0A" },
      });
      const qrImg = await loadImage(qrDataUrl);
      const qrY = ctaY + w * (isPost ? 0.025 : 0.035);
      ctx.drawImage(qrImg, cx - qrSize / 2, qrY, qrSize, qrSize);

      ctx.fillStyle = "rgba(245,245,240,0.5)";
      ctx.font = `600 ${w * 0.014}px 'IBM Plex Mono'`;
      ctx.fillText("СКАНИРУЙ И СЧИТАЙ СВОИ", cx, qrY + qrSize + w * (isPost ? 0.02 : 0.028));
    } catch (e) {
      console.log("QR generation failed", e);
    }
  } else {
    ctx.fillStyle = "rgba(245,245,240,0.7)";
    ctx.font = `600 ${w * 0.02}px Inter`;
    ctx.fillText("НЕ ОТКЛАДЫВАЙ ЖИЗНЬ.", cx, h - h * 0.1);
  }

  // date stamp
  ctx.fillStyle = "rgba(245,245,240,0.4)";
  ctx.font = `500 ${w * 0.016}px 'IBM Plex Mono'`;
  ctx.fillText(dateStr, cx, h - pad - w * 0.01);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line = "";
  let curY = y;
  const lines = [];
  for (const word of words) {
    const test = line ? line + " " + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  const startY = curY - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((l, i) => ctx.fillText(l, x, startY + i * lineHeight));
}

function Cards({ counters }) {
  const canvasRef = useRef(null);
  const [fmt, setFmt] = useState("story");
  const [taunt, setTaunt] = useState(() => TAUNTS[Math.floor(Math.random() * TAUNTS.length)]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null); // {ok, text}

  const dateStr = new Date().toLocaleDateString("ru-RU");

  useEffect(() => {
    if (!counters || !canvasRef.current) return;
    drawCard(canvasRef.current, fmt, { days: counters.daysUntilEnd, taunt, dateStr });
  }, [fmt, taunt, counters, dateStr]);

  const getBlob = () =>
    new Promise((resolve) => {
      if (!canvasRef.current) return resolve(null);
      canvasRef.current.toBlob((b) => resolve(b), "image/png");
    });

  const download = async () => {
    setBusy(true);
    setStatus(null);
    const blob = await getBlob();
    if (blob) {
      downloadBlob(blob, `dkmo-${fmt}.png`);
      setStatus({ ok: true, text: "Файл сохранён в загрузки." });
    } else {
      setStatus({ ok: false, text: "Не получилось создать файл. Попробуй ещё раз." });
    }
    setBusy(false);
  };

  const share = async () => {
    setBusy(true);
    setStatus(null);
    const blob = await getBlob();
    if (!blob) {
      setStatus({ ok: false, text: "Не получилось создать файл. Попробуй ещё раз." });
      setBusy(false);
      return;
    }
    const result = await shareImage(blob, {
      title: "ДКМО",
      text: "До конца молодости осталось. А у тебя?",
      filename: `dkmo-${fmt}.png`,
    });
    if (result.cancelled) {
      // пользователь сам закрыл системное меню — ничего не показываем
    } else if (result.ok && result.method === "native") {
      setStatus({ ok: true, text: "Открыто системное меню «Поделиться»." });
    } else if (result.ok && result.method === "web-share") {
      setStatus({ ok: true, text: "Готово." });
    } else if (result.ok && result.method === "download") {
      setStatus({ ok: true, text: "Прямой шаринг недоступен — файл сохранён в загрузки, отправь его вручную." });
    } else {
      setStatus({ ok: false, text: "Не получилось поделиться. Попробуй кнопку скачивания рядом." });
    }
    setBusy(false);
  };

  const ratio = FORMATS[fmt].w / FORMATS[fmt].h;

  return (
    <div style={{ padding: "24px 20px 110px" }}>
      <h1 style={{ ...h1, marginBottom: 4 }}>КАРТОЧКИ</h1>
      <div style={{ ...label, marginBottom: 18 }}>Сторис, посты, обои — с твоим числом</div>

      <div style={{ display: "flex", gap: 8, marginBottom: 18, overflowX: "auto" }}>
        {Object.entries(FORMATS).map(([key, f]) => (
          <button
            key={key}
            onClick={() => setFmt(key)}
            style={{
              flexShrink: 0, background: fmt === key ? ACCENT : CARD, color: fmt === key ? "#0A0A0A" : TEXT,
              border: `1px solid ${fmt === key ? ACCENT : BORDER}`, borderRadius: 20, padding: "8px 14px",
              fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "Inter", whiteSpace: "nowrap",
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}>
        <div
          style={{
            width: "100%", maxWidth: ratio >= 1 ? 320 : 220, aspectRatio: `${ratio}`,
            borderRadius: 18, overflow: "hidden", border: `1px solid ${BORDER}`, background: "#000",
          }}
        >
          <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
        </div>
      </div>

      <button
        onClick={() => setTaunt(TAUNTS[Math.floor(Math.random() * TAUNTS.length)])}
        style={{ ...btnGhost, marginBottom: 10 }}
      >
        <RefreshCw size={15} /> Обновить фразу
      </button>

      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={share} disabled={busy} style={{ ...btnPrimary, opacity: busy ? 0.6 : 1 }}>
          <Share2 size={17} /> Поделиться
        </button>
        <button onClick={download} disabled={busy} style={{ ...btnGhost, width: 56, flexShrink: 0, padding: 0 }}>
          <Download size={18} />
        </button>
      </div>

      {status && (
        <div style={{ marginTop: 12, fontSize: 13, lineHeight: 1.5, color: status.ok ? ACCENT : DANGER, fontFamily: "Inter" }}>
          {status.text}
        </div>
      )}
    </div>
  );
}

/* ---------- Settings ---------- */
function Settings({ state, onSave, onReset }) {
  const [birthDate, setBirthDate] = useState(state.birthDate || "");
  const [endAge, setEndAge] = useState(state.endAge);
  const [notifyHour, setNotifyHour] = useState(state.notifyHour ?? 10);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const maxDate = new Date().toISOString().slice(0, 10);

  return (
    <div style={{ padding: "24px 20px 110px" }}>
      <h1 style={{ ...h1, marginBottom: 20 }}>НАСТРОЙКИ</h1>

      <div style={{ marginBottom: 8, ...label }}>Дата рождения</div>
      <input
        type="date" value={birthDate} max={maxDate}
        onChange={(e) => setBirthDate(e.target.value)}
        style={{ ...inputStyle, colorScheme: "dark", marginBottom: 18 }}
      />

      <div style={{ marginBottom: 8, ...label }}>Конец молодости — возраст</div>
      <input
        type="number" min={18} max={99} value={endAge}
        onChange={(e) => setEndAge(Number(e.target.value) || 50)}
        style={{ ...inputStyle, marginBottom: 18, fontFamily: "'IBM Plex Mono'" }}
      />

      <div style={{ marginBottom: 8, ...label }}>Ежедневное напоминание — час</div>
      <input
        type="number" min={0} max={23} value={notifyHour}
        onChange={(e) => setNotifyHour(Math.min(23, Math.max(0, Number(e.target.value) || 0)))}
        style={{ ...inputStyle, marginBottom: 6, fontFamily: "'IBM Plex Mono'" }}
      />
      <div style={{ ...label, marginBottom: 18, fontSize: 11 }}>
        Придёт в {pad2(notifyHour)}:00 с актуальным числом дней
      </div>

      <button
        style={{ ...btnPrimary, marginBottom: 30 }}
        onClick={() => onSave({ birthDate, endAge, notifyHour })}
      >
        Сохранить
      </button>

      <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 20 }}>
        {!confirmingReset ? (
          <button style={{ ...btnGhost, color: DANGER, borderColor: "rgba(255,77,77,0.3)" }} onClick={() => setConfirmingReset(true)}>
            <Trash2 size={16} /> Сбросить все данные
          </button>
        ) : (
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 16 }}>
            <p style={{ color: TEXT, fontSize: 14, lineHeight: 1.5, marginBottom: 14 }}>
              Удалятся дата рождения, цели и настройки. Это необратимо.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={{ ...btnPrimary, background: DANGER, color: "#fff" }} onClick={() => { onReset(); setConfirmingReset(false); }}>
                Удалить всё
              </button>
              <button style={btnGhost} onClick={() => setConfirmingReset(false)}>Отмена</button>
            </div>
          </div>
        )}
      </div>

      <div style={{ marginTop: 30, textAlign: "center", ...label, opacity: 0.4 }}>
        ДКМО · У тебя есть время. Но не бесконечно.
      </div>
    </div>
  );
}

/* ---------- Root App ---------- */
export default function App() {
  useFonts();
  const [state, setState] = useState(null);
  const [tab, setTab] = useState("home");
  const [rewardModal, setRewardModal] = useState(null); // {goalText, reward}
  const [streakModal, setStreakModal] = useState(null); // number | null
  const [showLifeGrid, setShowLifeGrid] = useState(false);

  useEffect(() => {
    loadState().then((s) => setState(s || DEFAULT_STATE));
  }, []);

  useEffect(() => {
    if (state) saveState(state);
  }, [state]);

  const counters = useCounters(state?.birthDate, state?.endAge);

  // Пробрасываем дату рождения/возраст в нативное хранилище — оттуда их
  // читает виджет на главном экране (см. android-widget-kit/). На вебе
  // и до установки виджета это просто no-op.
  useEffect(() => {
    if (state?.birthDate) syncWidgetData(state.birthDate, state.endAge);
  }, [state?.birthDate, state?.endAge]);

  // Стрик: считаем дни подряд, когда приложение было открыто (как в Duolingo).
  // Срабатывает один раз за сессию, сразу после онбординга.
  useEffect(() => {
    if (!state?.onboarded) return;
    const today = new Date().toISOString().slice(0, 10);
    setState((s) => {
      const prevStreak = s.streak || { count: 0, lastOpenDate: null };
      if (prevStreak.lastOpenDate === today) return s;
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const newCount = prevStreak.lastOpenDate === yesterday ? prevStreak.count + 1 : 1;
      return { ...s, streak: { count: newCount, lastOpenDate: today } };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.onboarded]);

  // Вехи по стрику — 7/30/100 дней подряд, разово, с вибро и уведомлением
  useEffect(() => {
    const count = state?.streak?.count;
    if (!count) return;
    if ([7, 30, 100].includes(count)) {
      const key = `dkmo:streak-milestone:${count}`;
      if (!localStorage.getItem(key)) {
        localStorage.setItem(key, "1");
        celebrate();
        setStreakModal(count);
        notifyMilestone(`${count} дней подряд с ДКМО. Не останавливайся.`).catch(() => {});
      }
    }
  }, [state?.streak?.count]);

  // Пересобираем ежедневное уведомление при каждом запуске с актуальным числом дней
  useEffect(() => {
    if (!state?.onboarded || !counters) return;
    (async () => {
      try {
        await ensureNotificationPermission();
        await rescheduleDailyCountdown(counters.daysUntilEnd, state.notifyHour ?? 10);
      } catch (e) {
        console.log("Notifications unavailable in this environment", e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.onboarded, counters?.daysUntilEnd, state?.notifyHour]);

  // Уведомление о круглых вехах (каждые 1000 дней до конца молодости)
  useEffect(() => {
    if (!counters) return;
    if (counters.daysUntilEnd > 0 && counters.daysUntilEnd % 1000 === 0) {
      const key = `dkmo:milestone:${counters.daysUntilEnd}`;
      if (!localStorage.getItem(key)) {
        localStorage.setItem(key, "1");
        notifyMilestone(`Осталось ровно ${counters.daysUntilEnd.toLocaleString("ru-RU")} дней.`).catch(() => {});
      }
    }
  }, [counters?.daysUntilEnd]);

  if (!state) {
    return <div style={{ minHeight: "100vh", background: BG }} />;
  }

  if (!state.onboarded) {
    return (
      <Onboarding
        onComplete={({ birthDate, endAge }) => {
          setState({ ...DEFAULT_STATE, birthDate, endAge, onboarded: true });
        }}
      />
    );
  }

  const addGoal = (text, subtaskTemplates = []) => {
    const subtasks = subtaskTemplates.map((t) => ({ id: Date.now() + Math.random(), text: t, done: false }));
    setState((s) => ({
      ...s,
      goals: [...s.goals, { id: Date.now() + Math.random(), text, done: false, createdAt: new Date().toISOString(), subtasks, rewardGranted: false, rewardId: null }],
    }));
  };

  const toggleGoal = (id) => {
    const goal = state.goals.find((g) => g.id === id);
    if (!goal) return;
    const willBeDone = !goal.done;
    const shouldGrant = willBeDone && !goal.rewardGranted;
    const reward = shouldGrant ? pickReward(state.goals) : null;

    setState((s) => ({
      ...s,
      goals: s.goals.map((g) =>
        g.id === id
          ? { ...g, done: willBeDone, ...(reward ? { rewardGranted: true, rewardId: reward.id } : {}) }
          : g
      ),
    }));

    if (reward) {
      celebrate();
      setRewardModal({ goalText: goal.text, reward });
    }
  };

  const deleteGoal = (id) => {
    setState((s) => ({ ...s, goals: s.goals.filter((g) => g.id !== id) }));
  };

  const addSubtask = (goalId, text) => {
    setState((s) => ({
      ...s,
      goals: s.goals.map((g) =>
        g.id === goalId ? { ...g, subtasks: [...(g.subtasks || []), { id: Date.now() + Math.random(), text, done: false }] } : g
      ),
    }));
  };

  const toggleSubtask = (goalId, subId) => {
    const goal = state.goals.find((g) => g.id === goalId);
    if (!goal) return;
    const updatedSubtasks = (goal.subtasks || []).map((st) => (st.id === subId ? { ...st, done: !st.done } : st));
    const allDone = updatedSubtasks.length > 0 && updatedSubtasks.every((st) => st.done);
    const shouldGrant = allDone && !goal.done && !goal.rewardGranted;
    const reward = shouldGrant ? pickReward(state.goals) : null;

    setState((s) => ({
      ...s,
      goals: s.goals.map((g) =>
        g.id === goalId
          ? { ...g, subtasks: updatedSubtasks, done: allDone, ...(reward ? { rewardGranted: true, rewardId: reward.id } : {}) }
          : g
      ),
    }));

    if (reward) {
      celebrate();
      setRewardModal({ goalText: goal.text, reward });
    }
  };

  const deleteSubtask = (goalId, subId) => {
    setState((s) => ({
      ...s,
      goals: s.goals.map((g) => (g.id === goalId ? { ...g, subtasks: (g.subtasks || []).filter((st) => st.id !== subId) } : g)),
    }));
  };

  const saveSettings = ({ birthDate, endAge, notifyHour }) => {
    setState((s) => ({ ...s, birthDate, endAge, notifyHour }));
  };
  const setDisplayName = (name) => {
    setState((s) => ({ ...s, displayName: name }));
  };
  const resetAll = () => {
    localStorage.clear();
    setState({ ...DEFAULT_STATE });
  };

  const tabs = [
    { id: "home", icon: HomeIcon, label: "Главная" },
    { id: "goals", icon: Target, label: "Цели" },
    { id: "friends", icon: Users, label: "Друзья" },
    { id: "cards", icon: ImageIcon, label: "Карточки" },
    { id: "settings", icon: SlidersHorizontal, label: "Настройки" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: BG, fontFamily: "Inter" }}>
      {tab === "home" && (
        <Home
          state={state}
          counters={counters}
          onGoToCards={() => setTab("cards")}
          onGoToLifeGrid={() => setShowLifeGrid(true)}
        />
      )}
      {tab === "goals" && (
        <Goals
          state={state}
          onAdd={addGoal}
          onToggle={toggleGoal}
          onDelete={deleteGoal}
          onAddSubtask={addSubtask}
          onToggleSubtask={toggleSubtask}
          onDeleteSubtask={deleteSubtask}
        />
      )}
      {tab === "friends" && <Friends state={state} counters={counters} onSetDisplayName={setDisplayName} />}
      {tab === "cards" && <Cards counters={counters} />}
      {tab === "settings" && <Settings state={state} onSave={saveSettings} onReset={resetAll} />}

      {rewardModal && (
        <RewardModal
          goalText={rewardModal.goalText}
          reward={rewardModal.reward}
          onClose={() => setRewardModal(null)}
        />
      )}

      {streakModal && <StreakModal count={streakModal} onClose={() => setStreakModal(null)} />}

      {showLifeGrid && (
        <LifeGridView
          birthDate={state.birthDate}
          endAge={state.endAge}
          onClose={() => setShowLifeGrid(false)}
        />
      )}

      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#0A0A0A", borderTop: `1px solid ${BORDER}`, display: "flex", padding: "10px 0 22px" }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{ flex: 1, background: "none", border: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: "pointer", color: tab === t.id ? ACCENT : MUTED }}
          >
            <t.icon size={20} />
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" }}>{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
