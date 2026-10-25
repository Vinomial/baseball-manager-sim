import { DIFFS, LEAGUES } from '../../data/constants';
import { userTeam } from '../../league/season';
import type { Career } from '../../types';
import { esc } from '../../util/format';

/** 新しいチームを作る画面.canCancel のときは,タイトルに戻れる. */
export function renderStart(canCancel = false): string {
  return `<div class="start">
  <header class="board px"><div class="board-top"><span class="title">ダイヤモンド監督</span><span class="lg">新しいチーム</span></div>
  <div class="team">草野球リーグから,プロリーグを目指そう.</div></header>
  <div class="card">
    <p>GM(ゼネラルマネージャー)として,毎週の練習メニューを決め,監督やコーチを雇って選手を育てます.試合は自動で進みます.リーグの上位に入ると昇格です(下のリーグほど狭き門です).目指すは世界最高峰のメジャーリーグ!</p>
    <label for="tname"><b>チーム名</b></label>
    <input id="tname" maxlength="14" value="マイチーム">
    <p style="margin:0 0 4px"><b>難易度</b> <span class="small muted">あとからメニューで変えられます</span></p>
    <div class="diffs">${(Object.keys(DIFFS) as (keyof typeof DIFFS)[]).map((k) => `<label class="diffopt"><input type="radio" name="diff" value="${k}" ${k === 'normal' ? 'checked' : ''}><span><b>${DIFFS[k].name}</b><br><span class="small muted">${DIFFS[k].desc}</span></span></label>`).join('')}</div>
    <div class="row"><button class="btn" data-a="new">このチームで始める</button>${canCancel ? '<button class="btn ghost" data-a="screen" data-k="title">タイトルに戻る</button>' : ''}</div>
    ${canCancel ? '<p class="small" style="color:var(--bad);margin:8px 0 0">いまのセーブは,新しく始めると上書きされます(先にバックアップを取れます).</p>' : ''}
  </div></div>`;
}

/** タイトル画面.セーブがあれば,続きから始められる. */
export function renderTitle(c: Career | null): string {
  let h = `<div class="start"><header class="board px"><div class="board-top"><span class="title">ダイヤモンド監督</span><span class="lg">タイトル</span></div>
  <div class="team">草野球から,プロの頂点へ.</div></header>`;
  if (c) {
    const u = userTeam(c);
    const rec = c.phase === 'season' ? c.leagues[c.level].stand[c.userId] : c.off!.rec;
    h += `<div class="card"><p style="margin:0 0 4px"><b>${esc(u.name)}</b> <span class="small muted">${LEAGUES[c.level].name}</span></p>
    <p class="small muted" style="margin:0 0 10px">第${c.season}シーズン ${c.phase === 'season' ? `${c.week}/${c.leagues[c.level].schedule.length}試合` : 'オフシーズン'} / ${rec.w}勝${rec.l}敗${rec.d}分 / 信頼度 ${Math.round(c.trust)}</p>
    <button class="btn" data-a="screen" data-k="play" style="width:100%">▶ つづきから</button></div>`;
  }
  h += `<div class="card"><div class="row"><button class="btn ghost" data-a="screen" data-k="new">${c ? '新しく始める' : 'はじめる'}</button>
  <label class="btn ghost filebtn">バックアップを読み込む<input id="imp" type="file" accept="application/json,.json" hidden></label></div></div></div>`;
  return h;
}
