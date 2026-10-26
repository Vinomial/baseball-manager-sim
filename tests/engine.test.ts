import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newGame, step, stepToEnd } from '../src/engine/game';
import { newCareer, teamById } from '../src/league/season';
import { resetRandom, seeded, setRandom } from '../src/util/random';

describe('試合エンジン', () => {
  beforeEach(() => setRandom(seeded(42)));
  afterEach(() => resetRandom());

  it('試合は必ず終わり,スコアは負にならない', () => {
    const c = newCareer('テスト');
    for (let i = 0; i < 200; i++) {
      const g = newGame(c.teams[1], c.teams[2], false);
      stepToEnd(g);
      expect(g.over).toBe(true);
      expect(g.home.runs).toBeGreaterThanOrEqual(0);
      expect(g.away.runs).toBeGreaterThanOrEqual(0);
      expect(g.inning).toBeLessThanOrEqual(12);
      // イニングごとの得点の合計は総得点と一致する
      expect(g.home.inn.reduce((a, b) => a + b, 0)).toBe(g.home.runs);
      expect(g.away.inn.reduce((a, b) => a + b, 0)).toBe(g.away.runs);
    }
  });

  it('9回以降,後攻がリードした時点で試合が終わる', () => {
    const c = newCareer('テスト');
    for (let i = 0; i < 200; i++) {
      const g = newGame(c.teams[1], c.teams[2], false);
      stepToEnd(g);
      if (g.home.runs > g.away.runs && g.half === 1) {
        // サヨナラなら最後のイニングで逆転しているはず
        expect(g.inning).toBeGreaterThanOrEqual(9);
      }
    }
  });

  it('1打席ずつ進めても壊れない', () => {
    const c = newCareer('テスト');
    const g = newGame(c.teams[0], c.teams[1], true);
    let n = 0;
    while (!g.over && n++ < 1000) {
      step(g);
      expect(g.outs).toBeLessThan(3);
    }
    expect(g.over).toBe(true);
    expect(g.log.length).toBeGreaterThan(0);
  });

  it('1試合の平均得点が現実的な範囲に収まる', () => {
    const c = newCareer('テスト');
    let runs = 0;
    const N = 300;
    for (let i = 0; i < N; i++) {
      const g = newGame(teamById(c, c.teams[1].id), teamById(c, c.teams[2].id), false);
      stepToEnd(g);
      runs += g.home.runs + g.away.runs;
    }
    const avg = runs / N;
    expect(avg).toBeGreaterThan(3);
    expect(avg).toBeLessThan(13);
  });
});
