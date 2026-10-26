import { hasFirebase, getModel } from './firebase.js';

function parse(text) {
  const t = String(text)
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim();
  return JSON.parse(t);
}

/** 手書き漢字のAI採点。canvas の PNG(dataURL) を Gemini に渡す */
export async function gradeKanji(dataUrl, kanji, meaning) {
  const model = getModel();
  if (!model) throw new Error('Firebase未設定（デモモード）');
  const prompt = `あなたは漢字テストの採点者です。添付画像は生徒が手書きした1文字です。
正解は「${kanji}」（字義: ${meaning}）です。
画像の文字が「${kanji}」として読めるか、字形・部首・画数に誤りがないかを判定してください。
多少のバランスの崩れや線のはみ出しは許容し、別の字に見える・パーツが足りない/多い場合は不正解にしてください。
次のJSONだけを返してください:
{"correct": true または false, "score": 0〜100の整数, "comment": "日本語で40文字以内の具体的なコメント"}`;
  const res = await model.generateContent([prompt, { inlineData: { mimeType: 'image/png', data: dataUrl.split(',')[1] } }]);
  const j = parse(res.response.text());
  return { correct: !!j.correct, score: Number(j.score) || 0, comment: String(j.comment || '') };
}

function build(prompt, files = []) {
  const parts = [];
  let extra = '';
  for (const f of files) {
    if (f.kind === 'inline') parts.push({ inlineData: { mimeType: f.mimeType, data: f.data } });
    else extra += `\n\n--- 添付: ${f.name} ---\n${f.text.slice(0, 40000)}`;
  }
  return [prompt + extra, ...parts];
}
async function askJSON(prompt, files) {
  const model = getModel();
  const res = await model.generateContent(build(prompt, files));
  return parse(res.response.text());
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** なんでも単語帳: 入力・添付ファイルから4択問題のデッキを作る */
export async function generateDeck({ topic, note, count, files = [] }) {
  if (!getModel()) {
    // デモモード用のダミー
    await new Promise((r) => setTimeout(r, 800));
    return {
      title: (topic.split('\n')[0] || files[0]?.name || 'サンプル').slice(0, 20) + '（デモ）',
      items: Array.from({ length: Math.min(count, 3) }, (_, i) => ({
        q: `デモ問題${i + 1}: 「${(topic || files[0]?.name || '').slice(0, 10)}」に関する問題です`,
        choices: ['選択肢A', '選択肢B', '選択肢C', '選択肢D'],
        answer: i % 4,
        explain: 'Firebaseを設定すると、Geminiが本物の問題を作ります。',
      })),
    };
  }
  const prompt = `学習用の4択問題を${count}問作ってください。

# 素材・テーマ
${topic || '（添付ファイルの内容を素材にする）'}
添付ファイル（PDF・画像・テキスト）がある場合は、その内容から重要事項を拾って出題する。

# 追加の指示
${note || '特になし（素材に合わせて、覚えるべき重要事項を問う問題にする）'}

# ルール
- 日本語で出題する（英単語など学習対象は原語のまま可）
- 各問題の選択肢はちょうど4つ、正解は1つ。紛らわしいが明確に誤りの選択肢を作る
- answer は正解の選択肢の番号（0〜3）
- explain は1〜2文で簡潔に
- title は単語帳の題名（20文字以内）

次のJSONだけを返してください:
{"title": "...", "items": [{"q": "...", "choices": ["...","...","...","..."], "answer": 0, "explain": "..."}]}`;
  const j = await askJSON(prompt, files);
  const items = (j.items || [])
    .filter((it) => it && it.q && Array.isArray(it.choices) && it.choices.length === 4 && Number.isInteger(it.answer) && it.answer >= 0 && it.answer < 4)
    .map((it) => ({ q: String(it.q), choices: it.choices.map(String), answer: it.answer, explain: String(it.explain || '') }));
  if (!items.length) throw new Error('問題をうまく作れませんでした。もう一度お試しください');
  return { title: String(j.title || (topic || files[0]?.name || '単語帳').slice(0, 20)), items };
}

/* ================= 考査ノート ================= */

/** 範囲表（写真・PDF・テキスト）から、教科ごとの試験範囲を読み取る */
export async function extractRange({ text, files }) {
  if (!getModel()) {
    await wait(700);
    return { title: '', date: '', subjects: [{ name: '国語', range: 'デモ: 教科書 p.10〜45' }, { name: '数学', range: 'デモ: 第2章 p.30〜62' }, { name: '英語', range: 'デモ: Lesson 3〜5' }] };
  }
  const j = await askJSON(`添付の画像・PDF・テキストは、学校の考査または模試の「試験範囲表」です。教科ごとの試験範囲を読み取ってください。
${text ? '補足テキスト:\n' + text : ''}
ルール:
- 範囲はページ・単元・章など、書かれている通りに短くまとめる
- 日付が書かれていれば date に YYYY-MM-DD（年が無ければ今年）。無ければ空文字
- 試験名が分かれば title に。無ければ空文字
次のJSONだけを返してください:
{"title": "", "date": "", "subjects": [{"name": "教科名", "range": "範囲"}]}`, files);
  return {
    title: String(j.title || ''),
    date: /^\d{4}-\d{2}-\d{2}$/.test(j.date || '') ? j.date : '',
    subjects: (j.subjects || []).filter((s) => s && s.name).map((s) => ({ name: String(s.name), range: String(s.range || '') })),
  };
}

const ADVICE = '{"headline": "全体の見立てを1文で", "points": ["気づいた点（3〜5個、具体的に）"], "next": ["次にやること（3個以内、すぐ実行できる形で）"]}';

/** 点数の推移をGeminiが分析する */
export async function analyzeScores(summary) {
  if (!getModel()) {
    await wait(700);
    return { headline: 'デモ: Firebaseを設定すると、Geminiが点数を分析します。', points: ['教科ごとの得点率の変化を見ます', '平均点との差も見ます'], next: ['苦手な教科から復習する'] };
  }
  return askJSON(`あなたは中高生の学習コーチです。次の考査・模試の成績から、傾向を分析して提案してください。
励ましつつ、数字に基づいて具体的に。得点率(%)の上下、平均点との差、伸びた教科・落ちた教科に触れる。

# 成績
${summary}

次のJSONだけを返してください:
${ADVICE}`);
}

/** 振り返り（よかった点・反省点）から次の対策を提案する */
export async function analyzeReflection({ exam, good, bad, next, files }) {
  if (!getModel()) {
    await wait(700);
    return { headline: 'デモ: Firebaseを設定すると、Geminiが振り返りを分析します。', points: ['反省点を教科ごとに整理します'], next: ['間違えた問題をやり直す'] };
  }
  return askJSON(`あなたは中高生の学習コーチです。次の考査・模試の振り返りを読み、失点の原因を整理して、次回に向けた具体的な対策を提案してください。
添付（答案や問題の写真など）があれば、間違いの傾向も読み取ってください。

# 試験
${exam}

# 本人の振り返り
よかった点: ${good || '（未記入）'}
反省点・間違えた原因: ${bad || '（未記入）'}
次にやること: ${next || '（未記入）'}

次のJSONだけを返してください:
${ADVICE}`, files);
}

/** 課題と試験日から、日ごとの勉強計画を作る */
export async function makePlan({ tasks, exams, today, weekdayMin, holidayMin }) {
  if (!getModel()) {
    await wait(700);
    const days = {};
    const start = new Date(today + 'T00:00');
    for (const t of tasks) {
      const end = new Date(t.due + 'T00:00');
      const n = Math.max(1, Math.round((end - start) / 864e5));
      const per = Math.max(10, Math.round((t.minutes || 60) / n / 5) * 5);
      for (let i = 0; i < n; i++) {
        const d = ymd(new Date(start.getTime() + i * 864e5));
        (days[d] ||= []).push({ title: t.title, minutes: per, kind: 'task' });
      }
    }
    return { days: Object.keys(days).sort().map((date) => ({ date, items: days[date] })), tips: 'デモ: 期限までの日数で均等に割った計画です。Firebaseを設定すると、Geminiが試験範囲や休日も考えて作ります。' };
  }
  const j = await askJSON(`あなたは中高生の学習計画を立てるコーチです。今日は ${today} です。
未完了の課題と、これからの考査・模試をもとに、今日から最後の期限までの日ごとの勉強計画を作ってください。

# 未完了の課題
${tasks.map((t) => `- ${t.title}（${t.subject || '教科なし'}／期限 ${t.due}${t.minutes ? `／目安 ${t.minutes}分` : ''}）`).join('\n') || '（なし）'}

# これからの試験
${exams.map((e) => `- ${e.title}（${e.kind}／${e.date}）\n${e.subjects.map((s) => `   ${s.name}: ${s.range || '範囲未定'}`).join('\n')}`).join('\n') || '（なし）'}

# 条件
- 1日に使える時間: 平日 ${weekdayMin}分、土日祝 ${holidayMin}分 を超えない
- 課題は期限の前日までに終える。試験は直前に詰め込まず、範囲を分けて前から進める
- 試験前日と当日朝は復習中心。余裕のある日は少なめにして休む日も作る
- 計画は最大28日分まで。items は1日3〜5個以内、minutes は5分単位
- kind は課題なら "task"、試験勉強なら "exam"

次のJSONだけを返してください:
{"days": [{"date": "YYYY-MM-DD", "items": [{"title": "やること", "minutes": 30, "kind": "task"}]}], "tips": "計画のポイントを2文以内で"}`);
  const days = (j.days || [])
    .filter((d) => d && /^\d{4}-\d{2}-\d{2}$/.test(d.date) && Array.isArray(d.items))
    .map((d) => ({ date: d.date, items: d.items.map((it) => ({ title: String(it.title), minutes: Number(it.minutes) || 0, kind: it.kind === 'exam' ? 'exam' : 'task' })) }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  if (!days.length) throw new Error('計画をうまく作れませんでした。もう一度お試しください');
  return { days, tips: String(j.tips || '') };
}

export const aiAvailable = hasFirebase;
