import './styles.css';
import './themes.css';
import { initAuth, getUser, onUser, logout } from './auth.js';
import { APPS, APP_NAME } from './apps.js';
import { ICON, tabIcon } from './ui.js';
import { esc } from './dom.js';
import { setStatsUser, flush } from './stats.js';
import * as home from './views/home.js';
import * as login from './views/login.js';
import * as target from './views/target.js';
import * as goi from './views/goi.js';
import * as jigi from './views/jigi.js';
import * as anything from './views/anything.js';
import * as timer from './views/timer.js';

const ROUTES = {
  home: { title: 'ホーム', view: home, bar: false },
  login: { title: 'ログイン', view: login, bar: false, nav: false },
  target: { title: 'ターゲット1200', view: target, bar: true },
  goi: { title: '語彙1560', view: goi, bar: true },
  jigi: { title: '字義で覚える常用漢字', view: jigi, bar: true },
  anything: { title: 'AIなんでも単語帳', view: anything, bar: true },
  timer: { title: 'タイマー・ストップウォッチ', view: timer, bar: true },
};

const rootEl = document.getElementById('app');
let cleanup = null;

function tabbar(active) {
  return `<nav class="tabbar" aria-label="アプリ切り替え">
    <a href="#/" class="tab theme-home"><span class="ti">${ICON.home}</span><span class="tl">ホーム</span></a>
    ${APPS.map((a) => `<a href="${a.route}" class="tab theme-${a.id} ${a.id === active ? 'active' : ''}">${tabIcon(a)}<span class="tl">${esc(a.short)}</span></a>`).join('')}
  </nav>`;
}

function drawer(user, active) {
  const initial = (user.name || user.email || '?').trim().charAt(0).toUpperCase();
  return `<div class="scrim" data-act="close"></div>
  <aside class="drawer" aria-label="メニュー">
    <div class="drawer-user"><span class="avatar">${esc(initial)}</span><div><b>${esc(user.name || '')}</b><small>${esc(user.email || '')}</small></div></div>
    <nav class="drawer-list">
      <a href="#/" class="${active === 'home' ? 'on' : ''}"><span class="dot" style="background:#007AFF"></span>ホーム</a>
      <div class="drawer-label">学習アプリ</div>
      ${APPS.map((a) => `<a href="${a.route}" class="${a.id === active ? 'on' : ''}"><span class="dot" style="background:${a.color}"></span>${esc(a.full)}</a>`).join('')}
      <div class="drawer-label">ツール</div>
      <a href="#/timer" class="${active === 'timer' ? 'on' : ''}"><span class="dot" style="background:#5E5CE6"></span>タイマー・ストップウォッチ</a>
    </nav>
    <div class="drawer-foot">
      <button data-act="switch">アカウントを切り替える</button>
      <button data-act="logout" class="danger-text">ログアウト</button>
    </div>
  </aside>`;
}

function shell(name, r, user) {
  const theme = APPS.some((a) => a.id === name) ? name : 'home';
  return `<div class="shell theme-${theme}">
    ${r.nav === false ? '' : `<header class="nav"><button class="icon-btn" data-act="menu" aria-label="メニューを開く">${ICON.menu}</button><h1>${esc(r.title)}</h1><span class="nav-right" id="navRight"></span></header>`}
    <main id="view" class="${r.bar ? 'has-bar' : ''}"></main>
    ${r.bar ? tabbar(name) : ''}
    ${r.nav === false ? '' : drawer(user, name)}
  </div>`;
}

async function render() {
  cleanup?.();
  cleanup = null;
  const user = getUser();
  let name = location.hash.replace(/^#\/?/, '').split('?')[0] || 'home';
  if (!ROUTES[name]) name = 'home';
  if (!user && name !== 'login') return void (location.hash = '#/login');
  if (user && name === 'login') return void (location.hash = '#/');

  const r = ROUTES[name];
  document.title = name === 'home' || name === 'login' ? APP_NAME : `${r.title} - ${APP_NAME}`;
  document.body.dataset.theme = name;
  rootEl.innerHTML = shell(name, r, user);

  const shellEl = rootEl.querySelector('.shell');
  shellEl.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-act],.drawer a');
    if (!t) return;
    if (t.matches('.drawer a')) return shellEl.classList.remove('open'); // 遷移はhashchangeで
    const act = t.dataset.act;
    if (act === 'menu') shellEl.classList.add('open');
    else if (act === 'close') shellEl.classList.remove('open');
    else if (act === 'logout' || act === 'switch') {
      await flush();
      await logout();
    }
  });

  const ctx = {
    user,
    route: name,
    setRight: (html) => {
      const el = document.getElementById('navRight');
      if (el) el.innerHTML = html;
    },
  };
  cleanup = r.view.mount(document.getElementById('view'), ctx);
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', render);

(async () => {
  await initAuth();
  setStatsUser(getUser()?.uid ?? null);
  onUser((u) => {
    setStatsUser(u?.uid ?? null);
    if (!u) location.hash = '#/login';
    render();
  });
  render();
})();
