import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BASE_GAIN, MENUS, doTraining, type MenuKey } from '../src/growth/training';
import { LEAGUES, ROSTER_MAX, gamesPerSeason } from '../src/data/constants';
import {
  canStartSeason, newCareer, newSeason, pickDraft, playWeek, releasePlayer, userTeam,
} from '../src/league/season';
import { makeSchedule } from '../src/league/schedule';
import { isLineupValid, teamAttrs } from '../src/league/team';
import { migrate } from '../src/save';
import { ALL_KEYS } from '../src/data/constants';
import { resetRandom, seeded, setRandom } from '../src/util/random';
import type { Career } from '../src/types';

function playSeason(c: Career, menu: MenuKey = 'bat'): void {
  while (c.phase === 'season') playWeek(c, menu);
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

describe('日程', () => {
  it('リーグが上がるほど試合数が増える', () => {
    const games = LEAGUES.map((_, i) => gamesPerSeason(i));
    for (let i = 1; i < games.length; i++) expect(games[i]).toBeGreaterThan(games[i - 1]);
  });

  it('どのリーグでも全チームが同じ数の試合をする', () => {
    LEAGUES.forEach((lg, level) => {
      const ids = Array.from({ length: lg.teams }, (_, i) => i + 1);
      const sch = makeSchedule(ids, lg.rounds);
      expect(sch.length).toBe(gamesPerSeason(level));
      const n: Record<number, number> = {};
      for (const week of sch) {
        expect(week.length).toBe(lg.teams / 2);
        for (const [h, a] of week) { n[h] = (n[h] ?? 0) + 1; n[a] = (n[a] ?? 0) + 1; }
      }
      for (const id of ids) expect(n[id]).toBe(sch.length);
    });
  });
});

describe('シーズン進行', () => {
  beforeEach(() => setRandom(seeded(7)));
  afterEach(() => resetRandom());

  it('1シーズンの試合数はリーグで決まり,全チームが同じ数だけ戦う', () => {
    const c = newCareer('テスト');
    expect(c.schedule.length).toBe(gamesPerSeason(0));
    playSeason(c);
    expect(c.phase).toBe('off');
    expect(c.results.length).toBe(gamesPerSeason(0));
    for (const t of c.teams) {
      const s = c.stand[t.id];
      expect(s.w + s.l + s.d).toBe(gamesPerSeason(0));
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
      expect(c.schedule.length).toBe(gamesPerSeason(c.level));
      expect(c.teams.length).toBe(LEAGUES[c.level].teams);
    }
  });

  it('セーブデータ(JSON)にして戻しても続きを遊べる', () => {
    const c = newCareer('テスト');
    playWeek(c, 'bat');
    const restored = JSON.parse(JSON.stringify(c)) as Career;
    playSeason(restored);
    expect(restored.phase).toBe('off');
  });

  it('毎週,チーム能力の履歴が残る', () => {
    const c = newCareer('テスト');
    expect(c.hist.length).toBe(1);
    playWeek(c, 'bat');
    expect(c.hist.length).toBe(2);
    expect(c.hist[1].week).toBe(1);
  });
});

describe('練習', () => {
  beforeEach(() => setRandom(seeded(11)));
  afterEach(() => resetRandom());

  it('重点の能力が最も伸び,それ以外も伸びる', () => {
    const gain: Record<string, number> = {};
    const N = 30;
    for (let i = 0; i < N; i++) {
      const c = newCareer('テスト');
      const t = userTeam(c);
      for (const p of t.players) p.fatigue = 0;
      const before = teamAttrs(t);
      for (let w = 0; w < 5; w++) doTraining(t, 'bat');
      const after = teamAttrs(t);
      for (const k of ALL_KEYS) gain[k] = (gain[k] ?? 0) + (after[k] - before[k]) / N;
    }
    expect(gain.meet).toBeGreaterThan(gain.speed);
    expect(gain.power).toBeGreaterThan(gain.field);
    // 重点以外も伸びる
    for (const k of ['speed', 'field', 'velo', 'ctrl', 'stam']) expect(gain[k]).toBeGreaterThan(0);
  });

  it('どの練習でも重点でない能力は基本の倍率で伸びる', () => {
    for (const m of Object.values(MENUS)) {
      if (m.rest) continue;
      expect(m.base ?? BASE_GAIN).toBeGreaterThan(0);
    }
  });
});

describe('セーブデータの移行', () => {
  it('v1 のデータに履歴と結果の欄を足す', () => {
    const c = newCareer('テスト');
    const old = JSON.parse(JSON.stringify(c)) as Record<string, unknown>;
    old.version = 1;
    delete old.hist;
    delete old.results;
    const m = migrate(old);
    expect(m).not.toBeNull();
    expect(m!.hist).toEqual([]);
    expect(m!.results).toEqual([]);
  });

  it('v2 のデータに投手の被安打と与四球を足す', () => {
    const c = newCareer('テスト');
    const old = JSON.parse(JSON.stringify(c)) as Record<string, unknown>;
    old.version = 2;
    for (const t of old.teams as { players: { stats: Record<string, number> }[] }[]) {
      for (const p of t.players) { delete p.stats.ha; delete p.stats.bba; }
    }
    const m = migrate(old);
    expect(m).not.toBeNull();
    expect(m!.teams[0].players[0].stats.ha).toBe(0);
    expect(m!.teams[0].players[0].stats.bba).toBe(0);
  });

  it('知らないバージョンは読み込まない', () => {
    expect(migrate({ version: 99 })).toBeNull();
    expect(migrate(null)).toBeNull();
  });
});
