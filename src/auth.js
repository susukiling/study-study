import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { hasFirebase, auth } from './firebase.js';

let current = null;
const listeners = new Set();

export const getUser = () => current;
export function onUser(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function emit(u) {
  current = u;
  listeners.forEach((f) => f(u));
}

const MSG = {
  'auth/invalid-credential': 'メールアドレスまたはパスワードが違います',
  'auth/wrong-password': 'メールアドレスまたはパスワードが違います',
  'auth/user-not-found': 'メールアドレスまたはパスワードが違います',
  'auth/invalid-email': 'メールアドレスの形式が正しくありません',
  'auth/email-already-in-use': 'このメールアドレスは既に登録されています',
  'auth/weak-password': 'パスワードは6文字以上にしてください',
  'auth/missing-password': 'パスワードを入力してください',
  'auth/popup-closed-by-user': 'ログインがキャンセルされました',
  'auth/cancelled-popup-request': 'ログインがキャンセルされました',
  'auth/network-request-failed': 'ネットワークに接続できません',
  'auth/too-many-requests': '試行回数が多すぎます。しばらくしてからお試しください',
};
const fail = (e) => {
  throw new Error(MSG[e?.code] || `エラーが発生しました (${e?.code || e?.message || 'unknown'})`);
};

const toUser = (u) => ({ uid: u.uid, email: u.email, name: u.displayName || u.email });

/** 起動時に1回呼ぶ。最初のログイン状態が分かったら解決 */
export function initAuth() {
  return new Promise((resolve) => {
    if (!hasFirebase) {
      try {
        emit(JSON.parse(localStorage.getItem('studyhub:demoUser')));
      } catch {
        emit(null);
      }
      resolve();
      return;
    }
    let first = true;
    onAuthStateChanged(auth, (u) => {
      emit(u ? toUser(u) : null);
      if (first) {
        first = false;
        resolve();
      }
    });
  });
}

function demoLogin(email, name) {
  const uid = 'demo_' + email.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const u = { uid, email, name: name || email };
  localStorage.setItem('studyhub:demoUser', JSON.stringify(u));
  emit(u);
}

export async function loginEmail(email, password) {
  if (!email || !password) throw new Error('メールアドレスとパスワードを入力してください');
  if (!hasFirebase) return demoLogin(email);
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (e) {
    fail(e);
  }
}

export async function signupEmail(email, password) {
  if (!email || !password) throw new Error('メールアドレスとパスワードを入力してください');
  if (!hasFirebase) return demoLogin(email);
  try {
    await createUserWithEmailAndPassword(auth, email, password);
  } catch (e) {
    fail(e);
  }
}

export async function loginGoogle() {
  if (!hasFirebase) return demoLogin('google-demo@example.com', 'Google デモ');
  try {
    const p = new GoogleAuthProvider();
    p.setCustomParameters({ prompt: 'select_account' });
    await signInWithPopup(auth, p);
  } catch (e) {
    fail(e);
  }
}

export async function resetPassword(email) {
  if (!email) throw new Error('メールアドレスを入力してください');
  if (!hasFirebase) throw new Error('デモモードではパスワード再設定は使えません');
  try {
    await sendPasswordResetEmail(auth, email);
  } catch (e) {
    fail(e);
  }
}

export async function logout() {
  if (!hasFirebase) {
    localStorage.removeItem('studyhub:demoUser');
    emit(null);
    return;
  }
  await signOut(auth);
}
