import { GOI } from '../data/goi.js';
import { createStudyView, choiceQ, bracket, blanked, plain } from './study.js';
import { shuffle, pick } from '../dom.js';

const modes = [
  {
    id: 'meaning',
    label: '意味を選ぶ',
    desc: '語を見て、正しい意味を4つから選ぶ',
    icon: '📖',
    make: (it, pool) =>
      choiceQ(it, pool, (x) => x.meaning, { label: '意味を選ぶ', prompt: it.word, reveal: `${it.word}：${it.meaning}` }),
  },
  {
    id: 'cloze',
    label: '例文の穴埋め（4択）',
    desc: '例文の空所に入る語を4つから選ぶ',
    icon: '📝',
    make: (it, pool) => {
      const m = bracket(it.ex);
      if (!m) return null;
      const others = [...new Set(pool.filter((x) => x.id !== it.id).map((x) => x.word))].filter((v) => v !== it.word);
      if (!others.length) return null;
      const choices = shuffle([it.word, ...pick(others, 3)]);
      return {
        id: it.id,
        type: 'choice',
        label: '例文の穴埋め',
        prompt: blanked(it.ex),
        choices,
        answer: choices.indexOf(it.word),
        reveal: `${plain(it.ex)}\n${it.word}：${it.meaning}`,
      };
    },
  },
];

export const { mount } = createStudyView({ app: 'goi', data: GOI, modes, mix: true });
