import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { firebaseConfig } from "./firebaseConfig.js";

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Анонимная авторизация — без регистрации, без email/пароля.
// uid из неё используется как ID документа пользователя в Firestore.
export function ensureSignedIn() {
  if (auth.currentUser) return Promise.resolve(auth.currentUser.uid);
  return signInAnonymously(auth).then((cred) => cred.user.uid);
}
