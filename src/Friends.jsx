import React, { useEffect, useState } from "react";
import { UserPlus, Copy, Share2 } from "lucide-react";
import { publishProgress, getOrCreateInviteCode, addFriendByCode, subscribeFriends } from "./social.js";
import { shareText } from "./share.js";
import { buildInviteLink } from "./constants.js";

const CARD = "#151515";
const CARD2 = "#1D1D1D";
const BORDER = "rgba(245,245,240,0.12)";
const TEXT = "#F5F5F0";
const MUTED = "rgba(245,245,240,0.55)";
const ACCENT = "#C8FF00";
const DANGER = "#FF4D4D";

const label = { fontFamily: "Inter", fontSize: 12, fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase", color: MUTED };
const inputStyle = { width: "100%", background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14, color: TEXT, fontFamily: "Inter", fontSize: 16, boxSizing: "border-box" };
const btnPrimary = { background: ACCENT, color: "#0A0A0A", border: "none", padding: "14px 20px", borderRadius: 14, fontFamily: "Inter", fontWeight: 700, fontSize: 15, cursor: "pointer", width: "100%" };

function MiniBar({ value }) {
  const p = Math.max(0, Math.min(1, value));
  return (
    <div style={{ height: 4, width: "100%", background: CARD2, borderRadius: 2, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${p * 100}%`, background: ACCENT }} />
    </div>
  );
}

export default function Friends({ state, counters, onSetDisplayName }) {
  const [nameDraft, setNameDraft] = useState("");
  const [code, setCode] = useState(null);
  const [joinCode, setJoinCode] = useState("");
  const [friends, setFriends] = useState([]);
  const [status, setStatus] = useState(null);
  const [syncError, setSyncError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!state.displayName || !counters) return;
    publishProgress({
      displayName: state.displayName,
      daysUntilEnd: counters.daysUntilEnd,
      ageYears: counters.ageYears,
      streak: state.streak?.count || 0,
      goals: state.goals,
    }).catch((e) => setSyncError(e?.message || String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.displayName, state.goals, state.streak?.count]);

  useEffect(() => {
    if (!state.displayName) return;
    getOrCreateInviteCode().then(setCode).catch((e) => setSyncError(e?.message || String(e)));
    const unsub = subscribeFriends(setFriends);
    return unsub;
  }, [state.displayName]);

  if (!state.displayName) {
    return (
      <div style={{ padding: "24px 20px 110px" }}>
        <h1 style={{ fontFamily: "'Archivo Black'", fontSize: 30, color: TEXT, margin: 0, marginBottom: 8 }}>ДРУЗЬЯ</h1>
        <div style={{ color: MUTED, fontSize: 14, marginBottom: 20, lineHeight: 1.5 }}>
          Придумай имя — его увидят только те, кому ты дашь свой код приглашения.
        </div>
        <input
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && nameDraft.trim() && onSetDisplayName(nameDraft.trim())}
          placeholder="Твоё имя"
          style={inputStyle}
        />
        <button
          style={{ ...btnPrimary, marginTop: 12, opacity: nameDraft.trim() ? 1 : 0.4 }}
          disabled={!nameDraft.trim()}
          onClick={() => onSetDisplayName(nameDraft.trim())}
        >
          Продолжить
        </button>
      </div>
    );
  }

  const copyCode = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setStatus({ ok: true, text: "Код скопирован." });
    } catch {
      setStatus({ ok: false, text: "Не получилось скопировать." });
    }
  };

  const shareCode = async () => {
    if (!code) return;
    const days = counters?.daysUntilEnd?.toLocaleString("ru-RU");
    const hook = days
      ? `До конца моей молодости осталось ${days} дней. А до твоей? И на что ты её потратишь?`
      : "Считаю дни в ДКМО — присоединяйся.";
    const message = `${hook}\n\nМой код: ${code}\n${buildInviteLink(code)}`;
    const result = await shareText(message, { title: "ДКМО" });
    if (result.cancelled) return;
    if (result.method === "clipboard") {
      setStatus({ ok: result.ok, text: result.ok ? "Прямой шаринг недоступен — сообщение скопировано." : "Не получилось." });
    } else {
      setStatus({ ok: result.ok, text: result.ok ? "Отправлено." : "Не получилось." });
    }
  };

  const join = async () => {
    if (!joinCode.trim()) return;
    setBusy(true);
    setStatus(null);
    try {
      await addFriendByCode(joinCode);
      setJoinCode("");
      setStatus({ ok: true, text: "Друг добавлен." });
    } catch (e) {
      setStatus({ ok: false, text: e.message || "Не получилось." });
    }
    setBusy(false);
  };

  return (
    <div style={{ padding: "24px 20px 110px" }}>
      <h1 style={{ fontFamily: "'Archivo Black'", fontSize: 30, color: TEXT, margin: 0, marginBottom: 4 }}>ДРУЗЬЯ</h1>
      <div style={{ ...label, marginBottom: 20 }}>Сравнивайте прогресс к целям</div>

      {syncError && (
        <div style={{ background: "rgba(255,77,77,0.1)", border: `1px solid ${DANGER}`, borderRadius: 12, padding: 12, marginBottom: 16, fontSize: 12, color: DANGER, fontFamily: "'IBM Plex Mono'", wordBreak: "break-word" }}>
          {syncError}
        </div>
      )}

      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 16, marginBottom: 16 }}>
        <div style={{ ...label, marginBottom: 8 }}>Твой код приглашения</div>
        <div
          onClick={copyCode}
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#0A0A0A", border: `1px dashed ${ACCENT}`, borderRadius: 10, padding: "10px 14px", cursor: "pointer", marginBottom: 10 }}
        >
          <span style={{ fontFamily: "'IBM Plex Mono'", fontSize: 18, color: TEXT, letterSpacing: 2 }}>{code || "..."}</span>
          <Copy size={16} color={ACCENT} />
        </div>
        <button
          onClick={shareCode}
          disabled={!code}
          style={{ ...btnPrimary, padding: "12px 0", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: code ? 1 : 0.4 }}
        >
          <Share2 size={15} /> Поделиться кодом
        </button>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <input
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && join()}
          placeholder="Код друга"
          style={inputStyle}
        />
        <button
          onClick={join}
          disabled={busy}
          style={{ background: ACCENT, border: "none", borderRadius: 12, width: 52, flexShrink: 0, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", opacity: busy ? 0.6 : 1 }}
        >
          <UserPlus size={20} color="#0A0A0A" />
        </button>
      </div>
      {status && <div style={{ fontSize: 13, color: status.ok ? ACCENT : DANGER, marginBottom: 16 }}>{status.text}</div>}

      <div style={{ ...label, marginTop: 24, marginBottom: 10 }}>{friends.length} {friends.length === 1 ? "друг" : "друзей"}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {friends.map((f) => {
          const done = (f.goals || []).filter((g) => g.done).length;
          const total = (f.goals || []).length;
          return (
            <div key={f.id} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 15, color: TEXT }}>{f.displayName}</span>
                <span style={{ fontFamily: "'IBM Plex Mono'", fontSize: 13, color: ACCENT }}>
                  {f.daysUntilEnd != null ? `${f.daysUntilEnd.toLocaleString("ru-RU")} дн.` : "—"}
                </span>
              </div>
              {f.streak > 0 && <div style={{ fontSize: 12, color: MUTED, marginBottom: 8 }}>🔥 {f.streak} дней подряд</div>}
              <div style={{ fontSize: 12, color: MUTED, marginBottom: 6 }}>{done}/{total} целей выполнено</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {(f.goals || []).slice(0, 3).map((g) => (
                  <div key={g.id}>
                    <div style={{ fontSize: 12, color: g.done ? MUTED : TEXT, textDecoration: g.done ? "line-through" : "none", marginBottom: 3 }}>
                      {g.text}
                    </div>
                    <MiniBar value={g.progress} />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {friends.length === 0 && <div style={{ color: MUTED, fontSize: 13 }}>Пока никого — поделись своим кодом.</div>}
      </div>
    </div>
  );
}
