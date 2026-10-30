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
  writeBatch,
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

/* ---- 考査ノート（exams / tasks / plans）: 汎用の保存 ---- */
export async function listItems(uid, col) {
  if (!hasFirebase) return lsGet(`${uid}:${col}`, []);
  const snap = await getDocs(collection(db, 'users', uid, col));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
export async function saveItem(uid, col, item) {
  const id = item.id || 'i' + Date.now() + Math.random().toString(36).slice(2, 6);
  const data = JSON.parse(JSON.stringify({ ...item, id: undefined }));
  if (!hasFirebase) {
    const all = lsGet(`${uid}:${col}`, []);
    const i = all.findIndex((x) => x.id === id);
    const rec = { id, ...data };
    if (i >= 0) all[i] = rec;
    else all.push(rec);
    lsSet(`${uid}:${col}`, all);
    return id;
  }
  await setDoc(doc(db, 'users', uid, col, id), data);
  return id;
}
export async function deleteItem(uid, col, id) {
  if (!hasFirebase) {
    lsSet(`${uid}:${col}`, lsGet(`${uid}:${col}`, []).filter((x) => x.id !== id));
    return;
  }
  await deleteDoc(doc(db, 'users', uid, col, id));
}

/* ---- クラス（Classroomのように、コードで参加して予定を配信する） ----
   Firestore:  classCodes/{コード} → { classId, ownerUid }
               classes/{id} → { name, code, ownerUid, ownerName, createdAt }
               classes/{id}/members/{uid} → { name, joinedAt }
               classes/{id}/posts/{postId} → 配信（予定・小テスト・お知らせ）
               users/{uid}/classes/{id} → { name, role }   ← 自分の参加クラス一覧
   デモ（Firebase未設定）のときは、この端末の中だけで動きます。 */
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const genCode = () => Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
const clean = (o) => JSON.parse(JSON.stringify(o));

export async function createClass(uid, name, ownerName) {
  for (let i = 0; i < 6; i++) {
    const code = genCode();
    if (!hasFirebase) {
      const all = lsGet('classes', []);
      if (all.some((c) => c.code === code)) continue;
      const id = 'c' + Date.now();
      all.push({ id, code, name, ownerUid: uid, ownerName, createdAt: Date.now(), members: [{ uid, name: ownerName }], posts: [] });
      lsSet('classes', all);
      return { id, code };
    }
    const codeRef = doc(db, 'classCodes', code);
    if ((await getDoc(codeRef)).exists()) continue;
    const classRef = doc(collection(db, 'classes'));
    const b = writeBatch(db);
    b.set(classRef, { name, code, ownerUid: uid, ownerName, createdAt: Date.now() });
    b.set(codeRef, { classId: classRef.id, ownerUid: uid });
    b.set(doc(db, 'classes', classRef.id, 'members', uid), { name: ownerName, joinedAt: Date.now() });
    b.set(doc(db, 'users', uid, 'classes', classRef.id), { name, role: 'owner' });
    await b.commit();
    return { id: classRef.id, code };
  }
  throw new Error('コードを作れませんでした。もう一度お試しください');
}

export async function joinClass(uid, name, rawCode) {
  const code = String(rawCode || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length < 4) throw new Error('コードを入力してください');
  if (!hasFirebase) {
    const all = lsGet('classes', []);
    const c = all.find((x) => x.code === code);
    if (!c) throw new Error('そのコードのクラスが見つかりません');
    if (!c.members.some((m) => m.uid === uid)) c.members.push({ uid, name });
    lsSet('classes', all);
    return { id: c.id, name: c.name };
  }
  const snap = await getDoc(doc(db, 'classCodes', code));
  if (!snap.exists()) throw new Error('そのコードのクラスが見つかりません');
  const classId = snap.data().classId;
  await setDoc(doc(db, 'classes', classId, 'members', uid), { name, joinedAt: Date.now() });
  const cls = await getDoc(doc(db, 'classes', classId));
  if (!cls.exists()) throw new Error('そのクラスは削除されています');
  await setDoc(doc(db, 'users', uid, 'classes', classId), { name: cls.data().name, role: cls.data().ownerUid === uid ? 'owner' : 'member' });
  return { id: classId, name: cls.data().name };
}

export async function listMyClasses(uid) {
  if (!hasFirebase) {
    return lsGet('classes', [])
      .filter((c) => c.members.some((m) => m.uid === uid))
      .map((c) => ({ id: c.id, name: c.name, role: c.ownerUid === uid ? 'owner' : 'member' }));
  }
  const snap = await getDocs(collection(db, 'users', uid, 'classes'));
  const out = [];
  for (const d of snap.docs) {
    try {
      const c = await getDoc(doc(db, 'classes', d.id));
      if (c.exists()) out.push({ id: d.id, name: c.data().name, role: c.data().ownerUid === uid ? 'owner' : 'member' });
      else await deleteDoc(d.ref); // 削除されたクラスは一覧から外す
    } catch {
      await deleteDoc(d.ref).catch(() => {});
    }
  }
  return out;
}

export async function getClass(uid, id) {
  if (!hasFirebase) {
    const c = lsGet('classes', []).find((x) => x.id === id);
    if (!c) return null;
    return { id, name: c.name, code: c.code, ownerUid: c.ownerUid, ownerName: c.ownerName, role: c.ownerUid === uid ? 'owner' : 'member', members: c.members };
  }
  const s = await getDoc(doc(db, 'classes', id));
  if (!s.exists()) return null;
  const c = s.data();
  const role = c.ownerUid === uid ? 'owner' : 'member';
  let members = [];
  if (role === 'owner') members = (await getDocs(collection(db, 'classes', id, 'members'))).docs.map((d) => ({ uid: d.id, ...d.data() }));
  return { id, name: c.name, code: c.code, ownerUid: c.ownerUid, ownerName: c.ownerName, role, members };
}

export async function listPosts(id) {
  if (!hasFirebase) return lsGet('classes', []).find((x) => x.id === id)?.posts || [];
  const snap = await getDocs(collection(db, 'classes', id, 'posts'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
export async function savePost(id, post) {
  const pid = post.id || 'p' + Date.now() + Math.random().toString(36).slice(2, 5);
  const data = clean({ ...post, id: undefined });
  if (!hasFirebase) {
    const all = lsGet('classes', []);
    const c = all.find((x) => x.id === id);
    const i = c.posts.findIndex((p) => p.id === pid);
    const rec = { id: pid, ...data };
    if (i >= 0) c.posts[i] = rec;
    else c.posts.push(rec);
    lsSet('classes', all);
    return pid;
  }
  await setDoc(doc(db, 'classes', id, 'posts', pid), data);
  return pid;
}
export async function deletePost(id, pid) {
  if (!hasFirebase) {
    const all = lsGet('classes', []);
    const c = all.find((x) => x.id === id);
    c.posts = c.posts.filter((p) => p.id !== pid);
    lsSet('classes', all);
    return;
  }
  await deleteDoc(doc(db, 'classes', id, 'posts', pid));
}

export async function leaveClass(uid, id) {
  if (!hasFirebase) {
    const all = lsGet('classes', []);
    const c = all.find((x) => x.id === id);
    if (c) c.members = c.members.filter((m) => m.uid !== uid);
    lsSet('classes', all);
    return;
  }
  await deleteDoc(doc(db, 'classes', id, 'members', uid));
  await deleteDoc(doc(db, 'users', uid, 'classes', id));
}

export async function deleteClass(uid, id) {
  if (!hasFirebase) {
    lsSet('classes', lsGet('classes', []).filter((c) => c.id !== id));
    return;
  }
  const c = await getDoc(doc(db, 'classes', id));
  const code = c.exists() ? c.data().code : null;
  for (const sub of ['posts', 'members']) {
    const snap = await getDocs(collection(db, 'classes', id, sub));
    for (const d of snap.docs) if (!(sub === 'members' && d.id === uid)) await deleteDoc(d.ref);
  }
  if (code) await deleteDoc(doc(db, 'classCodes', code)).catch(() => {});
  await deleteDoc(doc(db, 'classes', id, 'members', uid)).catch(() => {});
  await deleteDoc(doc(db, 'classes', id));
  await deleteDoc(doc(db, 'users', uid, 'classes', id)).catch(() => {});
}
