import { ICON } from '../ui.js';
import { JIGI } from '../data/jigi.js';
import { createStudyView } from './study.js';

const make = (selfJudge) => (it) => ({
  id: it.id,
  type: 'write',
  label: '字義から漢字を書く',
  prompt: it.meaning,
  sub: `用例: ${it.ex.replace(/\[.+?\]/, '□')}　　音訓: ${it.yomi}`,
  answer: it.kanji,
  selfJudge,
  reveal: `${it.ex.replace(/[\[\]]/g, '')}\n音訓: ${it.yomi}`,
});

const modes = [
  { id: 'write', label: '手書き＋AI採点', desc: '字義を見て漢字を書くと、AIが採点', icon: ICON.robot, make: make(false) },
  { id: 'self', label: '手書き＋自己採点', desc: '書いたあと、答えを見て自分で○×', icon: ICON.pen, make: make(true) },
];

export const { mount } = createStudyView({ app: 'jigi', data: JIGI, modes });
