# ダイヤモンド監督(baseball-manager-sim)

野球チームの監督になって選手を育て,草野球リーグからプロリーグを目指すブラウザゲームです.

## 遊び方

- 毎週,練習メニューを選んでから試合をします.
- 選手は練習と試合で成長します.成長タイプ(早熟,普通,晩成)と隠れた伸びしろがあります.
- 一緒に試合に出たり,守備練習・投球練習をすると,バッテリーと二遊間の連携が深まります.
- 1シーズンは10週です.上位2チームは昇格,最下位は降格します.
- オフには加齢,引退,ドラフトがあります.

## 開発環境

Node.js 20 以上が必要です.

```bash
npm install        # 初回のみ
npm run dev        # 開発サーバー(http://localhost:5173)
npm test           # テスト
npm run typecheck  # 型チェック
npm run balance    # バランス確認(リーグ別の打撃成績,練習ごとの成長量)
npm run build      # 公開用のビルド(dist/ に出力)
```

## ディレクトリ構成

```
src/
├─ types.ts          型定義
├─ data/constants.ts リーグ,チーム名,名前リストなどの定数
├─ util/             乱数(シード対応),表示用の整形
├─ engine/game.ts    試合シミュレーション(打席,走塁,継投)
├─ growth/           選手生成,成長,加齢,練習メニュー,連携
├─ league/           チーム編成,日程,順位,シーズン進行,ドラフト
├─ save.ts           セーブとロード(localStorage)
├─ ui/               画面の描画と操作
└─ main.ts           エントリーポイント
tests/               テスト(Vitest)
scripts/balance.ts   バランス確認スクリプト
```

`engine/`,`growth/`,`league/` は DOM に依存しない純粋なロジックです.
乱数は必ず `util/random.ts` を経由させ,テストでは `setRandom(seeded(n))` で結果を固定します.

## 公開(GitHub Pages)

`main` ブランチに push すると `.github/workflows/deploy.yml` が自動でビルドして公開します.
初回だけ,GitHub のリポジトリ設定の Pages で,Source を「GitHub Actions」にしてください.
