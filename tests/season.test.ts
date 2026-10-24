import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { stepToEnd } from '../src/engine/game';
import { MENUS, type MenuKey } from '../src/growth/training';
import {
  canStartSeason, finalizeWeek, newCareer, newSeason, pickDraft, releasePlayer, startWeek, userTeam,
} from '../src/league/season';
import { isLineupValid } from '../src/league/team';
import { ROSTER_MAX, WEEKS_PER_SEASON } from '../src/data/constants';
import { resetRandom, seeded, setRandom } from '../src/util/random';
import type { Career } from '../src/types';

function playSeason(c: Career, menu: MenuKey = 'bat'): void {
  while (c.phase === 'season') {
    const { game } = startWeek(c, menu);
    stepToEnd(game);
    finalizeWeek(c, game);
  }
}

function prepareNextSeason(c: Career): void {
  pickDraft(c, 0);
  const u = userTeam(c);
  while (u.players.length > ROSTER_MAX) {
    const p = u.players.find((x) => x.role === '野手' && !u.lineup.some((e) => e.pid === x.id)) ?? u.players[0];
    releasePlayer(c, p.id);
  }
  expect(canStartSeason(c)).toBe(true);
  newSeason(c);
}

describe('シーズン進行', () => {
  beforeEach(() => setRandom(seeded(7)));
  afterEach(() => resetRandom());

  it('1シーズンは10週で,全チームが10試合ずつ戦う', () => {
    const c = newCareer('テスト');
    expect(c.schedule.length).toBe(WEEKS_PER_SEASON);
    playSeason(c);
    expect(c.phase).toBe('off');
    for (const t of c.teams) {
      const s = c.stand[t.id];
      expect(s.w + s.l + s.d).toBe(WEEKS_PER_SEASON);
    }
  });

  it('複数シーズン続けてもオーダーが壊れない', () => {
    const c = newCareer('テスト');
    const menus = Object.keys(MENUS) as MenuKey[];
    for (let s = 0; s < 5; s++) {
      playSeason(c, menus[s % menus.length]);
      prepareNextSeason(c);
      expect(isLineupValid(userTeam(c))).toBe(true);
      expect(c.season).toBe(s + 2);
      expect(c.level).toBeGreaterThanOrEqual(0);
      expect(c.level).toBeLessThanOrEqual(3);
    }
  });

  it('セーブデータ(JSON)にして戻しても続きを遊べる', () => {
    const c = newCareer('テスト');
    const { game } = startWeek(c, 'bat');
    stepToEnd(game);
    finalizeWeek(c, game);
    const restored = JSON.parse(JSON.stringify(c)) as Career;
    playSeason(restored);
    expect(restored.phase).toBe('off');
  });

  it('練習を続けると能力が伸びる', () => {
    const c = newCareer('テスト');
    const u = userTeam(c);
    const sum = () => u.players.filter((p) => p.role === '野手').reduce((s, p) => s + p.meet + p.power, 0);
    const before = sum();
    playSeason(c, 'bat');
    expect(sum()).toBeGreaterThan(before);
  });
});
