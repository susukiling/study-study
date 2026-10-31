import { esc, toast, todayKey, lsGet, lsSet } from '../dom.js';
import { ICON } from '../ui.js';
import { listItems, saveItem, deleteItem, createClass, joinClass, listMyClasses, getClass, listPosts, savePost, deletePost, leaveClass, deleteClass } from '../repo.js';
import { EXAM_KINDS, EVENT_TYPES, POST_TYPES, colorOf, WD as WDAYS, ymd, parse, addDays, buildEvents, monthGrid, toICS, fmtDate as fmtD } from '../calendar.js';
import { ACCEPT, readAll, fileChips } from '../files.js';
import { extractRange, extractSchedule, analyzeScores, analyzeReflection, makePlan } from '../ai.js';

const SUBJECTS = ['国語', '数学', '英語', '理科', '理科1','理科2','社会', '物理', '化学', '生物', '歴史', '地理', '公民', '情報'];
const COLORS = ['#e5584b', '#f09a00', '#2e9e6b', '#3b82f6', '#8b5cf6', '#14b8a6', '#ec4899', '#64748b'];
const WD = ['日', '月', '火', '水', '木', '金', '土'];

const dayDiff = (d) => Math.round((new Date(d + 'T00:00') - new Date(todayKey() + 'T00:00')) / 864e5);
const fmtDate = (d) => {
  const x = new Date(d + 'T00:00');
  return `${x.getMonth() + 1}/${x.getDate()}（${WD[x.getDay()]}）`;
};
const num = (v) => (v === '' || v == null || isNaN(Number(v)) ? null : Number(v));
const pct = (s) => (num(s.score) != null && num(s.max) ? (Number(s.score) / Number(s.max)) * 100 : null);
const total = (e) => {
  const ss = (e.subjects || []).filter((s) => num(s.score) != null && num(s.max));
  if (!ss.length) return null;
  const sum = ss.reduce((a, s) => a + Number(s.score), 0);
  const max = ss.reduce((a, s) => a + Number(s.max), 0);
  return { sum, max, p: (sum / max) * 100 };
};
const subjColor = (name, all) => COLORS[Math.max(0, all.indexOf(name)) % COLORS.length];

function lineChart(exams) {
  const list = exams.filter((e) => total(e)).sort((a, b) => (a.date < b.date ? -1 : 1)).slice(-8);
  if (!list.length) return '';
  const names = [...new Set(list.flatMap((e) => e.subjects.filter((s) => pct(s) != null).map((s) => s.name)))];
  const W = 340, H = 200, L = 30, R = 12, T = 12, B = 28;
  const iw = W - L - R, ih = H - T - B;
  const x = (i) => L + (list.length === 1 ? iw / 2 : (iw * i) / (list.length - 1));
  const y = (v) => T + ih - (v / 100) * ih;
  let g = '';
  for (let v = 0; v <= 100; v += 25) g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${L - 5}" y="${y(v) + 4}" class="ax" text-anchor="end">${v}</text>`;
  const line = (pts, c, w, dash = '') => {
    const d = pts.filter((p) => p.v != null);
    if (!d.length) return '';
    const path = d.map((p, k) => `${k ? 'L' : 'M'}${x(p.i).toFixed(1)} ${y(p.v).toFixed(1)}`).join('');
    return `<path d="${path}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" ${dash ? `stroke-dasharray="${dash}"` : ''}/>` + d.map((p) => `<circle cx="${x(p.i).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="${w > 2 ? 4 : 3}" fill="${c}"/>`).join('');
  };
  let body = '';
  names.forEach((n) => {
    body += line(list.map((e, i) => ({ i, v: pct(e.subjects.find((s) => s.name === n) || {}) })), subjColor(n, names), 2);
  });
  body += line(list.map((e, i) => ({ i, v: total(e).p })), 'var(--ink)', 3.2, '6 4');
  const xl = list.map((e, i) => `<text x="${x(i).toFixed(1)}" y="${H - 8}" class="ax" text-anchor="middle">${esc(e.date.slice(5).replace('-', '/'))}</text>`).join('');
  const legend = names.map((n) => `<span><i style="background:${subjColor(n, names)}"></i>${esc(n)}</span>`).join('') + '<span><i class="dash"></i>合計</span>';
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="得点率の推移">${g}${body}${xl}</svg><div class="legend">${legend}</div>`;
}

const aiCard = (r) =>
  r
    ? `<div class="card ai-card"><div class="ai-head">${ICON.sparkle}<b>${esc(r.headline || 'Geminiからの提案')}</b></div>
      ${r.points?.length ? `<ul>${r.points.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
      ${r.next?.length ? `<div class="ai-next"><small>次にやること</small><ul>${r.next.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>` : ''}</div>`
    : '';

export function mount(root, ctx) {
  const uid = ctx.user.uid;
  let alive = true;
  let tab = ((t) => (t === 'plan' ? 'cal' : t))(lsGet('exam:tab', 'cal'));
  let screen = 'list';
  let cur = null;
  let exams = [];
  let tasks = [];
  let plan = null;
  let scoreAI = null;
  let files = [];
  let events = [];
  let classes = [];
  let posts = [];
  let calView = lsGet('exam:view', 'month');
  const now0 = new Date();
  let ym = { y: now0.getFullYear(), m: now0.getMonth() };
  let pickDate = null;
  let curEvent = null;
  let curClass = null;
  let classPosts = [];
  let curPost = null;
  let postBack = 'list';
  let classForm = null;
  let scanRes = null;
  let showTaskForm = false;
  let selDay = null;
  const mins = lsGet('exam:mins', { wd: 90, hd: 180 });

  const byDate = (a, b) => (a.date < b.date ? -1 : 1);
  const busy = (btn, on, label) => {
    if (!btn) return;
    btn.disabled = on;
    if (label != null) btn.querySelector('span').textContent = label;
  };
  const clone = (o) => JSON.parse(JSON.stringify(o));

  async function load() {
    try {
      const [e, t, p, ev] = await Promise.all([listItems(uid, 'exams'), listItems(uid, 'tasks'), listItems(uid, 'plans'), listItems(uid, 'events')]);
      exams = e;
      tasks = t;
      events = ev;
      plan = p.find((x) => x.id === 'current') || null;
      scoreAI = p.find((x) => x.id === 'scoreAI') || null;
    } catch (err) {
      console.warn(err);
      toast('データを読み込めませんでした');
    }
    if (alive) render();
    await loadClasses();
  }

  /** 参加しているクラスと、その配信を読み込む（読めなかったクラスは飛ばす） */
  async function loadClasses() {
    try {
      classes = await listMyClasses(uid);
      const all = [];
      for (const c of classes) {
        try {
          (await listPosts(c.id)).forEach((p) => all.push({ ...p, cid: c.id, cname: c.name }));
        } catch (err) {
          console.warn(err);
        }
      }
      posts = all;
    } catch (err) {
      console.warn(err);
    }
    if (alive && screen === 'list') render();
  }

  /* ---------------- 共通の部品 ---------------- */
  const tabs = () => `<div class="seg exam-seg">${[['cal', '予定'], ['score', '点数'], ['task', '課題'], ['reflect', '振り返り'], ['class', 'クラス']]
    .map(([k, l]) => `<button data-a="tab" data-t="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`)
    .join('')}</div>`;

  const subjChips = () => `<div class="chips">${SUBJECTS.map((s) => `<button class="chip" data-a="addSubj" data-n="${s}">＋${s}</button>`).join('')}</div>`;

  /* ---------------- 予定 ---------------- */
  function examCard(e, act) {
    const d = dayDiff(e.date);
    const label = d > 0 ? `あと${d}日` : d === 0 ? '今日' : '終了';
    const t = total(e);
    return `<button class="card exam-card k${esc(e.kind)} ${d >= 0 && d <= 7 ? 'soon' : ''}" data-a="${act}" data-id="${esc(e.id)}">
      <div class="ex-top"><span class="kind">${esc(e.kind)}</span><b>${esc(e.title)}</b><span class="count">${label}</span></div>
      <small>${fmtDate(e.date)}${t ? `　得点 ${t.sum}/${t.max}（${t.p.toFixed(1)}%）` : ''}${e.reflection?.ai || e.reflection?.bad ? '　振り返り済み' : ''}</small>
      ${act === 'editExam' && e.subjects?.length ? `<ul class="ranges">${e.subjects.map((s) => `<li><i>${esc(s.name)}</i><span>${esc(s.range || '範囲未入力')}</span></li>`).join('')}</ul>` : ''}</button>`;
  }
  /* ---------------- 予定（カレンダー） ---------------- */
  const evRow = (e) => {
    const x = parse(e.date);
    const act = { exam: 'editExam', event: 'editEvent', post: 'viewPost', task: 'goTask' }[e.src];
    return `<button class="ev" data-a="${act}" data-id="${esc(e.id)}" data-cid="${esc(e.cid || '')}"><span class="tm">${x.getMonth() + 1}/${x.getDate()}<br>${WDAYS[x.getDay()]}</span><span class="bx" style="--kc:${colorOf(e.type)}"><b>${esc(e.title)}</b><small>${esc(e.type)}${e.time ? ' ' + esc(e.time) : ''}${e.sub ? '　' + esc(e.sub) : ''}${e.repeat ? '　くり返し' : ''}</small></span></button>`;
  };
  const allEvents = (from, to) => buildEvents({ exams, events, tasks, posts, from, to });
  const leftLabel = (d) => (dayDiff(d) === 0 ? '今日' : `あと${dayDiff(d)}日`);

  function calTab() {
    const seg = `<div class="seg sm cal-view"><button data-a="calView" data-v="month" class="${calView === 'month' ? 'on' : ''}">月</button><button data-a="calView" data-v="list" class="${calView === 'list' ? 'on' : ''}">リスト</button></div>`;
    return `<div class="cal-top">${seg}<button class="add-pill sm" data-a="pick">${ICON.plus}<span>予定を追加</span></button></div>
      ${calView === 'month' ? monthView() : listView()}
      <button class="ghost wide" data-a="ics">${ICON.exam}<span>iPadのカレンダーに書き出す</span></button>`;
  }

  function monthView() {
    const { y, m } = ym;
    const grid = monthGrid(y, m);
    const from = grid[0][0];
    const to = grid[grid.length - 1][6];
    const by = {};
    allEvents(from, to).forEach((e) => (by[e.date] ||= []).push(e));
    const today = todayKey();
    const sel = selDay || today;
    const mk = `${y}-${String(m + 1).padStart(2, '0')}`;
    const cell = (d) => {
      const list = by[d] || [];
      const types = [...new Set(list.map((e) => e.type))];
      return `<button class="cd ${d.slice(0, 7) === mk ? '' : 'o'} ${d === today ? 'today' : ''} ${d === sel ? 'sel' : ''}" data-a="calDay" data-d="${d}"><span class="n">${Number(d.slice(8))}</span><span class="dots">${types.slice(0, 4).map((t) => `<i style="background:${colorOf(t)}"></i>`).join('')}</span>${list.length > 1 ? `<em>${list.length}</em>` : ''}${pl[d] ? `<span class="sbar" title="勉強 ${pl[d].tot}分"><i style="width:${pl[d].tot ? Math.round((pl[d].done / pl[d].tot) * 100) : 0}%"></i></span>` : ''}</button>`;
    };
    const dayEvs = by[sel] || [];
    const pl = {};
    (plan?.days || []).forEach((d) => {
      const tot = d.items.reduce((a, it) => a + (it.minutes || 0), 0);
      const done = d.items.reduce((a, it, i) => a + (plan.done?.[d.date + '#' + i] ? it.minutes || 0 : 0), 0);
      pl[d.date] = { tot, done };
    });
    const selPlan = (plan?.days || []).find((d) => d.date === sel);
    return `<div class="card calcard">
        <div class="cal-head"><button class="nav-b" data-a="mPrev" aria-label="前の月">${ICON.chevron}</button><b>${y}年${m + 1}月</b><button class="nav-b" data-a="mNext" aria-label="次の月">${ICON.chevron}</button><button class="chip" data-a="mToday">今日</button></div>
        <div class="cal-wd">${WDAYS.map((w, i) => `<span class="${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}">${w}</span>`).join('')}</div>
        <div class="cal-grid">${grid.map((w) => w.map(cell).join('')).join('')}</div>
      </div>
      <div class="group-title">${fmtD(sel)}の予定</div>
      ${dayEvs.length ? dayEvs.map(evRow).join('') : '<p class="empty small">この日の予定はありません</p>'}
      ${selPlan ? `<div class="group-title">勉強の計画　${pl[sel].done}／${pl[sel].tot}分</div><div class="plan-day mini">${selPlan.items.map((it, i) => { const k = sel + '#' + i; return `<label class="pd-item ${it.kind}"><span class="tick"><input type="checkbox" data-a="planDone" data-k="${k}" ${plan.done?.[k] ? 'checked' : ''} /><i></i></span><span class="t">${esc(it.title)}</span><small>${it.minutes}分</small></label>`; }).join('')}</div>` : ''}
      <p class="footnote legend">${Object.keys(pl).length ? 'マスの下の線が勉強の計画です（塗りがおわった分）。' : '「課題」タブで勉強計画を作ると、ここに重なって出ます。'}</p>
      <button class="ghost wide" data-a="pick" data-d="${sel}">${ICON.plus}<span>この日に予定を追加</span></button>`;
  }

  function listView() {
    const today = todayKey();
    const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));
    const evs = allEvents(today, addDays(today, 150));
    const strip = days
      .map((d) => {
        const x = parse(d);
        const has = evs.some((e) => e.date === d);
        return `<button class="dy ${d === today ? 'today' : ''} ${d === selDay ? 'sel' : ''}" data-a="selDay" data-d="${d}">${WDAYS[x.getDay()]}<b>${x.getDate()}</b><i class="${has ? 'has' : ''}"></i></button>`;
      })
      .join('');
    const weekEnd = days[6];
    const now = selDay ? evs.filter((e) => e.date === selDay) : evs.filter((e) => e.date <= weekEnd);
    const later = selDay ? [] : evs.filter((e) => e.date > weekEnd).slice(0, 40);
    const past = exams.filter((e) => e.date < today).sort((a, b) => byDate(b, a));
    return `<div class="strip">${strip}</div>
      <div class="group-title">${selDay ? fmtD(selDay) + 'の予定' : '今週のできごと'}</div>
      ${now.length ? now.map(evRow).join('') : '<p class="empty small">この期間の予定はありません</p>'}
      ${later.length ? `<div class="group-title">少し先</div>${later.map(evRow).join('')}` : ''}
      ${past.length ? `<div class="group-title">終わった試験</div>${past.map((e) => examCard(e, 'editExam')).join('')}` : ''}`;
  }

  const PICK_DESC = { 考査: '範囲・点数・振り返りを記録', 模試: '範囲・点数・振り返りを記録', 小テスト: '範囲・点数・振り返りを記録', 提出: '提出物の期限', 授業: '時間割・補講など', 部活: '練習・試合など', 行事: '学校の行事', 予定: 'そのほか何でも' };
  function pickScreen() {
    const btn = (t) => `<button class="pick" data-a="newOf" data-t="${t}" style="--kc:${colorOf(t)}"><i></i><span><b>${t}</b><small>${PICK_DESC[t]}</small></span></button>`;
    return `<button class="text-btn back" data-a="back">‹ 戻る</button><h2 class="large">なにを追加する？</h2><p class="sub">${fmtD(pickDate || todayKey())}</p>
      <button class="pick scan-pick" data-a="openScan" style="--kc:var(--c)"><i></i><span><b>範囲表の写真から自動で入れる</b><small>日程表・範囲表を撮るだけ。AIが日付と範囲を読み取ります</small></span></button>
      <div class="group-title">点数や振り返りを残せるもの</div><div class="picks">${EXAM_KINDS.map(btn).join('')}</div>
      <div class="group-title">予定だけ入れるもの（くり返しもOK）</div><div class="picks">${EVENT_TYPES.map(btn).join('')}</div>`;
  }

  /* ---------------- 範囲表から自動登録 ---------------- */
  function scanScreen() {
    const r = scanRes;
    const head = `<button class="text-btn back" data-a="back">‹ 戻る</button><h2 class="large">写真から予定を入れる</h2>`;
    if (!r)
      return `${head}<p class="sub">考査・模試の日程表や範囲表の写真・PDFを選ぶと、AIが日付と範囲を読み取って、カレンダーに入れる内容を作ります。入れる前に確認できます。</p>
      <div class="card attach">
        <p class="aihint">${ICON.sparkle}<span>写真・PDF・テキストに対応しています</span></p>
        <label class="filebtn">${ICON.plus}<span>ファイルを選ぶ／写真をとる</span><input type="file" id="f-file" accept="${ACCEPT}" multiple hidden></label>
        <div class="fchips" id="fchips">${fileChips(files)}</div>
        <textarea id="f-text" rows="3" placeholder="文字で貼り付けてもOK"></textarea>
        <button class="primary big" data-a="runScan">${ICON.sparkle}<span>読み取る</span></button>
      </div>`;
    const ex = r.subjects.length
      ? `<div class="group-title">試験</div><div class="card scan-card"><label class="row field"><span>名前</span><input id="s-title" value="${esc(r.title)}" placeholder="例）2学期期末考査" /></label>
        <label class="row field"><span>種類</span><select id="s-kind">${EXAM_KINDS.map((k) => `<option ${k === r.kind ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
        ${r.subjects.map((s, i) => `<label class="scan-row"><input type="checkbox" class="s-on" data-i="${i}" ${s.off ? '' : 'checked'} /><b>${esc(s.name)}</b><span>${s.date ? fmtD(s.date) : '日付なし'}</span><small>${esc(s.range || '範囲なし')}</small></label>`).join('')}</div>`
      : '';
    const ot = r.others.length
      ? `<div class="group-title">そのほかの予定</div><div class="card scan-card">${r.others.map((o, i) => `<label class="scan-row"><input type="checkbox" class="o-on" data-i="${i}" ${o.off ? '' : 'checked'} /><b>${esc(o.title)}</b><span>${fmtD(o.date)}</span><small>${esc(o.type)}</small></label>`).join('')}</div>`
      : '';
    return `${head}<p class="sub">読み取れた内容です。いらないものはチェックを外してください。</p>${ex}${ot}
      <button class="primary big" data-a="regScan"><span>カレンダーに入れる</span></button>
      <button class="ghost wide" data-a="openScan">${ICON.pen}<span>やり直す</span></button>`;
  }

  function eventForm() {
    const e = curEvent;
    return `<button class="text-btn back" data-a="back">‹ 戻る</button>
      <h2 class="large">${e.id ? '予定を編集' : '予定を追加'}</h2>
      <div class="group-title">名前</div><input class="text" id="e-title" placeholder="例）英語ワーク提出 / 吹奏楽の練習" value="${esc(e.title)}" />
      <div class="group-title">日時</div>
      <div class="group"><label class="row field"><span>種類</span><select id="e-type">${EVENT_TYPES.map((k) => `<option ${k === e.type ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
        <label class="row field"><span>日付</span><input type="date" id="e-date" value="${esc(e.date)}" /></label>
        <label class="row field"><span>時間（なくてもOK）</span><input type="time" id="e-time" value="${esc(e.time || '')}" /></label></div>
      <div class="group-title">くり返し</div>
      <div class="group"><label class="row field"><span>くり返し</span><select id="e-repeat">${[['none', 'なし'], ['weekly', '毎週'], ['biweekly', '隔週'], ['monthly', '毎月']].map(([k, l]) => `<option value="${k}" ${k === (e.repeat || 'none') ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="row field"><span>終わりの日（空ならずっと）</span><input type="date" id="e-until" value="${esc(e.until || '')}" /></label></div>
      <div class="group-title">メモ</div><textarea id="e-note" rows="3" placeholder="持ち物・場所など">${esc(e.note || '')}</textarea>
      <button class="primary big" data-a="saveEvent"><span>保存する</span></button>
      ${e.id ? `<button class="danger" data-a="delEvent">${ICON.trash}<span>この予定を削除${e.repeat && e.repeat !== 'none' ? '（くり返し全部）' : ''}</span></button>` : ''}`;
  }

  /* ---------------- クラス（配信） ---------------- */
  function classTab() {
    const form =
      classForm === 'create'
        ? `<div class="card taskform"><input class="text" id="c-name" placeholder="クラスの名前（例: 2年A組）" /><div class="two"><button class="primary" data-a="doCreate"><span>作る</span></button><button class="text-btn" data-a="classForm" data-f="">やめる</button></div></div>`
        : classForm === 'join'
          ? `<div class="card taskform"><input class="text code-in" id="c-code" placeholder="参加コード（6文字）" autocapitalize="characters" autocomplete="off" maxlength="8" /><div class="two"><button class="primary" data-a="doJoin"><span>参加する</span></button><button class="text-btn" data-a="classForm" data-f="">やめる</button></div></div>`
          : `<div class="two2"><button class="primary" data-a="classForm" data-f="create"><span>クラスを作る</span></button><button class="ghost" data-a="classForm" data-f="join"><span>コードで参加</span></button></div>`;
    return `<p class="footnote lead">クラスを作ると、小テスト・提出・お知らせを「配信」できます。友達は参加コードを入れるだけで、みんなのカレンダーに自動で出ます。</p>
      ${form}
      <div class="group-title">参加中のクラス (${classes.length})</div>
      ${classes.length ? classes.map((c) => `<button class="card cls-card" data-a="openClass" data-id="${esc(c.id)}"><b>${esc(c.name)}</b><span class="kind">${c.role === 'owner' ? '作成者' : '参加中'}</span></button>`).join('') : '<p class="empty small">まだクラスがありません</p>'}`;
  }

  function classScreen() {
    const c = curClass;
    const owner = c.role === 'owner';
    const list = classPosts.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const today = todayKey();
    return `<button class="text-btn back" data-a="back">‹ 戻る</button>
      <h2 class="large">${esc(c.name)}</h2><p class="sub">${owner ? '作成者' : '参加中'}　・　${esc(c.ownerName || '')}</p>
      ${owner ? `<div class="code-box"><small>参加コード（友達に教えてね）</small><b>${esc(c.code)}</b><button class="ghost" data-a="copyCode"><span>コピー</span></button></div>` : ''}
      ${owner ? `<button class="primary big" data-a="newPost">${ICON.plus}<span>配信する</span></button>` : ''}
      <div class="group-title">配信 (${list.length})</div>
      ${list.length ? list.map((p) => `<button class="ev ${p.date < today ? 'past' : ''}" data-a="viewPost" data-id="${esc(p.id)}" data-cid="${esc(c.id)}" data-from="class"><span class="tm">${fmtD(p.date).replace('（', '<br>').replace('）', '')}</span><span class="bx" style="--kc:${colorOf(p.type)}"><b>${esc(p.title)}</b><small>${esc(p.type)}${p.time ? ' ' + esc(p.time) : ''}${p.subject ? '　' + esc(p.subject) : ''}</small></span></button>`).join('') : '<p class="empty small">まだ配信はありません</p>'}
      ${owner && c.members?.length ? `<div class="group-title">参加者 (${c.members.length})</div><div class="card members">${c.members.map((m) => `<span class="fchip">${esc(m.name || '名前なし')}</span>`).join('')}</div>` : ''}
      <button class="danger" data-a="${owner ? 'delClass' : 'leaveClass'}">${ICON.trash}<span>${owner ? 'このクラスを削除' : 'このクラスを抜ける'}</span></button>`;
  }

  function postForm() {
    const p = curPost;
    return `<button class="text-btn back" data-a="${postBack === 'class' ? 'backClass' : 'back'}">‹ 戻る</button>
      <h2 class="large">${p.id ? '配信を編集' : '配信する'}</h2><p class="sub">${esc(curClass.name)}</p>
      <div class="group-title">タイトル</div><input class="text" id="p-title" placeholder="例）英単語 小テスト / 数学ワーク提出" value="${esc(p.title)}" />
      <div class="group-title">種類と日時</div>
      <div class="group"><label class="row field"><span>種類</span><select id="p-type">${POST_TYPES.map((k) => `<option ${k === p.type ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
        <label class="row field"><span>教科</span><input id="p-subject" placeholder="英語" value="${esc(p.subject || '')}" /></label>
        <label class="row field"><span>日付</span><input type="date" id="p-date" value="${esc(p.date)}" /></label>
        <label class="row field"><span>時間（なくてもOK）</span><input type="time" id="p-time" value="${esc(p.time || '')}" /></label></div>
      <div class="group-title">範囲</div><textarea id="p-range" rows="2" placeholder="例）Lesson 3 の単語 / p.20〜30">${esc(p.range || '')}</textarea>
      <div class="group-title">メモ</div><textarea id="p-note" rows="3" placeholder="持ち物・連絡など">${esc(p.note || '')}</textarea>
      <button class="primary big" data-a="savePost"><span>配信する</span></button>`;
  }

  function postView() {
    const p = curPost;
    const owner = curClass?.role === 'owner' || classes.find((c) => c.id === p.cid)?.role === 'owner';
    const testy = ['小テスト', '考査', '模試'].includes(p.type);
    return `<button class="text-btn back" data-a="${postBack === 'class' ? 'backClass' : 'back'}">‹ 戻る</button>
      <div class="card postcard" style="--kc:${colorOf(p.type)}"><span class="kind" style="background:${colorOf(p.type)}">${esc(p.type)}</span><h2>${esc(p.title)}</h2>
        <p class="sub">${fmtD(p.date)}${p.time ? ' ' + esc(p.time) : ''}　${esc(p.cname || curClass?.name || '')}</p>
        ${p.subject ? `<p><b>教科</b>　${esc(p.subject)}</p>` : ''}${p.range ? `<p><b>範囲</b>　${esc(p.range)}</p>` : ''}${p.note ? `<p class="pnote">${esc(p.note)}</p>` : ''}</div>
      ${testy ? `<button class="primary big" data-a="postToExam"><span>自分の記録に追加（点数を残す）</span></button>` : ''}
      ${p.type === '提出' ? `<button class="primary big" data-a="postToTask"><span>自分の課題に追加</span></button>` : ''}
      ${owner ? `<button class="ghost wide" data-a="editPost">${ICON.pen}<span>編集する</span></button><button class="danger" data-a="delPost">${ICON.trash}<span>この配信を削除</span></button>` : ''}`;
  }

  function examForm() {
    const e = cur;
    return `<button class="text-btn back" data-a="back">‹ 戻る</button>
      <h2 class="large">${e.id ? '試験を編集' : '試験を追加'}</h2>
      <div class="group-title">名前</div>
      <input class="text" id="f-title" placeholder="例）2学期中間考査 / 第3回全国模試" value="${esc(e.title)}" />
      <div class="group-title">種類と日付</div>
      <div class="group"><label class="row field"><span>種類</span><select id="f-kind">${[...EXAM_KINDS, 'その他'].map((k) => `<option ${k === e.kind ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
        <label class="row field"><span>試験日</span><input type="date" id="f-date" value="${esc(e.date)}" /></label></div>
      <div class="group-title">試験範囲</div>
      <div class="card attach">
        <p class="aihint">${ICON.sparkle}<span>範囲表の写真やPDFを選ぶと、AIが教科ごとの範囲を読み取ります</span></p>
        <label class="filebtn">${ICON.plus}<span>ファイルを選ぶ／写真をとる</span><input type="file" id="f-file" accept="${ACCEPT}" multiple hidden></label>
        <div class="fchips" id="fchips">${fileChips(files)}</div>
        <textarea id="f-text" rows="3" placeholder="範囲をそのまま貼り付けてもOK"></textarea>
        <button class="ghost" data-a="readRange">${ICON.sparkle}<span>AIで読み取る</span></button>
      </div>
      <div class="group">${(e.subjects || [])
        .map((s, i) => `<div class="row subj"><input class="s-name" data-i="${i}" value="${esc(s.name)}" placeholder="教科" /><input class="s-range" data-i="${i}" value="${esc(s.range)}" placeholder="範囲（例: p.10〜45）" /><input type="date" class="s-date" data-i="${i}" value="${esc(s.date || '')}" aria-label="この教科の試験日" /><button class="x" data-a="rmSubj" data-i="${i}" aria-label="削除">×</button></div>`)
        .join('') || '<div class="row"><small>下のボタンで教科を追加できます</small></div>'}</div>
      ${subjChips()}
      <button class="primary big" data-a="saveExam"><span>保存する</span></button>
      ${e.id ? `<button class="danger" data-a="delExam">${ICON.trash}<span>この試験を削除</span></button>` : ''}`;
  }

  /* ---------------- 点数 ---------------- */
  function scoreTab() {
    const list = exams.slice().sort((a, b) => byDate(b, a));
    const any = exams.some((e) => total(e));
    return `${any ? `<div class="card chartcard">${lineChart(exams)}<p class="footnote">得点率(%)の推移。点線が合計です。</p></div>` : ''}
      ${any ? `<button class="ghost wide" data-a="aiScore">${ICON.sparkle}<span>Geminiに点数を分析してもらう</span></button>` : ''}
      ${scoreAI ? aiCard(scoreAI) : ''}
      <div class="group-title">点数を入力する試験をえらぶ</div>
      ${list.length ? list.map((e) => examCard(e, 'editScore')).join('') : '<p class="empty">先に「予定」タブで試験を登録してください。</p>'}`;
  }
  function scoreForm() {
    const e = cur;
    return `<button class="text-btn back" data-a="back">‹ 戻る</button>
      <h2 class="large">${esc(e.title)}</h2><p class="sub">${fmtDate(e.date)}の点数</p>
      <div class="group"><div class="row score-head"><span>教科</span><span>得点</span><span>満点</span><span>平均</span></div>${(e.subjects || [])
        .map(
          (s, i) => `<div class="row score-row"><input class="sc" data-s="name" data-i="${i}" value="${esc(s.name)}" /><input class="sc" data-s="score" data-i="${i}" type="number" inputmode="decimal" value="${esc(s.score ?? '')}" /><input class="sc" data-s="max" data-i="${i}" type="number" inputmode="decimal" value="${esc(s.max ?? 100)}" /><input class="sc" data-s="avg" data-i="${i}" type="number" inputmode="decimal" value="${esc(s.avg ?? '')}" placeholder="–" /></div>`,
        )
        .join('') || '<div class="row"><small>教科を追加してください</small></div>'}</div>
      ${subjChips()}
      <div class="group-title">総合（あれば）</div>
      <div class="group"><label class="row field"><span>総合順位</span><input id="f-rank" inputmode="numeric" value="${esc(e.rank ?? '')}" placeholder="例）12位 / 240人中" /></label>
        <label class="row field"><span>偏差値</span><input id="f-dev" inputmode="decimal" value="${esc(e.dev ?? '')}" placeholder="例）58.3" /></label></div>
      <button class="primary big" data-a="saveScore"><span>保存する</span></button>`;
  }

  /* ---------------- 課題・計画 ---------------- */
  function taskTab() {
    const open = tasks.filter((t) => !t.done).sort((a, b) => (a.due < b.due ? -1 : 1));
    const done = tasks.filter((t) => t.done);
    const row = (t) => {
      const d = dayDiff(t.due);
      return `<div class="row task ${t.done ? 'done' : ''}"><label class="tick"><input type="checkbox" data-a="toggleTask" data-id="${esc(t.id)}" ${t.done ? 'checked' : ''} /><i></i></label>
        <span class="row-main"><b>${esc(t.title)}</b><small>${t.subject ? esc(t.subject) + '　' : ''}期限 ${fmtDate(t.due)}${t.done ? '' : d < 0 ? '（過ぎています）' : d === 0 ? '（今日）' : `（あと${d}日）`}${t.minutes ? `　目安${t.minutes}分` : ''}</small></span>
        <button class="x" data-a="delTask" data-id="${esc(t.id)}" aria-label="削除">×</button></div>`;
    };
    return `${showTaskForm ? taskForm() : `<button class="primary big" data-a="newTask">${ICON.plus}<span>課題を追加</span></button>`}
      <div class="group-title">やること (${open.length})</div>
      ${open.length ? `<div class="group">${open.map(row).join('')}</div>` : '<p class="empty">未完了の課題はありません。</p>'}
      ${done.length ? `<div class="group-title">終わった課題</div><div class="group">${done.map(row).join('')}</div>` : ''}
      <div class="group-title">AIの勉強計画</div>
      <div class="group"><label class="row field"><span>平日に使える時間</span><select id="m-wd">${[30, 60, 90, 120, 150, 180, 240].map((n) => `<option value="${n}" ${n === mins.wd ? 'selected' : ''}>${n}分</option>`).join('')}</select></label>
        <label class="row field"><span>休日に使える時間</span><select id="m-hd">${[60, 120, 180, 240, 300, 360, 480].map((n) => `<option value="${n}" ${n === mins.hd ? 'selected' : ''}>${n}分</option>`).join('')}</select></label></div>
      <button class="ghost wide" data-a="makePlan">${ICON.sparkle}<span>課題と試験から計画を作る</span></button>
      ${planView()}`;
  }
  function taskForm() {
    return `<div class="card taskform"><input class="text" id="t-title" placeholder="課題の名前（例: 数学ワーク p.20〜30）" />
      <div class="group"><label class="row field"><span>教科</span><input id="t-subj" placeholder="数学" /></label>
        <label class="row field"><span>期限</span><input type="date" id="t-due" value="${todayKey()}" /></label>
        <label class="row field"><span>時間の目安（分）</span><input id="t-min" type="number" inputmode="numeric" placeholder="60" /></label></div>
      <div class="two"><button class="primary" data-a="saveTask"><span>追加</span></button><button class="text-btn" data-a="cancelTask">やめる</button></div></div>`;
  }
  function planView() {
    if (!plan?.days?.length) return '';
    const today = todayKey();
    const days = plan.days.filter((d) => d.date >= today);
    if (!days.length) return '';
    return `<div class="plan">${plan.tips ? `<div class="card ai-card"><div class="ai-head">${ICON.sparkle}<b>計画のポイント</b></div><p>${esc(plan.tips)}</p></div>` : ''}
      ${days
        .map((d) => {
          const sum = d.items.reduce((a, it) => a + (it.minutes || 0), 0);
          return `<div class="plan-day ${d.date === today ? 'today' : ''}"><div class="pd-head"><b>${fmtDate(d.date)}</b>${d.date === today ? '<em>きょう</em>' : ''}<span>${sum}分</span></div>
          ${d.items
            .map((it, i) => {
              const k = d.date + '#' + i;
              return `<label class="pd-item ${it.kind}"><span class="tick"><input type="checkbox" data-a="planDone" data-k="${k}" ${plan.done?.[k] ? 'checked' : ''} /><i></i></span><span class="t">${esc(it.title)}</span><small>${it.minutes}分</small></label>`;
            })
            .join('')}</div>`;
        })
        .join('')}</div>`;
  }

  /* ---------------- 振り返り ---------------- */
  function reflectTab() {
    const list = exams.filter((e) => e.date <= todayKey()).sort((a, b) => byDate(b, a));
    return `<div class="group-title">振り返る試験をえらぶ</div>${list.length ? list.map((e) => examCard(e, 'editReflect')).join('') : '<p class="empty">終わった試験がまだありません。</p>'}`;
  }
  function reflectForm() {
    const e = cur;
    const r = e.reflection || {};
    return `<button class="text-btn back" data-a="back">‹ 戻る</button>
      <h2 class="large">${esc(e.title)}の振り返り</h2><p class="sub">${fmtDate(e.date)}${total(e) ? `　${total(e).sum}/${total(e).max}点（${total(e).p.toFixed(1)}%）` : ''}</p>
      <div class="group-title">よかった点</div><textarea id="r-good" rows="3" placeholder="例）英語は毎日単語をやったので8割とれた">${esc(r.good || '')}</textarea>
      <div class="group-title">反省点・間違えた原因</div><textarea id="r-bad" rows="4" placeholder="例）数学の応用問題で時間が足りなかった。ケアレスミスが多い">${esc(r.bad || '')}</textarea>
      <div class="group-title">次にやること</div><textarea id="r-next" rows="3" placeholder="例）ワークを2周する">${esc(r.next || '')}</textarea>
      <div class="group-title">答案や問題の写真（任意）</div>
      <div class="card attach"><label class="filebtn">${ICON.plus}<span>ファイルを選ぶ／写真をとる</span><input type="file" id="f-file" accept="${ACCEPT}" multiple hidden></label>
        <div class="fchips" id="fchips">${fileChips(files)}</div><p class="footnote">添付するとAIが間違いの傾向も見てくれます（保存はされません）</p></div>
      <button class="ghost wide" data-a="aiReflect">${ICON.sparkle}<span>AIに振り返りを分析してもらう</span></button>
      <div id="aiBox">${aiCard(r.ai)}</div>
      <button class="primary big" data-a="saveReflect"><span>保存する</span></button>`;
  }

  /* ---------------- 描画 ---------------- */
  function render() {
    if (!alive) return;
    let body;
    if (screen === 'form') body = examForm();
    else if (screen === 'score') body = scoreForm();
    else if (screen === 'reflect') body = reflectForm();
    else if (screen === 'pick') body = pickScreen();
    else if (screen === 'scan') body = scanScreen();
    else if (screen === 'event') body = eventForm();
    else if (screen === 'class') body = classScreen();
    else if (screen === 'post') body = postForm();
    else if (screen === 'postView') body = postView();
    else body = tabs() + `<div class="exam-body">${{ cal: calTab, score: scoreTab, task: taskTab, reflect: reflectTab, class: classTab }[tab]()}</div>`;
    root.innerHTML = `<div class="page exam">${body}</div>`;
  }

  /* 画面の入力を cur に取り込む（再描画の前に必ず呼ぶ） */
  function sync() {
    const q = (s) => root.querySelector(s);
    if (screen === 'form' && cur) {
      cur.title = q('#f-title')?.value.trim() ?? cur.title;
      cur.kind = q('#f-kind')?.value ?? cur.kind;
      cur.date = q('#f-date')?.value || cur.date;
      root.querySelectorAll('.s-name').forEach((el) => (cur.subjects[el.dataset.i].name = el.value.trim()));
      root.querySelectorAll('.s-range').forEach((el) => (cur.subjects[el.dataset.i].range = el.value.trim()));
      root.querySelectorAll('.s-date').forEach((el) => (cur.subjects[el.dataset.i].date = el.value));
    } else if (screen === 'event' && curEvent) {
      const g = (id, k) => (curEvent[k] = q(id)?.value ?? curEvent[k]);
      curEvent.title = q('#e-title')?.value.trim() ?? curEvent.title;
      g('#e-type', 'type');
      curEvent.date = q('#e-date')?.value || curEvent.date;
      g('#e-time', 'time');
      g('#e-repeat', 'repeat');
      g('#e-until', 'until');
      g('#e-note', 'note');
    } else if (screen === 'post' && curPost) {
      curPost.title = q('#p-title')?.value.trim() ?? curPost.title;
      curPost.type = q('#p-type')?.value ?? curPost.type;
      curPost.subject = q('#p-subject')?.value.trim() ?? curPost.subject;
      curPost.date = q('#p-date')?.value || curPost.date;
      curPost.time = q('#p-time')?.value ?? curPost.time;
      curPost.range = q('#p-range')?.value ?? curPost.range;
      curPost.note = q('#p-note')?.value ?? curPost.note;
    } else if (screen === 'score' && cur) {
      root.querySelectorAll('.sc').forEach((el) => {
        const s = cur.subjects[el.dataset.i];
        s[el.dataset.s] = el.dataset.s === 'name' ? el.value.trim() : el.value === '' ? '' : Number(el.value);
      });
      cur.rank = q('#f-rank')?.value.trim() ?? cur.rank;
      cur.dev = q('#f-dev')?.value.trim() ?? cur.dev;
    } else if (screen === 'reflect' && cur) {
      cur.reflection = { ...(cur.reflection || {}), good: q('#r-good')?.value ?? '', bad: q('#r-bad')?.value ?? '', next: q('#r-next')?.value ?? '' };
    }
  }

  async function persist(e) {
    const id = await saveItem(uid, 'exams', e);
    const i = exams.findIndex((x) => x.id === id);
    const rec = { ...clone(e), id };
    if (i >= 0) exams[i] = rec;
    else exams.push(rec);
    return rec;
  }

  const back = () => {
    screen = 'list';
    cur = null;
    curEvent = null;
    curPost = null;
    curClass = null;
    files = [];
    render();
  };

  async function onClick(e) {
    const t = e.target.closest('[data-a]');
    if (!t || t.tagName === 'INPUT') return;
    const a = t.dataset.a;
    const find = () => exams.find((x) => x.id === t.dataset.id);
    try {
      if (a === 'tab') {
        tab = t.dataset.t;
        lsSet('exam:tab', tab);
        return render();
      }
      if (a === 'selDay') {
        selDay = selDay === t.dataset.d ? null : t.dataset.d;
        return render();
      }
      if (a === 'goTask') {
        tab = 'task';
        lsSet('exam:tab', tab);
        return render();
      }
      if (a === 'back') return back();
      if (a === 'calView') {
        calView = t.dataset.v;
        lsSet('exam:view', calView);
        return render();
      }
      if (a === 'calDay') {
        selDay = t.dataset.d;
        const x = parse(selDay);
        ym = { y: x.getFullYear(), m: x.getMonth() };
        return render();
      }
      if (a === 'mPrev' || a === 'mNext') {
        const d = new Date(ym.y, ym.m + (a === 'mNext' ? 1 : -1), 1);
        ym = { y: d.getFullYear(), m: d.getMonth() };
        return render();
      }
      if (a === 'mToday') {
        ym = { y: now0.getFullYear(), m: now0.getMonth() };
        selDay = todayKey();
        return render();
      }
      if (a === 'pick') {
        pickDate = t.dataset.d || selDay || todayKey();
        screen = 'pick';
        return render();
      }
      if (a === 'openScan') {
        scanRes = null;
        files = [];
        screen = 'scan';
        return render();
      }
      if (a === 'runScan') {
        const text = root.querySelector('#f-text').value.trim();
        if (!text && !files.length) return toast('写真・PDFを選ぶか、文字を貼り付けてください');
        busy(t, true, '読み取り中…');
        try {
          const r = await extractSchedule({ text, files });
          if (!alive) return;
          if (!r.subjects.length && !r.others.length) throw new Error('日程を読み取れませんでした。写真を撮り直してみてください');
          scanRes = r;
          files = [];
          return render();
        } catch (err) {
          toast(err.message || '読み取れませんでした');
          busy(t, false, '読み取る');
          return;
        }
      }
      if (a === 'regScan') {
        const r = scanRes;
        root.querySelectorAll('.s-on').forEach((el) => (r.subjects[el.dataset.i].off = !el.checked));
        root.querySelectorAll('.o-on').forEach((el) => (r.others[el.dataset.i].off = !el.checked));
        const subs = r.subjects.filter((x) => !x.off);
        const others = r.others.filter((x) => !x.off);
        let n = 0;
        if (subs.length) {
          const title = root.querySelector('#s-title')?.value.trim() || r.title || '試験';
          const kind = root.querySelector('#s-kind')?.value || r.kind;
          const ds = subs.map((x) => x.date).filter(Boolean).sort();
          const date = ds[0] || todayKey();
          await persist({ title, kind, date, subjects: subs.map((x) => ({ name: x.name, range: x.range, date: x.date || '' })) });
          n += subs.length;
        }
        for (const o of others) {
          const rec = { title: o.title, type: o.type, date: o.date, time: o.time || '', repeat: 'none', until: '', note: '' };
          const id = await saveItem(uid, 'events', rec);
          events.push({ ...rec, id });
          n++;
        }
        scanRes = null;
        toast(`${n}件をカレンダーに入れました`);
        return back();
      }
      if (a === 'newOf') {
        const kind = t.dataset.t;
        const date = pickDate || todayKey();
        if (EXAM_KINDS.includes(kind)) {
          cur = { title: '', kind, date, subjects: [] };
          screen = 'form';
          files = [];
        } else {
          curEvent = { title: '', type: kind, date, time: '', repeat: 'none', until: '', note: '' };
          screen = 'event';
        }
        return render();
      }
      if (a === 'editEvent') {
        curEvent = clone(events.find((x) => x.id === t.dataset.id));
        screen = 'event';
        return render();
      }
      if (a === 'saveEvent') {
        sync();
        if (!curEvent.title) return toast('予定の名前を入れてください');
        const id = await saveItem(uid, 'events', curEvent);
        const rec = { ...clone(curEvent), id };
        const i = events.findIndex((x) => x.id === id);
        if (i >= 0) events[i] = rec;
        else events.push(rec);
        toast('保存しました');
        return back();
      }
      if (a === 'delEvent') {
        if (!confirm('この予定を削除しますか？')) return;
        await deleteItem(uid, 'events', curEvent.id);
        events = events.filter((x) => x.id !== curEvent.id);
        return back();
      }
      if (a === 'ics') {
        const from = todayKey();
        const items = allEvents(from, addDays(from, 180));
        if (!items.length) return toast('書き出せる予定がありません');
        const blob = new Blob([toICS(items)], { type: 'text/calendar' });
        const url = URL.createObjectURL(blob);
        const l = document.createElement('a');
        l.href = url;
        l.download = 'studyhub.ics';
        document.body.appendChild(l);
        l.click();
        l.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        return toast('書き出しました。開くとカレンダーに追加できます');
      }
      /* ---- クラス ---- */
      if (a === 'classForm') {
        classForm = t.dataset.f || null;
        return render();
      }
      if (a === 'doCreate') {
        const name = root.querySelector('#c-name').value.trim();
        if (!name) return toast('クラスの名前を入れてください');
        const owner = ctx.user.name || (ctx.user.email || '').split('@')[0] || '作成者';
        await createClass(uid, name, owner);
        classForm = null;
        toast('クラスを作りました');
        await loadClasses();
        return render();
      }
      if (a === 'doJoin') {
        const code = root.querySelector('#c-code').value;
        if (!code.trim()) return toast('コードを入れてください');
        const owner = ctx.user.name || (ctx.user.email || '').split('@')[0] || '名前なし';
        const r = await joinClass(uid, owner, code);
        classForm = null;
        toast(`「${r.name}」に参加しました`);
        await loadClasses();
        return render();
      }
      if (a === 'openClass' || a === 'backClass') {
        const id = a === 'openClass' ? t.dataset.id : curClass.id;
        curClass = await getClass(uid, id);
        if (!curClass) return toast('クラスが見つかりません');
        classPosts = posts.filter((p) => p.cid === id);
        curPost = null;
        screen = 'class';
        return render();
      }
      if (a === 'copyCode') {
        try {
          await navigator.clipboard.writeText(curClass.code);
          toast('コピーしました');
        } catch {
          toast('コード: ' + curClass.code);
        }
        return;
      }
      if (a === 'leaveClass' || a === 'delClass') {
        if (!confirm(a === 'delClass' ? 'クラスを削除します。配信もすべて消えます。よろしいですか？' : 'このクラスを抜けますか？')) return;
        if (a === 'delClass') await deleteClass(uid, curClass.id);
        else await leaveClass(uid, curClass.id);
        await loadClasses();
        return back();
      }
      if (a === 'newPost') {
        curPost = { title: '', type: '小テスト', subject: '', date: todayKey(), time: '', range: '', note: '' };
        postBack = 'class';
        screen = 'post';
        return render();
      }
      if (a === 'editPost') {
        curPost = clone(curPost);
        screen = 'post';
        return render();
      }
      if (a === 'savePost') {
        sync();
        if (!curPost.title) return toast('タイトルを入れてください');
        const { cid, cname, ...data } = curPost;
        await savePost(curClass.id, data);
        await loadClasses();
        classPosts = posts.filter((p) => p.cid === curClass.id);
        curPost = null;
        screen = 'class';
        toast('配信しました');
        return render();
      }
      if (a === 'viewPost') {
        const cid = t.dataset.cid;
        const p = posts.find((x) => x.id === t.dataset.id && x.cid === cid);
        if (!p) return;
        postBack = t.dataset.from === 'class' ? 'class' : 'list';
        curClass = (await getClass(uid, cid)) || curClass;
        curPost = p;
        screen = 'postView';
        return render();
      }
      if (a === 'delPost') {
        if (!confirm('この配信を削除しますか？')) return;
        await deletePost(curPost.cid || curClass.id, curPost.id);
        await loadClasses();
        classPosts = posts.filter((p) => p.cid === curClass.id);
        curPost = null;
        screen = postBack === 'class' ? 'class' : 'list';
        return render();
      }
      if (a === 'postToExam') {
        const p = curPost;
        await persist({ title: p.title, kind: p.type, date: p.date, subjects: p.subject || p.range ? [{ name: p.subject || p.title, range: p.range || '' }] : [] });
        toast('自分の記録に追加しました。点数タブで結果を残せます');
        return;
      }
      if (a === 'postToTask') {
        const p = curPost;
        const rec = { title: p.title, subject: p.subject || '', due: p.date, done: false };
        const id = await saveItem(uid, 'tasks', rec);
        tasks.push({ ...rec, id });
        toast('課題に追加しました');
        return;
      }
      if (a === 'newExam') {
        cur = { title: '', kind: '考査', date: todayKey(), subjects: [] };
        screen = 'form';
        files = [];
        return render();
      }
      if (a === 'editExam' || a === 'editScore' || a === 'editReflect') {
        cur = clone(find());
        cur.subjects ||= [];
        screen = a === 'editExam' ? 'form' : a === 'editScore' ? 'score' : 'reflect';
        files = [];
        return render();
      }
      if (a === 'addSubj') {
        sync();
        cur.subjects.push(screen === 'score' ? { name: t.dataset.n, range: '', score: '', max: 100, avg: '' } : { name: t.dataset.n, range: '' });
        return render();
      }
      if (a === 'rmSubj') {
        sync();
        cur.subjects.splice(Number(t.dataset.i), 1);
        return render();
      }
      if (a === 'rmFile') {
        files.splice(Number(t.dataset.i), 1);
        root.querySelector('#fchips').innerHTML = fileChips(files);
        return;
      }
      if (a === 'readRange') {
        sync();
        const text = root.querySelector('#f-text').value.trim();
        if (!text && !files.length) return toast('写真・PDFを選ぶか、範囲を貼り付けてください');
        busy(t, true, '読み取り中…');
        try {
          const r = await extractRange({ text, files });
          if (!alive) return;
          if (!r.subjects.length) throw new Error('範囲を読み取れませんでした。写真を撮り直してみてください');
          if (!cur.title && r.title) cur.title = r.title;
          if (r.date) cur.date = r.date;
          for (const s of r.subjects) {
            const ex = cur.subjects.find((x) => x.name === s.name);
            if (ex) ex.range = s.range;
            else cur.subjects.push(s);
          }
          files = [];
          toast('読み取りました。内容を確認してください');
          render();
        } catch (err) {
          toast(err.message || '読み取れませんでした');
          busy(t, false, 'AIで読み取る');
        }
        return;
      }
      if (a === 'saveExam') {
        sync();
        if (!cur.title) return toast('試験の名前を入れてください');
        cur.subjects = cur.subjects.filter((s) => s.name);
        await persist(cur);
        toast('保存しました');
        return back();
      }
      if (a === 'delExam') {
        if (!confirm('この試験を削除しますか？（点数・振り返りも消えます）')) return;
        await deleteItem(uid, 'exams', cur.id);
        exams = exams.filter((x) => x.id !== cur.id);
        return back();
      }
      if (a === 'saveScore') {
        sync();
        cur.subjects = cur.subjects.filter((s) => s.name);
        await persist(cur);
        toast('保存しました');
        return back();
      }
      if (a === 'aiScore') {
        const list = exams.filter((x) => total(x)).sort(byDate);
        const summary = list
          .map((x) => `■ ${x.title}（${x.kind} ${x.date}） 合計 ${total(x).sum}/${total(x).max}（${total(x).p.toFixed(1)}%）${x.rank ? ' 順位:' + x.rank : ''}${x.dev ? ' 偏差値:' + x.dev : ''}\n` + x.subjects.filter((s) => pct(s) != null).map((s) => `  ${s.name}: ${s.score}/${s.max}（${pct(s).toFixed(0)}%）${num(s.avg) != null ? ` 平均${s.avg}` : ''}`).join('\n'))
          .join('\n');
        busy(t, true, '分析中…');
        try {
          const r = await analyzeScores(summary);
          scoreAI = { ...r, id: 'scoreAI' };
          await saveItem(uid, 'plans', scoreAI);
          render();
        } catch (err) {
          toast(err.message || '分析できませんでした');
          busy(t, false, 'Geminiに点数を分析してもらう');
        }
        return;
      }
      if (a === 'aiReflect') {
        sync();
        const r0 = cur.reflection;
        if (!r0.good && !r0.bad && !files.length) return toast('振り返りを書くか、写真を添付してください');
        busy(t, true, '分析中…');
        try {
          const r = await analyzeReflection({ exam: `${cur.title}（${cur.kind} ${cur.date}）${total(cur) ? ' 合計' + total(cur).p.toFixed(1) + '%' : ''}\n` + (cur.subjects || []).filter((s) => pct(s) != null).map((s) => `${s.name}: ${s.score}/${s.max}${num(s.avg) != null ? '（平均' + s.avg + '）' : ''}`).join(' / '), good: r0.good, bad: r0.bad, next: r0.next, files });
          cur.reflection.ai = r;
          root.querySelector('#aiBox').innerHTML = aiCard(r);
          toast('保存を押すと、この提案も残ります');
        } catch (err) {
          toast(err.message || '分析できませんでした');
        }
        busy(t, false, 'AIに振り返りを分析してもらう');
        return;
      }
      if (a === 'saveReflect') {
        sync();
        await persist(cur);
        toast('保存しました');
        return back();
      }
      if (a === 'newTask') {
        showTaskForm = true;
        return render();
      }
      if (a === 'cancelTask') {
        showTaskForm = false;
        return render();
      }
      if (a === 'saveTask') {
        const title = root.querySelector('#t-title').value.trim();
        if (!title) return toast('課題の名前を入れてください');
        const item = { title, subject: root.querySelector('#t-subj').value.trim(), due: root.querySelector('#t-due').value || todayKey(), minutes: num(root.querySelector('#t-min').value) || 0, done: false, createdAt: Date.now() };
        item.id = await saveItem(uid, 'tasks', item);
        tasks.push(item);
        showTaskForm = false;
        return render();
      }
      if (a === 'delTask') {
        await deleteItem(uid, 'tasks', t.dataset.id);
        tasks = tasks.filter((x) => x.id !== t.dataset.id);
        return render();
      }
      if (a === 'makePlan') {
        const open = tasks.filter((x) => !x.done);
        const up = exams.filter((x) => x.date >= todayKey());
        if (!open.length && !up.length) return toast('課題か、これからの試験を登録してください');
        busy(t, true, '計画を作っています…');
        try {
          const r = await makePlan({ tasks: open, exams: up, today: todayKey(), weekdayMin: mins.wd, holidayMin: mins.hd });
          plan = { ...r, id: 'current', done: {}, createdAt: Date.now() };
          await saveItem(uid, 'plans', plan);
          render();
        } catch (err) {
          toast(err.message || '計画を作れませんでした');
          busy(t, false, '課題と試験から計画を作る');
        }
      }
    } catch (err) {
      console.warn(err);
      toast('うまくいきませんでした: ' + (err.message || ''));
    }
  }

  async function onChange(e) {
    const el = e.target;
    if (el.id === 'f-file') {
      sync();
      try {
        files = files.concat(await readAll([...el.files]));
      } catch (err) {
        toast(err.message);
      }
      el.value = '';
      const box = root.querySelector('#fchips');
      if (box) box.innerHTML = fileChips(files);
    } else if (el.dataset.a === 'toggleTask') {
      const t = tasks.find((x) => x.id === el.dataset.id);
      t.done = el.checked;
      await saveItem(uid, 'tasks', t);
      render();
    } else if (el.dataset.a === 'planDone') {
      plan.done ||= {};
      plan.done[el.dataset.k] = el.checked;
      await saveItem(uid, 'plans', plan);
      if (screen === 'list' && tab === 'cal') render();
    } else if (el.id === 'm-wd' || el.id === 'm-hd') {
      mins.wd = Number(root.querySelector('#m-wd').value);
      mins.hd = Number(root.querySelector('#m-hd').value);
      lsSet('exam:mins', mins);
    }
  }

  root.onclick = onClick;
  root.onchange = onChange;
  load();
  render();
  return () => {
    alive = false;
    root.onclick = null;
    root.onchange = null;
  };
}
