# CLAUDE.md

このリポジトリで作業するときの前提です.

## プロジェクト

野球チームの育成・監督シミュレーション「ダイヤモンド監督」.TypeScript + Vite,フレームワークなし.

## コマンド

- `npm test`: テスト(変更後は必ず実行する)
- `npm run typecheck`: 型チェック
- `npm run balance`: バランス確認.試合エンジンや成長の数値を変えたら実行し,変更前後の結果を比べる
- `npm run dev`: 開発サーバー

## 設計のルール

- `src/engine`,`src/growth`,`src/league` は DOM に触れない.画面のコードは `src/ui` に置く.
- 乱数は `src/util/random.ts` の `rand` などを使う.`Math.random` を直接呼ばない.
- セーブデータの形(`Career` 型)を変えたら `SAVE_VERSION` を上げ,`src/save.ts` に古いデータの変換を書く.
- 新しいロジックにはテストを付ける.

## 文章のルール

- UI の日本語の句読点は「,」「.」を使う(「、」「。」は使わない).
