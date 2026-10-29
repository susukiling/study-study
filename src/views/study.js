// ターゲット / 語彙 / 字義 共通の「出題設定 → クイズ」画面
import { esc, shuffle, pick, toast, lsGet, lsSet } from '../dom.js';
import { banner, ICON } from '../ui.js';
import { runQuiz } from '../quiz.js';
import { getWrong } from '../repo.js';

const BLANK = '＿＿＿＿';
const bracket = (s) => /\[(.+?)\]/.exec(s || '');
const blanked = (s, mark = BLANK) => s.replace(/\[.+?\]/, mark);
const plain = (s) => s.replace(/[\[\]]/g, '');

/** 4択を作る。field は選択肢に使うプロパティ取得関数 */
export function choiceQ(item, pool, get, base) {
  const ans = get(item);
  const others = [...new Set(pool.filter((x) => x.id !== item.id).map(get))].filter((v) => v && v !== ans);
  if (others.length < 1) return null;
  const choices = shuffle([ans, ...pick(others, 3)]);
  return { id: item.id, type: 'choice', choices, answer: choices.indexOf(ans), ...base };
}

export { bracket, blanked, plain, BLANK };

/**
 * cfg: { app, data, modes:[{id,label,desc,icon,make(item,pool),accepts?(item)}], mix?:bool }
 * data の各要素は id（一意）を持つ。範囲指定に使う番号は no（なければ id）、ページは page（あれば「ページ」で範囲指定できる）
 * modes[].accepts があれば、その形式で出せる問題だけを数える/出す（例: 字義の「対策ゼミ」）
 */
export function createStudyView(cfg) {
  const { app, data, modes } = cfg;
  const numOf = (d) => d.no ?? d.id;
  const hasPage = data.some((d) => Number.isFinite(d.page));
  const allModes = cfg.mix
    ? [...modes, { id: 'mix', label: 'ミックス', desc: 'すべての形式をランダムに', icon: ICON.shuffle, make: (it, pool) => pick(modes, modes.length).map((m) => m.make(it, pool)).find(Boolean) || null }]
    : modes;

  return {
    mount(root, ctx) {
      const uid = ctx.user.uid;
      let dispose = null;
      const saved = lsGet('cfg:' + app, {});
      const st = {
        mode: allModes.some((m) => m.id === saved.mode) ? saved.mode : allModes[0].id,
        by: hasPage && saved.by === 'page' ? 'page' : 'no',
        from: saved.from || 0,
        to: saved.to || 0,
        count: saved.count ?? 10,
        order: saved.order || 'random',
        wrongOnly: false,
      };

      const mode = () => allModes.find((m) => m.id === st.mode);
      const pool0 = () => data.filter((d) => (mode().accepts ? mode().accepts(d) : true));
      const axis = (d) => (st.by === 'page' ? d.page : numOf(d));
      const bounds = () => {
        const v = pool0().map(axis).filter(Number.isFinite);
        return v.length ? [Math.min(...v), Math.max(...v)] : [1, 1];
      };
      const normalize = () => {
        const [lo, hi] = bounds();
        if (!st.from || st.from < lo || st.from > hi) st.from = lo;
        if (!st.to || st.to > hi || st.to < lo) st.to = hi;
        if (st.from > st.to) [st.from, st.to] = [st.to, st.from];
      };
      const resetRange = () => {
        st.from = 0;
        st.to = 0;
        normalize();
      };
      normalize();

      const save = () => lsSet('cfg:' + app, { mode: st.mode, by: st.by, from: st.from, to: st.to, count: st.count, order: st.order });
      const items = () => pool0().filter((d) => axis(d) >= st.from && axis(d) <= st.to);

      function chips() {
        const [lo, hi] = bounds();
        const span = hi - lo + 1;
        const block = st.by === 'page' ? 10 : span > 300 ? 100 : span > 60 ? 20 : 10;
        const out = [`<button class="chip ${st.from === lo && st.to === hi ? 'on' : ''}" data-from="${lo}" data-to="${hi}">全部</button>`];
        for (let s = lo; s <= hi; s += block) {
          const e = Math.min(s + block - 1, hi);
          out.push(`<button class="chip ${st.from === s && st.to === e ? 'on' : ''}" data-from="${s}" data-to="${e}">${s}–${e}</button>`);
        }
        return out.join('');
      }

      function showSetup() {
        root.onclick = onClick;
        root.onchange = onChange;
        normalize();
        const [lo, hi] = bounds();
        const unit = st.by === 'page' ? 'ページ' : '番号';
        root.innerHTML = `<div class="page">
          <div class="banner-wrap">${banner(app)}</div>
          <div class="group-title">出題形式</div>
          <div class="group">${allModes
            .map((m) => `<button class="row ${m.id === st.mode ? 'sel' : ''}" data-mode="${m.id}"><span class="row-icon">${m.icon}</span><span class="row-main"><b>${esc(m.label)}</b><small>${esc(m.desc)}</small></span><span class="check">✓</span></button>`)
            .join('')}</div>
          <div class="group-title range-title"><span>出題範囲</span>${
            hasPage ? `<div class="seg sm" id="segBy"><button data-by="no" class="${st.by === 'no' ? 'on' : ''}">番号</button><button data-by="page" class="${st.by === 'page' ? 'on' : ''}">ページ</button></div>` : '<span class="unit">（番号）</span>'
          }</div>
          <div class="group">
            <label class="row field"><span>はじめ（${unit}）</span><input type="number" inputmode="numeric" id="from" min="${lo}" max="${hi}" value="${st.from}" /></label>
            <label class="row field"><span>おわり（${unit}）</span><input type="number" inputmode="numeric" id="to" min="${lo}" max="${hi}" value="${st.to}" /></label>
          </div>
          <div class="chips" id="chips">${chips()}</div>
          <div class="group-title">オプション</div>
          <div class="group">
            <label class="row field"><span>問題数</span><select id="count">${[5, 10, 20, 30, 50, 0].map((n) => `<option value="${n}" ${n === st.count ? 'selected' : ''}>${n ? n + '問' : '範囲内すべて'}</option>`).join('')}</select></label>
            <label class="row field"><span>出題順</span><select id="order"><option value="random" ${st.order === 'random' ? 'selected' : ''}>ランダム</option><option value="seq" ${st.order === 'seq' ? 'selected' : ''}>順番どおり</option></select></label>
            <label class="row field"><span>間違えた問題だけ<small id="wrongInfo"></small></span><span class="switch"><input type="checkbox" id="wrongOnly" ${st.wrongOnly ? 'checked' : ''} /><i></i></span></label>
          </div>
          <p class="footnote" id="rangeInfo"></p>
          <button class="primary big" id="start">スタート</button>
        </div>`;
        updateInfo();
        getWrong(uid, app).then((ids) => {
          const el = root.querySelector('#wrongInfo');
          if (el) el.textContent = `現在 ${ids.length} 問`;
        });
      }

      function updateInfo() {
        const el = root.querySelector('#rangeInfo');
        if (el) el.textContent = `この範囲: ${items().length} 問（この形式の全 ${pool0().length} 問）`;
        const c = root.querySelector('#chips');
        if (c) c.innerHTML = chips();
      }

      async function buildQuestions() {
        let pool = items();
        if (st.wrongOnly) {
          const ids = new Set(await getWrong(uid, app));
          pool = pool.filter((d) => ids.has(d.id));
        }
        pool = st.order === 'random' ? shuffle(pool) : [...pool].sort((a, b) => (a.page ?? 0) - (b.page ?? 0) || numOf(a) - numOf(b));
        const m = mode();
        const all = pool0();
        const qs = [];
        for (const item of pool) {
          const q = m.make(item, all);
          if (q) qs.push(q);
          if (st.count && qs.length >= st.count) break;
        }
        return qs;
      }

      async function start() {
        const qs = await buildQuestions();
        if (!qs.length) return toast(st.wrongOnly ? '間違えた問題がありません' : 'この範囲・形式で出せる問題がありません');
        launch(qs);
      }

      function launch(qs) {
        dispose?.();
        dispose = runQuiz(root, {
          app,
          uid,
          questions: qs,
          onExit: () => {
            dispose = null;
            showSetup();
          },
          onRestart: () => start(),
          onRetry: (wrongQs) => launch(wrongQs),
        });
      }

      const onClick = (e) => {
        const t = e.target.closest('[data-mode],[data-from],[data-by],#start');
        if (!t || !root.querySelector('.page')) return;
        if (t.dataset.mode) {
          const [lo0, hi0] = bounds();
          st.mode = t.dataset.mode;
          const [lo, hi] = bounds();
          if (lo !== lo0 || hi !== hi0) resetRange();
          save();
          showSetup();
        } else if (t.dataset.by) {
          if (st.by === t.dataset.by) return;
          st.by = t.dataset.by;
          resetRange();
          save();
          showSetup();
        } else if (t.dataset.from) {
          st.from = Number(t.dataset.from);
          st.to = Number(t.dataset.to);
          root.querySelector('#from').value = st.from;
          root.querySelector('#to').value = st.to;
          updateInfo();
        } else if (t.id === 'start') {
          save();
          start();
        }
      };
      const onChange = (e) => {
        if (!root.querySelector('.page')) return;
        const id = e.target.id;
        if (id === 'from' || id === 'to') {
          const [lo, hi] = bounds();
          const clamp = (v) => Math.min(hi, Math.max(lo, Number(v) || lo));
          st.from = clamp(root.querySelector('#from').value);
          st.to = clamp(root.querySelector('#to').value);
          if (st.from > st.to) [st.from, st.to] = [st.to, st.from];
          root.querySelector('#from').value = st.from;
          root.querySelector('#to').value = st.to;
          updateInfo();
        } else if (id === 'count') st.count = Number(e.target.value);
        else if (id === 'order') st.order = e.target.value;
        else if (id === 'wrongOnly') st.wrongOnly = e.target.checked;
      };

      showSetup();
      return () => {
        dispose?.();
        root.onclick = null;
        root.onchange = null;
      };
    },
  };
}
