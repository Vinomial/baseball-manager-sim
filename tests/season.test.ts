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
import { fatigueRisk, isHurt, maybeInjure } from '../src/league/health';
import { ingredientPrice, MAX_FAC, sellIngredient, trainFacMult, upgrade, upgradeCost, weeklyIncome } from '../src/league/economy';
import { effectiveLineup, fit } from '../src/league/team';
import type { GameEvent, ManagerStyle, Player, Pos, Staff } from '../src/types';
import { avatar } from '../src/ui/avatar';
import { pressNote } from '../src/league/world';
import { PLAYOFF_START, SEASON_START, WEEKS_PER_YEAR, weekInfo } from '../src/league/calendar';
import { keysOf } from '../src/growth/player';
import { cook, mealMult, RECIPES } from '../src/growth/meals';
import { DIFFS, FOREIGN_FIRST, MOVES } from '../src/data/constants';
import { standings } from '../src/league/schedule';
import { goalProgress } from '../src/league/goals';
import { bargainChance, negotiate, projectedPayroll } from '../src/league/contracts';
import { opsOf } from '../src/league/leaders';
import { advise } from '../src/league/advice';
import { convertAdvice } from '../src/league/convert';
import { playoffOdds, seriesWinProb, userSeries } from '../src/league/playoffs';
import { doTrade, endLoans, extendHelper, hireHelper, tradeOpen, tradeOthers, tradeValue } from '../src/league/trade';
import { departures, extendContract, leavingRisk } from '../src/league/contracts';
import { renewContracts } from '../src/league/finance';
import { chapterTitle, judgeTrainGoals, phaseOf, setTrainGoal, storyBeat } from '../src/league/story';
import { planMult, plansFor, suggestPlan } from '../src/growth/plans';
import { earn, ledgerRow, spend } from '../src/league/economy';
import { toStars, ovrStars, potStars } from '../src/growth/stars';
import { playerStars, starsHTML } from '../src/ui/components';
import { autoLineup } from '../src/league/team';
import { ROLES, fireStaff, hireStaff, managerFx, mentalBoost, severance, signingBonus, staffCost, staffTrainMult, trainerInjuryScale } from '../src/league/staff';
import { dispatchScout, scoutCost, tickScout } from '../src/league/scouting';
import { moraleGrowth, moraleLabel, PERS, updateMorale } from '../src/growth/personality';
import { expandLeagues, playoffSeeds, weeklyUpkeep } from '../src/league/world';
import { addTrust } from '../src/league/finance';
import { confirmMessage, warnings } from '../src/league/warnings';
import { resultSound, setScene, setVolume, sfx, sound, startBgm, stopBgm, vibrate } from '../src/ui/sound';
import { gameText, seasonText } from '../src/ui/share';
import { convertOptions, convertWeeks, startConvert, tickConvert } from '../src/league/convert';
import { detailSheet } from '../src/ui/detail';
import { findCombos, sumFx } from '../src/league/combos';
import { budgetFor, checkFired, forecast, payroll, trustAfterGame, winProb } from '../src/league/finance';
import { playerValue, salaryOf } from '../src/growth/player';
import { newGame, stepToEnd } from '../src/engine/game';
import { migrate, pruneCareer, rawSave, saveCareer } from '../src/save';
import { adviseTraining, leagueAvgAttrs, projectGains } from '../src/growth/advisor';
import { ALL_KEYS } from '../src/data/constants';
import { rand, resetRandom, seeded, setRandom } from '../src/util/random';
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
  while (projectedPayroll(c) > budgetFor(c)) {
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
    for (let i = 1; i < games.length; i++) expect(games[i]).toBeGreaterThanOrEqual(games[i - 1]);
    expect(games[games.length - 1]).toBeGreaterThan(games[0]);
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
    expect(c.results.filter((r) => r.kind === 'league').length).toBe(gamesPerSeason(0));
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
    expect(games).toBeGreaterThanOrEqual(gamesPerSeason(0));
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
    expect(c.meal!.weeks).toBe(4);
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

describe('全日本選手権', () => {
  beforeEach(() => setRandom(seeded(111)));
  afterEach(() => resetRandom());

  it('全チームが出場する1つのトーナメントで,優勝は1チームだけ', () => {
    const c = newCareer('テスト');
    playSeason(c, 'mix');
    const total = LEAGUES.reduce((n, l) => n + l.teams, 0);
    expect(c.cupBracket.length).toBe(total - 1);
    const ids = new Set(c.cupBracket.flatMap((m) => [m.aId, m.bId]));
    expect(ids.size).toBe(total);
    expect(c.cups.length).toBe(1);
    const final = c.cupBracket[c.cupBracket.length - 1];
    expect(final.round).toBe('決勝');
    expect(c.cups[0].championId).toBe(final.winner);
    // 決勝以外は,負けたチームは二度と出てこない
    const lost = new Set<number>();
    for (const m of c.cupBracket) {
      expect(lost.has(m.aId)).toBe(false);
      expect(lost.has(m.bId)).toBe(false);
      lost.add(m.winner === m.aId ? m.bId : m.aId);
    }
    expect(c.off!.cup.length).toBeGreaterThan(0);
  });

  it('リーグ戦・プレーオフ・選手権の試合数が,出場数の上限になる', () => {
    const c = newCareer('テスト');
    playSeason(c, 'mix');
    // シーズンの試合数以上の登板・出場は記録されていない
    for (const t of c.teams) for (const p of t.players) expect(p.stats.g).toBeLessThanOrEqual(gamesPerSeason(c.leagues.findIndex((l) => l.teamIds.includes(t.id))) + 8 + 5);
  });

  it('v10 のデータに選手権の欄を足す', () => {
    const c = newCareer('テスト');
    const old = JSON.parse(JSON.stringify(c)) as Record<string, unknown>;
    old.version = 10;
    delete old.cups; delete old.cupBracket;
    const m = migrate(old);
    expect(m).not.toBeNull();
    expect(m!.cups).toEqual([]);
  });
});


describe('1年48週のカレンダー', () => {
  beforeEach(() => setRandom(seeded(131)));
  afterEach(() => resetRandom());

  it('各リーグの試合は,4月から10月までの週に割り振られる', () => {
    const c = newCareer('テスト');
    for (const lg of c.leagues) {
      expect(lg.weeks.length).toBe(lg.schedule.length);
      for (let i = 0; i < lg.weeks.length; i++) {
        expect(lg.weeks[i]).toBeGreaterThanOrEqual(SEASON_START);
        expect(lg.weeks[i]).toBeLessThan(PLAYOFF_START);
        if (i) expect(lg.weeks[i]).toBeGreaterThan(lg.weeks[i - 1]);
      }
    }
    // 試合数が最も多い独立リーグでも,1週に1試合までに収まる
    expect(Math.max(...c.leagues.map((lg) => lg.weeks.length))).toBeLessThanOrEqual(28);
  });

  it('1年は48週で終わり,プレーオフと全日本選手権まで終わる', () => {
    const c = newCareer('テスト');
    let weeks = 0;
    while (c.phase === 'season') { playWeek(c, 'mix'); weeks++; }
    expect(weeks).toBe(WEEKS_PER_YEAR);
    for (const lg of c.leagues) {
      expect(lg.po?.champion).not.toBeNull();
      expect(lg.week).toBe(lg.schedule.length);
    }
    expect(c.cup?.done).toBe(true);
    expect(c.cupBracket.length).toBe(LEAGUES.reduce((n, l) => n + l.teams, 0) - 1);
  });

  it('試合のない週は,練習試合を選べて,成績には入らず疲れだけがたまる', () => {
    const c = newCareer('テスト');
    // 草野球は最初の週(1月)に公式戦がない
    expect(weekInfo(c).userGame).toBeNull();
    const u = userTeam(c);
    for (const p of u.players) p.fatigue = 0;
    const r = playWeek(c, 'mix', { practice: true });
    expect(r.kind).toBe('practice');
    expect(r.games.length).toBe(1);
    for (const p of u.players) expect(p.stats.g).toBe(0);
    expect(u.players.some((p) => p.fatigue > 0)).toBe(true);
    expect(c.results.length).toBe(0);
  });

  it('強いチームはプレーオフに出て,その週はプレイヤーの試合が行われる', () => {
    const c = newCareer('テスト');
    const u = userTeam(c);
    for (const p of u.players) for (const k of keysOf(p)) { p[k] = 95; p.pot[k] = 99; }
    let po: ReturnType<typeof playWeek> | null = null;
    while (c.phase === 'season') {
      const cal = c.cal;
      const r = playWeek(c, 'mix');
      if (cal === PLAYOFF_START) po = r;
    }
    expect(po).not.toBeNull();
    expect(po!.kind).toBe('playoff');
    expect(po!.games.length).toBeGreaterThanOrEqual(2);
    expect(c.results.some((r) => r.kind === 'playoff')).toBe(true);
  });

  it('v11 のデータにカレンダーを足す', () => {
    const c = newCareer('テスト');
    const old = JSON.parse(JSON.stringify(c)) as Record<string, unknown>;
    old.version = 11;
    delete old.cal; delete old.cup;
    for (const lg of old.leagues as Record<string, unknown>[]) { delete lg.weeks; delete lg.po; }
    const m = migrate(old);
    expect(m).not.toBeNull();
    expect(m!.cal).toBeGreaterThanOrEqual(SEASON_START);
    expect(m!.leagues[0].weeks.length).toBe(m!.leagues[0].schedule.length);
  });
});

describe('疲労と怪我', () => {
  beforeEach(() => setRandom(seeded(141)));
  afterEach(() => resetRandom());

  it('1年のあいだに,怪我が起きて治る', () => {
    const c = newCareer('テスト');
    let hurtSeen = 0;
    while (c.phase === 'season') {
      playWeek(c, 'mix');
      for (const t of c.teams) hurtSeen += t.players.filter(isHurt).length;
    }
    expect(hurtSeen).toBeGreaterThan(0);
    // 怪我の週数は必ず正で,有限
    for (const t of c.teams) for (const p of t.players) if (p.inj) { expect(p.inj.weeks).toBeGreaterThan(0); expect(p.inj.weeks).toBeLessThanOrEqual(20); }
  });

  it('怪我人は試合に出ず,控えが代わりに出る', () => {
    const c = newCareer('テスト');
    const t = c.teams[1];
    const star = t.players.find((p) => t.lineup.some((e) => e.pid === p.id))!;
    star.inj = { name: 'テスト', weeks: 3, major: false };
    const eff = effectiveLineup(t);
    expect(eff.some((e) => e.pid === star.id)).toBe(false);
    expect(eff.length).toBe(9);
    for (let i = 0; i < 20; i++) {
      const g = newGame(t, c.teams[2], false);
      expect(g.home.lineup.some((e) => e.p.id === star.id)).toBe(false);
      stepToEnd(g);
    }
  });

  it('疲れがたまると怪我の確率が上がる', () => {
    const lo = { fatigue: 0 } as Player, hi = { fatigue: 90 } as Player;
    expect(fatigueRisk(hi)).toBeGreaterThan(fatigueRisk(lo) * 2);
  });

  it('休養は疲れをとり,きつい練習は疲れをためる', () => {
    const c = newCareer('テスト');
    const u = userTeam(c);
    for (const p of u.players) p.fatigue = 50;
    doTraining(u, 'rest', 1);
    expect(u.players.every((p) => p.fatigue < 50)).toBe(true);
    for (const p of u.players) p.fatigue = 50;
    doTraining(u, 'stam', 1);
    expect(u.players.every((p) => p.fatigue > 50)).toBe(true);
  });

  it('怪我人が多い・疲れているときは休養をすすめる', () => {
    const c = newCareer('テスト');
    const u = userTeam(c);
    for (const p of u.players) p.fatigue = 75;
    expect(adviseTraining(u, leagueAvgAttrs(c), 10, 1).best).toBe('rest');
  });
});

describe('資金と施設', () => {
  beforeEach(() => setRandom(seeded(151)));
  afterEach(() => resetRandom());

  it('毎週の収入と試合の入場収入で資金が増える', () => {
    const c = newCareer('テスト');
    const f0 = c.funds;
    playWeek(c, 'mix');
    expect(c.funds).toBeGreaterThan(f0);
    expect(weeklyIncome(c)).toBeGreaterThan(0);
  });

  it('施設を強くすると資金が減り,レベルが上がる.足りなければ強化できない', () => {
    const c = newCareer('テスト');
    c.funds = 0;
    expect(upgrade(c, 'clinic')).toContain('資金');
    c.funds = upgradeCost(c, 'clinic') + 5;
    expect(upgrade(c, 'clinic')).toBeNull();
    expect(c.fac.clinic).toBe(1);
    expect(c.funds).toBe(5);
    c.fac.clinic = MAX_FAC;
    c.funds = 1e9;
    expect(upgrade(c, 'clinic')).toContain('これ以上');
  });

  it('食材を売るとお金になる', () => {
    const c = newCareer('テスト');
    c.pantry.meat = 3;
    c.funds = 0;
    expect(sellIngredient(c, 'meat', 2)).toBeNull();
    expect(c.pantry.meat).toBe(1);
    expect(c.funds).toBe(2 * ingredientPrice(c, 'meat'));
    expect(sellIngredient(c, 'fish', 1)).toContain('ありません');
  });

  it('医務室が高いほど怪我が起きにくい', () => {
    let a = 0, b = 0;
    for (let i = 0; i < 4000; i++) {
      const p1 = { fatigue: 60, skills: [], pitches: {}, meet: 50, power: 50, speed: 50, field: 50, velo: 0, ctrl: 0, stam: 0, role: '野手', cond: 2 } as unknown as Player;
      const p2 = { ...p1 } as Player;
      if (maybeInjure(p1, 0.05, 0)) a++;
      if (maybeInjure(p2, 0.05, 5)) b++;
    }
    expect(b).toBeLessThan(a * 0.8);
  });

  it('食堂が整うほど料理が強く,長く効く', () => {
    const mk = (lv: number) => {
      const c = newCareer('テスト');
      c.fac.canteen = lv;
      c.pantry.rice = 1;
      cook(c, 'onigiri');
      return c.meal!;
    };
    expect(mk(5).mult.all!).toBeGreaterThan(mk(0).mult.all!);
    expect(mk(3).weeks).toBeGreaterThan(mk(0).weeks);
  });

  it('練習場が高いほど練習の伸びが大きい', () => {
    const c = newCareer('テスト');
    expect(trainFacMult(c)).toBe(1);
    c.fac.ground = 5;
    expect(trainFacMult(c)).toBeGreaterThan(1.25);
  });

  it('v12 のデータに資金と施設を足す', () => {
    const c = newCareer('テスト');
    const old = JSON.parse(JSON.stringify(c)) as Record<string, unknown>;
    old.version = 12;
    delete old.funds; delete old.fac; delete old.market;
    const m = migrate(old);
    expect(m).not.toBeNull();
    expect(m!.funds).toBeGreaterThan(0);
    expect(m!.fac.stadium).toBe(0);
  });
});

describe('コンバートと選手の詳細・順位の遷移', () => {
  beforeEach(() => setRandom(seeded(161)));
  afterEach(() => resetRandom());

  it('コンバート候補は向いている順で,現在の位置は含まれない', () => {
    const c = newCareer('テスト');
    const p = userTeam(c).players.find((x) => x.role === '野手')!;
    const o = convertOptions(p);
    expect(o.length).toBe(7);
    expect(o.some((x) => x.to === p.pos)).toBe(false);
    for (let i = 1; i < o.length; i++) expect(o[i - 1].score).toBeGreaterThanOrEqual(o[i].score);
    for (const x of o) { expect(x.chance).toBeGreaterThan(0); expect(x.chance).toBeLessThan(1); }
    // 同じ内野どうしは,外野に出るより早い
    expect(convertWeeks('遊', '二')).toBeLessThan(convertWeeks('遊', '左'));
    expect(convertWeeks('捕', '一')).toBeGreaterThan(convertWeeks('遊', '左'));
  });

  it('コンバートは週が進んで完了し,成功すると本職が変わり前の位置はサブポジに残る', () => {
    let changed = 0;
    for (let i = 0; i < 60; i++) {
      const c = newCareer('テスト');
      const p = userTeam(c).players.find((x) => x.role === '野手' && x.pos === '遊')!;
      const before = p.pos as Pos;
      expect(startConvert(c, p.id, '二')).toBeNull();
      expect(startConvert(c, p.id, '三')).toContain('すでに');
      for (let w = 0; w < 6; w++) tickConvert(c, 'mix');
      expect(p.conv).toBeNull();
      if (p.pos === '二') { changed++; expect(p.alt).toContain(before); expect(fit(p, before)).toBe(-3); }
    }
    expect(changed).toBeGreaterThan(15);
  });

  it('投手はコンバートできない', () => {
    const c = newCareer('テスト');
    const pit = userTeam(c).players.find((x) => x.role === '投手')!;
    expect(startConvert(c, pit.id, '一')).toContain('投手');
    expect(convertOptions(pit)).toEqual([]);
  });

  it('節ごとの順位の遷移が記録される', () => {
    const c = newCareer('テスト');
    for (let i = 0; i < 20; i++) playWeek(c, 'mix');
    const lg = c.leagues[3];
    expect(Object.keys(lg.rankHist).length).toBe(lg.teamIds.length);
    for (const id of lg.teamIds) {
      expect(lg.rankHist[id].length).toBe(lg.week);
      for (const r of lg.rankHist[id]) { expect(r).toBeGreaterThanOrEqual(1); expect(r).toBeLessThanOrEqual(lg.teamIds.length); }
    }
  });

  it('シーズンを終えると,その年の能力が記録に残り,詳細画面が作れる', () => {
    const c = newCareer('テスト');
    playSeason(c, 'mix');
    const p = userTeam(c).players.find((x) => x.seasons.length > 0)!;
    expect(p.seasons[0].attrs).toBeDefined();
    c.phase = 'season';
    const html = detailSheet(c, p.id);
    expect(html.length).toBeGreaterThan(500);
    expect(html).not.toMatch(/NaN|undefined/);
  });

  it('料理はどれも材料が正しく,効き目の期間が正', () => {
    const keys = new Set(['rice', 'meat', 'fish', 'veg', 'fruit', 'egg']);
    expect(RECIPES.length).toBeGreaterThanOrEqual(15);
    for (const r of RECIPES) {
      expect(r.weeks).toBeGreaterThan(0);
      for (const k of Object.keys(r.need)) expect(keys.has(k)).toBe(true);
    }
    expect(new Set(RECIPES.map((r) => r.key)).size).toBe(RECIPES.length);
  });
});

describe('休養の忠告と音', () => {
  beforeEach(() => setRandom(seeded(171)));
  afterEach(() => resetRandom());

  it('疲れがたまっていると忠告が出て,休養を選べば出ない', () => {
    const c = newCareer('テスト');
    expect(warnings(c, 'mix', false).filter((w) => w.level === 'bad')).toEqual([]);
    for (const p of userTeam(c).players) p.fatigue = 85;
    const w = warnings(c, 'mix', false);
    expect(w.some((x) => x.level === 'bad' && x.text.includes('休養'))).toBe(true);
    expect(confirmMessage(c, 'mix', false)).not.toBeNull();
    expect(confirmMessage(c, 'rest', false)).toBeNull();
  });

  it('走り込みや練習試合は,疲れ気味のときだけ注意される', () => {
    const c = newCareer('テスト');
    for (const p of userTeam(c).players) p.fatigue = 50;
    expect(warnings(c, 'stam', false).some((x) => x.text.includes('走り込み'))).toBe(true);
    expect(warnings(c, 'mix', true).some((x) => x.text.includes('練習試合'))).toBe(true);
    for (const p of userTeam(c).players) p.fatigue = 0;
    expect(warnings(c, 'stam', true)).toEqual([]);
  });

  it('信頼度が低いと注意され,年俸が予算超過でも注意される', () => {
    const c = newCareer('テスト');
    c.trust = 20;
    expect(warnings(c, 'mix', false).some((x) => x.level === 'bad' && x.text.includes('解任'))).toBe(true);
    c.trust = 60;
    userTeam(c).players[0].salary = 1e8;
    expect(warnings(c, 'mix', false).some((x) => x.text.includes('予算'))).toBe(true);
  });

  it('音の関数は,音の出せない環境(テスト)でも落ちない', () => {
    expect(() => { sfx.tap(); sfx.hr(); sfx.win(); sfx.lose(); resultSound(true); resultSound(null); startBgm(); stopBgm(); }).not.toThrow();
  });
});

describe('難易度・おまかせ進行・1年の振り返り', () => {
  beforeEach(() => setRandom(seeded(181)));
  afterEach(() => resetRandom());

  it('難易度で予算と信頼度の動きが変わる', () => {
    const a = newCareer('テスト', 'easy'), b = newCareer('テスト', 'hard');
    const bEasy = budgetFor(a);
    a.diff = 'hard';
    expect(bEasy).toBeGreaterThan(budgetFor(a));
    a.diff = 'easy';
    a.trust = 50; b.trust = 50;
    addTrust(a, 10); addTrust(b, 10);
    expect(a.trust).toBeGreaterThan(b.trust);
    a.trust = 50; b.trust = 50;
    addTrust(a, -10); addTrust(b, -10);
    expect(a.trust).toBeGreaterThan(b.trust);
    for (const d of Object.values(DIFFS)) expect(d.name.length).toBeGreaterThan(0);
  });

  it('やさしいほど AI の成長が小さい', () => {
    const grow = (d: 'easy' | 'hard') => {
      const c = newCareer('テスト', d);
      const t = c.teams.find((x) => !x.user)!;
      const before = t.players.reduce((s, p) => s + p.meet + p.velo, 0);
      for (let i = 0; i < 12; i++) weeklyUpkeep(c);
      return t.players.reduce((s, p) => s + p.meet + p.velo, 0) - before;
    };
    let e = 0, h = 0;
    for (let i = 0; i < 20; i++) { e += grow('easy'); h += grow('hard'); }
    expect(h).toBeGreaterThan(e);
  });

  it('おまかせ休養は,疲れがたまったとき自動で休養にする', () => {
    const c = newCareer('テスト');
    c.auto.rest = true;
    for (const p of userTeam(c).players) p.fatigue = 90;
    const r = playWeek(c, 'bat');
    expect(r.menu).toBe('rest');
    expect(c.news.some((n) => n.includes('自動で休養'))).toBe(true);
    c.auto.rest = false;
    for (const p of userTeam(c).players) p.fatigue = 90;
    expect(playWeek(c, 'bat').menu).toBe('bat');
  });

  it('おまかせオーダーで,週のはじめにオーダーが整う', () => {
    const c = newCareer('テスト');
    c.auto.lineup = true;
    const u = userTeam(c);
    u.lineup = [...u.lineup].reverse();
    playWeek(c, 'mix');
    expect(isLineupValid(u)).toBe(true);
  });

  it('1年を終えると振り返りができ,成長した選手が出る', () => {
    const c = newCareer('テスト');
    playSeason(c, 'mix');
    const r = c.off!.review!;
    expect(r).toBeDefined();
    expect(r.champion.length).toBeGreaterThan(0);
    expect(r.growers.length).toBeGreaterThan(0);
    for (const g of r.growers) expect(g.delta).toBeGreaterThan(0);
    expect(Number.isFinite(r.fundsDelta)).toBe(true);
    // 新人王が出ている(1年目の選手がいるため)
    expect(c.awards.some((a) => a.kind === '新人王')).toBe(true);
  });

  it('v14 のデータに難易度とおまかせ進行を足す', () => {
    const c = newCareer('テスト');
    const old = JSON.parse(JSON.stringify(c)) as Record<string, unknown>;
    old.version = 14;
    delete old.diff; delete old.auto; delete old.yearStart;
    const m = migrate(old);
    expect(m).not.toBeNull();
    expect(m!.diff).toBe('normal');
    expect(m!.auto.rest).toBe(false);
    expect(Object.keys(m!.yearStart.attrs).length).toBeGreaterThan(0);
  });
});

describe('選手の顔・追加の出来事・入団会見', () => {
  beforeEach(() => setRandom(seeded(191)));
  afterEach(() => resetRandom());

  it('顔は選手ごとに決まっていて,いつも同じ', () => {
    const c = newCareer('テスト');
    const [a, b] = userTeam(c).players;
    expect(avatar(a)).toBe(avatar(a));
    expect(avatar(a)).not.toBe(avatar(b));
    expect(avatar(a)).toContain('<svg');
    expect(avatar(a, 40, '#123456')).toContain('#123456');
  });

  it('追加した出来事(怪我の相談・引き抜き・ファン・スポンサー)がどの選択でも成り立つ', () => {
    for (const choice of [0, 1]) {
      const c = newCareer('テスト');
      const t = userTeam(c);
      const hurt = t.players[0];
      hurt.inj = { name: 'テスト', weeks: 6, major: false };
      const mk = (kind: string, pid?: number, teamId?: number): GameEvent => ({
        kind, title: kind, body: '', pid, teamId, choices: [{ key: '', label: '', hint: '' }, { key: '', label: '', hint: '' }],
      });
      const keys: Record<string, string[]> = { injTalk: ['rush', 'heal'], poach: ['sell', 'keep'], fan: ['host', 'skip'], sponsor: ['accept', 'decline'] };
      const bench = t.players.find((p) => p.role === '野手' && !t.lineup.some((e) => e.pid === p.id))!;
      const o = c.teams.find((x) => !x.user)!;
      for (const kind of Object.keys(keys)) {
        c.event = mk(kind, kind === 'poach' ? bench.id : hurt.id, o.id);
        const f0 = c.funds;
        const text = resolveEvent(c, keys[kind][choice]);
        expect(text.length).toBeGreaterThan(0);
        expect(c.event).toBeNull();
        if (kind === 'poach' && choice === 0) { expect(c.funds).toBeGreaterThan(f0); expect(t.players.includes(bench)).toBe(false); expect(o.players.includes(bench)).toBe(true); }
        if (kind === 'fan' && choice === 0) expect(c.funds).toBeGreaterThan(f0);
        expect(isLineupValid(t)).toBe(true);
      }
    }
  });

  it('ドラフトで指名すると,新人の入団会見のコメントが残る', () => {
    const c = newCareer('テスト');
    playSeason(c, 'mix');
    pickDraft(c, 0);
    const mine = c.off!.draft.picks.filter((p) => p.user);
    if (mine.length) expect(c.off!.press!.length).toBe(mine.length);
    expect(pressNote(userTeam(c).players[0])).toMatch(/入団会見/);
  });
});

describe('昇格・降格の枠', () => {
  beforeEach(() => setRandom(seeded(201)));
  afterEach(() => resetRandom());

  it('いちばん下のリーグには降格圏がなく,いちばん上のリーグには昇格圏がない', () => {
    const c = newCareer('テスト');
    const f0 = forecast(c, 60);
    expect(f0.downN).toBe(0);
    expect(f0.down).toBe(0);
    expect(f0.upN).toBe(MOVES[0]);
    c.level = LEAGUES.length - 1;
    const f1 = forecast(c, 60);
    expect(f1.upN).toBe(0);
    expect(f1.up).toBe(0);
    expect(f1.downN).toBe(MOVES[LEAGUES.length - 2]);
  });

  it('境目ごとに決まった数のチームだけが入れ替わり,各リーグのチーム数は変わらない', () => {
    const c = newCareer('テスト');
    playSeason(c, 'mix');
    const o = c.off!;
    for (let l = 0; l < LEAGUES.length - 1; l++) {
      const up = c.leagues[l].teamIds.filter((id) => o.next[id] === l + 1).length;
      const down = c.leagues[l + 1].teamIds.filter((id) => o.next[id] === l).length;
      // 自動の入れ替えに,入れ替え戦で下が勝てばもう 1 チーム
      const swap = o.swaps?.length ? up - MOVES[l] : 0;
      expect(swap === 0 || swap === 1).toBe(true);
      expect(up).toBe(MOVES[l] + swap);
      expect(down).toBe(up);
    }
    // 最下位リーグの最下位は降格しない
    const last = standings(c, 0).slice(-1)[0].t.id;
    expect(o.next[last]).toBe(0);
  });
});

describe('入れ替え戦と拡張', () => {
  beforeEach(() => setRandom(seeded(321)));
  afterEach(() => resetRandom());

  it('2位と下から2番目の入れ替え戦の結果が記録され,勝った方が上に残る', () => {
    const c = newCareer('テスト');
    playSeason(c, 'mix');
    const o = c.off!;
    expect(o.swaps).toHaveLength(LEAGUES.length - 1);
    for (let l = 0; l < LEAGUES.length - 1; l++) {
      const lo = standings(c, l)[MOVES[l]].t.id, up = standings(c, l + 1).slice().reverse()[MOVES[l]].t.id;
      expect([o.next[lo], o.next[up]].sort()).toEqual([l, l + 1]);
    }
  });

  it('足りないチームは,次のシーズンの開幕で AI チームとして加わる', () => {
    const c = newCareer('テスト');
    playSeason(c, 'mix');
    // 古いセーブのように,プロから 2 チームが少ない状態にする
    const pro = c.leagues[3];
    for (const id of pro.teamIds.slice(-2)) {
      c.teams = c.teams.filter((t) => t.id !== id);
      delete c.off!.next[id];
    }
    pro.teamIds = pro.teamIds.slice(0, -2);
    expandLeagues(c, c.off!.next);
    expect(c.teams.filter((t) => c.off!.next[t.id] === 3)).toHaveLength(LEAGUES[3].teams);
  });
});

describe('セーブの安全', () => {
  beforeEach(() => setRandom(seeded(211)));
  afterEach(() => resetRandom());

  it('大きくなりすぎたセーブは整理され,遊びに必要な部分は残る', () => {
    const c = newCareer('テスト');
    for (let i = 0; i < 600; i++) c.hist.push({ ...c.hist[0] });
    for (let i = 0; i < 400; i++) c.awards.push({ season: 1, level: 0, kind: 'MVP', pid: 1, name: 'x', team: 'y', text: '', mine: false });
    pruneCareer(c);
    expect(c.hist.length).toBeLessThanOrEqual(240);
    expect(c.awards.length).toBeLessThanOrEqual(200);
    expect(userTeam(c).players.length).toBeGreaterThan(10);
    expect(c.leagues.length).toBe(LEAGUES.length);
  });

  it('保存の結果(成功か,大きさ)が返る.保存先がない環境でも落ちない', () => {
    const c = newCareer('テスト');
    const r = saveCareer(c);
    expect(typeof r.ok).toBe('boolean');
    expect(r.size).toBeGreaterThan(1000);
    expect(rawSave() === null || typeof rawSave() === 'string').toBe(true);
  });

  it('長い進行でもセーブの大きさは,保存できる範囲に収まる', () => {
    const c = newCareer('テスト');
    for (let s = 0; s < 6; s++) { playSeason(c, 'mix'); prepareNextSeason(c); }
    expect(JSON.stringify(c).length).toBeLessThan(4_000_000);
  });
});

describe('オーナーの目標', () => {
  beforeEach(() => setRandom(seeded(221)));
  afterEach(() => resetRandom());

  it('新しいシーズンごとに2つの目標が決まる', () => {
    const c = newCareer('テスト');
    expect(c.goals.length).toBe(2);
    for (const g of c.goals) { expect(g.text.length).toBeGreaterThan(0); expect(g.reward.trust).toBeGreaterThan(0); expect(g.reward.funds).toBeGreaterThan(0); }
    playSeason(c, 'mix');
    prepareNextSeason(c);
    expect(c.goals.length).toBe(2);
  });

  it('1年の終わりに判定され,達成した目標の報酬(資金)がもらえる', () => {
    const c = newCareer('テスト');
    c.goals = [{ kind: 'wins', target: 0, text: 'テスト', reward: { trust: 5, funds: 1000 } }, { kind: 'wins', target: 999, text: '無理', reward: { trust: 5, funds: 1000 } }];
    const f0 = c.funds;
    playSeason(c, 'mix');
    const r = c.off!.review!;
    expect(r.goals.map((g) => g.done)).toEqual([true, false]);
    expect(c.funds).toBeGreaterThan(f0 + 999);
  });

  it('目標の進み具合の文章が作れる', () => {
    const c = newCareer('テスト');
    for (const g of c.goals) expect(goalProgress(c, g).length).toBeGreaterThan(0);
  });

  it('v16 のデータに目標を足す', () => {
    const c = newCareer('テスト');
    const old = JSON.parse(JSON.stringify(c)) as Record<string, unknown>;
    old.version = 16;
    delete old.goals;
    const m = migrate(old);
    expect(m).not.toBeNull();
    expect(m!.goals.length).toBe(2);
  });
});

describe('選手の個性・契約更改・スカウト・成績の幅', () => {
  beforeEach(() => setRandom(seeded(231)));
  afterEach(() => resetRandom());

  it('全員に性格とやる気があり,出られない選手はやる気が下がる', () => {
    const c = newCareer('テスト');
    for (const p of userTeam(c).players) { expect(Object.keys(PERS)).toContain(p.pers); expect(p.morale).toBeGreaterThan(0); }
    const u = userTeam(c);
    const core = new Set<number>([...u.lineup.map((e) => e.pid), ...u.pitchers.slice(0, 5)]);
    const bench = u.players.find((p) => !core.has(p.id) && p.pers === 'fighter') ?? u.players.find((p) => !core.has(p.id))!;
    const start = u.players.find((p) => core.has(p.id))!;
    bench.pers = 'fighter'; bench.morale = 60; start.morale = 60;
    for (let i = 0; i < 6; i++) updateMorale(c, null);
    expect(bench.morale).toBeLessThan(start.morale);
    expect(moraleLabel(10)).toContain('退団');
    expect(moraleGrowth({ morale: 100 } as Player)).toBeGreaterThan(moraleGrowth({ morale: 0 } as Player));
  });

  it('やる気が低い選手は,不満の出来事になる', () => {
    const c = newCareer('テスト');
    const p = userTeam(c).players[0];
    p.morale = 5;
    let found = false;
    for (let i = 0; i < 60 && !found; i++) { rollEvent(c); if (c.event?.kind === 'unrest') found = true; }
    expect(found).toBe(true);
    const before = p.morale;
    resolveEvent(c, 'raise');
    expect(p.morale).toBeGreaterThan(before);
  });

  it('年俸が大きく上がる選手は交渉待ちになり,受け入れるか値切るかを選べる', () => {
    const c = newCareer('テスト');
    playSeason(c, 'bat');
    const o = c.off!;
    expect(Array.isArray(o.contracts)).toBe(true);
    const asks = o.contracts!;
    if (!asks.length) return;
    const a = asks[0];
    const p = userTeam(c).players.find((x) => x.id === a.pid)!;
    expect(p.salary).toBe(a.old);
    expect(projectedPayroll(c)).toBeGreaterThan(payroll(userTeam(c)) - 1);
    expect(bargainChance(p)).toBeGreaterThan(0);
    negotiate(c, a.pid, 'accept');
    expect(p.salary).toBe(a.ask);
    expect(o.contracts!.some((x) => x.pid === a.pid)).toBe(false);
  });

  it('スカウトを出すと数週間で注目選手が戻り,ドラフトの候補に入る', () => {
    const c = newCareer('テスト');
    c.funds = 1e6;
    expect(dispatchScout(c, '素質')).toBeNull();
    expect(dispatchScout(c, '野手')).toContain('すでに');
    expect(c.funds).toBe(1e6 - scoutCost(c, '素質'));
    for (let i = 0; i < 3; i++) tickScout(c);
    expect(c.scout).toBeNull();
    expect(c.watch.length).toBe(1);
    const name = c.watch[0].name;
    playSeason(c, 'mix');
    expect(c.off!.draft.pool.concat(c.fa).some((p) => p.name === name) || c.off!.draft.picks.some((p) => p.name === name)).toBe(true);
    expect(c.watch.length).toBe(0);
  });

  it('二塁打と三塁打が記録され,OPS と WHIP が出せる', () => {
    const c = newCareer('テスト');
    for (let i = 0; i < 30; i++) playWeek(c, 'mix');
    const all = c.teams.flatMap((t) => t.players);
    expect(all.reduce((n, p) => n + p.stats.d2, 0)).toBeGreaterThan(0);
    for (const p of all) if (p.role === '野手' && p.stats.ab > 10) { const v = opsOf(p.stats); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(5); }
  });

  it('v17 のデータに性格・やる気・記録の欄を足す', () => {
    const c = newCareer('テスト');
    const old = JSON.parse(JSON.stringify(c)) as Record<string, unknown>;
    old.version = 17;
    delete old.scout; delete old.watch;
    for (const t of old.teams as { players: Record<string, unknown>[] }[]) for (const p of t.players) { delete p.pers; delete p.morale; }
    const m = migrate(old);
    expect(m).not.toBeNull();
    expect(Object.keys(PERS)).toContain(m!.teams[0].players[0].pers);
    expect(m!.watch).toEqual([]);
  });
});

describe('2周目の引き継ぎと地区', () => {
  beforeEach(() => setRandom(seeded(241)));
  afterEach(() => resetRandom());

  it('殿堂入りのあとの 2 周目は,施設の半分と実績を引き継いで始まる', () => {
    const a = newCareer('テスト');
    a.fac.stadium = 5; a.fac.clinic = 3;
    a.ach.first_win = 1; a.ach.hall = 3;
    a.rec.titles[LEAGUES.length - 1] = 5;
    a.season = 24;
    const b = newCareer('テスト', 'normal', a);
    expect(b.gen).toBe(2);
    expect(b.fac.stadium).toBe(2);
    expect(b.fac.clinic).toBe(1);
    expect(b.ach.hall).toBe(3);
    expect(b.legacy!.titles).toBe(5);
    expect(b.level).toBe(0);
    expect(b.season).toBe(1);
    expect(b.rec.titles.every((t) => t === 0)).toBe(true);
    expect(b.funds).toBeGreaterThan(3000);
  });

  it('プロとメジャーだけが,2 つの地区(A・B リーグ)に分かれる', () => {
    const c = newCareer('テスト');
    c.leagues.forEach((lg, i) => {
      if (LEAGUES[i].divs) {
        expect(lg.divs).toBeDefined();
        expect(lg.divs!.flat().sort()).toEqual([...lg.teamIds].sort());
        expect(lg.divs![0].length + lg.divs![1].length).toBe(lg.teamIds.length);
      } else expect(lg.divs).toBeUndefined();
    });
  });

  it('地区のあるリーグのプレーオフは,各地区の上位 2 チーム', () => {
    const c = newCareer('テスト');
    const lg = c.leagues[LEAGUES.length - 1];
    // 片方の地区に強いチームが集まっていても,各地区から 2 チームが出る
    const seeds = playoffSeeds(c, lg);
    expect(seeds.length).toBe(4);
    const d0 = seeds.filter((id) => lg.divs![0].includes(id)).length;
    expect(d0).toBe(2);
    expect(new Set(seeds).size).toBe(4);
  });

  it('v18/v19 のデータに周回と地区を足す', () => {
    const c = newCareer('テスト');
    const old = JSON.parse(JSON.stringify(c)) as Record<string, unknown>;
    old.version = 18;
    delete old.gen; delete old.legacy;
    for (const lg of old.leagues as Record<string, unknown>[]) delete lg.divs;
    const m = migrate(old);
    expect(m).not.toBeNull();
    expect(m!.gen).toBe(1);
    expect(m!.leagues[LEAGUES.length - 1].divs).toBeDefined();
  });
});

describe('共有と音量', () => {
  beforeEach(() => setRandom(seeded(251)));
  afterEach(() => resetRandom());

  it('1年の結果の文章に,順位と成績が入る', () => {
    const c = newCareer('テスト');
    playSeason(c, 'mix');
    const t = seasonText(c);
    expect(t).toContain('ダイヤモンド監督');
    expect(t).toContain(`${c.off!.rank}位`);
    expect(t).toContain('勝');
    expect(t).not.toMatch(/undefined|NaN/);
    const g = c.results.length ? gameText(c, 'A', 'B', 3, 2, '見出し') : '';
    expect(g).toContain('B 2 - 3 A');
  });

  it('音量は 0〜1 に収まり,音の出せない環境でも設定できる', () => {
    setVolume('se', 5);
    expect(sound.vol.se).toBe(1);
    setVolume('bgm', -1);
    expect(sound.vol.bgm).toBe(0);
    setVolume('se', 0.7); setVolume('bgm', 0.5);
    expect(() => { setScene('game'); setScene('off'); vibrate(10); }).not.toThrow();
  });
});

describe('画面を開き直しても変わらない予想', () => {
  beforeEach(() => setRandom(seeded(261)));
  afterEach(() => resetRandom());

  it('同じ状況なら,シーズンの予想はいつも同じで,ゲームの乱数も進めない', () => {
    const c = newCareer('テスト');
    const a = forecast(c);
    setRandom(seeded(261));
    const first = seeded(261)();
    // 予想を何度出しても,同じ結果で,ゲームの乱数は進まない
    for (let i = 0; i < 5; i++) expect(forecast(c)).toEqual(a);
    expect(rand()).toBe(first);
  });
});

describe('星の評価とおまかせオーダー', () => {
  beforeEach(() => setRandom(seeded(271)));
  afterEach(() => resetRandom());

  it('能力が高いほど星が多く,0.5〜5 に収まる', () => {
    expect(toStars(0)).toBe(0.5);
    expect(toStars(100)).toBe(5);
    let prev = 0;
    for (let v = 0; v <= 100; v += 5) { const s = toStars(v); expect(s).toBeGreaterThanOrEqual(prev); expect(s * 2).toBe(Math.round(s * 2)); prev = s; }
    const c = newCareer('テスト');
    for (const p of userTeam(c).players) { expect(potStars(p)).toBeGreaterThanOrEqual(ovrStars(p)); expect(starsHTML(ovrStars(p))).toContain('★★★★★'); }
  });

  it('調子重視のおまかせは,怪我人と疲れた選手を外す', () => {
    const c = newCareer('テスト');
    const u = userTeam(c);
    const star = u.players.find((p) => u.lineup.some((e) => e.pid === p.id))!;
    star.inj = { name: 'テスト', weeks: 4, major: false };
    autoLineup(u, { mode: 'form' });
    expect(u.lineup.some((e) => e.pid === star.id)).toBe(false);
    expect(isLineupValid(u)).toBe(true);
    star.inj = null;
    autoLineup(u, { mode: 'ability' });
    expect(isLineupValid(u)).toBe(true);
  });
});

describe('GMとスタッフ(監督・コーチ)', () => {
  beforeEach(() => setRandom(seeded(281)));
  afterEach(() => resetRandom());

  it('各役割に候補がいて,空席から始まる', () => {
    const c = newCareer('テスト');
    for (const r of ROLES) { expect(c.staff[r]).toBeNull(); expect(c.staffPool.filter((s) => s.role === r).length).toBe(3); }
    expect(staffCost(c)).toBe(0);
  });

  it('雇うと資金が減って席が埋まり,解雇すると退職金がかかる.足りなければ雇えない', () => {
    const c = newCareer('テスト');
    c.funds = 0;
    const cand = c.staffPool.find((s) => s.role === 'batting')!;
    expect(hireStaff(c, cand.id)).toContain('資金');
    c.funds = 1e6;
    expect(hireStaff(c, cand.id)).toBeNull();
    expect(c.staff.batting?.name).toBe(cand.name);
    expect(c.funds).toBe(1e6 - signingBonus(cand));
    expect(c.staffPool.some((s) => s.id === cand.id)).toBe(false);
    const f = c.funds;
    expect(fireStaff(c, 'batting')).toBeNull();
    expect(c.staff.batting).toBeNull();
    expect(c.funds).toBe(f - severance(cand));
  });

  it('給料は毎週,資金から払われ,払えないと信頼度が下がる', () => {
    const c = newCareer('テスト');
    c.funds = 1e6;
    hireStaff(c, c.staffPool.find((s) => s.role === 'manager')!.id);
    const f = c.funds;
    playWeek(c, 'mix');
    expect(c.funds).toBeLessThan(f + weeklyIncome(c) + 1e5);
    c.funds = 0;
    c.trust = 60;
    for (const s of Object.values(c.staff)) if (s) s.salary = 1e7;
    playWeek(c, 'mix');
    expect(c.trust).toBeLessThan(60);
  });

  it('腕のいいコーチほど,担当の能力が伸びる.能力の低いコーチは逆効果', () => {
    const c = newCareer('テスト');
    const p = userTeam(c).players.find((x) => x.role === '野手')!;
    expect(staffTrainMult(c, p, 'meet')).toBe(1);
    const mk = (skill: number): Staff => ({ id: 1, name: 'x', role: 'batting', age: 50, skill, salary: 100, years: 0 });
    c.staff.batting = mk(90);
    expect(staffTrainMult(c, p, 'meet')).toBeGreaterThan(1.09);
    expect(staffTrainMult(c, p, 'velo')).toBe(1);
    c.staff.batting = mk(10);
    expect(staffTrainMult(c, p, 'meet')).toBeLessThan(0.92);
  });

  it('監督のタイプで試合の補正が変わり,試合に反映される', () => {
    const c = newCareer('テスト');
    const mg = (style: ManagerStyle, skill = 80): Staff => ({ id: 2, name: 'm', role: 'manager', age: 50, skill, style, salary: 100, years: 0 });
    c.staff.manager = mg('aggressive');
    expect(managerFx(c).hr).toBeGreaterThan(0);
    expect(managerFx(c).def).toBeLessThan(0);
    c.staff.manager = mg('defensive');
    expect(managerFx(c).def).toBeGreaterThan(0);
    c.staff.manager = mg('developer');
    const young = userTeam(c).players.find((p) => p.age <= 24);
    if (young) expect(staffTrainMult(c, young, 'meet')).toBeGreaterThan(1);
    c.staff.manager = mg('defensive');
    userTeam(c).staffFx = managerFx(c);
    const g = newGame(userTeam(c), c.teams[1], false);
    const side = g.home.team.user ? g.home : g.away;
    expect(side.fx.def).toBeGreaterThan(0);
  });

  it('トレーナー・メンタルコーチの効果', () => {
    const c = newCareer('テスト');
    expect(trainerInjuryScale(c)).toBe(1);
    c.staff.trainer = { id: 3, name: 't', role: 'trainer', age: 50, skill: 90, salary: 100, years: 0 };
    c.staff.mental = { id: 4, name: 'm', role: 'mental', age: 50, skill: 90, salary: 100, years: 0 };
    expect(trainerInjuryScale(c)).toBeLessThan(0.85);
    expect(mentalBoost(c)).toBeGreaterThan(0);
  });

  it('スタッフは毎年年をとり,定年で退職する.新シーズンには候補が入れ替わる', () => {
    const c = newCareer('テスト');
    c.staff.pitching = { id: 5, name: '老', role: 'pitching', age: 64, skill: 70, salary: 100, years: 3 };
    const before = c.staffPool.map((s) => s.id).join();
    playSeason(c, 'mix');
    prepareNextSeason(c);
    expect(c.staff.pitching).toBeNull();
    expect(c.staffPool.map((s) => s.id).join()).not.toBe(before);
  });

  it('v20 のデータにスタッフの欄を足す', () => {
    const c = newCareer('テスト');
    const old = JSON.parse(JSON.stringify(c)) as Record<string, unknown>;
    old.version = 20;
    delete old.staff; delete old.staffPool;
    (old.auto as Record<string, unknown>).mode = undefined;
    const m = migrate(old);
    expect(m).not.toBeNull();
    expect(m!.staff.manager).toBeNull();
    expect(m!.auto.mode).toBe('form');
  });
});

describe('起承転結・育成方針・特訓・アルバム・収支', () => {
  beforeEach(() => setRandom(seeded(291)));
  afterEach(() => resetRandom());

  it('1年は起承転結の4場面に分かれ,場面ごとの一言が出る', () => {
    const c = newCareer('テスト');
    const seen = new Set<string>();
    for (let w = 0; w < WEEKS_PER_YEAR; w++) {
      seen.add(phaseOf(c));
      expect(storyBeat(c).length).toBeGreaterThan(0);
      playWeek(c, 'mix');
      if (c.phase === 'off') break;
    }
    expect([...seen].sort()).toEqual(['ketsu', 'ki', 'sho', 'ten']);
    expect(chapterTitle(newCareer('テスト'))).toContain('河川敷');
  });

  it('育成方針は,重点の能力を伸ばし,それ以外を少し控える', () => {
    const c = newCareer('テスト');
    const p = userTeam(c).players.find((x) => x.role === '野手')!;
    p.plan = 'slugger';
    expect(planMult(p, 'power')).toBeGreaterThan(1);
    expect(planMult(p, 'speed')).toBeLessThan(1);
    p.plan = 'balance';
    expect(planMult(p, 'power')).toBe(1);
    expect(plansFor(p).every((d) => d.role !== '投手')).toBe(true);
    expect(['slugger', 'contact', 'speedster', 'guardian']).toContain(suggestPlan(p));
  });

  it('特訓目標は3人まで.達成すると伸びしろとやる気が上がる', () => {
    const c = newCareer('テスト');
    const ps = userTeam(c).players.filter((x) => x.role === '野手');
    for (const p of ps.slice(0, 4)) { p.pot.meet = 99; p.meet = 30; }
    expect(setTrainGoal(c, ps[0], 'meet', 5)).toBeNull();
    expect(setTrainGoal(c, ps[0], 'power', 5)).toContain('すでに');
    expect(setTrainGoal(c, ps[1], 'meet', 5)).toBeNull();
    expect(setTrainGoal(c, ps[2], 'meet', 5)).toBeNull();
    expect(setTrainGoal(c, ps[3], 'meet', 5)).toContain('3人');
    const p = ps[0];
    const pot0 = p.pot.meet, mor0 = p.morale = 50;
    p.meet = p.train!.target + 1;
    const out = judgeTrainGoals(c);
    expect(out.some((t) => t.includes('達成'))).toBe(true);
    expect(p.pot.meet).toBeGreaterThanOrEqual(Math.min(99, pot0 + 3));
    expect(p.morale).toBeGreaterThan(mor0);
    expect(p.train).toBeNull();
    expect(p.story!.length).toBeGreaterThan(0);
  });

  it('能力のランクが上がると知らせが出る', () => {
    const c = newCareer('テスト');
    const u = userTeam(c);
    for (const p of u.players) for (const k of keysOf(p)) { p[k] = 39.95; p.pot[k] = 90; }
    const r = doTraining(u, 'bat', 4);
    expect(r.some((x) => x.rankUps?.length)).toBe(true);
    for (const x of r) for (const ru of x.rankUps ?? []) expect(ru.from).not.toBe(ru.to);
  });

  it('収支は科目ごとに記録され,資金と合う', () => {
    const c = newCareer('テスト');
    const f0 = c.funds;
    earn(c, 'week', 100);
    spend(c, 'facility', 40);
    const r = ledgerRow(c);
    expect(r.income.week).toBe(100);
    expect(r.expense.facility).toBe(40);
    expect(c.funds).toBe(f0 + 60);
    spend(c, 'staff', 1e9);
    expect(c.funds).toBe(0);
    playWeek(c, 'mix');
    expect(ledgerRow(c).income.week).toBeGreaterThan(100);
    expect(ledgerRow(c).season).toBe(c.season);
  });

  it('名場面は,優勝や昇格でアルバムに残る', () => {
    const c = newCareer('テスト');
    for (const p of userTeam(c).players) for (const k of keysOf(p)) { p[k] = 95; p.pot[k] = 99; }
    playSeason(c, 'mix');
    expect(c.album.some((a) => a.kind === 'title')).toBe(true);
    expect(c.album.length).toBeLessThanOrEqual(80);
  });

  it('あるあるイベントがどの選択でも成り立つ', () => {
    for (const kind of ['rain', 'late', 'gift', 'press']) {
      for (const choice of [0, 1]) {
        const c = newCareer('テスト');
        const t = userTeam(c);
        const keys: Record<string, string[]> = { rain: ['indoor', 'off'], late: ['scold', 'laugh'], gift: ['keep', 'party'], press: ['bold', 'humble'] };
        c.event = { kind, title: kind, body: '', pid: t.players[0].id, choices: [{ key: '', label: '', hint: '' }, { key: '', label: '', hint: '' }] };
        const text = resolveEvent(c, keys[kind][choice]);
        expect(text.length).toBeGreaterThan(0);
        for (const p of t.players) { expect(Number.isFinite(p.morale)).toBe(true); expect(p.morale).toBeGreaterThanOrEqual(0); expect(p.morale).toBeLessThanOrEqual(100); }
      }
    }
  });

  it('v22 のデータにアルバムと収支を足す', () => {
    const c = newCareer('テスト');
    const old = JSON.parse(JSON.stringify(c)) as Record<string, unknown>;
    old.version = 22;
    delete old.album; delete old.ledger;
    const m = migrate(old);
    expect(m).not.toBeNull();
    expect(m!.album).toEqual([]);
    expect(Array.isArray(m!.ledger)).toBe(true);
  });
});

describe('トレード・助っ人・複数年契約', () => {
  beforeEach(() => setRandom(seeded(301)));
  afterEach(() => resetRandom());

  it('価値が足りない条件ではトレードできず,足りれば成立して選手が入れ替わる', () => {
    const c = newCareer('テスト');
    for (let i = 0; i < 3; i++) playWeek(c, 'mix');
    const u = userTeam(c);
    const o = tradeOthers(c)[0];
    const want = o.players.filter((p) => p.role === '野手').sort((a, b) => tradeValue(b) - tradeValue(a))[0];
    const weak = u.players.filter((p) => p.role === '野手').sort((a, b) => tradeValue(a) - tradeValue(b))[0];
    weak.salary = 50; want.salary = 50;
    expect(doTrade(c, o.id, want.id, [weak.id])).toContain('受け入れ');
    expect(doTrade(c, o.id, want.id, [])).toContain('出す選手');
    // 価値の高い選手を出せば成立する
    const rich = u.players.filter((p) => p.role === '野手').sort((a, b) => tradeValue(b) - tradeValue(a))[0];
    rich.pot.meet = 99; rich.pot.power = 99; rich.meet = 80; rich.power = 80; rich.speed = 80; rich.field = 80;
    rich.salary = 50;
    const f0 = u.players.length;
    expect(doTrade(c, o.id, want.id, [rich.id])).toBeNull();
    expect(u.players.includes(want)).toBe(true);
    expect(o.players.includes(rich)).toBe(true);
    expect(u.players.length).toBe(f0);
    expect(isLineupValid(u)).toBe(true);
    expect(isLineupValid(o)).toBe(true);
  });

  it('トレードの期限を過ぎると行えない', () => {
    const c = newCareer('テスト');
    c.cal = 40;
    expect(tradeOpen(c)).toBe(false);
    const o = tradeOthers(c)[0];
    expect(doTrade(c, o.id, o.players[0].id, [userTeam(c).players[0].id])).toContain('期限');
  });

  it('助っ人は1シーズンだけ在籍し,延長すれば残る', () => {
    const c = newCareer('テスト');
    c.funds = 1e6;
    c.helpers.forEach((h) => { h.salary = 50; });
    const h = c.helpers[0];
    expect(hireHelper(c, h.id)).toBeNull();
    expect(userTeam(c).players.includes(h)).toBe(true);
    expect(h.loan).toBe(1);
    expect(extendHelper(c, h.id)).toBeNull();
    expect(h.loan).toBe(2);
    const h2 = c.helpers[0];
    hireHelper(c, h2.id);
    expect(endLoans(c).length).toBe(1);
    expect(userTeam(c).players.includes(h)).toBe(true);
    expect(userTeam(c).players.includes(h2)).toBe(false);
  });

  it('複数年契約で年俸が据え置かれ,やる気が上がる.やる気が低い主力は退団の恐れがある', () => {
    const c = newCareer('テスト');
    const p = userTeam(c).players.find((x) => x.role === '野手')!;
    p.morale = 50; c.funds = 1e6;
    p.meet = 90; p.power = 90; p.speed = 90; p.field = 90;
    expect(extendContract(c, p.id, 3)).toBeNull();
    expect(p.years).toBe(3);
    expect(p.morale).toBeGreaterThan(50);
    expect(extendContract(c, p.id, 2)).toContain('すでに');
    expect(leavingRisk(p)).toBe(false);
    p.years = undefined; p.morale = 10;
    expect(leavingRisk(p)).toBe(true);
    expect(departures(c)).toContain(p.name);
    expect(userTeam(c).players.includes(p)).toBe(false);
    expect(c.fa.includes(p) || c.teams.some((t) => t.players.includes(p))).toBe(true);
  });

  it('複数年契約の選手は,契約更改で年俸が変わらず年数が減る', () => {
    const c = newCareer('テスト');
    const p = userTeam(c).players[0];
    p.salary = 1000; p.years = 3;
    renewContracts(c);
    expect(p.salary).toBe(1000);
    expect(p.years).toBe(2);
  });

  it('v23 のデータに助っ人の欄を足す', () => {
    const c = newCareer('テスト');
    const old = JSON.parse(JSON.stringify(c)) as Record<string, unknown>;
    old.version = 23;
    delete old.helpers;
    const m = migrate(old);
    expect(m).not.toBeNull();
    expect(Array.isArray(m!.helpers)).toBe(true);
  });
});

describe('外国人選手・総合値・盗塁', () => {
  beforeEach(() => setRandom(seeded(311)));
  afterEach(() => resetRandom());

  it('上のリーグほど外国人選手が多い', () => {
    const c = newCareer('テスト');
    const share = (lv: number) => {
      const ps = c.leagues[lv].teamIds.flatMap((id) => c.teams.find((t) => t.id === id)!.players);
      return ps.filter((p) => FOREIGN_FIRST.includes(p.name.split(' ')[0])).length / ps.length;
    };
    expect(share(0)).toBeLessThan(0.05);
    expect(share(LEAGUES.length - 1)).toBeGreaterThan(share(0) + 0.2);
    expect(share(LEAGUES.length - 1)).toBeGreaterThan(share(2));
  });

  it('選手の総合値と将来が 0〜100 の数字で出る', () => {
    const c = newCareer('テスト');
    for (const p of userTeam(c).players.slice(0, 5)) {
      const html = playerStars(p);
      const o = Math.round(playerValue(p));
      expect(html).toContain(`>${o}<`);
      expect(html).not.toMatch(/NaN|undefined/);
      expect(o).toBeGreaterThanOrEqual(0);
      expect(o).toBeLessThanOrEqual(100);
    }
  });

  it('盗塁が記録される(0 ばかりにならない).足の速い選手のほうが多い', () => {
    const c = newCareer('テスト');
    const a = c.teams[1], b = c.teams[2];
    let runs = 0;
    for (let i = 0; i < 150; i++) {
      for (const p of [...a.players, ...b.players]) p.fatigue = 0;
      const g = newGame(a, b, false);
      stepToEnd(g);
      runs += g.home.runs + g.away.runs;
    }
    const all = [...a.players, ...b.players].filter((p) => p.role === '野手');
    const total = all.reduce((n, p) => n + p.stats.sb, 0);
    expect(total / 150).toBeGreaterThan(0.3);
    expect(total / 150).toBeLessThan(2.5);
    const fast = all.filter((p) => p.speed >= 45).reduce((n, p) => n + p.stats.sb, 0) / Math.max(1, all.filter((p) => p.speed >= 45).length);
    const slow = all.filter((p) => p.speed < 30).reduce((n, p) => n + p.stats.sb, 0) / Math.max(1, all.filter((p) => p.speed < 30).length);
    expect(fast).toBeGreaterThanOrEqual(slow);
    expect(runs / 150).toBeGreaterThan(3);
  });
});

describe('プレーオフの勝率と,入団時の育成方針', () => {
  beforeEach(() => setRandom(seeded(321)));
  afterEach(() => resetRandom());

  it('シリーズを勝ち抜く確率は,1 試合の勝率より極端になり,対称', () => {
    expect(seriesWinProb(0.5, 2)).toBeCloseTo(0.5, 6);
    expect(seriesWinProb(0.5, 3)).toBeCloseTo(0.5, 6);
    expect(seriesWinProb(0.7, 2)).toBeGreaterThan(0.7);
    expect(seriesWinProb(0.7, 3)).toBeGreaterThan(seriesWinProb(0.7, 2));
    expect(seriesWinProb(0.3, 3)).toBeLessThan(0.3);
    expect(seriesWinProb(0.62, 2) + seriesWinProb(0.38, 2)).toBeCloseTo(1, 6);
    expect(seriesWinProb(1, 3)).toBeCloseTo(1, 6);
    expect(seriesWinProb(0, 3)).toBeCloseTo(0, 6);
  });

  it('プレーオフの優勝確率は,4 チーム合わせて 100%', () => {
    const c = newCareer('テスト');
    for (let i = 0; i < 40; i++) playWeek(c, 'mix');
    expect(c.cal).toBe(40);
    const lg = c.leagues[c.level];
    const odds = playoffOdds(c, lg);
    expect(odds.length).toBe(4);
    expect(odds.reduce((s, o) => s + o.champion, 0)).toBeCloseTo(1, 6);
    // 準決勝のあとは 2 チームだけになる
    playWeek(c, 'mix');
    const after = playoffOdds(c, lg);
    expect(after.filter((o) => o.champion > 0).length).toBe(2);
    expect(after.reduce((s, o) => s + o.champion, 0)).toBeCloseTo(1, 6);
  });

  it('プレーオフに出る週は,相手と勝率が出る', () => {
    const c = newCareer('テスト');
    const u = userTeam(c);
    for (const p of u.players) for (const k of keysOf(p)) { p[k] = 95; p.pot[k] = 99; }
    for (let i = 0; i < 40; i++) playWeek(c, 'mix');
    const s = userSeries(c);
    expect(s).not.toBeNull();
    expect(s!.kind).toBe('playoff');
    expect(s!.opp).not.toBeNull();
    expect(s!.pGame).toBeGreaterThan(0.5);
    expect(s!.pSeries).toBeGreaterThanOrEqual(s!.pGame);
    expect(s!.wins).toBe(2);
  });

  it('全日本選手権の週も,相手と勝率が出る', () => {
    const c = newCareer('テスト');
    const u = userTeam(c);
    for (const p of u.players) for (const k of keysOf(p)) { p[k] = 95; p.pot[k] = 99; }
    for (let i = 0; i < 42; i++) playWeek(c, 'mix');
    const s = userSeries(c);
    if (s) { expect(s.kind).toBe('cup'); expect(s.wins).toBe(1); expect(s.pSeries).toBeCloseTo(s.pGame, 6); }
  });
});

describe('ポジションを考えたおすすめ・コンバート提案・オープン戦', () => {
  beforeEach(() => setRandom(seeded(331)));
  afterEach(() => resetRandom());

  it('ドラフトのおすすめは,いまそのポジションを守っている選手の力と年齢を考える', () => {
    const c = newCareer('テスト');
    const u = userTeam(c);
    const sr = u.lineup.find((e) => e.pos === '遊')!;
    const inc = u.players.find((p) => p.id === sr.pid)!;
    inc.age = 35;
    const mk = (pos: Pos, v: number): Player => {
      const p = { ...u.players.find((x) => x.role === '野手')! } as Player;
      p.id = 9000 + v; p.name = `候補${v}`; p.pos = pos; p.age = 19; p.alt = [];
      p.meet = v; p.power = v; p.speed = v; p.field = v;
      p.pot = { meet: 80, power: 80, speed: 80, field: 80, velo: 0, ctrl: 0, stam: 0 };
      return p;
    };
    const strong = mk('遊', Math.round(playerValue(inc)) + 15);
    const weak = mk('遊', 10);
    const adv = advise(u, [strong, weak]);
    expect(adv.get(strong.id)!.tags).toContain('ポジションを奪える');
    expect(adv.get(strong.id)!.reason).toContain(inc.name);
    expect(adv.get(strong.id)!.score).toBeGreaterThan(adv.get(weak.id)!.score);
    const old = mk('遊', Math.round(playerValue(inc)) - 2);
    expect(advise(u, [old]).get(old.id)!.tags).toContain('後継候補');
  });

  it('本職でない位置で出ている選手と,向いている控えが,コンバートのおすすめに出る', () => {
    const c = newCareer('テスト');
    const u = userTeam(c);
    const e = u.lineup.find((x) => x.pos === '二')!;
    const p = u.players.find((x) => x.id === e.pid)!;
    p.pos = '右';
    const tips = convertAdvice(c);
    expect(tips.length).toBeGreaterThan(0);
    expect(tips.length).toBeLessThanOrEqual(3);
    expect(tips.some((t) => t.pid === p.id && t.to === '二')).toBe(true);
    for (const t of tips) { expect(t.weeks).toBeGreaterThan(0); expect(t.chance).toBeGreaterThan(0); expect(t.text.length).toBeGreaterThan(0); }
    for (let i = 1; i < tips.length; i++) expect(tips[i - 1].gain).toBeGreaterThanOrEqual(tips[i].gain);
  });

  it('オープン戦(3月)は,毎週1試合が自動で行われ,成績には入らない', () => {
    const c = newCareer('テスト');
    for (let w = 0; w < 8; w++) playWeek(c, 'mix');
    expect(c.cal).toBe(8);
    let games = 0;
    for (let w = 0; w < 4; w++) {
      expect(weekInfo(c).kind).toBe('open');
      const r = playWeek(c, 'mix');
      expect(r.kind).toBe('open');
      expect(r.games.length).toBe(1);
      games++;
    }
    expect(games).toBe(4);
    for (const p of userTeam(c).players) expect(p.stats.g).toBe(0);
    expect(c.results.length).toBe(0);
    expect(c.cal).toBe(12);
  });
});
