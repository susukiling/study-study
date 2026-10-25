import { toast } from '../dom.js';

// 画面を離れても動き続けるよう、状態はモジュール内に保持
const T = {
  mode: 'timer',
  total: 300,
  remain: 300,
  endAt: 0,
  running: false,
  doneTimeout: null,
  audio: null,
  sw: { running: false, start: 0, base: 0, laps: [] },
};

const remaining = () => (T.running ? Math.max(0, (T.endAt - Date.now()) / 1000) : T.remain);
const swElapsed = () => T.sw.base + (T.sw.running ? Date.now() - T.sw.start : 0);
const p2 = (n) => String(Math.floor(n)).padStart(2, '0');
const fmtT = (s) => `${p2(Math.ceil(s) / 60)}:${p2(Math.ceil(s) % 60)}`;
const fmtSw = (ms) => `${p2(ms / 60000)}:${p2((ms / 1000) % 60)}.${p2((ms % 1000) / 10)}`;

function beep() {
  try {
    const a = T.audio;
    if (!a) return;
    [0, 0.35, 0.7].forEach((d) => {
      const o = a.createOscillator();
      const g = a.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.25, a.currentTime + d);
      g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + d + 0.28);
      o.connect(g).connect(a.destination);
      o.start(a.currentTime + d);
      o.stop(a.currentTime + d + 0.3);
    });
  } catch {
    /* 音が出せない環境 */
  }
}

function startTimer() {
  if (T.running) return;
  T.audio ||= new (window.AudioContext || window.webkitAudioContext)();
  T.audio.resume?.();
  if (T.remain <= 0) T.remain = T.total;
  T.endAt = Date.now() + T.remain * 1000;
  T.running = true;
  T.doneTimeout = setTimeout(() => {
    T.running = false;
    T.remain = 0;
    beep();
    navigator.vibrate?.([300, 150, 300]);
    toast('時間です！');
  }, T.remain * 1000);
}
function pauseTimer() {
  if (!T.running) return;
  T.remain = remaining();
  T.running = false;
  clearTimeout(T.doneTimeout);
}
function resetTimer() {
  pauseTimer();
  T.remain = T.total;
}
function setTotal(sec) {
  if (T.running) return;
  T.total = Math.max(1, Math.min(sec, 99 * 60 + 59));
  T.remain = T.total;
}

export function mount(root) {
  let iv = null;

  function draw() {
    const timer = T.mode === 'timer';
    root.innerHTML = `<div class="page timer-page">
      <div class="seg"><button data-m="timer" class="${timer ? 'on' : ''}">タイマー</button><button data-m="sw" class="${timer ? '' : 'on'}">ストップウォッチ</button></div>
      ${timer ? timerHTML() : swHTML()}</div>`;
    update();
  }

  function timerHTML() {
    const mins = Math.floor(T.total / 60);
    const secs = T.total % 60;
    return `<div class="ring-wrap"><svg viewBox="0 0 200 200"><circle cx="100" cy="100" r="90" class="ring-bg"/><circle cx="100" cy="100" r="90" class="ring-fg" id="ringFg" transform="rotate(-90 100 100)"/></svg><div class="clock" id="clock">00:00</div></div>
      <div class="chips center">${[1, 3, 5, 10, 25, 45].map((m) => `<button class="chip ${T.total === m * 60 ? 'on' : ''}" data-preset="${m}" ${T.running ? 'disabled' : ''}>${m}分</button>`).join('')}</div>
      <div class="group custom"><label class="row field"><span>分</span><input type="number" id="mm" min="0" max="99" inputmode="numeric" value="${mins}" ${T.running ? 'disabled' : ''}></label><label class="row field"><span>秒</span><input type="number" id="ss" min="0" max="59" inputmode="numeric" value="${secs}" ${T.running ? 'disabled' : ''}></label></div>
      <div class="timer-btns"><button class="round gray" data-a="reset">リセット</button><button class="round main" data-a="toggle" id="toggle">${T.running ? '一時停止' : 'スタート'}</button></div>`;
  }

  function swHTML() {
    return `<div class="clock sw" id="clock">00:00.00</div>
      <div class="timer-btns"><button class="round gray" data-a="swlap" id="swlap">${T.sw.running ? 'ラップ' : 'リセット'}</button><button class="round main ${T.sw.running ? 'stop' : ''}" data-a="swtoggle">${T.sw.running ? 'ストップ' : 'スタート'}</button></div>
      <div class="group laps" id="laps"></div>`;
  }

  function update() {
    const clock = root.querySelector('#clock');
    if (!clock) return;
    if (T.mode === 'timer') {
      const r = remaining();
      clock.textContent = fmtT(r);
      const fg = root.querySelector('#ringFg');
      const C = 2 * Math.PI * 90;
      fg.style.strokeDasharray = C;
      fg.style.strokeDashoffset = C * (1 - (T.total ? r / T.total : 0));
      const tg = root.querySelector('#toggle');
      const label = T.running ? '一時停止' : T.remain < T.total && T.remain > 0 ? '再開' : 'スタート';
      if (tg.textContent !== label) tg.textContent = label;
    } else {
      clock.textContent = fmtSw(swElapsed());
    }
  }

  function drawLaps() {
    const el = root.querySelector('#laps');
    if (!el) return;
    el.style.display = T.sw.laps.length ? '' : 'none';
    el.innerHTML = [...T.sw.laps]
      .map((l, i) => ({ l, i }))
      .reverse()
      .map(({ l, i }) => `<div class="row"><span>ラップ ${i + 1}</span><span class="mono">${fmtSw(l.split)}</span><span class="mono dim">${fmtSw(l.total)}</span></div>`)
      .join('');
  }

  root.onclick = (e) => {
    const t = e.target.closest('[data-m],[data-preset],[data-a]');
    if (!t) return;
    if (t.dataset.m) {
      T.mode = t.dataset.m;
      draw();
      drawLaps();
    } else if (t.dataset.preset) {
      setTotal(Number(t.dataset.preset) * 60);
      draw();
    } else {
      switch (t.dataset.a) {
        case 'toggle':
          T.running ? pauseTimer() : startTimer();
          draw();
          break;
        case 'reset':
          resetTimer();
          draw();
          break;
        case 'swtoggle':
          if (T.sw.running) {
            T.sw.base = swElapsed();
            T.sw.running = false;
          } else {
            T.sw.start = Date.now();
            T.sw.running = true;
          }
          draw();
          drawLaps();
          break;
        case 'swlap':
          if (T.sw.running) {
            const total = swElapsed();
            const prev = T.sw.laps.length ? T.sw.laps[T.sw.laps.length - 1].total : 0;
            T.sw.laps.push({ total, split: total - prev });
          } else {
            T.sw = { running: false, start: 0, base: 0, laps: [] };
          }
          draw();
          drawLaps();
          break;
      }
    }
  };
  root.onchange = (e) => {
    if (e.target.id === 'mm' || e.target.id === 'ss') {
      const m = Number(root.querySelector('#mm').value) || 0;
      const s = Number(root.querySelector('#ss').value) || 0;
      setTotal(m * 60 + s);
      draw();
    }
  };

  draw();
  drawLaps();
  iv = setInterval(update, 60);
  return () => {
    clearInterval(iv);
    root.onclick = null;
    root.onchange = null;
  };
}
