# 野球速報 (自分専用・広告なし)

セ・リーグ / パ・リーグ (1軍) と MLB の試合速報を見るための iPhone 向けウェブアプリ (PWA) です。
Safari で開いて「ホーム画面に追加」すると、普通のアプリのように全画面で使えます。Mac や Apple の開発者登録は不要です。

## できること

| 画面 | 内容 |
| --- | --- |
| 試合一覧 | 前後 1 週間の日付バー、セ / パ / MLB / お気に入りで絞り込み、スコア・イニング・アウト数、勝敗投手・予告先発、試合中は自動更新 |
| トップ | チームカラーのスコアボード、責任投手 (成績つき)、本塁打、戦評、得点経過、予告先発 |
| 速報 | B・S・O、走者 (グラウンド図)、打者・投手 (今日/シーズン成績)、一球ごとの球種・球速・結果、前後の打席に移動。MLB は守備位置と配球 (ストライクゾーン図) も表示 |
| 経過 | イニングごとの打席結果。タップで一球ごとの内容を展開。新しい順 / 古い順 |
| 成績 | 打者成績 (途中出場を含む全員・各打席の結果「左安」「遊ゴ」「見三振」など) と投手成績をチーム別に |
| カレンダー | チームを選ぶと月間の日程と勝敗 (○×△・中止・開始時刻)、ホームゲームに下線、月の勝敗数。NPB 12 球団と MLB 30 球団 |
| 順位 | セ・リーグ / パ・リーグ (対戦成績つき) / 交流戦 / オープン戦、MLB の地区別とワイルドカード |
| 設定 | お気に入りチーム (一覧の先頭・カレンダーの初期チーム)、表示するリーグ、自動更新間隔 |

MLB は日本時間の日付で表示します (例: 日本時間 10/11 の朝に行われる試合は 10/11 に出ます)。日本人選手は日本語表記で強調表示します。

## データの取得元

- **NPB**: スポーツナビ (baseball.yahoo.co.jp) のページを読み取り。取得できない場合は NPB 公式 (npb.jp) を使います。
- **MLB**: MLB 公式 Stats API (statsapi.mlb.com)。

NPB には公開 API がないため、ページの HTML を解析しています。サイトの見た目が変わると一部の項目が表示されなくなることがあります (その場合は下の「表示がおかしいとき」を参照)。個人で楽しむ範囲で使ってください。

## しくみ

```
iPhone (PWA: public/) ──> /api/* (Cloudflare Pages Functions: functions/ + lib/) ──> スポーツナビ / npb.jp / MLB API
```

ブラウザから他サイトのページを直接読むことはできない (CORS) ため、無料の Cloudflare Pages Functions を中継役にしています。
中継側で HTML を解析し、NPB も MLB も同じ形の JSON に変換して返します。

## 公開手順 (無料・10 分ほど)

1. [Cloudflare](https://dash.cloudflare.com/sign-up) のアカウントを作る (無料プラン)
2. ダッシュボードで **Workers & Pages → Create → Pages → Connect to Git** を選び、この GitHub リポジトリを接続
3. ビルド設定:
   - Framework preset: `None`
   - Build command: (空欄)
   - Build output directory: `public`
   - Production branch: 公開したいブランチ
4. **Save and Deploy** → `https://<プロジェクト名>.pages.dev` が発行されます
5. iPhone の Safari でその URL を開き、共有ボタン →「ホーム画面に追加」

以後は GitHub に push するたびに自動で更新されます。

## 手元での確認

Node.js 18 以上が必要です。

```sh
npm test            # パーサーのテスト
npm run dev:mock    # ダミーデータで画面確認 → http://localhost:8788
npm run dev         # 実データで確認 (外部サイトにアクセス)
npm run cf:dev      # Cloudflare 本番と同じ環境で確認 (wrangler)
```

## 表示がおかしいとき (NPB)

デプロイ後、次の URL で取得元ページを「行」と「表」に分解した結果を確認できます。

```
https://<プロジェクト名>.pages.dev/api/npb/debug?url=https://baseball.yahoo.co.jp/npb/game/<試合ID>/top
```

解析は主に `lib/npb/common.js` にあり、CSS のクラス名ではなく「計」「打率」「1回表」「◯号」などの文字で項目を探しています。
この出力を見ながら正規表現や見出しの判定を調整してください。

## ファイル構成

```
public/            画面 (index.html, styles.css, js/ に画面ごとのモジュール、PWA 設定、アイコン)
functions/api/     API の入口 (Cloudflare Pages Functions)
  npb/schedule.js    GET /api/npb/schedule?date=YYYY-MM-DD
  npb/game.js        GET /api/npb/game?id=...
  npb/standings.js   GET /api/npb/standings          (C / P / IL=交流戦 / OP=オープン戦)
  npb/calendar.js    GET /api/npb/calendar?team=g&month=YYYY-MM
  npb/debug.js       GET /api/npb/debug?url=...
  mlb/schedule.js    GET /api/mlb/schedule?date=YYYY-MM-DD
  mlb/game.js        GET /api/mlb/game?id=<gamePk>
  mlb/standings.js   GET /api/mlb/standings          (AL / NL / WC)
  mlb/calendar.js    GET /api/mlb/calendar?team=119&month=YYYY-MM
lib/               取得・解析の本体 (html.js = 依存なしの HTML パーサー)
test/              テストとダミーデータ
dev/               ローカル確認用サーバー
```
