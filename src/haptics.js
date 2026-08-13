// Вибро-отклик при достижении цели.
// На нативной платформе используем Capacitor Haptics (более качественный
// "тактильный" паттерн через системный API), в браузере — обычный
// navigator.vibrate как fallback.

function isNative() {
  return typeof window !== "undefined" && window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
}

export async function celebrate() {
  if (isNative()) {
    try {
      const { Haptics, NotificationType } = await import("@capacitor/haptics");
      await Haptics.notification({ type: NotificationType.Success });
      return;
    } catch (e) {
      console.log("native haptics unavailable", e);
    }
  }
  if (typeof navigator !== "undefined" && navigator.vibrate) {
    navigator.vibrate([30, 60, 30, 60, 100]);
  }
}
