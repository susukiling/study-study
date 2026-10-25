import { TARGET } from '../data/target.js';
import { createStudyView, choiceQ, bracket, blanked, plain } from './study.js';

const reveal = (it) => `${it.en} = ${it.ja}`;

const modes = [
  {
    id: 'en2ja',
    label: '英語 → 日本語',
    desc: '英単語を見て、意味を4択から選ぶ',
    icon: '🇬🇧',
    make: (it, pool) =>
      choiceQ(it, pool, (x) => x.ja, { label: '英語 → 日本語', prompt: it.en, speak: it.en, reveal: reveal(it) }),
  },
  {
    id: 'ja2en',
    label: '日本語 → 英語',
    desc: '意味を見て、英単語を4択から選ぶ',
    icon: '🇯🇵',
    make: (it, pool) => choiceQ(it, pool, (x) => x.en, { label: '日本語 → 英語', prompt: it.ja, reveal: reveal(it) }),
  },
  {
    id: 'listen',
    label: '聞いてスペルを書く',
    desc: '英語の音声を聞いて、スペルを入力',
    icon: '🎧',
    make: (it) => ({
      id: it.id,
      type: 'type',
      label: '音声 → スペル',
      prompt: '音声を聞いて入力',
      speak: it.en,
      autoSpeak: true,
      answer: it.en,
      reveal: reveal(it),
    }),
  },
  {
    id: 'ja2spell',
    label: '日本語からスペルを書く',
    desc: '意味を見て、英単語のスペルを入力',
    icon: '✏️',
    make: (it) => ({ id: it.id, type: 'type', label: '日本語 → スペル', prompt: it.ja, answer: it.en, reveal: reveal(it) }),
  },
  {
    id: 'cloze',
    label: '例文の穴埋め（4択）',
    desc: 'ページの例文の空所に入る語を選ぶ',
    icon: '📝',
    make: (it, pool) => {
      const m = bracket(it.ex);
      if (!m) return null;
      const ans = m[1];
      const others = [...new Set(pool.filter((x) => x.id !== it.id && bracket(x.ex)).map((x) => bracket(x.ex)[1]))].filter((v) => v !== ans);
      if (!others.length) return null;
      const picks = others.sort(() => Math.random() - 0.5).slice(0, 3);
      const choices = [ans, ...picks].sort(() => Math.random() - 0.5);
      return {
        id: it.id,
        type: 'choice',
        label: '例文の穴埋め',
        prompt: blanked(it.ex),
        sub: it.exJa,
        choices,
        answer: choices.indexOf(ans),
        reveal: `${plain(it.ex)}\n${it.exJa || ''}\n${reveal(it)}`.trim(),
      };
    },
  },
];

export const { mount } = createStudyView({ app: 'target', data: TARGET, modes });
