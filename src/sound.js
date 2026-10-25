// 効果音（外部ファイル不要・Web Audioで生成）。アプリごとに音色を変えています。
import { getSound } from './settings.js';

let ctx = null;
function ac() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx ||= new AC();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

/** 最初のタップで音を使えるようにする（iPad/iPhone対策） */
export function unlockAudio() {
  try {
    const c = ac();
    if (!c) return;
    const o = c.createOscillator();
    const g = c.createGain();
    g.gain.value = 0.0001;
    o.connect(g).connect(c.destination);
    o.start();
    o.stop(c.currentTime + 0.01);
  } catch {
    /* 音が出せない環境 */
  }
}

function tone({ f, t = 0, d = 0.25, type = 'sine', v = 0.2, to = null, a = 0.006 }) {
  const c = ac();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  const s = c.currentTime + t;
  o.type = type;
  o.frequency.setValueAtTime(f, s);
  if (to) o.frequency.exponentialRampToValueAtTime(to, s + d);
  g.gain.setValueAtTime(0.0001, s);
  g.gain.exponentialRampToValueAtTime(v, s + a);
  g.gain.exponentialRampToValueAtTime(0.0001, s + d);
  o.connect(g).connect(c.destination);
  o.start(s);
  o.stop(s + d + 0.03);
}

const theme = () => document.body.dataset.theme || '';

/** 正解：コイン / 鈴 / 拍子木＋鈴 / きらきら */
export function playCorrect() {
  if (!getSound()) return;
  try {
    switch (theme()) {
      case 'target':
        tone({ f: 988, d: 0.09, type: 'square', v: 0.07 });
        tone({ f: 1319, t: 0.09, d: 0.32, type: 'square', v: 0.07 });
        break;
      case 'goi':
        [784, 1175].forEach((f, i) => {
          tone({ f, t: i * 0.09, d: 1.0, v: 0.16 });
          tone({ f: f * 2.01, t: i * 0.09, d: 0.55, v: 0.04 });
        });
        break;
      case 'jigi':
        tone({ f: 540, to: 300, d: 0.11, type: 'triangle', v: 0.3 });
        tone({ f: 880, t: 0.12, d: 0.8, v: 0.12 });
        tone({ f: 1320, t: 0.12, d: 0.55, v: 0.05 });
        break;
      case 'anything':
        [880, 1109, 1319, 1760].forEach((f, i) => tone({ f, t: i * 0.07, d: 0.4, v: 0.1 }));
        break;
      default:
        tone({ f: 784, d: 0.14, v: 0.18 });
        tone({ f: 1047, t: 0.12, d: 0.45, v: 0.18 });
    }
  } catch {
    /* noop */
  }
}

/** 不正解：やさしく下がる音（驚かせない） */
export function playWrong() {
  if (!getSound()) return;
  try {
    switch (theme()) {
      case 'target':
        tone({ f: 233, to: 160, d: 0.32, type: 'sawtooth', v: 0.05 });
        break;
      case 'goi':
        tone({ f: 330, to: 262, d: 0.45, v: 0.12 });
        break;
      case 'jigi':
        tone({ f: 190, to: 130, d: 0.22, type: 'triangle', v: 0.26 });
        break;
      case 'anything':
        tone({ f: 392, to: 294, d: 0.38, v: 0.12 });
        break;
      default:
        tone({ f: 260, to: 200, d: 0.3, v: 0.12 });
    }
  } catch {
    /* noop */
  }
}

/** 結果発表：正答率が高いほど華やかに */
export function playFinish(pct) {
  if (!getSound()) return;
  try {
    const notes = pct >= 100 ? [523, 659, 784, 1047, 1319] : pct >= 80 ? [523, 659, 784, 1047] : pct >= 50 ? [523, 659, 784] : [440, 392];
    notes.forEach((f, i) => tone({ f, t: i * 0.11, d: 0.5, v: 0.14, type: pct >= 80 ? 'triangle' : 'sine' }));
  } catch {
    /* noop */
  }
}
