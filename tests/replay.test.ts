import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newGame, stepToEnd } from '../src/engine/game';
import { newCareer } from '../src/league/season';
import { buildFrames } from '../src/ui/replay';
import { resetRandom, seeded, setRandom } from '../src/util/random';

describe('試合の再生', () => {
  beforeEach(() => setRandom(seeded(9)));
  afterEach(() => resetRandom());

  it('再生用の場面は最初から最後まで矛盾なくつながる', () => {
    const c = newCareer('テスト');
    for (let i = 0; i < 30; i++) {
      const g = newGame(c.teams[0], c.teams[1], true);
      stepToEnd(g);
      const f = buildFrames(g);
      expect(f[0].kind).toBe('start');
      const last = f[f.length - 1];
      expect(last.kind).toBe('end');
      expect(last.a).toBe(g.away.runs);
      expect(last.h).toBe(g.home.runs);
      let a = 0, h = 0;
      for (const x of f) {
        expect(x.outs).toBeGreaterThanOrEqual(0);
        expect(x.outs).toBeLessThanOrEqual(3);
        expect(x.a).toBeGreaterThanOrEqual(a);
        expect(x.h).toBeGreaterThanOrEqual(h);
        a = x.a; h = x.h;
        // 3 アウトの場面では走者はいない
        if (x.outs >= 3) expect(x.bases.join('')).toBe('');
      }
    }
  });
});
