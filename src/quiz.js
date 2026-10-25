import { esc, toast } from './dom.js';
import { ICON } from './ui.js';
import * as stats from './stats.js';
import { getWrong, setWrong } from './repo.js';
import { gradeKanji } from './ai.js';
import { playCorrect, playWrong, playFinish } from './sound.js';

export function speak(text, lang = 'en-US') {
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.rate = 0.9;
    speechSynthesis.speak(u);
  } catch {
    /* 音声非対応 */
  }
}

/**
 * クイズ実行。questions の形:
 *  { id, type:'choice'|'type'|'write', label, prompt, sub, choices, answer, speak, autoSpeak, reveal, selfJudge }
 * 戻り値は dispose 関数（画面を離れるときに呼ぶ）
 */
export function runQuiz(root, opts) {
  const { app, uid, questions } = opts;
  let idx = 0;
  let cur = null;
  let disposed = false;
  let strokes = [];
  const results = [];

  stats.startSession();

  const keyHandler = (e) => {
    if (!cur || disposed) return;
    if (cur.q.type === 'choice' && !cur.done && /^[1-9]$/.test(e.key)) {
      const i = Number(e.key) - 1;
      if (i < cur.q.choices.length) answerChoice(i);
    } else if (e.key === 'Enter' && cur.done && document.activeElement?.tagName !== 'INPUT') {
      next();
    }
  };
  document.addEventListener('keydown', keyHandler);

  function dispose() {
    if (disposed) return;
    disposed = true;
    stats.endSession();
    document.removeEventListener('keydown', keyHandler);
    root.onclick = null;
    root.onsubmit = null;
    try {
      speechSynthesis.cancel();
    } catch {
      /* noop */
    }
  }

  const sfx = (ok) => (ok ? playCorrect() : playWrong());

  function finalize(ok, given) {
    if (cur.done) return;
    cur.done = true;
    cur.ok = ok;
    results.push({ q: cur.q, ok, given });
    stats.recordAnswer(app, ok);
  }

  function revealHTML(q) {
    return q.reveal ? `<div class="reveal">${esc(q.reveal).replace(/\n/g, '<br>')}</div>` : '';
  }

  function showNext() {
    const b = root.querySelector('#next');
    b.textContent = idx + 1 >= questions.length ? '結果を見る' : '次へ';
    b.hidden = false;
    b.focus({ preventScroll: true });
  }

  function showFeedback(ok, extra = '') {
    const q = cur.q;
    root.querySelector('#fb').innerHTML = `<div class="fb ${ok ? 'ok' : 'ng'}"><b>${ok ? '正解！' : '不正解'}</b>${extra}${revealHTML(q)}${q.explain ? `<p class="explain">${esc(q.explain)}</p>` : ''}</div>`;
    showNext();
  }

  /* ---------- 4択 ---------- */
  function answerChoice(i) {
    if (cur.done) return;
    const q = cur.q;
    const ok = i === q.answer;
    root.querySelectorAll('.choice').forEach((b, n) => {
      b.disabled = true;
      if (n === q.answer) b.classList.add('right');
      else if (n === i) b.classList.add('wrong');
    });
    finalize(ok, q.choices[i]);
    sfx(ok);
    showFeedback(ok);
  }

  /* ---------- スペル入力 ---------- */
  const norm = (s) => s.trim().toLowerCase().replace(/\s+/g, ' ');
  function answerType(giveUp) {
    if (cur.done) return;
    const input = root.querySelector('#ans');
    const given = giveUp ? '' : input.value;
    const ok = !giveUp && norm(given) === norm(cur.q.answer);
    input.disabled = true;
    root.querySelector('#typeActions').hidden = true;
    finalize(ok, given);
    sfx(ok);
    showFeedback(ok, ok ? '' : `<div class="answer-line">正解: <b>${esc(cur.q.answer)}</b>${given ? `<span class="mine">あなた: ${esc(given)}</span>` : ''}</div>`);
  }

  /* ---------- 手書き ---------- */
  function setupCanvas() {
    const canvas = root.querySelector('#pad');
    const g = canvas.getContext('2d');
    strokes = [];
    let drawing = false;
    const pt = (e) => {
      const r = canvas.getBoundingClientRect();
      return { x: ((e.clientX - r.left) * canvas.width) / r.width, y: ((e.clientY - r.top) * canvas.height) / r.height };
    };
    const redraw = () => {
      g.clearRect(0, 0, canvas.width, canvas.height);
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.lineWidth = 12;
      g.strokeStyle = '#1c1c1e';
      strokes.forEach((s) => {
        g.beginPath();
        s.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
        if (s.length === 1) g.lineTo(s[0].x + 0.1, s[0].y);
        g.stroke();
      });
    };
    canvas.addEventListener('pointerdown', (e) => {
      if (cur.locked) return;
      canvas.setPointerCapture(e.pointerId);
      drawing = true;
      strokes.push([pt(e)]);
      redraw();
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!drawing) return;
      strokes[strokes.length - 1].push(pt(e));
      redraw();
    });
    const up = () => (drawing = false);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    root.querySelector('#clear').onclick = () => {
      if (cur.locked) return;
      strokes = [];
      redraw();
    };
    root.querySelector('#undo').onclick = () => {
      if (cur.locked) return;
      strokes.pop();
      redraw();
    };
    cur.exportPng = () => {
      const c = document.createElement('canvas');
      c.width = canvas.width;
      c.height = canvas.height;
      const x = c.getContext('2d');
      x.fillStyle = '#fff';
      x.fillRect(0, 0, c.width, c.height);
      x.drawImage(canvas, 0, 0);
      return c.toDataURL('image/png');
    };
  }

  function writeFeedback(note, withAi) {
    const q = cur.q;
    const ok = cur.pendingOk;
    root.querySelector('#fb').innerHTML = `<div class="fb ${ok ? 'ok' : 'ng'}">
      <b>${ok ? '正解！' : '不正解'}</b>${withAi ? `<span class="score">${cur.score}点</span>` : ''}
      ${note ? `<p class="explain">${esc(note)}</p>` : ''}
      <div class="answer-big">${esc(q.answer)}</div>${revealHTML(q)}
      <button class="text-btn" data-a="flip">判定を${ok ? '「不正解」' : '「正解」'}に変更</button></div>`;
    showNext();
  }

  function showSelfJudge(note) {
    const q = cur.q;
    cur.locked = true;
    root.querySelector('#writeActions').hidden = true;
    root.querySelector('#fb').innerHTML = `<div class="fb"><p class="explain">${esc(note || '答えと見比べて自己採点しましょう')}</p>
      <div class="answer-big">${esc(q.answer)}</div>${revealHTML(q)}
      <div class="self-btns"><button class="btn-ok" data-a="selfok">合っていた</button><button class="btn-ng" data-a="selfng">違った</button></div></div>`;
  }

  async function grade() {
    if (!strokes.length) return toast('先に漢字を書いてください');
    if (cur.q.selfJudge) return showSelfJudge();
    const btn = root.querySelector('#grade');
    btn.disabled = true;
    btn.textContent = '採点中…';
    try {
      const r = await gradeKanji(cur.exportPng(), cur.q.answer, cur.q.prompt);
      if (disposed) return;
      cur.locked = true;
      cur.pendingOk = r.correct;
      cur.score = r.score;
      cur.note = r.comment;
      root.querySelector('#writeActions').hidden = true;
      writeFeedback(r.comment, true);
      sfx(r.correct);
    } catch (e) {
      if (disposed) return;
      console.warn(e);
      showSelfJudge('AI採点を使えませんでした。答えと見比べて自己採点してください。');
    }
  }

  /* ---------- 進行 ---------- */
  function next() {
    if (!cur.done) {
      if (cur.pendingOk == null) return;
      finalize(cur.pendingOk, '（手書き）');
    }
    idx++;
    idx >= questions.length ? finish() : renderQ();
  }

  function renderQ() {
    const q = questions[idx];
    cur = { q, done: false, ok: null, pendingOk: null, locked: false };
    let body = '';
    if (q.type === 'choice') {
      body = `<div class="choices">${q.choices.map((c, i) => `<button class="choice" data-i="${i}"><span class="n">${i + 1}</span><span class="t">${esc(c)}</span></button>`).join('')}</div>`;
    } else if (q.type === 'type') {
      body = `<form class="typebox" data-a="typeform"><input id="ans" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="スペルを入力" /><div id="typeActions"><button class="primary" type="submit">確認</button><button type="button" class="text-btn" data-a="giveup">わからない</button></div></form>`;
    } else {
      body = `<div class="padbox"><canvas id="pad" width="480" height="480"></canvas></div>
        <div class="pad-tools" id="writeActions"><button id="undo" class="tool">${ICON.undo}<span>一つ戻す</span></button><button id="clear" class="tool">${ICON.trash}<span>全部消す</span></button><button id="grade" class="primary">${q.selfJudge ? '答えを見る' : '採点する'}</button></div>`;
    }
    root.innerHTML = `<div class="quiz">
      <div class="qtop"><button class="text-btn" data-a="quit">やめる</button><div class="progress"><i style="width:${(idx / questions.length) * 100}%"></i></div><span class="count">${idx + 1}/${questions.length}</span></div>
      <div class="qcard">${q.label ? `<div class="qlabel">${esc(q.label)}</div>` : ''}<div class="qprompt ${q.prompt.length > 14 ? 'long' : ''}">${esc(q.prompt)}</div>${q.sub ? `<div class="qsub">${esc(q.sub)}</div>` : ''}${q.speak ? `<button class="speak" data-a="speak" aria-label="発音">${ICON.volume}</button>` : ''}</div>
      ${body}<div id="fb"></div><button class="primary next" id="next" hidden>次へ</button></div>`;
    if (q.type === 'write') setupCanvas();
    if (q.type === 'type') root.querySelector('#ans').focus({ preventScroll: true });
    if (q.autoSpeak) speak(q.speak);
  }

  root.onclick = (e) => {
    const t = e.target.closest('[data-a],.choice,#next,#grade');
    if (!t) return;
    if (t.classList.contains('choice')) return answerChoice(Number(t.dataset.i));
    if (t.id === 'next') return next();
    if (t.id === 'grade') return grade();
    switch (t.dataset.a) {
      case 'quit':
        if (confirm('クイズをやめますか？（ここまでの記録は残ります）')) {
          dispose();
          opts.onExit?.();
        }
        break;
      case 'speak':
        speak(cur.q.speak);
        break;
      case 'giveup':
        answerType(true);
        break;
      case 'flip':
        cur.pendingOk = !cur.pendingOk;
        writeFeedback(cur.note, cur.score != null);
        break;
      case 'selfok':
      case 'selfng':
        cur.pendingOk = t.dataset.a === 'selfok';
        cur.score = null;
        writeFeedback('', false);
        sfx(cur.pendingOk);
        break;
    }
  };
  root.onsubmit = (e) => {
    e.preventDefault();
    if (e.target.dataset.a === 'typeform') answerType(false);
  };

  async function finish() {
    stats.endSession();
    const total = results.length;
    const right = results.filter((r) => r.ok).length;
    const pct = total ? Math.round((right / total) * 100) : 0;
    const wrong = results.filter((r) => !r.ok);
    playFinish(pct);
    const msg = pct === 100 ? '全問正解！すばらしい！' : pct >= 80 ? 'よくできました！' : pct >= 50 ? 'あと少し。復習しよう' : 'ここから伸ばそう！';
    root.innerHTML = `<div class="result">
      <div class="score-ring" style="--p:${pct}"><div><b>${right}</b><span>/ ${total}</span></div></div>
      <h2>${msg}</h2><p class="sub">正答率 ${pct}%</p>
      ${wrong.length ? `<div class="group-title">間違えた問題</div><div class="group">${wrong.map((r) => `<div class="row wrong-row"><span class="row-main"><b>${esc(r.q.prompt.length > 40 ? r.q.prompt.slice(0, 40) + '…' : r.q.prompt)}</b><small>答え: ${esc(r.q.type === 'choice' ? r.q.choices[r.q.answer] : r.q.answer)}</small></span></div>`).join('')}</div>` : ''}
      <div class="result-actions">
        ${wrong.length ? '<button class="primary" data-a="retry">間違えた問題をやり直す</button>' : ''}
        <button class="secondary" data-a="again">もう一度</button>
        <button class="text-btn" data-a="exit">終了</button>
      </div></div>`;
    root.onclick = (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'retry') {
        dispose();
        opts.onRetry?.(wrong.map((r) => r.q));
      } else if (a === 'again') {
        dispose();
        opts.onRestart?.();
      } else if (a === 'exit') {
        dispose();
        opts.onExit?.();
      }
    };
    root.onsubmit = null;
    if (app !== 'anything') {
      try {
        const set = new Set(await getWrong(uid, app));
        results.forEach((r) => {
          if (r.q.id == null) return;
          r.ok ? set.delete(r.q.id) : set.add(r.q.id);
        });
        await setWrong(uid, app, [...set]);
      } catch (e) {
        console.warn(e);
      }
    }
  }

  renderQ();
  return dispose;
}
