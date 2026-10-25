import { lsGet, lsSet } from './dom.js';

// 表示モード: auto(端末に合わせる) / light / dark
let mode = lsGet('mode', 'auto');
let sound = lsGet('sound', true);
const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

export const getMode = () => mode;
export const getSound = () => sound;

export function applyMode() {
  const dark = mode === 'dark' || (mode === 'auto' && mq && mq.matches);
  document.body.dataset.mode = dark ? 'dark' : 'light';
  syncThemeColor();
}

/** ステータスバーの色を画面の背景に合わせる */
export function syncThemeColor() {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  const bg = getComputedStyle(document.body).getPropertyValue('--bg').trim();
  if (bg) meta.setAttribute('content', bg);
}

export function setMode(m) {
  mode = m;
  lsSet('mode', m);
  applyMode();
}
export function setSound(v) {
  sound = !!v;
  lsSet('sound', sound);
}

if (mq) {
  const on = () => mode === 'auto' && applyMode();
  mq.addEventListener ? mq.addEventListener('change', on) : mq.addListener?.(on);
}
