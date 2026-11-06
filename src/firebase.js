import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import { getAI, getGenerativeModel, GoogleAIBackend } from 'firebase/ai';

const env = import.meta.env;
const cfg = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

/** App Check 用の reCAPTCHA v3「サイトキー」。ここに貼り付ける（サイトキーは公開されても安全なもの）。
 *  空のままなら App Check は使わない */
const RECAPTCHA_SITE_KEY = '';

/** .env が未設定ならデモモード（端末内保存・AIはダミー） */
export const hasFirebase = Boolean(cfg.apiKey && cfg.projectId);

let app = null;
export let auth = null;
export let db = null;
let ai = null;

if (hasFirebase) {
  app = initializeApp(cfg);
  const siteKey = RECAPTCHA_SITE_KEY || env.VITE_RECAPTCHA_SITE_KEY;
  if (siteKey) {
    try {
      initializeAppCheck(app, { provider: new ReCaptchaV3Provider(siteKey), isTokenAutoRefreshEnabled: true });
    } catch (err) {
      console.warn('App Check', err);
    }
  }
  auth = getAuth(app);
  db = getFirestore(app);
}

/** Firebase AI Logic（Gemini）。JSONで返すよう設定 */
export function getModel() {
  if (!hasFirebase) return null;
  ai ||= getAI(app, { backend: new GoogleAIBackend() });
  return getGenerativeModel(ai, {
    model: env.VITE_GEMINI_MODEL || 'gemini-3.8-flash',
    generationConfig: { responseMimeType: 'application/json' },
  });
}
