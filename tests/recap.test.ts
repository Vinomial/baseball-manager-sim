import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newGame, stepToEnd } from '../src/engine/game';
import { boxScore, fmtIP, recap } from '../src/engine/recap';
import { newCareer } from '../src/league/season';
import { resetRandom, seeded, setRandom } from '../src/util/random';

describe('戦評とボックススコア', () => {
  beforeEach(() => setRandom(seeded(3)));
  afterEach(() => resetRandom());

  it('投球回の表記', () => {
    expect(fmtIP(0)).toBe('0回');
    expect(fmtIP(19)).toBe('6回1/3');
    expect(fmtIP(27)).toBe('9回');
  });

  it('ボックススコアの合計が試合結果と一致する', () => {
    const c = newCareer('テスト');
    for (let i = 0; i < 40; i++) {
      const g = newGame(c.teams[0], c.teams[1], true);
      stepToEnd(g);
      for (const s of [g.home, g.away]) {
        const b = boxScore(g, s);
        const other = s === g.home ? g.away : g.home;
        expect(b.bat.reduce((n, x) => n + x.h, 0)).toBe(s.hits);
        // 相手投手が許した失点の合計 = 自チームの得点
        expect(boxScore(g, other).pit.reduce((n, x) => n + x.r, 0)).toBe(s.runs);
        expect(b.pit.reduce((n, x) => n + x.outs, 0)).toBeGreaterThan(0);
      }
    }
  });

  it('戦評は必ず作れて,勝敗の見出しが付く', () => {
    const c = newCareer('テスト');
    for (let i = 0; i < 60; i++) {
      const g = newGame(c.teams[0], c.teams[1], true);
      stepToEnd(g);
      const r = recap(g);
      expect(r.headline.length).toBeGreaterThan(0);
      if (g.home.runs !== g.away.runs) {
        expect(r.mvp).not.toBeNull();
        expect(r.lines.length).toBeGreaterThan(0);
      }
      expect(r.lines.join('')).not.toMatch(/undefined|NaN/);
    }
  });
});
