// Мост между веб-частью и нативным виджетом на главном экране Android.
//
// Виджет — это отдельный процесс, у него нет доступа к localStorage внутри
// WebView. Поэтому при каждом изменении даты рождения / возраста мы дублируем
// эти два поля в нативное хранилище (SharedPreferences на Android) через
// @capacitor/preferences. Группа задана явно в capacitor.config.json
// (plugins.Preferences.group = "dkmo_widget_prefs"), чтобы нативный код
// виджета (DkmoWidgetProvider.kt) точно знал, из какого файла читать —
// см. android-widget-kit/WIDGET-SETUP.md.

function isNative() {
  return typeof window !== "undefined" && window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
}

export async function syncWidgetData(birthDate, endAge) {
  if (!isNative() || !birthDate) return;
  try {
    const { Preferences } = await import("@capacitor/preferences");
    await Preferences.set({ key: "dkmo_birth_date", value: birthDate });
    await Preferences.set({ key: "dkmo_end_age", value: String(endAge) });
  } catch (e) {
    // Плагин не установлен/не синхронизирован — приложение продолжает
    // работать нормально, просто виджет (если добавлен на экран) не увидит
    // новые данные, пока не будет проведена сборка с android-widget-kit.
    console.log("widget sync unavailable", e);
  }
}
