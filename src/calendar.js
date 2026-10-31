// カレンダー用の部品: 予定のまとめ・くり返しの展開・月のマス・.ics書き出し
import { todayKey } from './dom.js';

export const EXAM_KINDS = ['考査', '模試', '小テスト'];
export const EVENT_TYPES = ['提出', '授業', '部活', '行事', '予定'];
export const POST_TYPES = ['小テスト', '考査', '模試', '提出', '授業', '行事', 'お知らせ'];
export const TYPE_COLOR = {
  考査: '#2e9e6b', 模試: '#e5584b', 小テスト: '#8b5cf6', 課題: '#f09a00', 提出: '#d97706',
  授業: '#3b6fd8', 部活: '#14b8a6', 行事: '#ec4899', 予定: '#64748b', お知らせ: '#0ea5e9',
};
export const colorOf = (t) => TYPE_COLOR[t] || TYPE_COLOR.予定;
export const WD = ['日', '月', '火', '水', '木', '金', '土'];

const p2 = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
export const parse = (s) => new Date(s + 'T00:00');
export const addDays = (s, n) => {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
};
export const dayDiff = (s, base = todayKey()) => Math.round((parse(s) - parse(base)) / 864e5);
export const fmtDate = (s) => {
  const d = parse(s);
  return `${d.getMonth() + 1}/${d.getDate()}（${WD[d.getDay()]}）`;
};

/** くり返し予定の日付を [from, to] の範囲で全部出す */
export function occurrences(ev, from, to) {
  const start = ev.date;
  if (!start) return [];
  const rep = ev.repeat || 'none';
  if (rep === 'none') return start >= from && start <= to ? [start] : [];
  const limit = ev.until && ev.until >= start ? ev.until : addDays(start, 366);
  const end = limit < to ? limit : to;
  const out = [];
  if (rep === 'weekly' || rep === 'biweekly') {
    const step = rep === 'weekly' ? 7 : 14;
    for (let d = start, n = 0; d <= end && n < 400; d = addDays(d, step), n++) if (d >= from) out.push(d);
  } else if (rep === 'monthly') {
    const base = parse(start);
    for (let i = 0; i < 24; i++) {
      const x = new Date(base.getFullYear(), base.getMonth() + i, base.getDate());
      if (x.getDate() !== base.getDate()) continue; // 31日など存在しない月は飛ばす
      const d = ymd(x);
      if (d > end) break;
      if (d >= from) out.push(d);
    }
  }
  return out;
}

/** 試験・予定・課題・クラスの配信を、1つの予定リストにする */
export function buildEvents({ exams = [], events = [], tasks = [], posts = [], from, to }) {
  const out = [];
  for (const e of exams) {
    const subs = (e.subjects || []).filter((s) => s.name);
    const dated = subs.filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s.date || ''));
    if (dated.length) {
      // 教科ごとに試験日が違う（時間割つきの範囲表）→ 日ごとに分けて出す
      const byDay = {};
      for (const s of subs) (byDay[/^\d{4}-\d{2}-\d{2}$/.test(s.date || '') ? s.date : e.date] ||= []).push(s);
      for (const [d, list] of Object.entries(byDay))
        if (d >= from && d <= to) out.push({ src: 'exam', id: e.id, date: d, type: e.kind || '考査', title: e.title, time: '', sub: list.map((s) => s.name).join('・') });
    } else if (e.date >= from && e.date <= to)
      out.push({ src: 'exam', id: e.id, date: e.date, type: e.kind || '考査', title: e.title, time: '', sub: subs.map((s) => s.name).join('・') });
  }
  for (const ev of events) {
    for (const d of occurrences(ev, from, to))
      out.push({ src: 'event', id: ev.id, date: d, type: ev.type || '予定', title: ev.title, time: ev.time || '', sub: ev.note || '', repeat: ev.repeat && ev.repeat !== 'none' });
  }
  for (const t of tasks) {
    if (!t.done && t.due >= from && t.due <= to)
      out.push({ src: 'task', id: t.id, date: t.due, type: '課題', title: t.title, time: '', sub: `課題の期限${t.subject ? '（' + t.subject + '）' : ''}` });
  }
  for (const p of posts) {
    if (p.date >= from && p.date <= to)
      out.push({ src: 'post', id: p.id, cid: p.cid, date: p.date, type: p.type || 'お知らせ', title: p.title, time: p.time || '', sub: `${p.cname || 'クラス'}${p.subject ? '・' + p.subject : ''}` });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.time || '') < (b.time || '') ? -1 : (a.time || '') > (b.time || '') ? 1 : 0));
}

/** 月カレンダーの日付マス（日曜はじまり。前後の月の日も含めた6週分以内） */
export function monthGrid(y, m) {
  const first = new Date(y, m, 1);
  const start = new Date(y, m, 1 - first.getDay());
  const weeks = [];
  for (let w = 0; w < 6; w++) {
    const row = [];
    for (let i = 0; i < 7; i++) row.push(ymd(new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + i)));
    if (w >= 4 && row[0].slice(0, 7) > `${y}-${p2(m + 1)}`) break;
    weeks.push(row);
  }
  return weeks;
}

/* ---------- .ics（iPad・iPhoneのカレンダーに取り込める形式。通知つき） ---------- */
const esc = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const fold = (line) => (line.length <= 70 ? line : line.match(/.{1,70}/g).join('\r\n '));

export function toICS(items) {
  const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//StudyHub//JP', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:スタディハブ'];
  items.forEach((e, i) => {
    const day = e.date.replace(/-/g, '');
    L.push('BEGIN:VEVENT', `UID:studyhub-${e.src}-${e.id || i}-${day}@studyhub`, `DTSTAMP:${now}`);
    if (e.time && /^\d{2}:\d{2}$/.test(e.time)) {
      const t = e.time.replace(':', '') + '00';
      const h = Number(e.time.slice(0, 2));
      const end = `${p2(Math.min(h + 1, 23))}${e.time.slice(3, 5)}00`;
      L.push(`DTSTART:${day}T${t}`, `DTEND:${day}T${end}`);
    } else {
      L.push(`DTSTART;VALUE=DATE:${day}`, `DTEND;VALUE=DATE:${addDays(e.date, 1).replace(/-/g, '')}`);
    }
    L.push(fold(`SUMMARY:${esc(`【${e.type}】${e.title}`)}`));
    if (e.sub) L.push(fold(`DESCRIPTION:${esc(e.sub)}`));
    // 通知: 前日の21時と、当日の朝7時（時間ありの予定は1日前と30分前）
    if (e.time) {
      L.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:予定', 'TRIGGER:-P1D', 'END:VALARM', 'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:予定', 'TRIGGER:-PT30M', 'END:VALARM');
    } else {
      L.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:あしたの予定', 'TRIGGER:-PT3H', 'END:VALARM', 'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:きょうの予定', 'TRIGGER:PT7H', 'END:VALARM');
    }
    L.push('END:VEVENT');
  });
  L.push('END:VCALENDAR');
  return L.join('\r\n');
}
