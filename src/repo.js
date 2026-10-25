// データ保存の窓口。Firebase設定があれば Firestore、なければ localStorage。
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  deleteDoc,
  increment,
  query,
  orderBy,
  limit,
} from 'firebase/firestore';
import { hasFirebase, db } from './firebase.js';
import { lsGet, lsSet } from './dom.js';

/** 1日分の学習記録に加算: delta = { seconds, correct, solved: { appId: n } } */
export async function addDaily(uid, date, delta) {
  if (!hasFirebase) {
    const all = lsGet(`${uid}:daily`, {});
    const d = (all[date] ||= { date, seconds: 0, correct: 0, solved: {} });
    d.seconds += delta.seconds || 0;
    d.correct += delta.correct || 0;
    for (const [k, v] of Object.entries(delta.solved || {})) d.solved[k] = (d.solved[k] || 0) + v;
    lsSet(`${uid}:daily`, all);
    return;
  }
  const solved = {};
  for (const [k, v] of Object.entries(delta.solved || {})) solved[k] = increment(v);
  await setDoc(
    doc(db, 'users', uid, 'daily', date),
    { date, seconds: increment(delta.seconds || 0), correct: increment(delta.correct || 0), solved },
    { merge: true },
  );
}

export async function loadDaily(uid) {
  if (!hasFirebase) return Object.values(lsGet(`${uid}:daily`, {}));
  const snap = await getDocs(query(collection(db, 'users', uid, 'daily'), orderBy('date', 'desc'), limit(800)));
  return snap.docs.map((d) => d.data());
}

/* ---- 間違えた問題 ---- */
export async function getWrong(uid, app) {
  if (!hasFirebase) return lsGet(`${uid}:wrong:${app}`, []);
  const s = await getDoc(doc(db, 'users', uid, 'wrong', app));
  return s.exists() ? s.data().ids || [] : [];
}
export async function setWrong(uid, app, ids) {
  if (!hasFirebase) return lsSet(`${uid}:wrong:${app}`, ids);
  await setDoc(doc(db, 'users', uid, 'wrong', app), { ids });
}

/* ---- AIなんでも単語帳のデッキ ---- */
export async function listDecks(uid) {
  if (!hasFirebase) return lsGet(`${uid}:decks`, []).sort((a, b) => b.createdAt - a.createdAt);
  const snap = await getDocs(query(collection(db, 'users', uid, 'decks'), orderBy('createdAt', 'desc')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
export async function saveDeck(uid, deck) {
  const data = { title: deck.title, items: deck.items, createdAt: Date.now() };
  if (!hasFirebase) {
    const all = lsGet(`${uid}:decks`, []);
    const id = 'd' + Date.now();
    all.push({ id, ...data });
    lsSet(`${uid}:decks`, all);
    return id;
  }
  const ref = await addDoc(collection(db, 'users', uid, 'decks'), data);
  return ref.id;
}
export async function deleteDeck(uid, id) {
  if (!hasFirebase) {
    lsSet(`${uid}:decks`, lsGet(`${uid}:decks`, []).filter((d) => d.id !== id));
    return;
  }
  await deleteDoc(doc(db, 'users', uid, 'decks', id));
}
