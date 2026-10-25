import { esc } from './dom.js';

const svg = (inner, extra = '') =>
  `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${inner}</svg>`;

export const ICON = {
  menu: svg('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  home: svg('<path d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" fill="currentColor" stroke="none"/>'),
  timer: svg('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9 2h6"/>'),
  volume: svg('<path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor"/><path d="M16.5 9a4 4 0 0 1 0 6M19 6.5a8 8 0 0 1 0 11"/>'),
  undo: svg('<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>'),
  trash: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  sparkle: svg('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" fill="currentColor" stroke="none"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" fill="currentColor" stroke="none"/>'),
  chevron: svg('<path d="M9 6l6 6-6 6"/>', 'width="16" height="16"'),
};

const leaf = (color, x, y, rot, s = 1) =>
  `<svg class="leaf" style="left:${x}%;top:${y}%;transform:rotate(${rot}deg) scale(${s})" viewBox="0 0 24 28"><path d="M12 1C20 8 20 20 12 27C4 20 4 8 12 1Z" fill="${color}"/><path d="M12 6v21" stroke="rgba(255,255,255,.45)" stroke-width="1"/></svg>`;

/** 表紙のイメージに合わせたバナー（home: 小さめ / 各アプリ: 大きめ） */
export function banner(app, small = false) {
  const cls = `banner b-${app}${small ? ' sm' : ''}`;
  switch (app) {
    case 'target':
      return `<div class="${cls}"><div class="b-text"><small>英単語ターゲット</small><strong>1200</strong></div></div>`;
    case 'goi': {
      const leaves = [
        ['#9AB84A', 4, 6, -20], ['#E0922C', 22, 52, 25], ['#B3402F', 46, 8, 10], ['#6B7F2E', 70, 58, -35],
        ['#C9A227', 88, 10, 30], ['#7A3B2E', 8, 62, 15], ['#D4572B', 60, 6, -10], ['#4F6B2A', 92, 54, 20],
      ];
      return `<div class="${cls}">${leaves.map((l) => leaf(...l)).join('')}<div class="b-band"><small>中学</small><strong>国語力を高める<br>語彙1560</strong></div></div>`;
    }
    case 'jigi':
      return `<div class="${cls}"><div class="b-text"><small>カテゴリー別</small><strong>字義で覚える<br>常用漢字</strong></div><div class="blocks"><i style="background:#E8A468"></i><i style="background:#E6C94F"></i><i style="background:#E24B52"></i><i style="background:#3B9BDB"></i><i style="background:#7A4BA6"></i><i style="background:#4FA463"></i></div></div>`;
    default:
      return `<div class="${cls}"><div class="b-text"><small>好きな内容から問題を作る</small><strong>AIなんでも<br>単語帳</strong></div><span class="spark">${ICON.sparkle}</span></div>`;
  }
}

export const tabIcon = (a) => `<span class="ti">${esc(a.tab)}</span>`;
