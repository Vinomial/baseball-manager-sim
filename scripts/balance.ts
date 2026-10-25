/**
 * バランス確認用スクリプト.
 *   npm run balance
 * リーグごとの打撃成績と,練習メニュー別の成長量を表示する.
 */
import { LEAGUES } from '../src/data/constants';
import { newGame, stepToEnd } from '../src/engine/game';
import { MENUS, type MenuKey } from '../src/growth/training';
import { advise } from '../src/league/advice';
import { leagueTeams } from '../src/league/schedule';
import { newCareer, newSeason, pickDraft, playWeek, releasePlayer, signFreeAgent, userRosterMax, userTeam } from '../src/league/season';
import { faVerdict } from '../src/league/world';
import { autoLineup, autoPitchers, genTeam, ovr } from '../src/league/team';
import { futureValue, keysOf } from '../src/growth/player';
import type { Career } from '../src/types';

/** 1リーグあたり,チームの組を TEAMS 通り作って,それぞれ GAMES 試合する */
const TEAMS = 12, GAMES = 150, N = TEAMS * GAMES;

console.log('== リーグ別の打撃成績(同じ強さのチーム同士) ==');
for (let lv = 0; lv < LEAGUES.length; lv++) {
  const c = newCareer('dummy');
  let runs = 0, pa = 0, ab = 0, h = 0, hr = 0, so = 0, bb = 0, extra = 0;
  for (let t = 0; t < TEAMS; t++) {
    const a = genTeam(c, 'A', LEAGUES[lv].base, 20 + lv * 12);
    const b = genTeam(c, 'B', LEAGUES[lv].base, 20 + lv * 12);
    for (let i = 0; i < GAMES; i++) {
      const g = newGame(a, b, false);
      stepToEnd(g);
      runs += g.home.runs + g.away.runs;
      if (g.inning > 9) extra++;
      for (const p of [...a.players, ...b.players]) p.fatigue = 0;
    }
    for (const p of [...a.players, ...b.players]) {
      pa += p.stats.pa; ab += p.stats.ab; h += p.stats.h; hr += p.stats.hr; so += p.stats.so; bb += p.stats.bb;
    }
  }
  console.log(
    `${LEAGUES[lv].name.padEnd(6, ' ')} 得点/試合 ${(runs / N).toFixed(2)}  打率 ${(h / ab).toFixed(3)}  ` +
    `本塁打/試合 ${((hr / N)).toFixed(2)}  三振率 ${(so / pa * 100).toFixed(1)}%  四球率 ${(bb / pa * 100).toFixed(1)}%  延長 ${(extra / N * 100).toFixed(1)}%`,
  );
}

console.log('\n== 練習メニューを1シーズン続けたときの成長(プレイヤーチームの平均) ==');
for (const menu of Object.keys(MENUS) as MenuKey[]) {
  const c: Career = newCareer('dummy');
  const u = userTeam(c);
  const snapshot = () => u.players.map((p) => keysOf(p).reduce((s, k) => s + p[k], 0) / keysOf(p).length);
  const before = snapshot();
  while (c.phase === 'season') playWeek(c, menu);
  const after = snapshot();
  const avg = after.reduce((s, v, i) => s + v - before[i], 0) / after.length;
  console.log(`${MENUS[menu].name.padEnd(5, ' ')} 平均 ${avg >= 0 ? '+' : ''}${avg.toFixed(2)}  順位 ${c.off?.rank}位`);
}

/** おすすめどおりにドラフトと自由契約を進める簡単な自動プレイ */
function autoOffseason(c: Career): void {
  const u = userTeam(c);
  while (!c.off!.draft.done) {
    const d = c.off!.draft;
    const adv = advise(u, d.pool);
    const i = d.pool.findIndex((p) => adv.get(p.id)?.star);
    pickDraft(c, i >= 0 ? i : 0);
  }
  const cands = advise(u, c.fa.filter((p) => faVerdict(c, p) === 'ok'));
  for (const id of [...cands.entries()].filter(([, a]) => a.star).map(([id]) => id)) {
    if (u.players.length < userRosterMax(c)) signFreeAgent(c, id);
  }
  const core = new Set<number>([...u.lineup.map((e) => e.pid), ...u.pitchers.slice(0, 5)]);
  while (u.players.length > userRosterMax(c)) {
    const rest = u.players.filter((p) => !core.has(p.id)).sort((a, b) => futureValue(a) - futureValue(b));
    if (!rest.length || releasePlayer(c, rest[0].id)) break;
  }
  autoLineup(u);
  autoPitchers(u);
  newSeason(c);
}

const SEASONS = 30;
console.log(`\n== おすすめどおりに${SEASONS}シーズン進めたときの歩み(3回の平均) ==`);
for (const menu of ['mix', 'bat'] as MenuKey[]) {
  const R = 3;
  const lv = Array(SEASONS).fill(0), rk = Array(SEASONS).fill(0), my = Array(SEASONS).fill(0);
  const lgOvr = LEAGUES.map(() => Array(SEASONS).fill(0));
  let titles = 0, protitles = 0;
  for (let r = 0; r < R; r++) {
    const c = newCareer('dummy');
    for (let s = 0; s < SEASONS; s++) {
      while (c.phase === 'season') playWeek(c, menu);
      lv[s] += c.off!.from / R; rk[s] += c.off!.rank / R; my[s] += c.hist[c.hist.length - 1].ovr / R;
      LEAGUES.forEach((_, l) => { lgOvr[l][s] += leagueTeams(c, l).reduce((a, t) => a + ovr(t), 0) / leagueTeams(c, l).length / R; });
      if (c.off!.playoff.includes('優勝')) { titles++; if (c.off!.from === 3) protitles++; }
      autoOffseason(c);
    }
  }
  const row = (a: number[], f = 1) => a.map((v) => v.toFixed(f)).join(' ');
  console.log(`${MENUS[menu].name}: リーグ ${row(lv)}`);
  console.log(`       順位   ${row(rk)}`);
  console.log(`       自軍   ${row(my, 0)}`);
  LEAGUES.forEach((L, l) => console.log(`       ${L.name.slice(0, 2)}平均 ${row(lgOvr[l], 0)}`));
  console.log(`       優勝 ${titles}回(プロで ${protitles}回) / ${R * SEASONS}シーズン`);
}
