// Шаринг картинки — сложнее, чем кажется.
// navigator.share с файлами в Capacitor WebView на Android часто либо
// недоступен, либо тихо падает (canShare возвращает true, а share() — реджектит).
// Надёжный путь на нативной платформе: записать PNG в кэш через Filesystem,
// получить file:// URI и отдать его в нативный плагин Share — это открывает
// настоящее системное меню "Поделиться" (Instagram, Telegram, WhatsApp и т.д.)
//
// Возвращает объект { ok: boolean, method: "native" | "web-share" | "download" | "failed" }
// чтобы UI мог показать понятную обратную связь вместо тихого провала.

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result; // "data:image/png;base64,XXXX"
      resolve(String(result).split(",")[1] || "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function isNative() {
  return typeof window !== "undefined" && window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
}

export async function shareImage(blob, { title, text, filename = "dkmo.png" } = {}) {
  // --- Путь 1: нативный Android/iOS через Capacitor ---
  if (isNative()) {
    try {
      const { Filesystem, Directory } = await import("@capacitor/filesystem");
      const { Share } = await import("@capacitor/share");

      const base64 = await blobToBase64(blob);
      const path = `dkmo-${Date.now()}.png`;
      const written = await Filesystem.writeFile({ path, data: base64, directory: Directory.Cache });

      await Share.share({
        title: title || "ДКМО",
        text: text || "До конца молодости осталось. А у тебя?",
        url: written.uri,
        dialogTitle: "Поделиться",
      });
      return { ok: true, method: "native" };
    } catch (e) {
      if (e?.message?.includes("cancel") || e?.message?.includes("Share canceled")) {
        return { ok: false, method: "native", cancelled: true };
      }
      console.log("native share failed, falling back", e);
      // падаем дальше на скачивание
    }
  }

  // --- Путь 2: Web Share API (обычный браузер с поддержкой файлов) ---
  try {
    const file = new File([blob], filename, { type: "image/png" });
    if (navigator.canShare && navigator.share && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title, text });
      return { ok: true, method: "web-share" };
    }
  } catch (e) {
    if (e?.name === "AbortError") return { ok: false, method: "web-share", cancelled: true };
    console.log("web share failed, falling back to download", e);
  }

  // --- Путь 3: просто скачать файл ---
  try {
    downloadBlob(blob, filename);
    return { ok: true, method: "download" };
  } catch (e) {
    console.error("download fallback failed", e);
    return { ok: false, method: "failed" };
  }
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Шаринг обычного текста (например, код приглашения) — без файла,
// через то же системное меню "Поделиться".
export async function shareText(text, { title } = {}) {
  if (isNative()) {
    try {
      const { Share } = await import("@capacitor/share");
      await Share.share({ title: title || "ДКМО", text, dialogTitle: "Поделиться" });
      return { ok: true, method: "native" };
    } catch (e) {
      if (e?.message?.includes("cancel")) return { ok: false, cancelled: true };
      console.log("native text share failed", e);
    }
  }
  try {
    if (navigator.share) {
      await navigator.share({ title, text });
      return { ok: true, method: "web-share" };
    }
  } catch (e) {
    if (e?.name === "AbortError") return { ok: false, cancelled: true };
  }
  try {
    await navigator.clipboard.writeText(text);
    return { ok: true, method: "clipboard" };
  } catch {
    return { ok: false, method: "failed" };
  }
}
