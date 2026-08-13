import React, { useEffect, useRef, useState } from "react";
import { X, Download, Share2 } from "lucide-react";
import { shareImage, downloadBlob } from "./share.js";

const BG = "#0A0A0A";
const BORDER = "rgba(245,245,240,0.12)";
const TEXT = "#F5F5F0";
const MUTED = "rgba(245,245,240,0.55)";
const ACCENT = "#C8FF00";
const DANGER = "#FF4D4D";

async function drawLifeGrid(canvas, { weeksLived, totalWeeks, endAge }) {
  const cols = 52; // недель в году
  const rows = Math.ceil(totalWeeks / cols);
  const cell = 16;
  const gap = 4;
  const padX = 56;
  const padTop = 150;
  const padBottom = 90;

  const w = padX * 2 + cols * (cell + gap) - gap;
  const h = padTop + rows * (cell + gap) + padBottom;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");

  try {
    await document.fonts.load(`400 40px 'Archivo Black'`);
    await document.fonts.load(`700 20px Inter`);
  } catch {}

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, w, h);

  ctx.textAlign = "left";
  ctx.fillStyle = ACCENT;
  ctx.font = `700 20px Inter`;
  ctx.fillText("Д К М О", padX, 46);

  ctx.fillStyle = TEXT;
  ctx.font = `400 38px 'Archivo Black'`;
  ctx.fillText("ТВОЯ ЖИЗНЬ В НЕДЕЛЯХ", padX, 94);

  ctx.fillStyle = MUTED;
  ctx.font = `500 16px Inter`;
  const pct = Math.round((weeksLived / totalWeeks) * 100);
  ctx.fillText(`Прожито ${weeksLived.toLocaleString("ru-RU")} из ${totalWeeks.toLocaleString("ru-RU")} недель · ${pct}%`, padX, 124);

  for (let i = 0; i < totalWeeks; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = padX + col * (cell + gap);
    const y = padTop + row * (cell + gap);
    if (i < weeksLived) {
      ctx.fillStyle = ACCENT;
      ctx.fillRect(x, y, cell, cell);
    } else {
      ctx.strokeStyle = "rgba(245,245,240,0.18)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
    }
  }

  ctx.fillStyle = MUTED;
  ctx.font = `500 14px 'IBM Plex Mono'`;
  ctx.fillText(`Каждый квадрат — одна неделя, до ${endAge} лет`, padX, h - 40);
}

export default function LifeGridView({ birthDate, endAge, onClose }) {
  const canvasRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    if (!canvasRef.current || !birthDate) return;
    const birth = new Date(birthDate + "T00:00:00");
    const end = new Date(birth);
    end.setFullYear(end.getFullYear() + endAge);
    const now = new Date();
    const msWeek = 7 * 86400000;
    const totalWeeks = Math.max(1, Math.ceil((end - birth) / msWeek));
    const weeksLived = Math.min(totalWeeks, Math.max(0, Math.floor((now - birth) / msWeek)));
    drawLifeGrid(canvasRef.current, { weeksLived, totalWeeks, endAge });
  }, [birthDate, endAge]);

  const getBlob = () =>
    new Promise((resolve) => {
      if (!canvasRef.current) return resolve(null);
      canvasRef.current.toBlob((b) => resolve(b), "image/png");
    });

  const download = async () => {
    setBusy(true);
    const blob = await getBlob();
    if (blob) {
      downloadBlob(blob, "dkmo-life-in-weeks.png");
      setStatus({ ok: true, text: "Файл сохранён." });
    } else {
      setStatus({ ok: false, text: "Не получилось создать файл." });
    }
    setBusy(false);
  };

  const share = async () => {
    setBusy(true);
    const blob = await getBlob();
    if (!blob) {
      setStatus({ ok: false, text: "Не получилось создать файл." });
      setBusy(false);
      return;
    }
    const result = await shareImage(blob, {
      title: "ДКМО",
      text: "Моя жизнь в неделях. А твоя?",
      filename: "dkmo-life-in-weeks.png",
    });
    if (!result.cancelled) {
      setStatus({
        ok: result.ok,
        text: result.ok
          ? (result.method === "download" ? "Прямой шаринг недоступен — файл сохранён." : "Готово.")
          : "Не получилось поделиться.",
      });
    }
    setBusy(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: BG, zIndex: 70, display: "flex", flexDirection: "column", padding: "20px 16px", boxSizing: "border-box" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontFamily: "'Archivo Black'", fontSize: 17, color: TEXT }}>ЖИЗНЬ В НЕДЕЛЯХ</div>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
          <X size={22} color={MUTED} />
        </button>
      </div>

      <div style={{ flex: 1, overflow: "auto", border: `1px solid ${BORDER}`, borderRadius: 16, background: "#000", display: "flex", alignItems: "flex-start" }}>
        <canvas ref={canvasRef} style={{ width: "100%", display: "block" }} />
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
        <button
          onClick={share}
          disabled={busy}
          style={{
            flex: 1, background: ACCENT, color: "#0A0A0A", border: "none", borderRadius: 14, padding: "14px 0",
            fontWeight: 700, fontFamily: "Inter", fontSize: 15, display: "flex", alignItems: "center",
            justifyContent: "center", gap: 8, cursor: "pointer", opacity: busy ? 0.6 : 1,
          }}
        >
          <Share2 size={17} /> Поделиться
        </button>
        <button
          onClick={download}
          disabled={busy}
          style={{ width: 56, background: "transparent", border: `1px solid ${BORDER}`, borderRadius: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <Download size={18} color={TEXT} />
        </button>
      </div>

      {status && (
        <div style={{ marginTop: 10, fontSize: 13, color: status.ok ? ACCENT : DANGER, textAlign: "center", fontFamily: "Inter" }}>
          {status.text}
        </div>
      )}
    </div>
  );
}
