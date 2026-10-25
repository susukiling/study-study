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
 * cfg: { app, data, modes:[{id,label,desc,icon,make(item,pool)}], mix?:bool }
 * data の各要素は id（番号）を持つこと
 */
export function createStudyView(cfg) {
  const { app, data, modes } = cfg;
  const maxId = Math.max(...data.map((d) => d.id));
  const block = maxId > 300 ? 100 : maxId > 60 ? 20 : 10;
  const allModes = cfg.mix
    ? [...modes, { id: 'mix', label: 'ミックス', desc: 'すべての形式をランダムに', icon: ICON.shuffle, make: (it, pool) => pick(modes, modes.length).map((m) => m.make(it, pool)).find(Boolean) || null }]
    : modes;

  return {
    mount(root, ctx) {
      const uid = ctx.user.uid;
      let dispose = null;
      let wrongCount = 0;
      const saved = lsGet('cfg:' + app, {});
      const st = {
        mode: allModes.some((m) => m.id === saved.mode) ? saved.mode : allModes[0].id,
        from: Math.min(Math.max(1, saved.from || 1), maxId),
        to: Math.min(Math.max(1, saved.to || maxId), maxId),
        count: saved.count ?? 10,
        order: saved.order || 'random',
        wrongOnly: false,
      };

      const save = () => lsSet('cfg:' + app, { mode: st.mode, from: st.from, to: st.to, count: st.count, order: st.order });

      function chips() {
        const out = [`<button class="chip ${st.from === 1 && st.to === maxId ? 'on' : ''}" data-from="1" data-to="${maxId}">全部</button>`];
        for (let s = 1; s <= maxId; s += block) {
          const e = Math.min(s + block - 1, maxId);
          out.push(`<button class="chip ${st.from === s && st.to === e ? 'on' : ''}" data-from="${s}" data-to="${e}">${s}–${e}</button>`);
        }
        return out.join('');
      }

      function inRange() {
        return data.filter((d) => d.id >= st.from && d.id <= st.to).length;
      }

      function showSetup() {
        root.onclick = onClick;
        root.onchange = onChange;
        root.innerHTML = `<div class="page">
          <div class="banner-wrap">${banner(app)}</div>
          <div class="group-title">出題形式</div>
          <div class="group">${allModes
            .map((m) => `<button class="row ${m.id === st.mode ? 'sel' : ''}" data-mode="${m.id}"><span class="row-icon">${m.icon}</span><span class="row-main"><b>${esc(m.label)}</b><small>${esc(m.desc)}</small></span><span class="check">✓</span></button>`)
            .join('')}</div>
          <div class="group-title">出題範囲（番号）</div>
          <div class="group">
            <label class="row field"><span>はじめ</span><input type="number" inputmode="numeric" id="from" min="1" max="${maxId}" value="${st.from}" /></label>
            <label class="row field"><span>おわり</span><input type="number" inputmode="numeric" id="to" min="1" max="${maxId}" value="${st.to}" /></label>
          </div>
          <div class="chips" id="chips">${chips()}</div>
          <div class="group-title">オプション</div>
          <div class="group">
            <label class="row field"><span>問題数</span><select id="count">${[5, 10, 20, 30, 50, 0].map((n) => `<option value="${n}" ${n === st.count ? 'selected' : ''}>${n ? n + '問' : '範囲内すべて'}</option>`).join('')}</select></label>
            <label class="row field"><span>出題順</span><select id="order"><option value="random" ${st.order === 'random' ? 'selected' : ''}>ランダム</option><option value="seq" ${st.order === 'seq' ? 'selected' : ''}>番号順</option></select></label>
            <label class="row field"><span>間違えた問題だけ<small id="wrongInfo"></small></span><span class="switch"><input type="checkbox" id="wrongOnly" ${st.wrongOnly ? 'checked' : ''} /><i></i></span></label>
          </div>
          <p class="footnote" id="rangeInfo"></p>
          <button class="primary big" id="start">スタート</button>
        </div>`;
        updateInfo();
        getWrong(uid, app).then((ids) => {
          wrongCount = ids.length;
          const el = root.querySelector('#wrongInfo');
          if (el) el.textContent = `現在 ${ids.length} 問`;
        });
      }

      function updateInfo() {
        const el = root.querySelector('#rangeInfo');
        if (el) el.textContent = `この範囲: ${inRange()} 問（全 ${data.length} 問）`;
        root.querySelector('#chips').innerHTML = chips();
      }

      async function buildQuestions() {
        let pool = data.filter((d) => d.id >= st.from && d.id <= st.to);
        if (st.wrongOnly) {
          const ids = new Set(await getWrong(uid, app));
          pool = pool.filter((d) => ids.has(d.id));
        }
        pool = st.order === 'random' ? shuffle(pool) : [...pool].sort((a, b) => a.id - b.id);
        const mode = allModes.find((m) => m.id === st.mode);
        const qs = [];
        for (const item of pool) {
          const q = mode.make(item, data);
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
        const t = e.target.closest('[data-mode],[data-from],#start');
        if (!t || !root.querySelector('.page')) return;
        if (t.dataset.mode) {
          st.mode = t.dataset.mode;
          root.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('sel', b.dataset.mode === st.mode));
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
          const clamp = (v) => Math.min(maxId, Math.max(1, Number(v) || 1));
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
