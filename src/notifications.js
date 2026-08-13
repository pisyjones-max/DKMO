// Локальные уведомления работают офлайн и не требуют бэкенда.
// Так как счётчик дней меняется каждые сутки, мы не можем один раз
// запланировать текст на годы вперёд — вместо этого приложение
// переpланирует уведомление на "завтра" при каждом запуске
// (см. вызов rescheduleDailyCountdown в App.jsx).

import { LocalNotifications } from "@capacitor/local-notifications";

const DAILY_ID = 2001;

const TAUNTS = [
  "НЕ ПРОСРЫВАЙ.",
  "ВРЕМЯ ИДЁТ, ПОКА ТЫ ЧИТАЕШЬ ЭТО.",
  "А ТЫ УЖЕ СДЕЛАЛ ХОТЬ ЧТО-ТО ИЗ СПИСКА?",
  "БУТЕРБРОД ЕЩЁ МОЖНО СЪЕСТЬ.",
  "СЧИТАЕМ ДАЛЬШЕ.",
  "ОДНИМ ДНЁМ МЕНЬШЕ.",
];

export async function ensureNotificationPermission() {
  const perm = await LocalNotifications.checkPermissions();
  if (perm.display !== "granted") {
    await LocalNotifications.requestPermissions();
  }
}

// Ежедневное напоминание в 10:00 с актуальным числом оставшихся дней.
// Вызывать при каждом старте приложения — план на "завтра" пересоздаётся,
// поэтому число всегда свежее.
export async function rescheduleDailyCountdown(daysLeft, hour = 10, minute = 0) {
  await LocalNotifications.cancel({ notifications: [{ id: DAILY_ID }] });
  const taunt = TAUNTS[Math.floor(Math.random() * TAUNTS.length)];
  await LocalNotifications.schedule({
    notifications: [
      {
        id: DAILY_ID,
        title: "ДО КОНЦА МОЛОДОСТИ",
        body: `Осталось ${daysLeft.toLocaleString("ru-RU")} дней. ${taunt}`,
        schedule: { on: { hour, minute } },
      },
    ],
  });
}

// Уведомление о достигнутой круглой вехе (каждую 1000 дней, каждый год и т.д.)
export async function notifyMilestone(label) {
  await LocalNotifications.schedule({
    notifications: [
      {
        id: Date.now() % 100000,
        title: "ВЕХА",
        body: label,
        schedule: { at: new Date(Date.now() + 1000) },
      },
    ],
  });
}
