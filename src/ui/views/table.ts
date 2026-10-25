import { LEAGUES } from '../../data/constants';
import { leaders } from '../../league/leaders';
import { standings, teamById } from '../../league/schedule';
import { ovr } from '../../league/team';
import type { Career } from '../../types';
import { esc } from '../../util/format';
import { rankSVG } from '../charts';
import { gradeHTML } from '../components';
import { state } from '../state';
import { rosterHTML } from './players';

/** 順位タブ.どのリーグの順位,個人成績,優勝の歴史も見られる. */
export function renderTable(c: Career): string {
  const level = state.viewLevel ?? c.level;
  const lg = c.leagues[level];
  const L = LEAGUES[level];
  const tabs = `<div class="lgtabs" role="group" aria-label="リーグ">${LEAGUES.map((x, i) =>
    `<button data-a="lv" data-i="${i}" aria-pressed="${i === level}">${x.name.replace('リーグ', '')}${i === c.level ? ' ★' : ''}</button>`).join('')}</div>`;
  const moveNote = `${level < LEAGUES.length - 1 ? '上位2チームは昇格.' : ''}${level > 0 ? '下位2チームは降格.' : ''}上位4チームはプレーオフに進みます.`;
  const tbl = standings(c, level);
  let h = `${tabs}<h2>${L.name} 順位表 <span class="small muted">(${lg.week}/${lg.schedule.length}試合)</span></h2><p class="small muted">${moveNote}</p>
  <div class="card scroll"><table class="std"><thead><tr><th>順位</th><th>チーム</th><th>試合</th><th>勝</th><th>敗</th><th>分</th><th>勝率</th><th>得失点</th><th>戦力</th></tr></thead><tbody>
  ${tbl.map((r, i) => `<tr class="${r.t.user ? 'me' : ''}"><td>${i + 1}</td><td><button class="linkish" data-a="vteam" data-id="${r.t.id}">${esc(r.t.name)}</button></td><td>${r.w + r.l + r.d}</td><td>${r.w}</td><td>${r.l}</td><td>${r.d}</td><td>${r.w + r.l ? (r.w / (r.w + r.l)).toFixed(3) : '---'}</td><td>${r.rf - r.ra > 0 ? '+' : ''}${r.rf - r.ra}</td><td>${gradeHTML(ovr(r.t))}</td></tr>`).join('')}
  </tbody></table></div>`;

  if (state.viewTeam !== null && lg.teamIds.includes(state.viewTeam)) {
    const t = teamById(c, state.viewTeam);
    h += `<h2>${esc(t.name)} の選手 <button class="btn ghost" data-a="vteam" data-id="-1">閉じる</button></h2>${rosterHTML(c, t, false)}`;
  } else {
    h += `<p class="small muted">チーム名をタップすると,選手と通算成績が見られます.</p>`;
  }

  h += `<h2>個人成績 <span class="small muted">(${L.name})</span></h2><div class="boards">${leaders(c, level).map((b) =>
    `<div class="board2"><h4>${b.name}</h4>${b.rows.length ? `<ol>${b.rows.map((r) => `<li><span>${esc(r.p.name)} <span class="muted">${esc(r.team.slice(0, 4))}</span></span><b>${r.text}</b></li>`).join('')}</ol>` : '<span class="small muted">まだありません</span>'}</div>`).join('')}</div>`;

  const rh = lg.teamIds.map((id) => ({ name: teamById(c, id).name, values: lg.rankHist[id] ?? [], user: id === c.userId }));
  if (rh.some((r) => r.values.length > 1)) {
    h += `<h2>順位の遷移 <span class="small muted">(${L.name})</span></h2><div class="card">${rankSVG(rh, lg.teamIds.length)}<p class="small muted" style="margin:4px 0 0">1節ごとの順位です.太い線があなたのチームです.</p></div>`;
  }
  const po = lg.po;
  if (po) {
    const nm = (id: number) => teamById(c, id).name;
    const row = (id: number) => `<span class="${id === c.userId ? 'w' : ''}">${esc(nm(id))}</span>`;
    h += `<h2>プレーオフ <span class="small muted">(${L.name})</span></h2><div class="card"><table class="results"><tbody>
    <tr><td class="muted small">準決勝</td><td>${row(po.seeds[0])} vs ${row(po.seeds[3])}</td></tr>
    <tr><td class="muted small">準決勝</td><td>${row(po.seeds[1])} vs ${row(po.seeds[2])}</td></tr>
    <tr><td class="muted small">決勝</td><td>${po.semiWinners.length ? po.semiWinners.map(row).join(' vs ') : '(準決勝のあと)'}</td></tr>
    ${po.champion != null ? `<tr><td class="muted small">優勝</td><td><b>${row(po.champion)}</b></td></tr>` : ''}</tbody></table></div>`;
  }
  const champs = c.champs.filter((x) => x.level === level).slice().reverse().slice(0, 12);
  h += `<h2>歴代の優勝 <span class="small muted">(${L.name})</span></h2><div class="card">${champs.length
    ? `<table class="results"><tbody>${champs.map((x) => `<tr><td>第${x.season}季</td><td class="${x.teamId === c.userId ? 'w' : ''}">${esc(x.team)}</td><td class="muted small">準優勝 ${esc(x.runnerUp)}</td></tr>`).join('')}</tbody></table>`
    : '<p class="small muted">まだ優勝チームはありません.</p>'}</div>`;
  return h + cupHTML(c);
}

/** 全日本選手権.全リーグ混合のトーナメントの結果. */
export function cupHTML(c: Career): string {
  const rounds: string[] = [];
  for (const m of c.cupBracket) if (!rounds.includes(m.round)) rounds.push(m.round);
  const past = c.cups.slice().reverse().slice(0, 8);
  let h = `<h2>全日本選手権 <span class="small muted">(全リーグ混合・年末)</span></h2><div class="card">`;
  if (!c.cupBracket.length) {
    h += '<p class="small muted" style="margin:0">シーズンが終わると,全リーグの全チームが1つのトーナメントで戦います.上のリーグほどシードが上位で,下のリーグが勝ち上がれば大金星です.</p>';
  } else {
    h += rounds.map((r) => `<details ${r === '決勝' || r === '準決勝' ? 'open' : ''}><summary><b>${r}</b></summary><table class="results"><tbody>${c.cupBracket.filter((m) => m.round === r).map((m) => {
      const mine = m.aId === c.userId || m.bId === c.userId;
      const A = `<span class="${m.winner === m.aId ? 'w' : 'muted'}">${esc(m.a)}</span>`, B = `<span class="${m.winner === m.bId ? 'w' : 'muted'}">${esc(m.b)}</span>`;
      return `<tr class="${mine ? 'me' : ''}"><td>${A}</td><td class="num">${m.sa} - ${m.sb}</td><td>${B}</td></tr>`;
    }).join('')}</tbody></table></details>`).join('');
  }
  h += `</div>`;
  if (past.length) h += `<div class="card"><table class="results"><tbody>${past.map((x) => `<tr><td>第${x.season}季</td><td class="${x.championId === c.userId ? 'w' : ''}">${esc(x.champion)}</td><td class="muted small">${LEAGUES[x.championLevel].name.replace('リーグ', '')} / 準優勝 ${esc(x.runnerUp)}</td></tr>`).join('')}</tbody></table></div>`;
  return h;
}
