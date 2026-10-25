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
  robot: svg('<rect x="5" y="8" width="14" height="11" rx="3"/><path d="M12 8V4M9 13v1M15 13v1M9.5 17h5"/><circle cx="12" cy="3.5" r="1" fill="currentColor"/>'),
  pen: svg('<path d="M4 20l1-4L16.5 4.5a2 2 0 0 1 3 3L8 19z M14.5 6.5l3 3"/>'),
  book: svg('<path d="M4 5a2 2 0 0 1 2-1h6v16H6a2 2 0 0 0-2 1zM20 5a2 2 0 0 0-2-1h-6v16h6a2 2 0 0 1 2 1z"/>'),
  note: svg('<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h3"/>'),
  shuffle: svg('<path d="M3 7h3.5c5 0 5 10 10 10H21M3 17h3.5c1.6 0 2.7-.8 3.6-2M13.9 9c.9-1.2 2-2 3.6-2H21M18.5 4.5 21 7l-2.5 2.5M18.5 14.5 21 17l-2.5 2.5"/>'),
  headphone: svg('<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="14" width="4" height="6" rx="1.5" fill="currentColor"/><rect x="17" y="14" width="4" height="6" rx="1.5" fill="currentColor"/>'),
  flame: svg('<path d="M12 3c1 4 5 6 5 11a5 5 0 0 1-10 0c0-2 1-3.500 2-4.500.2 1.500 1 2.200 1.800 2.500C10.500 9 11 6 12 3z" fill="currentColor" stroke="none"/>'),
  check: svg('<path d="M5 12.500l4.500 4.500L19 7.500" stroke-width="3"/>'),
  en: svg('<path d="M4 18 9 6l5 12M5.800 14h6.400"/><path d="M17 8h4M19 6v2c0 3-1.500 5-3.500 6M17.500 11c.5 1.500 1.700 2.700 3.500 3.500"/>'),
  ja: svg('<path d="M6 7h12M12 4v3M8 7c0 5-1 8-3 10M16 7c0 5 1 8 3 10M9.500 12h5"/>'),
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

export const tabIcon = (a) => `<span class="ti">${a.id === 'anything' ? ICON.sparkle : esc(a.tab)}</span>`;
