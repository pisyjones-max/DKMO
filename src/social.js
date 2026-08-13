import {
  doc, setDoc, getDoc, onSnapshot, collection, query, where, documentId, serverTimestamp,
} from "firebase/firestore";
import { db, ensureSignedIn } from "./firebase.js";

function randomCode(len = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // без похожих на вид символов
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

// Публикуем сводку своего прогресса для друзей. Точную дату рождения не
// передаём — только уже вычисленные значения (чуть больше приватности).
export async function publishProgress({ displayName, daysUntilEnd, ageYears, streak, goals }) {
  const uid = await ensureSignedIn();
  const goalsSummary = (goals || []).map((g) => ({
    id: g.id,
    text: g.text,
    done: g.done,
    progress: g.subtasks?.length ? g.subtasks.filter((s) => s.done).length / g.subtasks.length : (g.done ? 1 : 0),
  }));
  await setDoc(
    doc(db, "users", uid),
    { displayName, daysUntilEnd, ageYears, streak: streak || 0, goals: goalsSummary, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

export async function getOrCreateInviteCode() {
  const uid = await ensureSignedIn();
  const meRef = doc(db, "users", uid);
  const snap = await getDoc(meRef);
  const existing = snap.exists() ? snap.data().inviteCode : null;
  if (existing) return existing;
  const code = randomCode();
  await setDoc(doc(db, "invites", code), { uid });
  await setDoc(meRef, { inviteCode: code }, { merge: true });
  return code;
}

export async function addFriendByCode(rawCode) {
  const uid = await ensureSignedIn();
  const code = rawCode.trim().toUpperCase();
  const inviteSnap = await getDoc(doc(db, "invites", code));
  if (!inviteSnap.exists()) throw new Error("Код не найден");
  const friendUid = inviteSnap.data().uid;
  if (friendUid === uid) throw new Error("Это твой собственный код");
  await setDoc(doc(db, "users", uid, "friends", friendUid), { addedAt: serverTimestamp() });
  await setDoc(doc(db, "users", friendUid, "friends", uid), { addedAt: serverTimestamp() }); // взаимно
  return friendUid;
}

// Живая подписка на список друзей + их профили. Firestore 'in' поддерживает
// максимум 10 значений за запрос — бьём на чанки, если друзей больше.
export function subscribeFriends(onChange) {
  let unsubUsers = [];
  let unsubList = null;
  let cancelled = false;

  ensureSignedIn().then((uid) => {
    if (cancelled) return;
    const friendsCol = collection(db, "users", uid, "friends");
    unsubList = onSnapshot(friendsCol, (snap) => {
      unsubUsers.forEach((u) => u());
      unsubUsers = [];
      const ids = snap.docs.map((d) => d.id);
      if (ids.length === 0) { onChange([]); return; }

      const chunks = [];
      for (let i = 0; i < ids.length; i += 10) chunks.push(ids.slice(i, i + 10));
      const results = {};
      chunks.forEach((chunk) => {
        const q = query(collection(db, "users"), where(documentId(), "in", chunk));
        const unsub = onSnapshot(q, (usersSnap) => {
          usersSnap.docs.forEach((d) => { results[d.id] = { id: d.id, ...d.data() }; });
          onChange(Object.values(results));
        });
        unsubUsers.push(unsub);
      });
    });
  });

  return () => {
    cancelled = true;
    if (unsubList) unsubList();
    unsubUsers.forEach((u) => u());
  };
}
