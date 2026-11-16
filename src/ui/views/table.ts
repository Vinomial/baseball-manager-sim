import { gamesPerSeason, LEAGUES, PO_PER_GROUP, relegPerLeague } from '../../data/constants';
import { leaders } from '../../league/leaders';
import { groupName, groupOf, groupsInTier, groupStandings, teamById } from '../../league/schedule';
import { leagueName } from '../../league/world';
import { tierOdds, tierPO, tierRuleText } from '../../league/promotion';
import { ovr } from '../../league/team';
import type { Career } from '../../types';
import { esc } from '../../util/format';
import { rankSVG } from '../charts';
import { gradeHTML } from '../components';
import { state } from '../state';
import { rosterHTML } from './players';
import { emblem } from '../emblem';
import { cupBracketSVG, tierBracketSVG } from '../bracket';
import { cupDef, userCupDef } from '../../data/cups';

/** 順位タブ.どのリーグの順位,昇格・降格の決まり,昇格プレーオフ,個人成績,優勝の歴史も見られる. */
export function renderTable(c: Career): string {
  const level = state.viewLevel ?? c.level;
  const gs = groupsInTier(c, level);
  const myG = level === c.level ? groupOf(c, c.userId) : null;
  const gi = Math.min(gs.length - 1, state.viewSub ?? (myG ? gs.findIndex((g) => g.ids.includes(c.userId)) : 0));
  const g = gs[Math.max(0, gi)];
  const lg = g.lg;
  const tabs = `<div class="lgtabs" role="group" aria-label="階層">${LEAGUES.map((x, i) =>
    `<button data-a="lv" data-i="${i}" aria-pressed="${i === level}">${x.name.replace('リーグ', '')}${i === c.level ? ' ★' : ''}</button>`).join('')}</div>
    ${gs.length > 1 ? `<div class="lgtabs sub" role="group" aria-label="リーグ">${gs.map((x, i) => `<button data-a="lvs" data-i="${i}" aria-pressed="${i === gi}">${esc(groupName(x).split(' ').pop() ?? '')}${x.ids.includes(c.userId) ? ' ★' : ''}</button>`).join('')}</div>` : ''}`;
  const poN = PO_PER_GROUP, downN = relegPerLeague(level);
  const rule = `<details class="card rule" open><summary><b>📘 ${esc(LEAGUES[level].name)}の決まり</b></summary><ul class="recap">${tierRuleText(c, level).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></details>`;
  const tbl = groupStandings(c, g);
  const games = lg.divs ? gamesPerSeason(level) : lg.schedule.length;
  let h = `${tabs}${rule}<h2>${esc(groupName(g))} 順位表 <span class="small muted">(全${games}試合${lg.divs ? '・交流戦を含む' : ''})</span></h2>
  <div class="card scroll"><table class="std"><thead><tr><th>順位</th><th>チーム</th><th>試合</th><th>勝</th><th>敗</th><th>分</th><th>勝率</th><th>得失点</th><th>戦力</th></tr></thead><tbody>
  ${tbl.map((r, i) => {
    const zone = i < poN ? 'po' : downN && i >= tbl.length - downN ? 'down' : '';
    const mark = zone === 'po' ? '<span class="tag zone-po">PO</span>' : zone === 'down' ? '<span class="tag zone-down">降格</span>' : '';
    return `<tr class="${r.t.user ? 'me' : ''} ${zone}"><td>${i + 1}</td><td>${emblem(r.t, 18)} <button class="linkish" data-a="vteam" data-id="${r.t.id}">${esc(r.t.name)}</button>${mark}</td><td>${r.w + r.l + r.d}</td><td>${r.w}</td><td>${r.l}</td><td>${r.d}</td><td>${r.w + r.l ? (r.w / (r.w + r.l)).toFixed(3) : '---'}</td><td>${r.rf - r.ra > 0 ? '+' : ''}${r.rf - r.ra}</td><td>${gradeHTML(ovr(r.t))}</td></tr>`;
  }).join('')}
  </tbody></table></div>
  <p class="small muted" style="margin:2px 0 8px"><span class="tag zone-po">PO</span> 昇格プレーオフに出られる順位${downN ? ` / <span class="tag zone-down">降格</span> ${esc(LEAGUES[level - 1].name)}へ下がる順位` : ''}</p>`;

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
  const tp = tierPO(c, level);
  if (tp) {
    const odds = tierOdds(c, tp);
    const pc = (v: number) => `${Math.round(v * 100)}%`;
    const promo = level < LEAGUES.length - 1;
    h += `<h2>昇格プレーオフ <span class="small muted">(${esc(LEAGUES[level].name)})</span></h2><div class="card scroll">${tierBracketSVG(c, tp)}
    <h3>${promo ? '昇格と優勝の確率' : '優勝する確率'}</h3><table class="results odds"><thead><tr><th>チーム</th>${promo ? '<th class="num">昇格</th>' : ''}<th class="num">優勝</th></tr></thead><tbody>${odds.map((o) => `<tr class="${o.team.id === c.userId ? 'me' : ''}"><td>${esc(o.team.name)}</td>${promo ? `<td class="num">${pc(o.promote)}</td>` : ''}<td class="num">${pc(o.champion)}</td></tr>`).join('')}</tbody></table>
    <p class="small muted" style="margin:4px 0 0">チームの総合力の差から計算した,目安の確率です.</p></div>`;
  }
  const champs = c.champs.filter((x) => x.level === level).slice().reverse().slice(0, 12);
  h += `<h2>歴代の優勝 <span class="small muted">(${esc(LEAGUES[level].name)})</span></h2><div class="card">${champs.length
    ? `<table class="results"><tbody>${champs.map((x) => `<tr><td>第${x.season}季</td><td class="${x.teamId === c.userId ? 'w' : ''}">${esc(x.team)}</td><td class="muted small">準優勝 ${esc(x.runnerUp)}</td></tr>`).join('')}</tbody></table>`
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
