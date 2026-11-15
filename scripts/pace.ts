/**
 * ペースの物差し.上手なプレイヤーのボットで,各リーグに上がるまでと,最上位で優勝するまでのシーズン数を測る.
 *   npx tsx scripts/pace.ts [回数] [最大シーズン数] [難易度]
 */
import { LEAGUES } from '../src/data/constants';
import { newCareer } from '../src/league/season';
import { resetRandom, seeded, setRandom } from '../src/util/random';
import { runPace } from './bot';

const R = Number(process.argv[2] ?? 6), MAX = Number(process.argv[3] ?? 40);
const diff = (process.argv[4] ?? 'normal') as 'easy' | 'normal' | 'hard';
const tiers = LEAGUES.length;
const results: ReturnType<typeof runPace>[] = [];
const t0 = Date.now();
for (let r = 0; r < R; r++) {
  setRandom(seeded(1000 + r * 7919));
  const res = runPace(newCareer('ボット', diff), MAX, tiers);
  resetRandom();
  results.push(res);
  console.log(`#${r + 1} 到達 ${res.reach.map((x) => x ?? '-').join(' / ')}  最上位優勝 ${res.topTitle ?? '-'}${res.fired ? ' (解任)' : ''}`);
}
const med = (xs: number[]): string => {
  if (!xs.length) return '-';
  const s = [...xs].sort((a, b) => a - b);
  return String(s[Math.floor(s.length / 2)]);
};
console.log(`\n== ${R}回の中央値(${MAX}シーズンまで,難易度 ${diff}) ==`);
LEAGUES.forEach((L, i) => {
  const xs = results.map((r) => r.reach[i]).filter((x): x is number => x !== null);
  console.log(`${L.name.padEnd(8, ' ')} 到達 ${med(xs)}季目 (${xs.length}/${R}回到達)`);
});
const tt = results.map((r) => r.topTitle).filter((x): x is number => x !== null);
console.log(`最上位で優勝 ${med(tt)}季目 (${tt.length}/${R}回)  解任 ${results.filter((r) => r.fired).length}回  ${((Date.now() - t0) / 1000).toFixed(0)}秒`);
