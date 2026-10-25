import { addDaily, loadDaily } from './repo.js';
import { todayKey } from './dom.js';

let uid = null;
let pending = empty();
let session = null;
let ticker = null;
let flushT = null;

function empty() {
  return { seconds: 0, correct: 0, solved: {} };
}
const sum = (o) => Object.values(o || {}).reduce((a, b) => a + b, 0);

export function setStatsUser(id) {
  if (uid && uid !== id) flush();
  uid = id;
}

/** 1問答えるごとに呼ぶ */
export function recordAnswer(app, ok) {
  pending.solved[app] = (pending.solved[app] || 0) + 1;
  if (ok) pending.correct++;
  clearTimeout(flushT);
  flushT = setTimeout(flush, 8000);
}

/* ---- 学習時間（画面が見えている間だけ加算） ---- */
function tick() {
  if (!session) return;
  const now = Date.now();
  if (!session.paused) pending.seconds += Math.min(30, (now - session.last) / 1000);
  session.last = now;
}
function onVis() {
  if (!session) return;
  if (document.visibilityState === 'hidden') {
    tick();
    session.paused = true;
    flush();
  } else {
    session.paused = false;
    session.last = Date.now();
  }
}
export function startSession() {
  endSession();
  session = { last: Date.now(), paused: document.visibilityState === 'hidden' };
  ticker = setInterval(tick, 5000);
  document.addEventListener('visibilitychange', onVis);
}
export function endSession() {
  if (!session) return;
  tick();
  clearInterval(ticker);
  document.removeEventListener('visibilitychange', onVis);
  session = null;
  flush();
}

export async function flush() {
  if (!uid) return;
  const d = pending;
  pending = empty();
  d.seconds = Math.round(d.seconds);
  if (!d.seconds && !d.correct && !sum(d.solved)) return;
  try {
    await addDaily(uid, todayKey(), d);
  } catch (e) {
    console.warn('記録の保存に失敗', e);
  }
}
window.addEventListener('pagehide', flush);

/** ホーム画面用の集計 */
export async function getSummary() {
  await flush();
  const rows = uid ? await loadDaily(uid) : [];
  const map = new Map(rows.map((r) => [r.date, r]));
  let seconds = 0;
  let correct = 0;
  let solved = 0;
  for (const r of rows) {
    seconds += r.seconds || 0;
    correct += r.correct || 0;
    solved += sum(r.solved);
  }
  const active = (r) => r && ((r.seconds || 0) > 0 || sum(r.solved) > 0);
  let streak = 0;
  const d = new Date();
  if (!active(map.get(todayKey(d)))) d.setDate(d.getDate() - 1);
  while (active(map.get(todayKey(d)))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  const days = [];
  for (let i = 29; i >= 0; i--) {
    const x = new Date();
    x.setDate(x.getDate() - i);
    const r = map.get(todayKey(x)) || {};
    days.push({
      date: todayKey(x),
      label: `${x.getMonth() + 1}/${x.getDate()}`,
      seconds: r.seconds || 0,
      correct: r.correct || 0,
      solved: r.solved || {},
    });
  }
  return { streak, seconds, correct, solved, days, today: days[days.length - 1] };
}
