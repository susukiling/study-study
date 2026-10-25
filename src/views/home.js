import { APPS } from '../apps.js';
import { banner } from '../ui.js';
import { esc, fmtDuration } from '../dom.js';
import { getSummary } from '../stats.js';

const TIME_COLOR = '#5E5CE6';

function chartSVG(days, metric) {
  const W = 340, H = 200, L = 34, R = 8, T = 12, B = 26;
  const iw = W - L - R, ih = H - T - B;
  const segs = days.map((d) =>
    metric === 'time'
      ? [{ id: 'time', v: Math.round(d.seconds / 60), c: TIME_COLOR }]
      : APPS.map((a) => ({ id: a.id, v: d.solved[a.id] || 0, c: a.color })),
  );
  const totals = segs.map((s) => s.reduce((a, x) => a + x.v, 0));
  const mx = Math.max(1, ...totals);
  const step = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000].find((s) => mx / s <= 4) || 1000;
  const top = Math.ceil(mx / step) * step;
  const y = (v) => T + ih - (v / top) * ih;
  let grid = '';
  for (let v = 0; v <= top; v += step) {
    grid += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${L - 6}" y="${y(v) + 4}" class="ax" text-anchor="end">${v}</text>`;
  }
  const slot = iw / days.length;
  const bw = Math.max(3, slot * 0.62);
  const every = days.length > 14 ? 5 : 1;
  let bars = '';
  let xl = '';
  days.forEach((d, i) => {
    const x = L + slot * i + (slot - bw) / 2;
    let acc = 0;
    segs[i].forEach((s) => {
      if (!s.v) return;
      const h = (s.v / top) * ih;
      bars += `<rect x="${x.toFixed(1)}" y="${(T + ih - ((acc + s.v) / top) * ih).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="1.5" fill="${s.c}"/>`;
      acc += s.v;
    });
    if ((days.length - 1 - i) % every === 0) xl += `<text x="${(x + bw / 2).toFixed(1)}" y="${H - 8}" class="ax" text-anchor="middle">${d.label}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="学習記録のグラフ">${grid}${bars}${xl}</svg>`;
}

export function mount(root, ctx) {
  let alive = true;
  let metric = 'solved';
  let range = 7;
  let summary = null;

  const name = (ctx.user.name || '').split('@')[0];
  const today = new Date().toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'long' });

  root.innerHTML = `<div class="page">
    <div class="hello"><small>${esc(today)}</small><h2>こんにちは${name ? '、' + esc(name) + 'さん' : ''}</h2></div>
    <section class="stamp-card">
      <div class="stamp-head"><div class="streak"><span class="flame">🔥</span><b id="streak">–</b><span>日れんぞく！</span></div></div>
      <div class="stamps" id="stamps">${Array.from({ length: 7 }, () => '<div class="stamp"><i></i><small>–</small></div>').join('')}</div>
    </section>
    <section class="totals">
      <div><small>勉強した時間</small><b id="tt">–</b></div>
      <div><small>正解した問題</small><b id="tc">–</b></div>
      <div><small>きょうの問題</small><b id="td">–</b></div>
    </section>
    <h3 class="sec"><span>きょうは どれにする？</span></h3>
    <div class="apps">${APPS.map(
      (a) => `<article class="appcard theme-${a.id}">
        <a class="banner-link" href="${a.route}" aria-label="${esc(a.full)}">${banner(a.id, true)}</a>
        <div class="plank"></div>
        <div class="appcard-body"><b>${esc(a.full)}</b><small>きょう <b id="today-${a.id}">0</b> 問</small></div>
        <a class="btn" href="${a.route}">問題を解く</a>
      </article>`,
    ).join('')}</div>
    <h3 class="sec"><span>がんばりグラフ</span></h3>
    <section class="card chartcard">
      <div class="chart-head"><div class="seg sm" id="segMetric"><button data-metric="solved" class="on">問題数</button><button data-metric="time">時間(分)</button></div>
      <div class="seg sm" id="segRange"><button data-range="7" class="on">7日</button><button data-range="30">30日</button></div></div>
      <div id="chart"><div class="skeleton"></div></div>
      <div class="legend" id="legend"></div>
    </section>
  </div>`;

  function drawChart() {
    if (!summary) return;
    root.querySelector('#chart').innerHTML = chartSVG(summary.days.slice(-range), metric);
    root.querySelector('#legend').innerHTML =
      metric === 'time'
        ? `<span><i style="background:${TIME_COLOR}"></i>学習時間</span>`
        : APPS.map((a) => `<span><i style="background:${a.color}"></i>${esc(a.name)}</span>`).join('');
  }

  getSummary().then((s) => {
    if (!alive) return;
    summary = s;
    root.querySelector('#streak').textContent = s.streak;
    root.querySelector('#tt').textContent = fmtDuration(s.seconds);
    root.querySelector('#tc').textContent = `${s.correct}問`;
    APPS.forEach((a) => (root.querySelector('#today-' + a.id).textContent = s.today.solved[a.id] || 0));
    root.querySelector('#td').textContent = `${Object.values(s.today.solved).reduce((x, y) => x + y, 0)}問`;
    root.querySelector('#stamps').innerHTML = s.days
      .slice(-7)
      .map((d, i, a) => {
        const on = d.seconds > 0 || Object.values(d.solved).some((v) => v > 0);
        return `<div class="stamp ${on ? 'on' : ''} ${i === a.length - 1 ? 'today' : ''}"><i>${on ? '✓' : ''}</i><small>${esc(d.label.split('/')[1])}</small></div>`;
      })
      .join('');
    drawChart();
  });

  root.onclick = (e) => {
    const t = e.target.closest('[data-metric],[data-range]');
    if (!t) return;
    if (t.dataset.metric) {
      metric = t.dataset.metric;
      root.querySelectorAll('[data-metric]').forEach((b) => b.classList.toggle('on', b === t));
    } else {
      range = Number(t.dataset.range);
      root.querySelectorAll('[data-range]').forEach((b) => b.classList.toggle('on', b === t));
    }
    drawChart();
  };

  return () => {
    alive = false;
    root.onclick = null;
  };
}
