import { loginEmail, signupEmail, loginGoogle, resetPassword } from '../auth.js';
import { hasFirebase } from '../firebase.js';
import { APP_NAME } from '../apps.js';
import { esc } from '../dom.js';

const BASE = import.meta.env.BASE_URL || './';
const G = `<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.800 2.400 30.300 0 24 0 14.600 0 6.500 5.400 2.600 13.200l7.900 6.100C12.400 13.700 17.700 9.500 24 9.500z"/><path fill="#4285F4" d="M46.500 24.500c0-1.600-.1-3.100-.4-4.500H24v9h12.700c-.6 3-2.300 5.500-4.800 7.200l7.500 5.800c4.400-4.100 7.100-10.100 7.100-17.500z"/><path fill="#FBBC05" d="M10.500 28.700c-.5-1.400-.8-3-.8-4.700s.3-3.200.8-4.700l-7.900-6.100C.9 16.400 0 20.100 0 24s.9 7.600 2.600 10.800l7.900-6.100z"/><path fill="#34A853" d="M24 48c6.500 0 11.900-2.100 15.900-5.800l-7.500-5.800c-2.100 1.400-4.800 2.300-8.400 2.300-6.300 0-11.600-4.200-13.500-9.900l-7.900 6.100C6.500 42.600 14.600 48 24 48z"/></svg>`;

export function mount(root) {
  let signup = false;
  let step = 1; // 1: メール  2: パスワード
  let email = '';
  let show = false;
  let busy = false;

  function draw(error = '', info = '') {
    root.innerHTML = `<div class="lg">
      <div class="lg-brand"><img src="${BASE}icon.svg" alt="" /><b>${esc(APP_NAME)}</b></div>
      <h1>${signup ? 'アカウント作成' : 'ログイン'}</h1>
      <p class="lg-sub">${signup ? 'すでにアカウントをお持ちですか？ <button data-a="toggle">ログイン</button>' : 'はじめての方は <button data-a="toggle">アカウントを作成</button>'}</p>
      ${hasFirebase ? '' : '<p class="notice">デモモード: Firebase未設定のため、どのメールアドレスでも入れます（記録は端末内に保存）。</p>'}
      <form id="f" novalidate>
        ${
          step === 1
            ? `<label class="lg-field"><span>メールアドレス</span><div class="lg-input"><input id="email" type="email" autocomplete="email" inputmode="email" autocapitalize="off" value="${esc(email)}" /></div></label>`
            : `<div class="lg-who"><span>${esc(email)}</span><button type="button" data-a="edit">変更</button></div>
               <label class="lg-field"><span>パスワード${signup ? '（6文字以上）' : ''}</span><div class="lg-input"><input id="pw" type="${show ? 'text' : 'password'}" autocomplete="${signup ? 'new-password' : 'current-password'}" /><button type="button" class="eye" data-a="eye">${show ? '隠す' : '表示'}</button></div></label>`
        }
        ${error ? `<p class="error">${esc(error)}</p>` : ''}${info ? `<p class="info">${esc(info)}</p>` : ''}
        <div class="lg-go"><button class="lg-btn" type="submit">${step === 1 ? '続ける' : signup ? '登録する' : 'ログイン'}</button></div>
      </form>
      <div class="lg-or"><span>または</span></div>
      <button class="lg-google" data-a="google">${G}<span>Googleで続ける</span></button>
      <div class="lg-foot">${step === 2 && !signup ? '<button class="lg-link" data-a="reset" style="text-align:left">パスワードを忘れた方</button>' : ''}</div>
    </div>`;
    root.querySelector(step === 1 ? '#email' : '#pw')?.focus();
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
    if (step === 1) {
      const v = root.querySelector('#email').value.trim();
      if (!/^\S+@\S+\.\S+$/.test(v)) return draw('メールアドレスを正しく入力してください');
      email = v;
      step = 2;
      return draw();
    }
    const pw = root.querySelector('#pw').value;
    if (!pw) return draw('パスワードを入力してください');
    run(() => (signup ? signupEmail(email, pw) : loginEmail(email, pw)));
  };
  root.onclick = (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (!a) return;
    if (a === 'google') run(loginGoogle);
    else if (a === 'toggle') {
      email = root.querySelector('#email')?.value.trim() || email;
      signup = !signup;
      draw();
    } else if (a === 'edit') {
      step = 1;
      draw();
    } else if (a === 'eye') {
      const v = root.querySelector('#pw').value;
      show = !show;
      draw();
      root.querySelector('#pw').value = v;
    } else if (a === 'reset') {
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
