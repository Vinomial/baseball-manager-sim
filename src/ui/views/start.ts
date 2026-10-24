export function renderStart(): string {
  return `<div class="start">
  <header class="board px"><div class="board-top"><span class="title">ダイヤモンド監督</span><span class="lg">新しいチーム</span></div>
  <div class="team">草野球リーグから,プロリーグを目指そう.</div></header>
  <div class="card">
    <p>監督として毎週の練習メニューを決め,試合で采配をとります.選手は練習と試合で成長し,一緒に出場するほど連携が深まります.リーグ上位2チームに入ると昇格です.</p>
    <label for="tname"><b>チーム名</b></label>
    <input id="tname" maxlength="14" value="マイチーム">
    <button class="btn" data-a="new">このチームで始める</button>
  </div></div>`;
}
