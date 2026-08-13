package com.dkmo.app

import android.app.AlarmManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.text.format.DateUtils
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale
import kotlin.math.ceil

/**
 * Виджет на главном экране: показывает число дней до конца молодости.
 *
 * Данные (дата рождения, возраст-граница) пишутся веб-частью приложения через
 * @capacitor/preferences в SharedPreferences-файл "dkmo_widget_prefs"
 * (см. capacitor.config.json -> plugins.Preferences.group и src/widgetSync.js).
 * Виджет читает их напрямую, без обращения к WebView — работает даже когда
 * приложение закрыто.
 *
 * Android не позволяет виджетам тикать в реальном времени (минимальный
 * системный период планового обновления — 30 минут, это ограничение ОС для
 * всех приложений). Поскольку число дней меняется только раз в сутки, этого
 * более чем достаточно — а точный будильник на полночь (scheduleMidnightRefresh)
 * гарантирует, что число обновится именно в момент смены дня, а не когда
 * система решит сама.
 */
class DkmoWidgetProvider : AppWidgetProvider() {

    companion object {
        private const val PREFS_NAME = "dkmo_widget_prefs"
        private const val KEY_BIRTH = "dkmo_birth_date" // "YYYY-MM-DD"
        private const val KEY_END_AGE = "dkmo_end_age"
        private const val ACTION_MIDNIGHT_REFRESH = "com.dkmo.app.MIDNIGHT_REFRESH"

        fun updateAll(context: Context) {
            val manager = AppWidgetManager.getInstance(context)
            val ids = manager.getAppWidgetIds(ComponentName(context, DkmoWidgetProvider::class.java))
            if (ids.isNotEmpty()) {
                DkmoWidgetProvider().onUpdate(context, manager, ids)
            }
        }

        fun scheduleMidnightRefresh(context: Context) {
            val intent = Intent(context, DkmoWidgetProvider::class.java).apply {
                action = ACTION_MIDNIGHT_REFRESH
            }
            val pendingIntent = PendingIntent.getBroadcast(
                context, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            val calendar = Calendar.getInstance().apply {
                add(Calendar.DAY_OF_YEAR, 1)
                set(Calendar.HOUR_OF_DAY, 0)
                set(Calendar.MINUTE, 0)
                set(Calendar.SECOND, 5)
                set(Calendar.MILLISECOND, 0)
            }
            val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            try {
                alarmManager.setExactAndAllowWhileIdle(
                    AlarmManager.RTC_WAKEUP, calendar.timeInMillis, pendingIntent
                )
            } catch (e: SecurityException) {
                // Точные будильники недоступны (например, пользователь не выдал
                // разрешение "Alarms & reminders" на Android 12+) — используем
                // обычный неточный будильник, система сама выберет удобный момент,
                // виджет всё равно обновится в течение планового цикла.
                alarmManager.set(AlarmManager.RTC_WAKEUP, calendar.timeInMillis, pendingIntent)
            }
        }
    }

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        for (id in appWidgetIds) {
            updateWidget(context, appWidgetManager, id)
        }
        scheduleMidnightRefresh(context)
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action == ACTION_MIDNIGHT_REFRESH) {
            updateAll(context)
        }
    }

    override fun onEnabled(context: Context) {
        scheduleMidnightRefresh(context)
    }

    private fun updateWidget(context: Context, appWidgetManager: AppWidgetManager, widgetId: Int) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val birthDateStr = prefs.getString(KEY_BIRTH, null)
        val endAge = prefs.getString(KEY_END_AGE, "50")?.toIntOrNull() ?: 50

        val views = android.widget.RemoteViews(context.packageName, R.layout.dkmo_widget)

        if (birthDateStr == null) {
            views.setTextViewText(R.id.widget_number, "—")
            views.setTextViewText(R.id.widget_label, "Открой ДКМО и укажи дату рождения")
        } else {
            try {
                val sdf = SimpleDateFormat("yyyy-MM-dd", Locale.US)
                val birth = sdf.parse(birthDateStr)
                val cal = Calendar.getInstance()
                cal.time = birth!!
                cal.set(Calendar.HOUR_OF_DAY, 0)
                cal.set(Calendar.MINUTE, 0)
                cal.set(Calendar.SECOND, 0)
                cal.set(Calendar.MILLISECOND, 0)
                cal.add(Calendar.YEAR, endAge)
                val endMillis = cal.timeInMillis
                val nowMillis = System.currentTimeMillis()

                // Math.ceil, как и в веб-версии (src/App.jsx -> daysBetween),
                // чтобы число на виджете совпадало с числом в самом приложении.
                val diffMillis = (endMillis - nowMillis).coerceAtLeast(0)
                val daysLeft = ceil(diffMillis / DateUtils.DAY_IN_MILLIS.toDouble()).toLong()

                val formatted = String.format(Locale("ru"), "%,d", daysLeft).replace(',', ' ')
                views.setTextViewText(R.id.widget_number, formatted)
                views.setTextViewText(R.id.widget_label, "дней до конца молодости")
            } catch (e: Exception) {
                views.setTextViewText(R.id.widget_number, "—")
                views.setTextViewText(R.id.widget_label, "Ошибка данных")
            }
        }

        // Тап по виджету открывает приложение
        val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
        if (launchIntent != null) {
            val pendingIntent = PendingIntent.getActivity(
                context, 0, launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.widget_root, pendingIntent)
        }

        appWidgetManager.updateAppWidget(widgetId, views)
    }
}
