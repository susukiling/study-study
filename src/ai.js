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

/** なんでも単語帳: 入力から4択問題のデッキを作る */
export async function generateDeck({ topic, note, count }) {
  const model = getModel();
  if (!model) {
    // デモモード用のダミー
    await new Promise((r) => setTimeout(r, 800));
    return {
      title: (topic.split('\n')[0] || 'サンプル').slice(0, 20) + '（デモ）',
      items: Array.from({ length: Math.min(count, 3) }, (_, i) => ({
        q: `デモ問題${i + 1}: 「${topic.slice(0, 10)}」に関する問題です`,
        choices: ['選択肢A', '選択肢B', '選択肢C', '選択肢D'],
        answer: i % 4,
        explain: 'Firebaseを設定すると、Geminiが本物の問題を作ります。',
      })),
    };
  }
  const prompt = `学習用の4択問題を${count}問作ってください。

# 素材・テーマ
${topic}

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
  const res = await model.generateContent(prompt);
  const j = parse(res.response.text());
  const items = (j.items || [])
    .filter((it) => it && it.q && Array.isArray(it.choices) && it.choices.length === 4 && Number.isInteger(it.answer) && it.answer >= 0 && it.answer < 4)
    .map((it) => ({ q: String(it.q), choices: it.choices.map(String), answer: it.answer, explain: String(it.explain || '') }));
  if (!items.length) throw new Error('問題をうまく作れませんでした。もう一度お試しください');
  return { title: String(j.title || topic.slice(0, 20)), items };
}

export const aiAvailable = hasFirebase;
