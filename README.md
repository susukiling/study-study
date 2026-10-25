# スタディハブ

ターゲット1200 / 語彙1560 / 字義で覚える常用漢字 / AIなんでも単語帳 の4アプリを、
ハンバーガーメニューと下のメニューバーで切り替えられる学習アプリです。
Vite（素のJS）＋ Firebase（認証・Firestore・Gemini）で動きます。

## すぐ試す（デモモード）

```bash
npm install
npm run dev
```

`.env` がないと「デモモード」になり、ログイン・学習記録は端末内に保存、AIはダミーで動きます。

## Firebase をつなぐ

1. Firebaseコンソールでプロジェクトを作成
2. **Authentication** で「メール/パスワード」と「Google」を有効化
3. **Firestore Database** を作成し、`firestore.rules` の内容をルールに貼り付け
4. **Firebase AI Logic** を開き、Gemini Developer API を有効化（字義の採点・AIなんでも単語帳で使用）
5. プロジェクトの設定 > マイアプリ で Webアプリを追加し、表示された設定値を `.env.example` を `.env` にコピーして入力
6. Authentication > 設定 > 承認済みドメイン に公開URL（`xxx.web.app`）を追加

## GitHub から自動公開

`main` に push すると `.github/workflows/deploy.yml` が Firebase Hosting へ公開します。
GitHub の Settings > Secrets に、`.env` と同じ `VITE_*` の値と `FIREBASE_SERVICE_ACCOUNT`（サービスアカウントのJSON）を登録してください。
（`firebase init hosting:github` を実行すると、サービスアカウントの登録まで自動でやってくれます）

## 問題データの差し替え

`src/data/` の3ファイルがダミーデータです。PDF/テキストをもらったら、同じ形式に変換して差し替えます。

| ファイル | 項目 |
| --- | --- |
| `target.js` | `id` 番号 / `en` 英単語 / `ja` 意味 / `ex` 例文（穴埋め部分を `[ ]` で囲む）/ `exJa` 和訳 |
| `goi.js` | `id` / `word` 語 / `meaning` 意味 / `ex` 例文（答えを `[ ]` で囲む） |
| `jigi.js` | `id` / `kanji` 漢字 / `meaning` 字義 / `yomi` 音訓 / `ex` 用例（答えの漢字を `[ ]` で囲む） |

## 構成

- `src/main.js` 画面の切り替え・ハンバーガーメニュー・下のバー
- `src/views/` 各画面（home / login / target / goi / jigi / anything / timer）
- `src/quiz.js` 4択・スペル入力・手書きの共通クイズ画面
- `src/stats.js` 連続日数・問題数・学習時間の記録
- `src/ai.js` Gemini による手書き採点・問題作成（モデルは `VITE_GEMINI_MODEL` で変更可）
- `src/apps.js` アプリ名・色（ここを直すと全体に反映）
