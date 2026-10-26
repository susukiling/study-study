export const APP_NAME = 'スタディハブ';

// 色はアプリごとに固定。ボタン・タブ・グラフすべてこの色を使います。
export const APPS = [
  {
    id: 'target',
    name: 'ターゲット1200',
    short: 'ターゲット',
    full: '英単語ターゲット1200',
    tab: 'Aa',
    color: '#F09A00',
    desc: '4択・スペル・例文穴埋めで英単語を覚える',
    route: '#/target',
  },
  {
    id: 'goi',
    name: '語彙1560',
    short: '語彙',
    full: '国語力を高める語彙1560',
    tab: '語',
    color: '#8B3E8F',
    desc: '意味を選ぶ・例文の穴埋め（4択）',
    route: '#/goi',
  },
  {
    id: 'jigi',
    name: '字義で覚える常用漢字',
    short: '漢字',
    full: '字義で覚える常用漢字',
    tab: '字',
    color: '#D8503F',
    desc: '字義から漢字を手書き、AIが採点',
    route: '#/jigi',
  },
  {
    id: 'anything',
    name: 'AIなんでも単語帳',
    short: 'AI単語帳',
    full: 'AIなんでも単語帳',
    tab: 'AI',
    color: '#1B9AAA',
    desc: '好きな内容からAIが問題を作る',
    route: '#/anything',
  },
];

// 考査ノートは「問題を解くアプリ」ではないので、学習記録(APPS)とは別に持つ
export const EXAM = {
  id: 'exam',
  name: '考査ノート',
  short: '考査',
  full: '考査ノート',
  tab: '考',
  color: '#2E9E6B',
  desc: '点数・試験範囲・課題の計画・振り返り',
  route: '#/exam',
};
export const ALL_APPS = [...APPS, EXAM];

export const appById = (id) => APPS.find((a) => a.id === id);
