import { LEAGUES } from '../../data/constants';
import { recap } from '../../engine/recap';
import { MENUS } from '../../growth/training';
import { weekInfo } from '../../league/calendar';
import { fmtYen } from '../../league/finance';
import { hurtPlayers } from '../../league/health';
import { standings } from '../../league/schedule';
import { userMatch, userTeam } from '../../league/season';
import { ovr } from '../../league/team';
import { warnings } from '../../league/warnings';
import type { Career, Game } from '../../types';
import { userSide } from '../../engine/game';
import { esc } from '../../util/format';
import { fold, gradeHTML } from '../components';
import { term } from '../glossary';
import { state } from '../state';
import { tutorialCard } from '../tutorial';
import { renderOff } from './offseason';
import { userSeries } from '../../league/playoffs';
import { winProbHTML } from './status';
import { convertTipsHTML, storyHTML, todoHTML } from './todo';
import { renderTraining } from './training';

/** ホームの上のダッシュボード.いまの状況を 4 つの数字で見せる. */
function dashboardHTML(c: Career): string {
  const u = userTeam(c);
  const rank = standings(c).findIndex((r) => r.t.id === c.userId) + 1;
  const rec = c.leagues[c.level].stand[c.userId];
  const hurt = hurtPlayers(u).length;
  const tired = u.players.filter((p) => p.fatigue >= 70 && !(p.inj && p.inj.weeks > 0)).length;
  const cond = hurt || tired ? `${hurt ? `🩹${hurt}` : ''}${hurt && tired ? ' ' : ''}${tired ? `疲${tired}` : ''}` : '良好';
  return `<div class="tiles">
  <button class="tile" data-a="tab" data-k="table"><small>順位</small><b>${rank}位</b><small>${rec.w}勝${rec.l}敗${rec.d}分</small></button>
  <button class="tile" data-a="tab" data-k="gm"><small>資金</small><b>${fmtYen(c.funds)}</b><small>GMの信頼度 ${Math.round(c.trust)}</small></button>
  <button class="tile ${hurt || tired ? 'alert' : ''}" data-a="tab" data-k="team"><small>コンディション</small><b>${cond}</b><small>選手を見る</small></button>
  <button class="tile" data-a="tab" data-k="gm"><small>目標</small><b>${c.goals.length}件</b><small>オーナー</small></button></div>`;
}

function scoreLine(g: Game): string {
  const us = userSide(g), them = us === g.home ? g.away : g.home;
  return `${us.runs}-${them.runs}${us.runs > them.runs ? ' 勝ち' : us.runs < them.runs ? ' 負け' : ' 引き分け'}`;
}

export function renderHome(c: Career): string {
  if (c.phase === 'off') return renderOff(c);
  const u = userTeam(c);
  const m = userMatch(c);
  const info = weekInfo(c);
  let h = dashboardHTML(c);
  h += storyHTML(c);
  h += tutorialCard();
  if (c.last) h += `<div class="notice">${esc(c.last)}</div>`;
  for (const n of c.news) h += `<div class="news">★ ${esc(n)}</div>`;
  if (c.event) {
    h += `<div class="card event"><p style="margin:0"><span class="rec star">出来事</span> <b>${esc(c.event.title)}</b></p><p class="small" style="margin:6px 0">${esc(c.event.body)}</p><div class="row">${c.event.choices.map((x) => `<button class="btn ghost ev" data-a="event" data-k="${x.key}"><b>${esc(x.label)}</b><span class="small muted">${esc(x.hint)}</span></button>`).join('')}</div><p class="small muted" style="margin:6px 0 0">選ばずに進むと,出来事は過ぎ去ります.</p></div>`;
  }
  if (state.last?.game) {
    const r = recap(state.last.game);
    h += `<div class="card"><p style="margin:0"><b>前の試合</b> <span class="small">${state.last.game ? scoreLine(state.last.game) : ''}</span> <span class="small muted">${esc(r.headline)}</span></p><button class="btn ghost" data-a="tab" data-k="game" style="margin-top:6px">結果・再生を見る</button></div>`;
  }
  for (const w of warnings(c, state.menu, state.practice)) h += `<div class="warnbox ${w.level}">${w.level === 'info' ? 'ℹ' : '⚠'} ${esc(w.text)}${w.level !== 'info' && w.text.startsWith('疲れ') && state.menu !== 'rest' ? ' <button class="btn ghost" data-a="menu" data-k="rest" style="margin-top:6px">休養にする</button>' : ''}</div>`;
  h += todoHTML(c);
  if (c.cal < 12) h += convertTipsHTML(c, '春季キャンプのコンバート提案');

  const total = c.leagues[c.level].schedule.length, lg = LEAGUES[c.level];
  h += `<h2>${info.label} <span class="small muted">${esc(info.title)}</span></h2><div class="card">`;
  if (info.note) h += `<p class="small" style="margin:0 0 6px">${esc(info.note)}</p>`;
  if (info.userGame === 'league' && m) {
    h += `<div class="row" style="justify-content:space-between"><div><b>第${c.week + 1}戦 vs ${esc(m.opp.name)}</b>${m.opp.id === c.rival ? ' <span class="rec star">ライバル対決!</span>' : ''} <span class="muted small">(${m.home ? 'ホーム' : 'ビジター'} / 全${total}戦 ${lg.teams}チーム)</span></div>
    <div class="small">${term('ovr')} 相手 ${gradeHTML(ovr(m.opp))} 自チーム ${gradeHTML(ovr(u))}</div></div>${winProbHTML(c, m.opp)}`;
  } else if (info.userGame) {
    const sr = userSeries(c);
    h += `<p style="margin:0"><b>${info.userGame === 'playoff' ? 'プレーオフに出場します' : '全日本選手権に出場します'}</b></p>`;
    if (sr) {
      if (!sr.opp) h += '<p class="small muted" style="margin:4px 0 0">この回戦は不戦勝(シード)です.</p>';
      else {
        const pc = (v: number) => `${Math.round(v * 100)}%`;
        h += `<p class="small" style="margin:6px 0 0">${esc(sr.label)} vs <b>${esc(sr.opp.name)}</b> <span class="small muted">総合力 相手 ${Math.round(ovr(sr.opp))} / 自チーム ${Math.round(ovr(u))}</span></p>
        <div class="prob" role="img" aria-label="1試合の予想勝率 ${pc(sr.pGame)}"><span class="small">1試合の勝率</span><span class="bar"><i style="width:${sr.pGame * 100}%;${sr.pGame < 0.5 ? 'background:var(--bad)' : ''}"></i></span><b>${pc(sr.pGame)}</b></div>
        ${sr.wins > 1 ? `<div class="prob" role="img" aria-label="シリーズを勝ち抜く確率 ${pc(sr.pSeries)}"><span class="small">シリーズ突破</span><span class="bar"><i style="width:${sr.pSeries * 100}%;${sr.pSeries < 0.5 ? 'background:var(--bad)' : ''}"></i></span><b>${pc(sr.pSeries)}</b></div>` : ''}`;
      }
    }
  } else {
    if (info.kind === 'open') h += `<p style="margin:0"><b>⚾ オープン戦が1試合,自動で組まれます</b></p>`;
    if (m) h += `<p class="small muted" style="margin:0">次のリーグ戦: ${Math.floor(m.cal / 4) + 1}月 第${(m.cal % 4) + 1}週 vs ${esc(m.opp.name)}</p>`;
    if (info.kind !== 'open') h += `<div class="row" style="margin-top:8px"><button class="btn ghost" data-a="practice" aria-pressed="${state.practice}">${state.practice ? '✔ 練習試合を組む' : '練習試合を組む'}</button><span class="small muted">試合の経験が積めますが,疲れがたまります.成績には入りません.</span></div>`;
  }
  h += `</div>`;
  h += renderTraining(c);

  if (c.results.length) {
    const w = c.results.filter((r) => r.us > r.them).length, l = c.results.filter((r) => r.us < r.them).length;
    h += fold('results', '今シーズンの試合結果', `${w}勝${l}敗`, `<table class="results"><tbody>${[...c.results].reverse().slice(0, 10).map((r) => {
      const k = r.us > r.them ? 'w' : r.us < r.them ? 'l' : '';
      return `<tr><td>${r.kind === 'playoff' ? 'PO' : r.kind === 'cup' ? '選手権' : `第${r.week + 1}戦`}</td><td>${esc(r.opp)}<span class="tag">${r.home ? 'H' : 'A'}</span></td><td class="${k}">${r.us > r.them ? '勝' : r.us < r.them ? '負' : '分'}</td><td class="num">${r.us} - ${r.them}</td></tr>`;
    }).join('')}</tbody></table>`);
  }
  h += `<div class="actionbar"><button class="btn" data-a="start">▶ ${info.userGame ? '試合へ' : info.kind === 'open' ? 'オープン戦へ' : state.practice ? '練習試合' : '1週進める'}<br><span class="small" style="font-weight:400">${MENUS[state.menu].name}</span></button><button class="btn ghost" data-a="month" title="4週まとめて進めます.出来事や警告で止まります">⏩ 1か月</button><button class="btn ghost" data-a="auto-season" title="年末まで進めます">⏭ 年末</button></div>`;
  return h;
}
