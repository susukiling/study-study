import { loginEmail, signupEmail, loginGoogle, resetPassword } from '../auth.js';
import { hasFirebase } from '../firebase.js';
import { APP_NAME, APPS } from '../apps.js';
import { esc } from '../dom.js';

export function mount(root) {
  let signup = false;
  let busy = false;

  function draw(error = '', info = '') {
    root.innerHTML = `<div class="login">
      <div class="logo">${APPS.map((a) => `<i style="background:${a.color}">${esc(a.tab)}</i>`).join('')}</div>
      <h1>${esc(APP_NAME)}</h1>
      <p class="sub">${signup ? 'アカウントを作成' : 'ログインして学習をはじめよう'}</p>
      ${hasFirebase ? '' : '<p class="notice">デモモード: Firebase未設定のため、どのメールアドレスでも入れます（記録は端末内に保存）。</p>'}
      <form id="f" class="login-form">
        <div class="group">
          <label class="row field"><input id="email" type="email" autocomplete="email" placeholder="メールアドレス" required></label>
          <label class="row field"><input id="pw" type="password" autocomplete="${signup ? 'new-password' : 'current-password'}" placeholder="パスワード（6文字以上）" required></label>
        </div>
        ${error ? `<p class="error">${esc(error)}</p>` : ''}${info ? `<p class="info">${esc(info)}</p>` : ''}
        <button class="primary big" type="submit">${signup ? '新規登録' : 'ログイン'}</button>
      </form>
      <div class="or"><span>または</span></div>
      <button class="google" data-a="google"><b>G</b>Googleでログイン</button>
      <div class="login-links">
        <button class="text-btn" data-a="toggle">${signup ? 'アカウントをお持ちの方はログイン' : '新規登録はこちら'}</button>
        ${signup ? '' : '<button class="text-btn" data-a="reset">パスワードを忘れた方</button>'}
      </div></div>`;
  }

  async function run(fn) {
    if (busy) return;
    busy = true;
    try {
      await fn();
    } catch (e) {
      draw(e.message);
    } finally {
      busy = false;
    }
  }

  root.onsubmit = (e) => {
    e.preventDefault();
    const email = root.querySelector('#email').value.trim();
    const pw = root.querySelector('#pw').value;
    run(() => (signup ? signupEmail(email, pw) : loginEmail(email, pw)));
  };
  root.onclick = (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'google') run(loginGoogle);
    else if (a === 'toggle') {
      signup = !signup;
      draw();
    } else if (a === 'reset') {
      const email = root.querySelector('#email').value.trim();
      run(async () => {
        await resetPassword(email);
        draw('', '再設定用のメールを送信しました');
      });
    }
  };

  draw();
  return () => {
    root.onsubmit = null;
    root.onclick = null;
  };
}
