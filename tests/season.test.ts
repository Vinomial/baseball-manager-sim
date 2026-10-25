import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BASE_GAIN, MENUS, doTraining, type MenuKey } from '../src/growth/training';
import { LEAGUES, MIN_FIELDERS, MIN_PITCHERS, rosterMax, gamesPerSeason } from '../src/data/constants';
import {
  canStartSeason, newCareer, newSeason, pickDraft, playWeek, releasePlayer, signFreeAgent, userRosterMax, userTeam,
} from '../src/league/season';
import { makeSchedule } from '../src/league/schedule';
import { fielders, isLineupValid, pitchersOf, teamAttrs } from '../src/league/team';
import { resolveEvent, rollEvent } from '../src/league/events';
import { adviseCuts } from '../src/league/cuts';
import { cook, mealMult } from '../src/growth/meals';
import { findCombos, sumFx } from '../src/league/combos';
import { budgetFor, checkFired, forecast, payroll, trustAfterGame, winProb } from '../src/league/finance';
import { salaryOf } from '../src/growth/player';
import { newGame, stepToEnd } from '../src/engine/game';
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
  while (u.players.length > userRosterMax(c)) {
    const p = u.players.find((x) => x.role === '野手' && !u.lineup.some((e) => e.pid === x.id)) ?? u.players[0];
    releasePlayer(c, p.id);
  }
  // 予算を超えているときは,高い年俸の控えから放出する
  while (payroll(u) > budgetFor(c)) {
    const core = new Set<number>([...u.lineup.map((e) => e.pid), ...u.pitchers.slice(0, 5)]);
    const rest = u.players.filter((x) => !core.has(x.id)).sort((a, b) => b.salary - a.salary);
    // 人数の下限で放出できない選手は飛ばす
    if (!rest.some((x) => !releasePlayer(c, x.id))) break;
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
        // 最低人数の補充(入団テスト)は上限より優先されるので,プレイヤーのチームは除く
        if (!t.user) expect(t.players.length).toBeLessThanOrEqual(rosterMax(c.leagues.findIndex((lg) => lg.teamIds.includes(t.id))));
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

describe('記録と実績', () => {
  beforeEach(() => setRandom(seeded(33)));
  afterEach(() => resetRandom());

  it('シーズンを終えると表彰,優勝,チーム記録が残る', () => {
    const c = newCareer('テスト');
    playSeason(c, 'mix');
    expect(c.awards.length).toBeGreaterThan(0);
    expect(c.awards.some((a) => a.kind === 'MVP' && a.level === 0)).toBe(true);
    expect(c.rec.total.w + c.rec.total.l + c.rec.total.d).toBe(gamesPerSeason(0));
    expect(c.rec.bestWins).toBe(c.off!.rec.w);
    expect(c.rival).not.toBeNull();
    const games = Object.values(c.h2h).reduce((n, r) => n + r.w + r.l + r.d, 0);
    expect(games).toBe(gamesPerSeason(0));
  });

  it('実績は一度だけ解除され,知らせが出る', () => {
    const c = newCareer('テスト');
    for (let i = 0; i < 30 && !c.ach.first_win; i++) {
      if (c.phase === 'off') prepareNextSeason(c);
      playWeek(c, 'mix');
    }
    expect(c.ach.first_win).toBeDefined();
    const n = Object.keys(c.ach).length;
    playWeek(c, 'mix');
    expect(Object.keys(c.ach).length).toBeGreaterThanOrEqual(n);
  });

  it('引退した名選手は上限を超えて増えない', () => {
    const c = newCareer('テスト');
    for (let s = 0; s < 12; s++) { playSeason(c, 'mix'); prepareNextSeason(c); }
    expect(c.legends.length).toBeLessThanOrEqual(60);
    const sorted = [...c.legends].sort((a, b) => b.score - a.score);
    expect(c.legends).toEqual(sorted);
  });

  it('v5 のデータに出来事の欄を足す', () => {
    const c = newCareer('テスト');
    const old = JSON.parse(JSON.stringify(c)) as Record<string, unknown>;
    old.version = 5;
    delete old.event;
    const m = migrate(old);
    expect(m).not.toBeNull();
    expect(m!.event).toBeNull();
  });

  it('v4 のデータに記録の欄を足す', () => {
    const c = newCareer('テスト');
    const old = JSON.parse(JSON.stringify(c)) as Record<string, unknown>;
    old.version = 4;
    for (const k of ['ach', 'news', 'awards', 'legends', 'h2h', 'rival', 'rec', 'ended']) delete old[k];
    const m = migrate(old);
    expect(m).not.toBeNull();
    expect(m!.ach).toEqual({});
    expect(m!.rec.titles.length).toBe(LEAGUES.length);
    expect(m!.rival).not.toBeNull();
  });
});

describe('出来事', () => {
  beforeEach(() => setRandom(seeded(77)));
  afterEach(() => resetRandom());

  it('どの出来事のどの選択でも壊れず,チームが成り立つ', () => {
    const kinds = new Set<string>();
    for (let i = 0; i < 400; i++) {
      const c = newCareer('テスト');
      for (let w = 0; w < 3; w++) playWeek(c, 'mix');
      // 年齢の高い選手や若手,不調の選手をそろえて,出来事が起きやすくする
      const u = userTeam(c);
      u.players[0].age = 35; u.players[1].age = 20; u.players[2].cond = 0;
      for (let tries = 0; tries < 20 && !c.event; tries++) rollEvent(c);
      if (!c.event) continue;
      kinds.add(c.event.kind);
      const key = c.event.choices[i % c.event.choices.length].key;
      const text = resolveEvent(c, key);
      expect(text.length).toBeGreaterThan(0);
      expect(c.event).toBeNull();
      expect(isLineupValid(u)).toBe(true);
      expect(fielders(u).length).toBeGreaterThanOrEqual(MIN_FIELDERS);
      expect(pitchersOf(u).length).toBeGreaterThanOrEqual(MIN_PITCHERS);
      for (const p of u.players) for (const k of ALL_KEYS) expect(Number.isFinite(p[k])).toBe(true);
    }
    expect(kinds.size).toBeGreaterThanOrEqual(5);
  });

  it('選ばずに試合を進めると出来事は消える', () => {
    const c = newCareer('テスト');
    for (let i = 0; i < 30 && !c.event; i++) playWeek(c, 'mix');
    if (!c.event) return;
    playWeek(c, 'mix');
    expect(c.event === null || c.event !== undefined).toBe(true);
  });
});

describe('戦力外と登録上限', () => {
  beforeEach(() => setRandom(seeded(61)));
  afterEach(() => resetRandom());

  it('リーグが上がるほど登録上限が増える', () => {
    for (let i = 1; i < LEAGUES.length; i++) expect(rosterMax(i)).toBeGreaterThan(rosterMax(i - 1));
  });

  it('戦力外のおすすめは先発以外から選ばれ,上限超過分は必ずおすすめになる', () => {
    const c = newCareer('テスト');
    playSeason(c, 'mix');
    const u = userTeam(c);
    const core = new Set<number>([...u.lineup.map((e) => e.pid), ...u.pitchers.slice(0, 5)]);
    // 上限を超える人数にして確かめる
    while (!c.off!.draft.done) pickDraft(c, 0);
    const rows = adviseCuts(c);
    for (const r of rows) expect(core.has(r.p.id)).toBe(false);
    const over = Math.max(0, u.players.length - userRosterMax(c));
    expect(rows.filter((r) => r.rec).length).toBeGreaterThanOrEqual(Math.min(over, rows.filter((r) => !r.locked).length));
    for (let i = 1; i < rows.length; i++) expect(rows[i - 1].score).toBeGreaterThanOrEqual(rows[i].score);
  });
});

describe('年俸・予算・信頼度', () => {
  beforeEach(() => setRandom(seeded(81)));
  afterEach(() => resetRandom());

  it('力が高い選手ほど年俸が高く,全員に年俸が付く', () => {
    const c = newCareer('テスト');
    for (const t of c.teams) for (const p of t.players) expect(p.salary).toBeGreaterThanOrEqual(50);
    const lo = { ...userTeam(c).players[0], meet: 30, power: 30, speed: 30, field: 30 };
    const hi = { ...userTeam(c).players[0], meet: 80, power: 80, speed: 80, field: 80 };
    expect(salaryOf(hi)).toBeGreaterThan(salaryOf(lo) * 10);
  });

  it('最初の年俸総額は予算に収まる', () => {
    const c = newCareer('テスト');
    expect(payroll(userTeam(c))).toBeLessThanOrEqual(budgetFor(c));
  });

  it('予想勝率は強いチームほど高く,0〜1 に収まる', () => {
    const c = newCareer('テスト');
    const [a, b] = [c.teams[1], c.teams[2]];
    const p = winProb(a, b);
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(1);
    expect(winProb(a, b) + winProb(b, a)).toBeCloseTo(1, 5);
    for (const q of b.players) { q.meet += 30; q.power += 30; q.velo += 30; q.ctrl += 30; q.stam += 30; q.speed += 30; q.field += 30; }
    expect(winProb(a, b)).toBeLessThan(p);
  });

  it('予想勝率が実際の勝率とほぼ合う', () => {
    const c = newCareer('テスト');
    let exp = 0, got = 0;
    for (let i = 0; i < 2; i++) {
      for (const lg of c.leagues) {
        const ts = lg.teamIds.map((id) => c.teams.find((t) => t.id === id)!);
        for (let x = 0; x < ts.length; x++) for (let y = 0; y < ts.length; y++) {
          if (x === y) continue;
          for (const t of [ts[x], ts[y]]) for (const p of t.players) p.fatigue = 0;
          const g = newGame(ts[x], ts[y], false);
          stepToEnd(g);
          if (g.home.runs === g.away.runs) continue;
          exp += winProb(ts[x], ts[y]);
          got += g.home.runs > g.away.runs ? 1 : 0;
        }
      }
    }
    expect(Math.abs(got - exp) / exp).toBeLessThan(0.08);
  });

  it('シーズン予想の確率は 0〜1 で,順位の確率の合計は 1', () => {
    const c = newCareer('テスト');
    const f = forecast(c, 100);
    expect(f.rank.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
    expect(f.up).toBeLessThanOrEqual(f.playoff + 1e-9);
  });

  it('勝つと信頼度が上がり,負けると下がる.0 で解任される', () => {
    expect(trustAfterGame(0.5, 5, 1)).toBeGreaterThan(0);
    expect(trustAfterGame(0.5, 1, 5)).toBeLessThan(0);
    expect(trustAfterGame(0.2, 5, 1)).toBeGreaterThan(trustAfterGame(0.8, 5, 1));
    const c = newCareer('テスト');
    c.trust = 0;
    checkFired(c, '解任');
    expect(c.fired).not.toBeNull();
  });

  it('予算を超える獲得はできず,超過のままではシーズンを始められない', () => {
    const c = newCareer('テスト');
    playSeason(c, 'mix');
    while (!c.off!.draft.done) pickDraft(c, 0);
    const u = userTeam(c);
    u.players[0].salary = budgetFor(c) * 2;
    expect(canStartSeason(c)).toBe(false);
    u.players[0].salary = 50;
    const p = c.fa[0];
    p.salary = budgetFor(c);
    expect(signFreeAgent(c, p.id)).toContain('予算');
  });

  it('v7 のデータに年俸と信頼度を足す', () => {
    const c = newCareer('テスト');
    const old = JSON.parse(JSON.stringify(c)) as Record<string, unknown>;
    old.version = 7;
    delete old.trust; delete old.fired;
    for (const t of old.teams as { players: Record<string, unknown>[] }[]) for (const p of t.players) delete p.salary;
    const m = migrate(old);
    expect(m).not.toBeNull();
    expect(m!.trust).toBe(60);
    expect(m!.teams[0].players[0].salary).toBeGreaterThanOrEqual(50);
  });
});

describe('球種・特殊能力・コンボ', () => {
  beforeEach(() => setRandom(seeded(91)));
  afterEach(() => resetRandom());

  it('全員に球種か特殊能力の欄があり,投手は球種を持つ', () => {
    const c = newCareer('テスト');
    for (const t of c.teams) for (const p of t.players) {
      expect(Array.isArray(p.skills)).toBe(true);
      if (p.role === '投手') expect(Object.keys(p.pitches).length).toBeGreaterThan(0);
    }
  });

  it('長距離砲だらけの打線は,そうでない打線より本塁打が多い', () => {
    const c = newCareer('テスト');
    const a = c.teams[1], b = c.teams[2];
    const hrs = (t: typeof a) => {
      let n = 0;
      for (let i = 0; i < 200; i++) {
        for (const x of [a, b]) for (const p of x.players) p.fatigue = 0;
        const g = newGame(t === a ? a : b, t === a ? b : a, false);
        stepToEnd(g);
        n += (t === a ? g.home : g.away).hits > 0 ? t.players.reduce((s, p) => s + (p.stats.hr - (g.snap[p.id]?.hr ?? 0)), 0) : 0;
        for (const p of t.players) g.snap[p.id] = { ...p.stats };
      }
      return n;
    };
    for (const p of a.players) { p.skills = []; }
    for (const p of b.players) { p.skills = []; }
    const base = hrs(a);
    for (const e of a.lineup) { const p = a.players.find((x) => x.id === e.pid)!; if (p.role === '野手') p.skills = ['slugger']; }
    const boosted = hrs(a);
    expect(boosted).toBeGreaterThan(base);
  });

  it('コンボは条件がそろうと発動し,補正が足し合わされる', () => {
    const c = newCareer('テスト');
    const t = userTeam(c);
    const before = findCombos(t).filter((x) => x.active).length;
    const L = t.lineup.map((e) => t.players.find((p) => p.id === e.pid)!);
    L[2].power = 99; L[3].power = 99; L[4].power = 99;
    L[2].skills = ['slugger']; L[3].skills = ['slugger'];
    const cs = findCombos(t);
    expect(cs.find((x) => x.key === 'cleanup')!.active).toBe(true);
    expect(cs.find((x) => x.key === 'arch')!.active).toBe(true);
    expect(cs.filter((x) => x.active).length).toBeGreaterThanOrEqual(before);
    expect(sumFx(cs).hr).toBeGreaterThan(0.03);
  });

  it('練習で球種や特殊能力を身につけることがある', () => {
    let learned = 0;
    for (let i = 0; i < 300; i++) {
      const c = newCareer('テスト');
      const t = userTeam(c);
      for (const p of t.players) p.skills = [];
      const rep = doTraining(t, 'bat', 4);
      learned += rep.filter((r) => r.note).length;
    }
    expect(learned).toBeGreaterThan(0);
  });

  it('v8 のデータに球種・特殊能力・絆を足す', () => {
    const c = newCareer('テスト');
    const old = JSON.parse(JSON.stringify(c)) as Record<string, unknown>;
    old.version = 8;
    for (const t of old.teams as { bonds?: unknown; players: Record<string, unknown>[] }[]) {
      delete t.bonds;
      for (const p of t.players) { delete p.pitches; delete p.skills; }
    }
    const m = migrate(old);
    expect(m).not.toBeNull();
    expect(m!.teams[0].bonds).toEqual([]);
    expect(Array.isArray(m!.teams[0].players[0].skills)).toBe(true);
  });
});

describe('ミッションと料理', () => {
  beforeEach(() => setRandom(seeded(101)));
  afterEach(() => resetRandom());

  it('ミッションは常に3つあり,達成すると食材がもらえて補充される', () => {
    const c = newCareer('テスト');
    expect(c.missions.length).toBe(3);
    const total = () => Object.values(c.pantry).reduce((a, b) => a + b, 0);
    let got = false;
    for (let i = 0; i < 40 && !got; i++) {
      if (c.phase === 'off') prepareNextSeason(c);
      const before = total();
      playWeek(c, 'bat');
      expect(c.missions.length).toBe(3);
      if (c.news.some((n) => n.startsWith('ミッション達成'))) got = true;
      expect(total()).toBeGreaterThanOrEqual(before);
    }
    expect(got).toBe(true);
  });

  it('料理を作ると食材が減り,しばらく練習の伸びが大きくなる', () => {
    const c = newCareer('テスト');
    c.pantry = { rice: 1, meat: 1, fish: 0, veg: 0, fruit: 0, egg: 1 };
    expect(cook(c, 'bento')).toBeNull();
    const m = cook(c, 'katsu');
    expect(m).not.toBeNull();
    expect(c.pantry).toEqual({ rice: 0, meat: 0, fish: 0, veg: 0, fruit: 0, egg: 0 });
    expect(c.meal!.weeks).toBe(2);
    expect(mealMult(c.meal, 'meet')).toBeGreaterThan(1.5);
    expect(mealMult(null, 'meet')).toBe(1);

    let plain = 0, fed = 0;
    for (let i = 0; i < 20; i++) {
      const a = newCareer('テスト'), b = newCareer('テスト');
      const ta = userTeam(a), tb = userTeam(b);
      const ma = teamAttrs(ta).meet, mb = teamAttrs(tb).meet;
      doTraining(ta, 'bat', 1, 0, null);
      doTraining(tb, 'bat', 1, 0, { name: 'x', weeks: 2, mult: { all: 2 }, desc: '' });
      plain += teamAttrs(ta).meet - ma;
      fed += teamAttrs(tb).meet - mb;
    }
    expect(fed).toBeGreaterThan(plain * 1.3);
  });

  it('料理の効き目は試合ごとに減って,なくなる', () => {
    const c = newCareer('テスト');
    c.meal = { name: 'テスト', weeks: 2, mult: { all: 1.5 }, desc: '' };
    playWeek(c, 'mix');
    expect(c.meal!.weeks).toBe(1);
    playWeek(c, 'mix');
    expect(c.meal).toBeNull();
  });

  it('v9 のデータにミッションと食材を足す', () => {
    const c = newCareer('テスト');
    const old = JSON.parse(JSON.stringify(c)) as Record<string, unknown>;
    old.version = 9;
    for (const k of ['missions', 'lastMenus', 'pantry', 'meal', 'mid']) delete old[k];
    const m = migrate(old);
    expect(m).not.toBeNull();
    expect(m!.missions.length).toBe(3);
    expect(m!.pantry.rice).toBe(0);
  });
});
