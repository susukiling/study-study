import { ICON } from '../ui.js';
import * as dummy from '../data/jigi.js';
import { mergeParts } from '../data/merge.js';
import { createStudyView } from './study.js';

// 漢字（基本編）と対策ゼミを1つの配列にまとめる。ゼミの id は漢字と重ならないよう 100000 から振る
// src/data/jigi/ フォルダの中のファイルを全部読み込んで合体（ファイルがなければダミーを使う）
const { JIGI, ZEMI } = mergeParts(import.meta.glob('../data/jigi/*.js', { eager: true }), dummy);

const data = [
  ...JIGI.map((k) => ({ ...k, kind: 'kanji' })),
  ...ZEMI.map((z, i) => ({ ...z, zkind: z.kind, kind: 'zemi', no: z.no ?? i + 1, id: 100000 + (z.no ?? i + 1) })),
];
const isKanji = (d) => d.kind === 'kanji';

const make = (selfJudge) => (it) =>
  isKanji(it)
    ? {
        id: it.id,
        type: 'write',
        label: '字義から漢字を書く',
        prompt: it.meaning,
        sub: `用例: ${it.ex.replace(/\[.+?\]/, '□')}　　音訓: ${it.yomi}`,
        answer: it.kanji,
        selfJudge,
        reveal: `${it.ex.replace(/[\[\]]/g, '')}\n音訓: ${it.yomi}`,
      }
    : null;

const zemi = (zkind) => (it) =>
  it.kind === 'zemi' && it.zkind === zkind
    ? {
        id: it.id,
        type: 'type',
        label: zkind === 'write' ? '対策ゼミ: 漢字に直す' : '対策ゼミ: 読みを答える',
        prompt: it.text.replace(/\{(.+?)\}/g, '【$1】'),
        sub: it.page ? `p.${it.page}${it.note ? '　' + it.note : ''}` : it.note || '',
        placeholder: zkind === 'write' ? '漢字で入力' : 'ひらがなで入力',
        answer: it.answer,
      }
    : null;

const modes = [
  { id: 'write', label: '手書き＋AI採点', desc: '字義を見て漢字を書くと、AIが採点', icon: ICON.robot, make: make(false), accepts: isKanji },
  { id: 'self', label: '手書き＋自己採点', desc: '書いたあと、答えを見て自分で○×', icon: ICON.pen, make: make(true), accepts: isKanji },
  { id: 'zw', label: '対策ゼミ: 書き取り', desc: 'カタカナの部分を漢字に直して入力', icon: ICON.note, make: zemi('write'), accepts: (d) => d.kind === 'zemi' && d.zkind === 'write' },
  { id: 'zr', label: '対策ゼミ: 読み', desc: '漢字の読みをひらがなで入力', icon: ICON.book, make: zemi('read'), accepts: (d) => d.kind === 'zemi' && d.zkind === 'read' },
];

export const { mount } = createStudyView({ app: 'jigi', data, modes });
