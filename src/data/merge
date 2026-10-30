// data/jigi/ フォルダの中の複数ファイルを、ファイル名順に1つにまとめる
//  各ファイルは  export const JIGI = [ ... ];  と／または  export const ZEMI = [ ... ];  を持つ
export function mergeParts(modules, fallback) {
  const keys = Object.keys(modules).sort((a, b) => a.localeCompare(b, 'ja', { numeric: true }));
  const jigi = [];
  const zemi = [];
  for (const k of keys) {
    const m = modules[k];
    if (Array.isArray(m.JIGI)) jigi.push(...m.JIGI);
    if (Array.isArray(m.ZEMI)) zemi.push(...m.ZEMI);
  }
  // フォルダが空のときは、ダミー（data/jigi.js）を使う
  if (!jigi.length && !zemi.length) return { JIGI: fallback.JIGI, ZEMI: fallback.ZEMI, parts: 0 };
  // id が書かれていない行には、上から順に 1,2,3… を自動で振る
  let n = 0;
  const withId = jigi.map((d) => ({ ...d, id: Number.isFinite(d.id) ? d.id : ++n }));
  return { JIGI: withId, ZEMI: zemi, parts: keys.length };
}
