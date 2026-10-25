import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BASE_GAIN, MENUS, doTraining, type MenuKey } from '../src/growth/training';
import { LEAGUES, ROSTER_MAX, gamesPerSeason } from '../src/data/constants';
import {
  canStartSeason, newCareer, newSeason, pickDraft, playWeek, releasePlayer, userTeam,
} from '../src/league/season';
import { makeSchedule } from '../src/league/schedule';
import { isLineupValid, teamAttrs } from '../src/league/team';
import { migrate } from '../src/save';
import { adviseTraining, leagueAvgAttrs, projectGains } from '../src/growth/advisor';
import { ALL_KEYS } from '../src/data/constants';
import { resetRandom, seeded, setRandom } from '../src/util/random';
import type { Career } from '../src/types';

function playSeason(c: Career, menu: MenuKey = 'bat'): void {
  while (c.phase === 'season') playWeek(c, menu);
}

function prepareNextSeason(c: Career): void {
  while (!c.off!.draft.done) pickDraft(c, 0);
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
    expect(c.leagues[0].schedule.length).toBe(gamesPerSeason(0));
    playSeason(c);
    expect(c.phase).toBe('off');
    expect(c.results.length).toBe(gamesPerSeason(0));
    for (const lg of c.leagues) {
      for (const id of lg.teamIds) {
        const s = lg.stand[id];
        expect(s.w + s.l + s.d).toBe(gamesPerSeason(lg.level));
      }
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
      expect(c.leagues[c.level].schedule.length).toBe(gamesPerSeason(c.level));
      c.leagues.forEach((lg, i) => expect(lg.teamIds.length).toBe(LEAGUES[i].teams));
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

describe('世界の進行', () => {
  beforeEach(() => setRandom(seeded(21)));
  afterEach(() => resetRandom());

  it('全リーグが毎シーズン進み,選手の重複や人数の破綻がない', () => {
    const c = newCareer('テスト');
    for (let s = 0; s < 8; s++) {
      playSeason(c, 'mix');
      // どのリーグも全試合を消化し,優勝が記録される
      for (const lg of c.leagues) expect(lg.week).toBe(lg.schedule.length);
      expect(c.champs.length).toBe((s + 1) * LEAGUES.length);
      prepareNextSeason(c);
      const seen = new Set<number>();
      for (const t of c.teams) {
        expect(t.players.length).toBeLessThanOrEqual(ROSTER_MAX);
        expect(isLineupValid(t)).toBe(true);
        for (const p of t.players) { expect(seen.has(p.id)).toBe(false); seen.add(p.id); }
      }
      for (const p of c.fa) expect(seen.has(p.id)).toBe(false);
      expect(c.fa.length).toBeLessThanOrEqual(40);
    }
  });

  it('昇格したチームは上のリーグに移り,各リーグのチーム数は変わらない', () => {
    const c = newCareer('テスト');
    playSeason(c, 'mix');
    const o = c.off!;
    const before = Object.fromEntries(c.leagues.flatMap((lg) => lg.teamIds.map((id) => [id, lg.level])));
    for (const id of Object.keys(o.next).map(Number)) expect(Math.abs(o.next[id] - before[id])).toBeLessThanOrEqual(1);
    prepareNextSeason(c);
    for (const id of Object.keys(o.next).map(Number)) {
      expect(c.leagues.find((lg) => lg.teamIds.includes(id))!.level).toBe(o.next[id]);
    }
  });

  it('選手の成績が通算に積み上がる', () => {
    const c = newCareer('テスト');
    playSeason(c, 'bat');
    const u = userTeam(c);
    const games = u.players.reduce((n, p) => n + p.stats.g, 0);
    expect(games).toBeGreaterThan(0);
    prepareNextSeason(c);
    const withLines = userTeam(c).players.filter((p) => p.seasons.length > 0);
    expect(withLines.length).toBeGreaterThan(0);
    // 新シーズンの成績は 0 から始まる
    for (const p of userTeam(c).players) expect(p.stats.g).toBe(0);
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

  it('v3 のデータから全リーグの世界を作って続きを遊べる', () => {
    const c = newCareer('テスト');
    // v3 の形(リーグ 1 つ分の日程と順位をトップに持つ)に戻す
    const lg = c.leagues[0];
    const old = JSON.parse(JSON.stringify({ ...c, schedule: lg.schedule, stand: lg.stand, teams: c.teams.filter((t) => lg.teamIds.includes(t.id)) })) as Record<string, unknown>;
    old.version = 3;
    delete old.leagues; delete old.fa; delete old.champs;
    for (const t of old.teams as { players: Record<string, unknown>[] }[]) for (const p of t.players) delete p.seasons;
    const m = migrate(old);
    expect(m).not.toBeNull();
    expect(m!.leagues.length).toBe(LEAGUES.length);
    m!.leagues.forEach((l, i) => expect(l.teamIds.length).toBe(LEAGUES[i].teams));
    playSeason(m!);
    expect(m!.phase).toBe('off');
  });

  it('知らないバージョンは読み込まない', () => {
    expect(migrate({ version: 99 })).toBeNull();
    expect(migrate(null)).toBeNull();
  });
});

describe('練習のおすすめ', () => {
  beforeEach(() => setRandom(seeded(5)));
  afterEach(() => resetRandom());

  it('見込みは重点の能力が最も高く,どの練習でも他の能力も伸びる', () => {
    const c = newCareer('テスト');
    const t = userTeam(c);
    const bat = projectGains(t, 'bat', 5, 1);
    expect(bat.meet).toBeGreaterThan(bat.speed);
    expect(bat.speed).toBeGreaterThan(0);
    expect(bat.velo).toBeGreaterThan(0);
  });

  it('おすすめは全メニューの中から選ばれ,弱点の分析がそろう', () => {
    const c = newCareer('テスト');
    const adv = adviseTraining(userTeam(c), leagueAvgAttrs(c), 10, 1);
    expect(Object.keys(MENUS)).toContain(adv.best);
    expect(adv.reason.length).toBeGreaterThan(0);
    for (const k of ALL_KEYS) expect(Number.isFinite(adv.gap[k])).toBe(true);
  });

  it('疲れが溜まっていると休養をすすめる', () => {
    const c = newCareer('テスト');
    const t = userTeam(c);
    for (const p of t.players) { p.fatigue = 90; p.cond = 0; }
    const adv = adviseTraining(t, leagueAvgAttrs(c), 10, 1);
    expect(adv.best).toBe('rest');
  });

  it('見込みどおりに伸びる(平均的に)', () => {
    let exp = 0, got = 0;
    for (let i = 0; i < 20; i++) {
      const c = newCareer('テスト');
      const t = userTeam(c);
      const before = teamAttrs(t);
      exp += projectGains(t, 'mix', 5, 1).meet;
      for (let w = 0; w < 5; w++) doTraining(t, 'mix');
      got += teamAttrs(t).meet - before.meet;
    }
    expect(Math.abs(got - exp) / exp).toBeLessThan(0.25);
  });
});
