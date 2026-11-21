# CLAUDE.md

このリポジトリで作業するときの前提です.

## プロジェクト

野球チームの育成・監督シミュレーション「ダイヤモンド監督」.TypeScript + Vite,フレームワークなし.

## コマンド

- `npm test`: テスト(変更後は必ず実行する)
- `npm run typecheck`: 型チェック
- `npm run balance`: バランス確認.試合エンジンや成長の数値を変えたら実行し,変更前後の結果を比べる
- `npm run pace`: ペースの物差し.上手なプレイヤーのボットで,各リーグへの到達と最上位の優勝までのシーズン数を測る(`npm run pace -- 6 40` で 6 回,40 シーズンまで).ゲームの仕組みや数値を変えたら,変更前後で比べる
- `npm run dev`: 開発サーバー
- `npm run test:rules`,`npm run e2e:sync`: 端末間の同期のテスト(Firebase のエミュレーター.Java が必要).`src/sync` や `firestore.rules` を変えたら実行する

## 設計のルール

- `src/engine`,`src/growth`,`src/league`,`src/sync` は DOM に触れない.画面のコードは `src/ui` に置く.
- 乱数は `src/util/random.ts` の `rand` などを使う.`Math.random` を直接呼ばない.
- セーブデータの形(`Career` 型)を変えたら `SAVE_VERSION` を上げ,`src/save.ts` に古いデータの変換を書く.
- 新しいロジックにはテストを付ける.

## 文章のルール

- UI の日本語の句読点は「,」「.」を使う(「、」「。」は使わない).
