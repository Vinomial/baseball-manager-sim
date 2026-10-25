import { LEAGUES } from '../../data/constants';
import { recap } from '../../engine/recap';
import { MENUS } from '../../growth/training';
import { userMatch, userTeam } from '../../league/season';
import { ovr } from '../../league/team';
import type { Career } from '../../types';
import { esc } from '../../util/format';
import { weekInfo } from '../../league/calendar';
import { hurtPlayers } from '../../league/health';
import { warnings } from '../../league/warnings';
import { fold, gradeHTML } from '../components';
import { state } from '../state';
import { renderOff } from './offseason';
import { facilitiesHTML, facilitiesSummary } from './facilities';
import { kitchenHTML, kitchenSummary, missionsHTML } from './kitchen';
import { renderTraining } from './training';
import { forecastHTML, forecastSummary, trustHTML, trustSummary, winProbHTML } from './status';

export function renderHome(c: Career): string {
  if (c.phase === 'off') return renderOff(c);
  const u = userTeam(c);
  const m = userMatch(c);
  const info = weekInfo(c);
  let h = '';
  if (c.last) h += `<div class="notice">${esc(c.last)}</div>`;
  for (const n of c.news) h += `<div class="news">★ ${esc(n)}</div>`;
  if (c.event) {
    h += `<div class="card event"><p style="margin:0"><span class="rec star">出来事</span> <b>${esc(c.event.title)}</b></p><p class="small" style="margin:6px 0">${esc(c.event.body)}</p><div class="row">${c.event.choices.map((x) => `<button class="btn ghost ev" data-a="event" data-k="${x.key}"><b>${esc(x.label)}</b><span class="small muted">${esc(x.hint)}</span></button>`).join('')}</div><p class="small muted" style="margin:6px 0 0">選ばずに試合へ進むと,出来事は過ぎ去ります.</p></div>`;
  }
  if (state.last?.game && !state.autoOpen) {
    const r = recap(state.last.game);
    h += `<div class="card"><p style="margin:0"><b>前の試合</b> <span class="small muted">${esc(r.headline)}</span></p><button class="btn ghost" data-a="tab" data-k="game" style="margin-top:6px">詳しく見る</button></div>`;
  }
  const hurt = hurtPlayers(u);
  const tiredN = u.players.filter((p) => p.fatigue >= 70 && !(p.inj && p.inj.weeks > 0)).length;
  if (hurt.length || tiredN) {
    h += `<div class="card"><p style="margin:0"><b>コンディション</b> <span class="small muted">怪我人は,控えが自動で代わりに出ます.</span></p>${hurt.map((p) => `<p class="small" style="margin:4px 0 0">🩹 ${esc(p.name)} ${esc(p.inj!.name)} あと${p.inj!.weeks}週</p>`).join('')}${tiredN ? `<p class="small" style="margin:4px 0 0">疲労70以上の選手が${tiredN}人います.休養で回復できます.</p>` : ''}</div>`;
  }
  for (const w of warnings(c, state.menu, state.practice)) h += `<div class="warnbox ${w.level}">${w.level === 'info' ? 'ℹ' : '⚠'} ${esc(w.text)}${w.level !== 'info' && w.text.startsWith('疲れ') && state.menu !== 'rest' ? ' <button class="btn ghost" data-a="menu" data-k="rest" style="margin-top:6px">休養にする</button>' : ''}</div>`;
  const total = c.leagues[c.level].schedule.length, lg = LEAGUES[c.level];
  h += `<h2>${info.label} <span class="small muted">${esc(info.title)}</span></h2><div class="card">`;
  if (info.note) h += `<p class="small" style="margin:0 0 6px">${esc(info.note)}</p>`;
  if (info.userGame === 'league' && m) {
    h += `<div class="row" style="justify-content:space-between"><div><b>第${c.week + 1}戦 vs ${esc(m.opp.name)}</b>${m.opp.id === c.rival ? ' <span class="rec star">ライバル対決!</span>' : ''} <span class="muted small">(${m.home ? 'ホーム' : 'ビジター'} / 全${total}戦 ${lg.teams}チーム)</span></div>
    <div class="small">総合力 ${gradeHTML(ovr(m.opp))} 自チーム ${gradeHTML(ovr(u))}</div></div>${winProbHTML(c, m.opp)}`;
  } else if (info.userGame) {
    h += `<p style="margin:0"><b>${info.userGame === 'playoff' ? 'プレーオフに出場します' : '全日本選手権に出場します'}</b></p>`;
  } else {
    if (m) h += `<p class="small muted" style="margin:0">次のリーグ戦: ${Math.floor(m.cal / 4) + 1}月 第${(m.cal % 4) + 1}週 vs ${esc(m.opp.name)}</p>`;
    h += `<div class="row" style="margin-top:8px"><button class="btn ghost" data-a="practice" aria-pressed="${state.practice}">${state.practice ? '✔ 練習試合を組む' : '練習試合を組む'}</button><span class="small muted">試合の経験が積めますが,疲れがたまります.成績には入りません.</span></div>`;
  }
  h += `</div>`;
  h += renderTraining(c);
  const w = c.results.filter((r) => r.us > r.them).length, l = c.results.filter((r) => r.us < r.them).length;
  const sumPantry = Object.values(c.pantry).reduce((a, b) => a + b, 0);
  h += `<h2>ミッション・施設・食事</h2>`;
  h += fold('missions', 'ミッション', `${c.missions.length}件 進行中`, missionsHTML(c));
  h += fold('facilities', '施設と資金', facilitiesSummary(c), facilitiesHTML(c));
  h += fold('kitchen', '台所', kitchenSummary(c) + (sumPantry && !c.meal ? ' / 料理が作れます' : ''), kitchenHTML(c));
  h += `<h2>状況</h2>`;
  h += fold('trust', '監督の信頼度', trustSummary(c), trustHTML(c));
  h += fold('forecast', 'シーズンの予想', forecastSummary(c), forecastHTML(c));
  if (c.results.length) {
    h += fold('results', '今シーズンの試合結果', `${w}勝${l}敗`, `<table class="results"><tbody>${[...c.results].reverse().slice(0, 10).map((r) => {
      const k = r.us > r.them ? 'w' : r.us < r.them ? 'l' : '';
      return `<tr><td>${r.kind === 'playoff' ? 'PO' : r.kind === 'cup' ? '選手権' : `第${r.week + 1}戦`}</td><td>${esc(r.opp)}<span class="tag">${r.home ? 'H' : 'A'}</span></td><td class="${k}">${r.us > r.them ? '勝' : r.us < r.them ? '負' : '分'}</td><td class="num">${r.us} - ${r.them}</td></tr>`;
    }).join('')}</tbody></table>`);
  }
  h += fold('settings', '設定・データ', 'バックアップなど', `<div class="row"><button class="btn ghost" data-a="autoopen" aria-pressed="${state.autoOpen}">試合後に結果を開く: ${state.autoOpen ? 'ON' : 'OFF(スキップ)'}</button></div>
  <p class="small muted" style="margin:8px 0 4px">セーブはこの端末のブラウザに保存されます.機種変更やデータ消去に備えて,ときどきバックアップを取りましょう.</p>
  <div class="row"><button class="btn ghost" data-a="export">バックアップを保存</button><label class="btn ghost filebtn">バックアップを読み込む<input id="imp" type="file" accept="application/json,.json" hidden></label></div>
  <div class="row" style="margin-top:8px"><button class="btn danger" data-a="reset">データを消して最初から</button></div>`);
  h += `<div class="actionbar"><button class="btn" data-a="start">▶ ${MENUS[state.menu].name}${info.userGame ? 'で試合へ' : state.practice ? 'と練習試合' : 'で1週進める'}</button><button class="btn ghost" data-a="auto-season" title="この練習のまま,今年の終わりまで進めます">⏩ 年末まで</button></div>`;
  return h;
}
