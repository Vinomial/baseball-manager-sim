import { LEAGUES, POS_NAME } from '../../data/constants';
import { ACHIEVEMENTS, goals } from '../../league/achievements';
import { findPlayer } from '../../league/team';
import type { Career } from '../../types';
import { esc } from '../../util/format';

const lgShort = (l: number): string => LEAGUES[l].name.replace('リーグ', '');

function goalsHTML(c: Career): string {
  return goals(c).map((g) => `<div class="chem"><span class="who">${g.done ? '✔ ' : ''}${esc(g.name)}</span><span class="bar"><i style="width:${(g.now / g.max) * 100}%"></i></span><span class="num">${g.now}/${g.max}</span></div>`).join('');
}

function rivalHTML(c: Career): string {
  const r = c.rival !== null ? c.teams.find((t) => t.id === c.rival) : null;
  const rows = Object.entries(c.h2h).map(([id, v]) => ({ t: c.teams.find((x) => x.id === Number(id)), v })).filter((x) => x.t)
    .sort((a, b) => (b.v.w + b.v.l + b.v.d) - (a.v.w + a.v.l + a.v.d)).slice(0, 10);
  let h = '';
  if (r) {
    const v = c.h2h[r.id] ?? { w: 0, l: 0, d: 0 };
    const ace = r.pitchers[0] !== undefined ? findPlayer(r, r.pitchers[0]) : undefined;
    const star = r.lineup.map((e) => findPlayer(r, e.pid)).filter((p) => !!p).sort((a, b) => (b!.meet + b!.power) - (a!.meet + a!.power))[0];
    h += `<div class="card"><p style="margin:0"><span class="rec star">ライバル</span> <b>${esc(r.name)}</b> <span class="small muted">通算 ${v.w}勝${v.l}敗${v.d}分</span></p>
    <p class="small" style="margin:4px 0 0">${ace ? `エース ${esc(ace.name)}` : ''}${star ? ` / 主砲 ${esc(star.name)}(${POS_NAME[star.pos]})` : ''}</p></div>`;
  } else h += '<p class="small muted">まだライバルがいません.</p>';
  if (rows.length) h += `<div class="card scroll"><table class="results"><tbody>${rows.map((x) => `<tr><td>${esc(x.t!.name)}${x.t!.id === c.rival ? '<span class="tag">宿敵</span>' : ''}</td><td class="num">${x.v.w}勝 ${x.v.l}敗 ${x.v.d}分</td></tr>`).join('')}</tbody></table></div>`;
  return h;
}

function starsHTML(c: Career): string {
  const last = Math.max(0, ...c.awards.map((a) => a.season));
  const recent = c.awards.filter((a) => a.season === last && a.level === c.level);
  const mine = c.awards.filter((a) => a.mine).slice(-8).reverse();
  let h = '';
  if (recent.length) {
    h += `<h3>第${last}季の表彰(${lgShort(c.level)})</h3><div class="card"><table class="results"><tbody>${recent.map((a) => `<tr><td>${a.kind}</td><td class="${a.mine ? 'w' : ''}">${esc(a.name)}</td><td class="muted small">${esc(a.team)}</td><td class="num small">${esc(a.text)}</td></tr>`).join('')}</tbody></table></div>`;
  }
  if (mine.length) {
    h += `<h3>自チームの受賞</h3><div class="card"><table class="results"><tbody>${mine.map((a) => `<tr><td>第${a.season}季</td><td>${lgShort(a.level)} ${a.kind}</td><td class="w">${esc(a.name)}</td></tr>`).join('')}</tbody></table></div>`;
  }
  const hall = c.legends.slice(0, 12);
  h += `<h3>名選手(引退した選手)</h3>${hall.length
    ? `<div class="plist">${hall.map((l) => `<div class="pl"><div class="top"><span class="nm">${esc(l.name)}<span class="tag">${l.pos}</span><span class="tag">最高 ${lgShort(l.level)}</span>${l.mine ? '<span class="tag">自チーム</span>' : ''}</span><span class="small muted">第${l.lastSeason}季引退</span></div><div class="small">${esc(l.team)} / ${l.years}年 ${esc(l.line)}</div></div>`).join('')}</div>`
    : '<p class="small muted">まだ名選手はいません.ベテランが引退すると,ここに残ります.</p>'}`;
  return h;
}

export function renderRecords(c: Career): string {
  const r = c.rec, unlocked = Object.keys(c.ach).length;
  let h = '';
  if (c.ended) h += `<div class="card ending"><p class="result px" style="margin:0">殿堂入り!</p><p class="small" style="text-align:center;margin:4px 0 0">プロリーグで${r.titles[LEAGUES.length - 1]}回の優勝.草野球から頂点まで駆け上がった監督として,名を残しました.</p></div>`;
  h += `<h2>目標</h2><div class="card">${goalsHTML(c)}</div>
  <h2>チームの記録</h2><div class="card"><table class="results"><tbody>
  <tr><td>通算成績</td><td class="num">${r.total.w}勝 ${r.total.l}敗 ${r.total.d}分</td></tr>
  <tr><td>最長連勝</td><td class="num">${r.bestStreak}連勝(いま ${r.streak})</td></tr>
  <tr><td>シーズン最多勝</td><td class="num">${r.bestWins}勝${r.bestSeason ? `(第${r.bestSeason}季)` : ''}</td></tr>
  <tr><td>優勝回数</td><td class="num">${LEAGUES.map((_, i) => `${lgShort(i)} ${r.titles[i]}`).join(' / ')}</td></tr>
  <tr><td>プロの連覇</td><td class="num">${r.proStreak}</td></tr></tbody></table></div>
  <h2>ライバル</h2>${rivalHTML(c)}
  <h2>名選手</h2>${starsHTML(c)}
  <h2>実績 <span class="small muted">${unlocked}/${ACHIEVEMENTS.length}</span></h2><div class="achs">${ACHIEVEMENTS.map((a) => {
    const s = c.ach[a.id];
    return `<div class="ach ${s !== undefined ? 'on' : ''}"><b>${s !== undefined ? '★ ' : ''}${esc(a.name)}</b><span class="small">${esc(a.desc)}</span>${s !== undefined ? `<span class="small muted">第${s}季</span>` : ''}</div>`;
  }).join('')}</div>`;
  return h;
}

