import { LEAGUES } from '../../data/constants';
import { downCount, upCount } from '../../league/finance';
import { leaders } from '../../league/leaders';
import { leaguesInTier, standings, teamById, userLeague } from '../../league/schedule';
import { leagueName } from '../../league/world';
import { ovr } from '../../league/team';
import type { Career } from '../../types';
import { esc } from '../../util/format';
import { playoffOdds } from '../../league/playoffs';
import { rankSVG } from '../charts';
import { gradeHTML } from '../components';
import { state } from '../state';
import { rosterHTML } from './players';
import { emblem } from '../emblem';
import { cupBracketSVG, playoffBracketSVG } from '../bracket';
import { cupDef, userCupDef } from '../../data/cups';

/** 順位タブ.どのリーグの順位,個人成績,優勝の歴史も見られる. */
export function renderTable(c: Career): string {
  const level = state.viewLevel ?? c.level;
  const lgs = leaguesInTier(c, level);
  const mine = userLeague(c);
  const lg = lgs[Math.min(lgs.length - 1, state.viewSub ?? (level === c.level ? lgs.indexOf(mine) : 0))] ?? lgs[0];
  const L = LEAGUES[level];
  const tabs = `<div class="lgtabs" role="group" aria-label="リーグ">${LEAGUES.map((x, i) =>
    `<button data-a="lv" data-i="${i}" aria-pressed="${i === level}">${x.name.replace('リーグ', '')}${i === c.level ? ' ★' : ''}</button>`).join('')}</div>
    ${lgs.length > 1 ? `<div class="lgtabs sub" role="group" aria-label="地域">${lgs.map((x, i) => `<button data-a="lvs" data-i="${i}" aria-pressed="${x === lg}">${esc(L.subs?.[x.sub ?? i] ?? String(i + 1))}${x === mine ? ' ★' : ''}</button>`).join('')}</div>` : ''}`;
  const upN = upCount(lg.level), downN = downCount(lg.level);
  const moveNote = `${upN ? `優勝チームは${LEAGUES[level + 1].name}へ自動昇格.2位は入れ替え戦に回ることがあります.` : ''}${downN ? `下位${downN}チームは自動降格,そのすぐ上は入れ替え戦に回ることがあります.` : ''}${lg.divs ? '各地区の上位2チームが' : '上位4チームが'}プレーオフに進みます.`;
  const tbl = standings(c, lg);
  let h = `${tabs}<h2>${esc(leagueName(lg))} 順位表 <span class="small muted">(${lg.week}/${lg.schedule.length}試合)</span></h2><p class="small muted">${moveNote}</p>
  <div class="card scroll"><table class="std"><thead><tr><th>順位</th><th>チーム</th><th>試合</th><th>勝</th><th>敗</th><th>分</th><th>勝率</th><th>得失点</th><th>戦力</th></tr></thead><tbody>
  ${tbl.map((r, i) => `<tr class="${r.t.user ? 'me' : ''}"><td>${i + 1}</td><td>${emblem(r.t, 18)} <button class="linkish" data-a="vteam" data-id="${r.t.id}">${esc(r.t.name)}</button>${lg.divs ? `<span class="tag">${lg.divs[0].includes(r.t.id) ? 'A' : 'B'}</span>` : ''}</td><td>${r.w + r.l + r.d}</td><td>${r.w}</td><td>${r.l}</td><td>${r.d}</td><td>${r.w + r.l ? (r.w / (r.w + r.l)).toFixed(3) : '---'}</td><td>${r.rf - r.ra > 0 ? '+' : ''}${r.rf - r.ra}</td><td>${gradeHTML(ovr(r.t))}</td></tr>`).join('')}
  </tbody></table></div>`;

  if (state.viewTeam !== null && lg.teamIds.includes(state.viewTeam)) {
    const t = teamById(c, state.viewTeam);
    h += `<h2>${esc(t.name)} の選手 <button class="btn ghost" data-a="rename-t" data-id="${t.id}">✎ チーム名を変える</button> <button class="btn ghost" data-a="vteam" data-id="-1">閉じる</button></h2>${rosterHTML(c, t, false)}`;
  } else {
    h += `<p class="small muted">チーム名をタップすると,選手と通算成績が見られます.チーム名や選手の名前も,そこから変えられます.</p>`;
  }

  h += `<h2>個人成績 <span class="small muted">(${esc(leagueName(lg))})</span></h2><div class="boards">${leaders(c, lg).map((b) =>
    `<div class="board2"><h4>${b.name}</h4>${b.rows.length ? `<ol>${b.rows.map((r) => `<li><span>${esc(r.p.name)} <span class="muted">${esc(r.team.slice(0, 4))}</span></span><b>${r.text}</b></li>`).join('')}</ol>` : '<span class="small muted">まだありません</span>'}</div>`).join('')}</div>`;

  const rh = lg.teamIds.map((id) => ({ name: teamById(c, id).name, values: lg.rankHist[id] ?? [], user: id === c.userId }));
  if (rh.some((r) => r.values.length > 1)) {
    h += `<h2>順位の遷移 <span class="small muted">(${esc(leagueName(lg))})</span></h2><div class="card">${rankSVG(rh, lg.teamIds.length)}<p class="small muted" style="margin:4px 0 0">1節ごとの順位です.太い線があなたのチームです.</p></div>`;
  }
  const po = lg.po;
  if (po) {
    const odds = playoffOdds(c, lg);
    const pc = (v: number) => `${Math.round(v * 100)}%`;
    h += `<h2>プレーオフ <span class="small muted">(${esc(leagueName(lg))})</span></h2><div class="card">${playoffBracketSVG(c, lg)}
    <h3>優勝する確率</h3>${odds.map((o) => `<div class="chem"><span class="who ${o.team.id === c.userId ? 'me' : ''}">${esc(o.team.name)}</span><span class="bar"><i style="width:${o.champion * 100}%"></i></span><span class="small">${pc(o.champion)}</span></div>`).join('')}
    <p class="small muted" style="margin:4px 0 0">チームの総合力の差から計算した,目安の確率です.</p></div>`;
  }
  const champs = c.champs.filter((x) => x.level === level).slice().reverse().slice(0, 12);
  h += `<h2>歴代の優勝 <span class="small muted">(${esc(leagueName(lg))})</span></h2><div class="card">${champs.length
    ? `<table class="results"><tbody>${champs.map((x) => `<tr><td>第${x.season}季</td><td class="${x.teamId === c.userId ? 'w' : ''}">${esc(x.team)}</td><td class="muted small">${x.league && LEAGUES[level].count > 1 ? `${esc(x.league.split(' ').pop())} / ` : ''}準優勝 ${esc(x.runnerUp)}</td></tr>`).join('')}</tbody></table>`
    : '<p class="small muted">まだ優勝チームはありません.</p>'}</div>`;
  return h + cupHTML(c);
}

/** 年末の選手権.プレイヤーが出る大会の対戦表と,すべての大会の歴代優勝. */
export function cupHTML(c: Career): string {
  const rounds: string[] = [];
  for (const m of c.cupBracket) if (!rounds.includes(m.round)) rounds.push(m.round);
  const past = c.cups.slice().reverse().slice(0, 9);
  const d = userCupDef(c);
  let h = `<h2>${esc(d.name)} <span class="small muted">(${d.tiers.map((t) => LEAGUES[t].name.replace('リーグ', '')).join('・')}・年末)</span></h2><div class="card">`;
  if (!c.cupBracket.length) {
    h += '<p class="small muted" style="margin:0">シーズンが終わると,近い階層のチームが集まってトーナメントで戦います(アマチュア・日本・世界の 3 大会).上の階層ほどシードが上位で,下の階層が勝ち上がれば大金星です.</p>';
  } else {
    const mine = c.cupBracket.filter((m) => m.aId === c.userId || m.bId === c.userId);
    h += cupBracketSVG(c);
    if (mine.length) {
      h += `<h3>あなたの勝ち上がり</h3><ol class="path">${mine.map((m) => {
        const us = m.aId === c.userId, opp = us ? m.b : m.a, my = us ? m.sa : m.sb, th = us ? m.sb : m.sa, win = m.winner === c.userId;
        return `<li class="${win ? 'w' : 'l'}"><span class="muted small">${m.round}</span> ${win ? '○' : '●'} ${my}-${th} ${esc(opp)}</li>`;
      }).join('')}</ol>`;
    }
    h += rounds.map((r) => `<details ${r === '決勝' ? 'open' : ''}><summary><b>${r}</b></summary><table class="results"><tbody>${c.cupBracket.filter((m) => m.round === r).map((m) => {
      const mine = m.aId === c.userId || m.bId === c.userId;
      const A = `<span class="${m.winner === m.aId ? 'w' : 'muted'}">${esc(m.a)}</span>`, B = `<span class="${m.winner === m.bId ? 'w' : 'muted'}">${esc(m.b)}</span>`;
      return `<tr class="${mine ? 'me' : ''}"><td>${A}</td><td class="num">${m.sa} - ${m.sb}</td><td>${B}</td></tr>`;
    }).join('')}</tbody></table></details>`).join('');
  }
  h += `</div>`;
  if (past.length) h += `<div class="card"><table class="results"><tbody>${past.map((x) => `<tr><td>第${x.season}季</td><td class="small">${esc(cupDef(x.kind).short)}</td><td class="${x.championId === c.userId ? 'w' : ''}">${esc(x.champion)}</td><td class="muted small">${LEAGUES[x.championLevel]?.name.replace('リーグ', '') ?? ''} / 準優勝 ${esc(x.runnerUp)}</td></tr>`).join('')}</tbody></table></div>`;
  return h;
}
