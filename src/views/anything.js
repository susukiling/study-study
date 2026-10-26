import { esc, shuffle, toast } from '../dom.js';
import { banner, ICON } from '../ui.js';
import { runQuiz } from '../quiz.js';
import { listDecks, saveDeck, deleteDeck } from '../repo.js';
import { generateDeck, aiAvailable } from '../ai.js';
import { ACCEPT, readAll, fileChips } from '../files.js';

export function mount(root, ctx) {
  const uid = ctx.user.uid;
  let dispose = null;
  let decks = [];
  let draft = null;
  let alive = true;
  const form = { topic: '', note: '', count: 10 };
  let files = [];

  const bind = () => {
    root.onclick = onClick;
    root.onchange = onChange;
  };
  const dateStr = (t) => new Date(t).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });

  /* ---------- 一覧 ---------- */
  async function showList() {
    bind();
    root.innerHTML = `<div class="page"><div class="banner-wrap">${banner('anything')}</div>
      <button class="primary big" data-a="new">${ICON.plus}<span>新しい単語帳を作る</span></button>
      ${aiAvailable ? '' : '<p class="notice">デモモード: Firebase未設定のため、AIはダミーの問題を返します。</p>'}
      <div class="group-title">マイ単語帳</div><div id="decks"><p class="footnote">読み込み中…</p></div></div>`;
    try {
      decks = await listDecks(uid);
    } catch (e) {
      console.warn(e);
      decks = [];
    }
    if (!alive) return;
    const el = root.querySelector('#decks');
    if (!el) return;
    el.innerHTML = decks.length
      ? `<div class="group">${decks
          .map((d) => `<button class="row" data-deck="${esc(d.id)}"><span class="row-main"><b>${esc(d.title)}</b><small>${d.items.length}問 ・ ${dateStr(d.createdAt)}</small></span><span class="chev">${ICON.chevron}</span></button>`)
          .join('')}</div>`
      : '<p class="empty">まだ単語帳がありません。<br>「新しい単語帳を作る」から作ってみましょう。</p>';
  }

  /* ---------- 作成フォーム ---------- */
  function showForm(error = '') {
    bind();
    root.innerHTML = `<div class="page">
      <button class="text-btn back" data-a="list">‹ 戻る</button>
      <h2 class="large">新しい単語帳</h2>
      ${error ? `<p class="error">${esc(error)}</p>` : ''}
      <div class="group-title">素材・テーマ</div>
      <textarea id="topic" rows="6" placeholder="（ファイルだけでもOK）&#10;例）&#10;・英検2級の頻出単語&#10;・光合成に出てくる用語&#10;・授業のノートや単語リストをそのまま貼り付け">${esc(form.topic)}</textarea>
      <div class="group-title">ファイルを添付（PDF・写真・txt・Word・CSV）</div>
      <div class="card attach"><label class="filebtn">${ICON.plus}<span>ファイルを選ぶ／写真をとる</span><input type="file" id="files" accept="${ACCEPT}" multiple hidden></label>
        <div class="fchips" id="fchips">${fileChips(files)}</div>
        <p class="footnote">教科書のPDFやノートの写真、授業のプリントをそのまま渡せます（1つ12MBまで）</p></div>
      <div class="group-title">追加の指示（任意）</div>
      <input class="text" id="note" placeholder="例）意味を選ぶ形式で / 例文の穴埋めで / 難しめに" value="${esc(form.note)}" />
      <div class="group"><label class="row field"><span>問題数</span><select id="count">${[5, 10, 15, 20, 30].map((n) => `<option ${n === form.count ? 'selected' : ''} value="${n}">${n}問</option>`).join('')}</select></label></div>
      <button class="primary big" data-a="gen">${ICON.sparkle}<span>AIで問題を作る</span></button></div>`;
  }

  async function generate() {
    form.topic = root.querySelector('#topic').value.trim();
    form.note = root.querySelector('#note').value.trim();
    form.count = Number(root.querySelector('#count').value);
    if (!form.topic && !files.length) return toast('素材・テーマを入力するか、ファイルを添付してください');
    root.innerHTML = `<div class="page center"><div class="spinner"></div><p>AIが問題を作っています…</p></div>`;
    try {
      draft = await generateDeck({ ...form, files });
      files = [];
      if (!alive) return;
      showPreview();
    } catch (e) {
      console.warn(e);
      if (alive) showForm(e.message || '問題を作れませんでした');
    }
  }

  /* ---------- プレビュー ---------- */
  function showPreview() {
    bind();
    root.innerHTML = `<div class="page">
      <button class="text-btn back" data-a="form">‹ 作り直す</button>
      <div class="group-title">単語帳の名前</div>
      <input class="text" id="title" value="${esc(draft.title)}" />
      <div class="group-title">問題 (${draft.items.length}問)</div>
      <div class="group">${draft.items
        .map((it, i) => `<div class="row preview"><span class="row-main"><b>${i + 1}. ${esc(it.q)}</b><small>${it.choices.map((c, n) => `${n === it.answer ? '<u>' : ''}${esc(c)}${n === it.answer ? '</u>' : ''}`).join(' / ')}</small></span></div>`)
        .join('')}</div>
      <button class="primary big" data-a="save">保存する</button></div>`;
  }

  /* ---------- 単語帳の詳細・出題 ---------- */
  function showDeck(id) {
    bind();
    const d = decks.find((x) => x.id === id);
    if (!d) return showList();
    root.innerHTML = `<div class="page">
      <button class="text-btn back" data-a="list">‹ 戻る</button>
      <h2 class="large">${esc(d.title)}</h2><p class="sub">${d.items.length}問</p>
      <div class="group"><label class="row field"><span>出題順</span><select id="order"><option value="random">ランダム</option><option value="seq">作成順</option></select></label></div>
      <button class="primary big" data-a="play" data-id="${esc(id)}">スタート</button>
      <button class="danger" data-a="del" data-id="${esc(id)}">${ICON.trash}<span>この単語帳を削除</span></button></div>`;
  }

  function play(id, order) {
    const d = decks.find((x) => x.id === id);
    const items = order === 'seq' ? d.items : shuffle(d.items);
    const make = (list) =>
      list.map((it) => {
        const choices = shuffle(it.choices.map((c, i) => ({ c, ok: i === it.answer })));
        return { type: 'choice', label: d.title, prompt: it.q, choices: choices.map((x) => x.c), answer: choices.findIndex((x) => x.ok), explain: it.explain };
      });
    const launch = (qs) => {
      dispose?.();
      dispose = runQuiz(root, {
        app: 'anything',
        uid,
        questions: qs,
        onExit: () => {
          dispose = null;
          showDeck(id);
        },
        onRestart: () => play(id, order),
        onRetry: launch,
      });
    };
    launch(make(items));
  }

  const onChange = async (e) => {
    if (e.target.id !== 'files') return;
    form.topic = root.querySelector('#topic')?.value ?? form.topic;
    try {
      files = files.concat(await readAll([...e.target.files]));
    } catch (err) {
      toast(err.message);
    }
    e.target.value = '';
    const box = root.querySelector('#fchips');
    if (box) box.innerHTML = fileChips(files);
  };

  const onClick = async (e) => {
    const t = e.target.closest('[data-a],[data-deck]');
    if (!t || root.querySelector('.quiz,.result')) return;
    if (t.dataset.deck) return showDeck(t.dataset.deck);
    switch (t.dataset.a) {
      case 'new':
        showForm();
        break;
      case 'list':
        showList();
        break;
      case 'rmFile':
        files.splice(Number(t.dataset.i), 1);
        root.querySelector('#fchips').innerHTML = fileChips(files);
        break;
      case 'form':
        showForm();
        break;
      case 'gen':
        generate();
        break;
      case 'save': {
        draft.title = root.querySelector('#title').value.trim() || draft.title;
        try {
          await saveDeck(uid, draft);
          toast('保存しました');
          draft = null;
          showList();
        } catch (err) {
          console.warn(err);
          toast('保存に失敗しました');
        }
        break;
      }
      case 'play':
        play(t.dataset.id, root.querySelector('#order').value);
        break;
      case 'del':
        if (confirm('この単語帳を削除しますか？')) {
          await deleteDeck(uid, t.dataset.id);
          showList();
        }
        break;
    }
  };

  showList();
  return () => {
    alive = false;
    dispose?.();
    root.onclick = null;
    root.onchange = null;
  };
}
