/**
 * バランス確認用スクリプト.
 *   npm run balance
 * リーグごとの打撃成績と,練習メニュー別の成長量を表示する.
 */
import { LEAGUES, ROSTER_MAX } from '../src/data/constants';
import { newGame, stepToEnd } from '../src/engine/game';
import { MENUS, type MenuKey } from '../src/growth/training';
import { newCareer, newSeason, pickDraft, playWeek, releasePlayer, userTeam } from '../src/league/season';
import { genTeam } from '../src/league/team';
import { keysOf } from '../src/growth/player';
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

console.log('\n== 同じ練習を続けた12シーズンの歩み(リーグ/順位。3回の平均) ==');
for (const menu of ['mix', 'bat', 'pitch'] as MenuKey[]) {
  const levels: number[] = Array(12).fill(0), ranks: number[] = Array(12).fill(0), ovrs: number[] = Array(12).fill(0);
  const R = 3;
  for (let r = 0; r < R; r++) {
    const c = newCareer('dummy');
    for (let s = 0; s < 12; s++) {
      while (c.phase === 'season') playWeek(c, menu);
      levels[s] += c.off!.from / R; ranks[s] += c.off!.rank / R; ovrs[s] += c.hist[c.hist.length - 1].ovr / R;
      pickDraft(c, 0);
      const u = userTeam(c);
      while (u.players.length > ROSTER_MAX) {
        const p = u.players.find((x) => !u.lineup.some((e) => e.pid === x.id) && !u.pitchers.slice(0, 5).includes(x.id)) ?? u.players[0];
        if (releasePlayer(c, p.id)) break;
      }
      newSeason(c);
    }
  }
  console.log(`${MENUS[menu].name}: リーグ ${levels.map((v) => v.toFixed(1)).join(' ')}`);
  console.log(`       順位   ${ranks.map((v) => v.toFixed(1)).join(' ')}`);
  console.log(`       総合力 ${ovrs.map((v) => v.toFixed(0)).join(' ')}`);
}
