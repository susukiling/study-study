import { esc, toast, todayKey, lsGet, lsSet } from '../dom.js';
import { ICON } from '../ui.js';
import { listItems, saveItem, deleteItem } from '../repo.js';
import { ACCEPT, readAll, fileChips } from '../files.js';
import { extractRange, analyzeScores, analyzeReflection, makePlan } from '../ai.js';

const SUBJECTS = ['国語', '数学', '英語', '理科','理科1','理科2', '社会', '物理', '化学', '生物', '歴史', '地理', '公民', '情報'];
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
const colorOf = (name, all) => COLORS[Math.max(0, all.indexOf(name)) % COLORS.length];

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
    body += line(list.map((e, i) => ({ i, v: pct(e.subjects.find((s) => s.name === n) || {}) })), colorOf(n, names), 2);
  });
  body += line(list.map((e, i) => ({ i, v: total(e).p })), 'var(--ink)', 3.2, '6 4');
  const xl = list.map((e, i) => `<text x="${x(i).toFixed(1)}" y="${H - 8}" class="ax" text-anchor="middle">${esc(e.date.slice(5).replace('-', '/'))}</text>`).join('');
  const legend = names.map((n) => `<span><i style="background:${colorOf(n, names)}"></i>${esc(n)}</span>`).join('') + '<span><i class="dash"></i>合計</span>';
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
  let tab = lsGet('exam:tab', 'plan');
  let screen = 'list';
  let cur = null;
  let exams = [];
  let tasks = [];
  let plan = null;
  let scoreAI = null;
  let files = [];
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
      const [e, t, p] = await Promise.all([listItems(uid, 'exams'), listItems(uid, 'tasks'), listItems(uid, 'plans')]);
      exams = e;
      tasks = t;
      plan = p.find((x) => x.id === 'current') || null;
      scoreAI = p.find((x) => x.id === 'scoreAI') || null;
    } catch (err) {
      console.warn(err);
      toast('データを読み込めませんでした');
    }
    if (alive) render();
  }

  /* ---------------- 共通の部品 ---------------- */
  const tabs = () => `<div class="seg exam-seg">${[['plan', '予定'], ['score', '点数'], ['task', '課題'], ['reflect', '振り返り']]
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
  function planTab() {
    const today = todayKey();
    const addDays = (d, n) => {
      const x = new Date(d + 'T00:00');
      x.setDate(x.getDate() + n);
      return todayKey(x);
    };
    const left = (d) => (dayDiff(d) === 0 ? '今日' : `あと${dayDiff(d)}日`);
    const evs = [
      ...exams.filter((e) => e.date >= today).map((e) => ({ date: e.date, type: 'exam', kind: e.kind, id: e.id, title: e.title, sub: `${(e.subjects || []).map((s) => s.name).join('・')}${e.subjects?.length ? '　' : ''}${left(e.date)}` })),
      ...tasks.filter((t) => !t.done && t.due >= today).map((t) => ({ date: t.due, type: 'task', kind: '課題', id: t.id, title: t.title, sub: `課題の期限${t.subject ? '（' + t.subject + '）' : ''}　${left(t.due)}` })),
    ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));
    const strip = days
      .map((d) => {
        const x = new Date(d + 'T00:00');
        const has = evs.some((e) => e.date === d);
        return `<button class="dy ${d === today ? 'today' : ''} ${d === selDay ? 'sel' : ''}" data-a="selDay" data-d="${d}">${WD[x.getDay()]}<b>${x.getDate()}</b><i class="${has ? 'has' : ''}"></i></button>`;
      })
      .join('');
    const ev = (e) => {
      const x = new Date(e.date + 'T00:00');
      return `<button class="ev" data-a="${e.type === 'exam' ? 'editExam' : 'goTask'}" data-id="${esc(e.id)}"><span class="tm">${x.getMonth() + 1}/${x.getDate()}<br>${WD[x.getDay()]}</span><span class="bx k${esc(e.kind)}"><b>${esc(e.title)}</b><small>${esc(e.sub)}</small></span></button>`;
    };
    const weekEnd = days[6];
    const now = selDay ? evs.filter((e) => e.date === selDay) : evs.filter((e) => e.date <= weekEnd);
    const later = selDay ? [] : evs.filter((e) => e.date > weekEnd);
    const past = exams.filter((e) => e.date < today).sort((a, b) => byDate(b, a));
    return `<div class="strip">${strip}</div>
      <button class="add-pill" data-a="newExam">${ICON.plus}<span>考査・模試を追加</span></button>
      <div class="group-title">${selDay ? fmtDate(selDay) + 'の予定' : '今週のできごと'}</div>
      ${now.length ? now.map(ev).join('') : '<p class="empty">この期間の予定はありません</p>'}
      ${later.length ? `<div class="group-title">少し先</div>${later.map(ev).join('')}` : ''}
      ${past.length ? `<div class="group-title">終わった試験</div>${past.map((e) => examCard(e, 'editExam')).join('')}` : ''}`;
  }

  function examForm() {
    const e = cur;
    return `<button class="text-btn back" data-a="back">‹ 戻る</button>
      <h2 class="large">${e.id ? '試験を編集' : '試験を追加'}</h2>
      <div class="group-title">名前</div>
      <input class="text" id="f-title" placeholder="例）2学期中間考査 / 第3回全国模試" value="${esc(e.title)}" />
      <div class="group-title">種類と日付</div>
      <div class="group"><label class="row field"><span>種類</span><select id="f-kind">${['考査', '模試', 'その他'].map((k) => `<option ${k === e.kind ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
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
        .map((s, i) => `<div class="row subj"><input class="s-name" data-i="${i}" value="${esc(s.name)}" placeholder="教科" /><input class="s-range" data-i="${i}" value="${esc(s.range)}" placeholder="範囲（例: p.10〜45）" /><button class="x" data-a="rmSubj" data-i="${i}" aria-label="削除">×</button></div>`)
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
    else body = tabs() + `<div class="exam-body">${{ plan: planTab, score: scoreTab, task: taskTab, reflect: reflectTab }[tab]()}</div>`;
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
