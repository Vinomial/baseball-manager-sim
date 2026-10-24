/**
 * バランス確認用スクリプト.
 *   npm run balance
 * リーグごとの打撃成績と,練習メニュー別の成長量を表示する.
 */
import { LEAGUES } from '../src/data/constants';
import { newGame, stepToEnd } from '../src/engine/game';
import { MENUS, type MenuKey } from '../src/growth/training';
import { finalizeWeek, newCareer, startWeek, userTeam } from '../src/league/season';
import { genTeam } from '../src/league/team';
import { keysOf } from '../src/growth/player';
import type { Career } from '../src/types';

const N = 500;

console.log('== リーグ別の打撃成績(同じ強さのチーム同士) ==');
for (let lv = 0; lv < LEAGUES.length; lv++) {
  const c = newCareer('dummy');
  const a = genTeam(c, 'A', LEAGUES[lv].base, 20 + lv * 12);
  const b = genTeam(c, 'B', LEAGUES[lv].base, 20 + lv * 12);
  let runs = 0, pa = 0, ab = 0, h = 0, hr = 0, so = 0, bb = 0, extra = 0;
  for (const p of [...a.players, ...b.players]) p.stats = { ...p.stats, pa: 0, ab: 0, h: 0, hr: 0, so: 0, bb: 0 };
  for (let i = 0; i < N; i++) {
    const g = newGame(a, b, false);
    stepToEnd(g);
    runs += g.home.runs + g.away.runs;
    if (g.inning > 9) extra++;
    for (const p of [...a.players, ...b.players]) p.fatigue = 0;
  }
  for (const p of [...a.players, ...b.players]) {
    pa += p.stats.pa; ab += p.stats.ab; h += p.stats.h; hr += p.stats.hr; so += p.stats.so; bb += p.stats.bb;
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
  while (c.phase === 'season') {
    const { game } = startWeek(c, menu);
    stepToEnd(game);
    finalizeWeek(c, game);
  }
  const after = snapshot();
  const avg = after.reduce((s, v, i) => s + v - before[i], 0) / after.length;
  console.log(`${MENUS[menu].name.padEnd(5, ' ')} 平均 ${avg >= 0 ? '+' : ''}${avg.toFixed(2)}  順位 ${c.off?.rank}位`);
}
