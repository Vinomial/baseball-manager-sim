import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BASE_GAIN, MENUS, doTraining, type MenuKey } from '../src/growth/training';
import { LEAGUES, MIN_FIELDERS, MIN_PITCHERS, rosterMax, gamesPerSeason } from '../src/data/constants';
import {
  canStartSeason, newCareer, newSeason, pickDraft, playWeek, releasePlayer, signFreeAgent, userRosterMax, userTeam, weekGen,
} from '../src/league/season';
import { makeSchedule } from '../src/league/schedule';
import { activePlayers, fielders, findPlayer, fromFarm, isFarm, isLineupValid, pitchersOf, teamAttrs, toFarm } from '../src/league/team';
import { resolveEvent, rollEvent } from '../src/league/events';
import { adviseCuts } from '../src/league/cuts';
import { fatigueRisk, isHurt, maybeInjure } from '../src/league/health';
import { ingredientPrice, MAX_FAC, sellIngredient, trainFacMult, upgrade, upgradeCost, weeklyIncome } from '../src/league/economy';
import { effectiveLineup, fit } from '../src/league/team';
import type { GameEvent, ManagerStyle, Player, Pos, Staff } from '../src/types';
import { avatar } from '../src/ui/avatar';
import { stadiumSVG } from '../src/ui/stadium';
import { chordTones, freq, midi, notesAt, SONGS, songSteps, STEPS_PER_BAR } from '../src/ui/music';
import { BAR_W, BAR_X, cardSVG, potHint, rarityOf } from '../src/ui/card';
import { emblem, emblemChar, teamColors } from '../src/ui/emblem';
import { cupBracketSVG, playoffBracketSVG } from '../src/ui/bracket';
import { pressNote } from '../src/league/world';
import { PLAYOFF_START, SEASON_START, WEEKS_PER_YEAR, weekInfo } from '../src/league/calendar';
import { driftPot, emptyStats, gameExperience, genPlayer, growAttr, keysOf } from '../src/growth/player';
import { canCook, cook, effectText, mealEffect, mealGuard, mealLift, mealRest, RECIPES, seasonalIng } from '../src/growth/meals';
import { renamePlayer, renameTeam } from '../src/league/rename';
import { adviseMeals } from '../src/growth/mealAdvice';
import { updateMissions } from '../src/league/missions';
import { currentPlan, needsPlan, setMonthPlan } from '../src/league/actions';
import { chooseMenu } from '../src/league/autoplay';
import { lotteryOpen } from '../src/league/lottery';
import { faChance, isStarFA, offerFA } from '../src/league/fa';
import { awardPerks, franchiseOf, induct, obCandidates, titlePerks, updateFranchise } from '../src/league/history';
import { fansAfterGame, fansOf, market, popularity } from '../src/league/fans';
import { FAM_START, setTactic, tacticBonus, tacticFx, tacticPower } from '../src/league/tactics';
import { DIFFS, DRAFT_ROUNDS, FOREIGN_FIRST, relegPerLeague } from '../src/data/constants';
import { standings } from '../src/league/schedule';
import { goalProgress } from '../src/league/goals';
import { bargainChance, negotiate, projectedPayroll } from '../src/league/contracts';
import { careerStats, foldHistory, opsOf, seasonCount } from '../src/league/leaders';
import { advise } from '../src/league/advice';
import { convertAdvice } from '../src/league/convert';
import { playoffOdds, seriesWinProb, userSeries } from '../src/league/playoffs';
import { doTrade, endLoans, extendHelper, hireHelper, tradeOpen, tradeOthers, tradeRatio, tradeValue } from '../src/league/trade';
import { departures, extendContract, leavingRisk } from '../src/league/contracts';
import { renewContracts } from '../src/league/finance';
import { chapterTitle, judgeTrainGoals, phaseOf, setTrainGoal, storyBeat } from '../src/league/story';
import { planMult, plansFor, suggestPlan } from '../src/growth/plans';
import { earn, ledgerRow, spend } from '../src/league/economy';
import { toStars, ovrStars, potStars } from '../src/growth/stars';
import { playerStars, starsHTML } from '../src/ui/components';
import { autoLineup } from '../src/league/team';
import { ROLES, fireStaff, hireStaff, refreshPool, managerFx, mentalBoost, severance, signingBonus, staffCost, staffTrainMult, trainerInjuryScale } from '../src/league/staff';
import { dispatchScout, scoutCost, tickScout } from '../src/league/scouting';
import { moraleGrowth, moraleLabel, PERS, updateMorale } from '../src/growth/personality';
import { arrangeLeagues, faAppeal, leagueName, playoffSeeds, weeklyUpkeep } from '../src/league/world';
import { leaguesInTier, userLeague } from '../src/league/schedule';
import { CUPS } from '../src/data/cups';
import { addTrust } from '../src/league/finance';
import { confirmMessage, warnings } from '../src/league/warnings';
import { resultSound, setScene, setVolume, sfx, sound, startBgm, stopBgm, vibrate } from '../src/ui/sound';
import { gameText, seasonText } from '../src/ui/share';
import { convertOptions, convertWeeks, startConvert, tickConvert } from '../src/league/convert';
import { detailSheet } from '../src/ui/detail';
import { findCombos, sumFx } from '../src/league/combos';
import { budgetFor, checkFired, forecast, payroll, trustAfterGame, winProb } from '../src/league/finance';
import { playerValue, salaryOf } from '../src/growth/player';
import { applyMoment, findMoment, momentFollowUp, newGame, stepToEnd } from '../src/engine/game';
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
      expect(userLeague(c).schedule.length).toBe(gamesPerSeason(c.level));
      c.leagues.forEach((lg) => expect(lg.teamIds.length).toBe(LEAGUES[lg.level].teams));
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
      expect(c.champs.length).toBe((s + 1) * c.leagues.length);
      prepareNextSeason(c);
      const seen = new Set<number>();
      for (const t of c.teams) {
        // 最低人数の補充(入団テスト)は上限より優先されるので,プレイヤーのチームは除く
        if (!t.user) expect(t.players.length).toBeLessThanOrEqual(rosterMax(c.leagues.find((lg) => lg.teamIds.includes(t.id))!.level));
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
    const lg = userLeague(c);
    const old = JSON.parse(JSON.stringify({ ...c, schedule: lg.schedule, stand: lg.stand, teams: c.teams.filter((t) => lg.teamIds.includes(t.id)) })) as Record<string, unknown>;
    old.version = 3;
    delete old.leagues; delete old.fa; delete old.champs;
    for (const t of old.teams as { players: Record<string, unknown>[] }[]) for (const p of t.players) delete p.seasons;
    const m = migrate(old);
    expect(m).not.toBeNull();
    // 昔の 5 階層に,市民リーグを足した 6 階層(地域のリーグは次のシーズンから)
    expect(m!.leagues.map((l) => l.level)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(m!.leagues.map((l) => l.teamIds.length)).toEqual([6, 6, 6, 8, 12, 12]);
    playSeason(m!);
    expect(m!.phase).toBe('off');
    prepareNextSeason(m!);
    LEAGUES.forEach((L, l) => expect(leaguesInTier(m!, l)).toHaveLength(L.count));
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

  it('料理を作ると食材が減り,しばらく体が整う(能力は上がらない)', () => {
    const c = newCareer('テスト');
    c.pantry = { rice: 1, meat: 1, fish: 0, veg: 0, fruit: 0, egg: 1 };
    expect(cook(c, 'bento')).toBeNull();
    const u = userTeam(c);
    const attrs = JSON.stringify(teamAttrs(u));
    for (const p of u.players) p.morale = 50;
    const m = cook(c, 'katsu');
    expect(m).not.toBeNull();
    expect(c.pantry).toEqual({ rice: 0, meat: 0, fish: 0, veg: 0, fruit: 0, egg: 0 });
    expect(c.meal!.weeks).toBe(4);
    // 米で疲れがとれやすく,肉で怪我をしにくく,卵でやる気が上がる
    expect(mealRest(c.meal)).toBeGreaterThan(0);
    expect(mealGuard(c.meal)).toBeLessThan(1);
    expect(mealLift(c.meal)).toBe(0);
    expect(u.players.every((p) => p.morale > 50)).toBe(true);
    expect(JSON.stringify(teamAttrs(u))).toBe(attrs);
    expect(m!.desc).toContain('4週間');
    expect(m!.desc).toContain('怪我');
    expect(mealRest(null)).toBe(0);
    expect(mealGuard(null)).toBe(1);
  });

  it('すぐ効くだけの料理は,いま効いている料理を消さない', () => {
    const c = newCareer('テスト');
    c.pantry = { rice: 1, meat: 0, fish: 0, veg: 2, fruit: 0, egg: 0 };
    for (const p of userTeam(c).players) p.fatigue = 60;
    cook(c, 'onigiri');
    const r = cook(c, 'soup');
    expect(r!.desc).toContain('疲れ-');
    expect(c.meal!.name).toContain('おにぎり');
    expect(userTeam(c).players.every((p) => p.fatigue < 60)).toBe(true);
  });

  it('料理の米で,毎週の疲れがよけいにとれる', () => {
    const run = (fed: boolean) => {
      setRandom(seeded(5));
      const c = newCareer('テスト');
      if (fed) c.meal = { name: 'x', weeks: 3, desc: '', rest: 8, guard: 1, lift: 0 };
      for (const p of userTeam(c).players) p.fatigue = 60;
      weeklyUpkeep(c);
      return userTeam(c).players.reduce((a, p) => a + p.fatigue, 0);
    };
    expect(run(true)).toBeLessThan(run(false));
  });

  it('料理の肉で,怪我が起きにくい', () => {
    let a = 0, b = 0;
    for (let i = 0; i < 4000; i++) {
      const p1 = { fatigue: 60, skills: [], pitches: {}, meet: 50, power: 50, speed: 50, field: 50, velo: 0, ctrl: 0, stam: 0, role: '野手', cond: 2 } as unknown as Player;
      const p2 = { ...p1 } as Player;
      if (maybeInjure(p1, 0.05, 0, 1)) a++;
      if (maybeInjure(p2, 0.05, 0, 0.5)) b++;
    }
    expect(b).toBeLessThan(a * 0.7);
  });

  it('料理の効き目は週ごとに減って,なくなる', () => {
    const c = newCareer('テスト');
    c.meal = { name: 'テスト', weeks: 2, desc: '', rest: 4, guard: 1, lift: 0 };
    playWeek(c, 'mix');
    expect(c.meal!.weeks).toBe(1);
    playWeek(c, 'mix');
    expect(c.meal).toBeNull();
  });

  it('v31 の効いている途中の料理は,体を整える料理として続く', () => {
    const c = newCareer('テスト');
    const old = JSON.parse(JSON.stringify(c)) as Record<string, unknown>;
    old.version = 31;
    old.meal = { name: 'カツ丼', weeks: 3, mult: { meet: 1.7 }, desc: '' };
    const m = migrate(old)!;
    expect(m.meal).toMatchObject({ name: 'カツ丼', weeks: 3, rest: 4, guard: 1, lift: 0 });
    expect((m.meal as unknown as { mult?: unknown }).mult).toBeUndefined();
  });

  it('選手とチームの名前を変えられる.空や長すぎる名前,同じチーム名はだめ', () => {
    const c = newCareer('テスト');
    const u = userTeam(c), o = c.teams.find((t) => !t.user)!;
    const p = o.players[0];
    expect(renamePlayer(c, p.id, '  山田 太郎 ')).toBeNull();
    expect(p.name).toBe('山田 太郎');
    expect(renamePlayer(c, p.id, '   ')).toContain('入れて');
    expect(renamePlayer(c, p.id, 'あ'.repeat(13))).toContain('12文字');
    expect(renamePlayer(c, -5, 'だれ')).toContain('見つかりません');
    expect(renameTeam(c, o.id, u.name)).toContain('同じ名前');
    expect(renameTeam(c, o.id, '新しいチーム')).toBeNull();
    expect(o.name).toBe('新しいチーム');
    expect(renameTeam(c, u.id, 'わがチーム')).toBeNull();
    expect(u.name).toBe('わがチーム');
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

  it('3 つの選手権に,それぞれの階層の全チームが出て,どれも優勝は 1 チームだけ', () => {
    const c = newCareer('テスト');
    playSeason(c, 'mix');
    const teamsIn = (tiers: number[]) => tiers.reduce((n, l) => n + LEAGUES[l].teams * LEAGUES[l].count, 0);
    // プレイヤーはいちばん下の階層なので,アマチュアの大会に出る
    const total = teamsIn(CUPS[0].tiers);
    expect(c.cupBracket.length).toBe(total - 1);
    const ids = new Set(c.cupBracket.flatMap((m) => [m.aId, m.bId]));
    expect(ids.size).toBe(total);
    expect(c.sideCups).toHaveLength(CUPS.length - 1);
    for (const [i, side] of c.sideCups!.entries()) {
      expect(side.live.done).toBe(true);
      expect(side.bracket.length).toBe(teamsIn(CUPS[i + 1].tiers) - 1);
    }
    expect(c.cups.length).toBe(CUPS.length);
    expect(new Set(c.cups.map((x) => x.kind)).size).toBe(CUPS.length);
    const final = c.cupBracket[c.cupBracket.length - 1];
    expect(final.round).toBe('決勝');
    expect(c.cups.find((x) => x.kind === 'ama')!.championId).toBe(final.winner);
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
    for (const t of c.teams) for (const p of t.players) expect(p.stats.g).toBeLessThanOrEqual(gamesPerSeason(c.leagues.find((l) => l.teamIds.includes(t.id))!.level) + 8 + 6);
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
    expect(mk(5).rest).toBeGreaterThan(mk(0).rest);
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

  it('新しい出来事(シェフ・覚醒・OB・情報・寄付・慶事)がどの選択でも成り立つ', () => {
    for (const choice of [0, 1]) {
      const c = newCareer('テスト');
      const t = userTeam(c);
      const young = t.players.find((p) => p.age <= 23) ?? t.players[0];
      const mk = (kind: string): GameEvent => ({
        kind, title: kind, body: '', pid: young.id, choices: [{ key: '', label: '', hint: '' }, { key: '', label: '', hint: '' }],
      });
      const keys: Record<string, string[]> = {
        chef: ['cook', 'learn'], awake: ['push', 'watch'], ob: ['talk', 'batting'], tip: ['check', 'skip'], donate: ['accept', 'decline'], family: ['party', 'quiet'],
      };
      for (const kind of Object.keys(keys)) {
        c.event = mk(kind);
        const w0 = c.watch.length, f0 = c.funds;
        const text = resolveEvent(c, keys[kind][choice]);
        expect(text.length).toBeGreaterThan(0);
        expect(c.event).toBeNull();
        if (kind === 'tip' && choice === 0) { expect(c.watch.length).toBe(w0 + 1); expect(c.funds).toBeLessThan(f0); }
        if (kind === 'donate' && choice === 0) expect(c.funds).toBeGreaterThan(f0);
        if (kind === 'chef' && choice === 0) expect(c.meal).not.toBeNull();
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
    expect(f0.upN).toBe(1);
    c.level = LEAGUES.length - 1;
    const f1 = forecast(c, 60);
    expect(f1.upN).toBe(0);
    expect(f1.up).toBe(0);
    expect(f1.downN).toBe(relegPerLeague(LEAGUES.length - 1));
  });

  it('境目ごとに上がる数と下がる数が等しく,開幕後も各リーグのチーム数は変わらない', () => {
    const c = newCareer('テスト');
    playSeason(c, 'mix');
    const o = c.off!;
    for (let l = 0; l < LEAGUES.length - 1; l++) {
      const up = leaguesInTier(c, l).flatMap((lg) => lg.teamIds).filter((id) => o.next[id] === l + 1).length;
      const down = leaguesInTier(c, l + 1).flatMap((lg) => lg.teamIds).filter((id) => o.next[id] === l).length;
      // 各リーグの優勝チームが自動で上がり,入れ替え戦で下が勝てばさらに上がる
      const auto = LEAGUES[l].count;
      const swaps = Math.min(LEAGUES[l].count, LEAGUES[l + 1].count);
      expect(up).toBeGreaterThanOrEqual(auto);
      expect(up).toBeLessThanOrEqual(auto + swaps);
      expect(down).toBe(up);
      // 各リーグの優勝チームは必ず上がる
      for (const lg of leaguesInTier(c, l)) expect(o.next[standings(c, lg)[0].t.id]).toBe(l + 1);
    }
    // 最下位リーグの最下位は降格しない
    for (const lg of leaguesInTier(c, 0)) expect(o.next[standings(c, lg).slice(-1)[0].t.id]).toBe(0);
    while (!c.off!.draft.done) pickDraft(c, -1);
    newSeason(c);
    LEAGUES.forEach((L, l) => {
      const lgs = leaguesInTier(c, l);
      expect(lgs).toHaveLength(L.count);
      for (const lg of lgs) expect(lg.teamIds, leagueName(lg)).toHaveLength(L.teams);
    });
    expect(new Set(c.leagues.flatMap((lg) => lg.teamIds)).size).toBe(c.teams.length);
  });
});

describe('入れ替え戦と拡張', () => {
  beforeEach(() => setRandom(seeded(321)));
  afterEach(() => resetRandom());

  it('地区のあるリーグでは,プレーオフの見込みを自分の地区の上位2で出す', () => {
    const c = newCareer('テスト');
    const pro = c.leagues[3];
    // プレイヤーをプロに移し,同じ地区の相手を極端に弱くする
    c.leagues[0].teamIds = c.leagues[0].teamIds.filter((id) => id !== c.userId);
    pro.teamIds = [...pro.teamIds.slice(1), c.userId];
    pro.divs = [pro.teamIds.slice(0, 6), pro.teamIds.slice(6)];
    c.level = 3;
    const mine = pro.divs.find((d) => d.includes(c.userId))!;
    for (const id of mine) if (id !== c.userId) for (const p of c.teams.find((t) => t.id === id)!.players) for (const k of keysOf(p)) p[k] = 10;
    for (const id of pro.teamIds) pro.stand[id] ??= { w: 0, l: 0, d: 0, rf: 0, ra: 0 };
    const f = forecast(c, 200);
    // 全体の上位 4 より,地区の上位 2 のほうが入りやすい状況
    expect(f.playoff).toBeGreaterThan(f.rank.slice(0, 4).reduce((a, b) => a + b, 0) - 0.01);
    expect(f.playoff).toBeLessThanOrEqual(1);
  });

  it('2位と下から2番目の入れ替え戦の結果が記録され,勝った方が上に残る', () => {
    const c = newCareer('テスト');
    playSeason(c, 'mix');
    const o = c.off!;
    const pairs = LEAGUES.slice(0, -1).reduce((n, L, l) => n + Math.min(L.count, LEAGUES[l + 1].count), 0);
    expect(o.swaps).toHaveLength(pairs);
    // 入れ替え戦に出た 2 チームは,片方が上,片方が下に分かれる
    const seconds = c.leagues.map((lg) => standings(c, lg)[1].t.id);
    for (let l = 0; l < LEAGUES.length - 1; l++) {
      const lows = seconds.filter((id) => leaguesInTier(c, l).some((lg) => lg.teamIds.includes(id)) && o.next[id] === l + 1);
      for (const id of lows) expect(leaguesInTier(c, l).some((lg) => standings(c, lg)[1].t.id === id)).toBe(true);
    }
  });

  it('足りないチームは,次のシーズンの開幕で AI チームとして加わる', () => {
    const c = newCareer('テスト');
    playSeason(c, 'mix');
    // 古いセーブのように,プロから 2 チームが少なく,草野球のリーグが 1 つしかない状態にする
    const pro = leaguesInTier(c, 4)[0];
    for (const id of pro.teamIds.slice(-2)) {
      c.teams = c.teams.filter((t) => t.id !== id);
      delete c.off!.next[id];
    }
    pro.teamIds = pro.teamIds.slice(0, -2);
    const grass = leaguesInTier(c, 0);
    for (const lg of grass.slice(1)) {
      for (const id of lg.teamIds) { if (id === c.userId) continue; c.teams = c.teams.filter((t) => t.id !== id); delete c.off!.next[id]; }
      c.leagues = c.leagues.filter((x) => x !== lg);
    }
    if (!grass[0].teamIds.includes(c.userId)) grass[0].teamIds.push(c.userId);
    arrangeLeagues(c, c.off!.next);
    expect(c.teams.filter((t) => c.off!.next[t.id] === 4)).toHaveLength(LEAGUES[4].teams);
    expect(leaguesInTier(c, 0)).toHaveLength(LEAGUES[0].count);
    for (const lg of leaguesInTier(c, 0)) expect(lg.teamIds).toHaveLength(LEAGUES[0].teams);
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
    expect(c.leagues.length).toBe(LEAGUES.reduce((n, L) => n + L.count, 0));
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
    c.leagues.forEach((lg) => {
      if (LEAGUES[lg.level].divs) {
        expect(lg.divs).toBeDefined();
        expect(lg.divs!.flat().sort()).toEqual([...lg.teamIds].sort());
        expect(lg.divs![0].length + lg.divs![1].length).toBe(lg.teamIds.length);
      } else expect(lg.divs).toBeUndefined();
    });
  });

  it('地区のあるリーグのプレーオフは,各地区の上位 2 チーム', () => {
    const c = newCareer('テスト');
    const lg = leaguesInTier(c, LEAGUES.length - 1)[0];
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
    expect(leaguesInTier(m!, LEAGUES.length - 1)[0].divs).toBeDefined();
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
      const ps = leaguesInTier(c, lv).flatMap((lg) => lg.teamIds).flatMap((id) => c.teams.find((t) => t.id === id)!.players);
      return ps.filter((p) => FOREIGN_FIRST.includes(p.name.split(' ')[0])).length / ps.length;
    };
    expect(share(0)).toBeLessThan(0.05);
    expect(share(LEAGUES.length - 1)).toBeGreaterThan(share(0) + 0.2);
    expect(share(LEAGUES.length - 1)).toBeGreaterThan(share(3));
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

describe('料理と成長上限とミッション', () => {
  beforeEach(() => setRandom(seeded(555)));
  afterEach(() => resetRandom());

  it('料理は種類が増え,旬の食材を使うと効き目が大きい', () => {
    expect(RECIPES.length).toBeGreaterThanOrEqual(25);
    expect(new Set(RECIPES.map((r) => r.kind)).size).toBeGreaterThanOrEqual(5);
    const c = newCareer('テスト');
    c.cal = 16; // 5月ごろ: 野菜が旬
    for (const k of Object.keys(c.pantry) as (keyof typeof c.pantry)[]) c.pantry[k] = 5;
    const plain = cook(c, 'onigiri')!;
    const inSeason = cook(c, 'soup')!;
    expect(seasonalIng(c.cal)).toBe('veg');
    expect(inSeason.name).toContain('旬');
    expect(plain.name).not.toContain('旬');
    const soup = RECIPES.find((r) => r.key === 'soup')!;
    expect(inSeason.desc).toBe(effectText(mealEffect(c, soup)));
    c.cal = 0; // 冬: 野菜は旬でない
    expect(mealEffect({ ...c, cal: 16 }, soup).recover).toBeGreaterThan(mealEffect(c, soup).recover);
  });

  it('おすすめ料理は作れるものだけで,材料が足りなければ出さない', () => {
    const c = newCareer('テスト');
    for (const k of Object.keys(c.pantry) as (keyof typeof c.pantry)[]) c.pantry[k] = 0;
    expect(adviseMeals(c)).toHaveLength(0);
    c.pantry.rice = 1; c.pantry.meat = 2; c.pantry.egg = 1;
    const tips = adviseMeals(c);
    expect(tips.length).toBeGreaterThan(0);
    expect(tips.every((t) => canCook(c, t.recipe))).toBe(true);
    expect(tips[0].reason.length).toBeGreaterThan(0);
  });

  it('料理の勝負めしは,食べると全員の調子が上がる', () => {
    const c = newCareer('テスト');
    for (const p of userTeam(c).players) p.cond = 1;
    cook(c, 'victory', true);
    expect(userTeam(c).players.every((p) => p.cond === 3)).toBe(true);
  });

  it('ミッションの報酬には資金が含まれ,達成すると受け取れる', () => {
    const c = newCareer('テスト');
    expect(c.missions.every((m) => (m.cash ?? 0) > 0)).toBe(true);
    const m = c.missions[0];
    const f0 = c.funds;
    m.progress = m.target;
    updateMissions(c, { menu: 'mix', games: [] });
    expect(c.funds).toBeGreaterThanOrEqual(f0 + (m.cash ?? 0));
  });

  it('成長の上限は目安で,超えた先も少しずつ伸びる', () => {
    const c = newCareer('テスト');
    const p = userTeam(c).players[0];
    p.age = 24;
    p.meet = 60; p.pot.meet = 60;
    let over = 0;
    for (let i = 0; i < 400; i++) { growAttr(p, 'meet', 1); if (p.pot.meet - p.meet < -3) break; over++; }
    expect(p.meet).toBeGreaterThan(60);
    expect(over).toBeGreaterThan(5);
  });

  it('上限は年ごとにゆらぎ,まれに覚醒して大きく広がる', () => {
    const c = newCareer('テスト');
    const p = userTeam(c).players.find((x) => x.role === '野手')!;
    p.age = 20;
    let wake = 0;
    for (let i = 0; i < 400; i++) {
      const before = { ...p.pot };
      const k = driftPot(p);
      if (k) { wake++; expect(p.pot[k]).toBeGreaterThanOrEqual(before[k]); }
      p.age = 20;
    }
    expect(wake).toBeGreaterThan(3);
    expect(wake).toBeLessThan(60);
  });
});

describe('見た目(カード・エンブレム・トーナメント表)', () => {
  beforeEach(() => setRandom(seeded(77)));
  afterEach(() => resetRandom());

  it('カードのレア度は総合値のランクで決まり,カードに名前と総合値が入る', () => {
    const c = newCareer('テスト');
    const p = userTeam(c).players[0];
    for (const k of keysOf(p)) p[k] = 50;
    expect(rarityOf(p)).toBe(1);
    for (const k of keysOf(p)) p[k] = 85;
    expect(rarityOf(p)).toBe(4);
    const svg = cardSVG(p);
    expect(svg).toContain(p.name);
    expect(svg).toContain('LEGEND');
    expect(svg).toContain('>85<');
  });

  it('カードの上限の印は,正確な上限ではなく詳細画面と同じ目安を使う', () => {
    const c = newCareer('テスト');
    const p = userTeam(c).players.find((x) => x.role === '野手')!;
    p.meet = 40; p.pot.meet = 73;
    const hint = potHint(p, 'meet');
    expect(hint % 5).toBe(0);
    const svg = cardSVG(p);
    // ミートの行の印の位置(バーの幅 70 に対する割合)
    expect(svg).toContain(`x="${BAR_X + (BAR_W * hint) / 100 - 0.5}"`);
    if (hint !== 73) expect(svg).not.toContain(`x="${BAR_X + (BAR_W * 73) / 100 - 0.5}"`);
    expect(detailSheet(c, p.id)).toContain(`上限 ${hint}前後`);
  });

  it('エンブレムはチーム名からいつも同じ色と文字になる', () => {
    expect(emblemChar('ニューヨーク・キングス')).toBe('キ');
    expect(emblemChar('河川敷ドリームス')).toBe('河');
    expect(teamColors({ name: 'A' })).toEqual(teamColors({ name: 'A' }));
    expect(emblem({ name: '河川敷ドリームス' })).toContain('<svg');
  });

  it('全日本選手権が終わると,準々決勝から決勝までの表と優勝チームが描かれる', () => {
    const c = newCareer('テスト');
    while (c.phase === 'season') playWeek(c, 'mix');
    const svg = cupBracketSVG(c);
    expect(svg).toContain('準々決勝');
    expect(svg).toContain('🏆');
    expect(svg).not.toContain('未定');
  });

  it('本拠地の絵は,施設を強くするほど描くものが増える', () => {
    const c = newCareer('テスト');
    const small = stadiumSVG(c, 'テスト');
    c.fac = { stadium: 5, ground: 3, clinic: 2, canteen: 2, scout: 2 };
    const big = stadiumSVG(c, 'テスト');
    expect(big.length).toBeGreaterThan(small.length * 2);
    expect(big).toContain('スタジアムLv5');
  });

  it('プレーオフの表は,準決勝の前でも組み合わせを描き,決勝は未定にする', () => {
    const c = newCareer('テスト');
    while (c.cal < PLAYOFF_START) playWeek(c, 'mix');
    const lg = c.leagues[c.level];
    const svg = playoffBracketSVG(c, lg);
    expect(svg).toContain('準決勝');
  });
});

describe('BGM の楽譜', () => {
  it('どの曲も,1 小節が 8 ステップで,音名がすべて読め,コードと小節の数がそろう', () => {
    for (const [name, s] of Object.entries(SONGS)) {
      expect(s.chords.length, name).toBe(s.melody.length);
      for (const bar of s.melody) {
        const toks = bar.split(/\s+/);
        expect(toks, `${name}: ${bar}`).toHaveLength(STEPS_PER_BAR);
        for (const t of toks) if (t !== '-' && t !== '.') expect(midi(t), `${name}: ${t}`).not.toBeNull();
        expect(toks[0], `${name}: 小節の頭がのばしになっている`).not.toBe('-');
      }
      if (s.drums) expect(s.drums).toHaveLength(STEPS_PER_BAR);
    }
  });

  it('音の高さとコードの計算が正しい', () => {
    expect(midi('A4')).toBe(69);
    expect(midi('C4')).toBe(60);
    expect(midi('Bb4')).toBe(70);
    expect(midi('F#5')).toBe(78);
    expect(Math.round(freq(69))).toBe(440);
    expect(chordTones('Am')).toEqual({ root: 9, tones: [0, 3, 7] });
    expect(chordTones('Bb').root).toBe(10);
  });

  it('のばしの記号でメロディの音の長さが決まり,曲はくり返す', () => {
    const s = SONGS.title;
    expect(notesAt(s, 0).lead).toEqual({ midi: midi('E5'), len: 2 });
    expect(notesAt(s, 1).lead).toBeNull();
    expect(notesAt(s, songSteps(s))).toEqual(notesAt(s, 0));
    expect(notesAt(SONGS.game, 0).drum).toBe('k');
  });
});

describe('セーブを軽くする', () => {
  beforeEach(() => setRandom(seeded(4242)));
  afterEach(() => resetRandom());

  it('古いシーズンを1行にまとめても,通算成績とシーズン数は変わらない', () => {
    const c = newCareer('テスト');
    const p = userTeam(c).players[0];
    for (let s = 1; s <= 9; s++) {
      p.seasons.push({ season: s, level: s >= 5 ? 1 : 0, team: 'X', age: 20 + s, stats: { ...emptyStats(), g: 10, h: s, hr: 1, ab: 30 } });
    }
    const before = careerStats(p, false), n = seasonCount(p);
    foldHistory(p, 4);
    expect(p.seasons).toHaveLength(5);
    expect(p.seasons[0].rolled).toBe(5);
    expect(p.seasons[0].level).toBe(1);
    expect(careerStats(p, false)).toEqual(before);
    expect(seasonCount(p)).toBe(n);
    foldHistory(p, 4);
    expect(p.seasons).toHaveLength(5);
  });

  it('AI チームの選手は,何年たっても最近のシーズンだけを持ち,セーブが軽い', () => {
    const c = newCareer('テスト');
    for (let s = 0; s < 6; s++) {
      while (c.phase === 'season') playWeek(c, 'mix');
      while (!c.off!.draft.done) pickDraft(c, -1);
      newSeason(c);
    }
    const ai = c.teams.filter((t) => !t.user).flatMap((t) => t.players);
    expect(Math.max(...ai.map((p) => p.seasons.filter((x) => !x.rolled).length))).toBeLessThanOrEqual(4);
    expect(ai.some((p) => p.seasons.some((x) => x.rolled))).toBe(true);
  });
});

describe('6 階層への移行(v25 → v26)', () => {
  beforeEach(() => setRandom(seeded(2626)));
  afterEach(() => resetRandom());

  it('昔の 5 階層のセーブは,番号を付け直し,市民リーグを足し,次の開幕で地域のリーグに分かれる', () => {
    const c = newCareer('テスト');
    // 昔の形に戻す: 1 階層に 1 リーグ(プレイヤーのいる草野球,社会人,独立,プロ,メジャー)
    const pick = [userLeague(c), ...[2, 3, 4, 5].map((t) => leaguesInTier(c, t)[0])];
    const keep = new Set(pick.flatMap((lg) => lg.teamIds));
    const old = JSON.parse(JSON.stringify({ ...c, teams: c.teams.filter((t) => keep.has(t.id)) })) as Career;
    old.leagues = JSON.parse(JSON.stringify(pick));
    old.leagues.forEach((lg, i) => { lg.level = i; delete lg.sub; });
    old.level = 0;
    old.rec.titles = [2, 1, 0, 0, 0];
    old.ach = { up1: 1, title0: 1, title1: 1 };
    old.champs = [{ season: 1, level: 1, team: 'x', teamId: 1, runnerUp: 'y' }];
    old.cups = [{ season: 1, champion: 'x', championId: 1, championLevel: 2, runnerUp: 'y' }];
    (old as unknown as { version: number }).version = 25;
    const m = migrate(old)!;
    expect(m).not.toBeNull();
    expect(m.leagues.map((l) => l.level)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(m.rec.titles).toEqual([2, 0, 1, 0, 0, 0]);
    expect(m.ach).toEqual({ up2: 1, title0: 1, title2: 1 });
    expect(m.champs[0].level).toBe(2);
    expect(m.cups[0].championLevel).toBe(3);
    expect(m.cups[0].kind).toBe('ama');
    playSeason(m);
    prepareNextSeason(m);
    LEAGUES.forEach((L, l) => {
      expect(leaguesInTier(m, l), L.name).toHaveLength(L.count);
      for (const lg of leaguesInTier(m, l)) expect(lg.teamIds).toHaveLength(L.teams);
    });
  });
});

describe('月の方針と行動枠', () => {
  beforeEach(() => setRandom(seeded(1212)));
  afterEach(() => resetRandom());

  it('方針は月に 1 回だけ決められ,行動は枠の数まで,同じ行動は 1 回', () => {
    const c = newCareer('テスト');
    expect(needsPlan(c)).toBe(true);
    expect(setMonthPlan(c, null, ['rest', 'talk', 'fan']).error).not.toBeNull();
    expect(setMonthPlan(c, null, ['rest', 'rest']).error).not.toBeNull();
    const r = setMonthPlan(c, 'bat', ['rest', 'talk']);
    expect(r.error).toBeNull();
    expect(r.results).toHaveLength(2);
    expect(needsPlan(c)).toBe(false);
    expect(setMonthPlan(c, 'pitch', []).error).not.toBeNull();
    // 今月の練習は方針どおり
    expect(chooseMenu(c, null, 'mix')).toBe('bat');
    // 今週だけの休養は方針より優先
    expect(chooseMenu(c, 'rest', 'mix')).toBe('rest');
  });

  it('月が変わると,また方針を決める.決めずに進むと,練習はおまかせで行動はしない', () => {
    const c = newCareer('テスト');
    setMonthPlan(c, 'bat', []);
    for (let i = 0; i < 4; i++) playWeek(c, chooseMenu(c, null, 'mix'));
    expect(needsPlan(c)).toBe(true);
    const f0 = c.funds;
    playWeek(c, chooseMenu(c, null, 'mix'));
    expect(needsPlan(c)).toBe(false);
    expect(currentPlan(c)!.menu).toBeNull();
    expect(currentPlan(c)!.actions).toEqual([]);
    expect(c.funds).toBeGreaterThan(0);
    void f0;
  });

  it('特訓は食材を使い,選んだ選手の育成方針の重点を大きく伸ばす', () => {
    const c = newCareer('テスト');
    for (const k of Object.keys(c.pantry) as (keyof typeof c.pantry)[]) c.pantry[k] = 0;
    expect(setMonthPlan(c, null, ['special']).error).toContain('食材');
    c.pantry.rice = 2; c.pantry.meat = 2;
    const p = userTeam(c).players.find((x) => x.role === '野手')!;
    p.plan = 'slugger'; p.age = 21; p.power = 40; p.pot.power = 80; p.meet = 40; p.pot.meet = 80;
    const r = setMonthPlan(c, null, ['special'], p.id);
    expect(r.error).toBeNull();
    expect(c.pantry.rice + c.pantry.meat).toBe(1);
    expect(p.power + p.meet).toBeGreaterThan(81.5);
    expect(r.results[0]).toContain(p.name);
  });

  it('スカウト遠征は資金を使って注目選手を増やし,スポンサー営業は資金を増やす', () => {
    const c = newCareer('テスト');
    const f0 = c.funds, w0 = c.watch.length;
    setMonthPlan(c, null, ['scout', 'sponsor']);
    expect(c.watch.length).toBe(w0 + 1);
    expect(c.funds).not.toBe(f0);
    // 行動を枠いっぱい使うミッションが達成できる
    c.missions = [{ id: 99, kind: 'act', title: 'x', target: 1, progress: 0, reward: {} }];
    updateMissions(c, { menu: 'mix', games: [] });
    expect(c.missions.some((m) => m.id === 99)).toBe(false);
  });
});

describe('出場で伸びる育成と二軍', () => {
  beforeEach(() => setRandom(seeded(3131)));
  afterEach(() => resetRandom());

  it('試合に出た経験で伸び,出番が多いほど,若いほど伸びる', () => {
    const c = newCareer('テスト');
    const mk = (age: number) => { const p = genPlayer(c, '野手', 40, { age }); for (const k of keysOf(p)) { p[k] = 40; p.pot[k] = 90; } return p; };
    const sum = (p: Player) => keysOf(p).reduce((s, k) => s + p[k], 0);
    const full = mk(20), half = mk(20), old = mk(30), none = mk(20);
    for (let i = 0; i < 30; i++) { gameExperience(full, 1); gameExperience(half, 0.5); gameExperience(old, 1); gameExperience(none, 0); }
    expect(sum(full)).toBeGreaterThan(sum(half));
    expect(sum(half)).toBeGreaterThan(sum(none));
    expect(sum(full)).toBeGreaterThan(sum(old));
    expect(sum(none)).toBe(160);
  });

  it('公式戦に出たレギュラーは,控えより伸びる', () => {
    const c = newCareer('テスト');
    const u = userTeam(c);
    const starter = findPlayer(u, u.lineup[0].pid)!;
    const bench = fielders(u).find((p) => !u.lineup.some((e) => e.pid === p.id))!;
    for (const p of [starter, bench]) { p.age = 21; for (const k of keysOf(p)) { p[k] = 45; p.pot[k] = 90; } }
    c.auto.lineup = false;
    // リーグ戦を最後まで(どちらも怪我をしないように,毎週の疲れはとっておく)
    while (c.cal < PLAYOFF_START) { playWeek(c, 'rest'); for (const p of [starter, bench]) { p.fatigue = 0; p.inj = null; } }
    const s = (p: Player) => keysOf(p).reduce((a, k) => a + p[k], 0);
    expect(s(starter)).toBeGreaterThan(s(bench) + 1);
  });

  it('二軍の選手は一軍の人数に数えず,試合に出ず,一軍の最低人数は守られる', () => {
    const c = newCareer('テスト');
    const u = userTeam(c);
    const p = fielders(u).find((x) => !u.lineup.some((e) => e.pid === x.id))!;
    const before = activePlayers(u).length;
    expect(toFarm(u, p.id)).toBeNull();
    expect(activePlayers(u).length).toBe(before - 1);
    expect(fielders(u).includes(p)).toBe(false);
    expect(toFarm(u, p.id)).not.toBeNull();
    // 一軍の野手を最低人数まで減らすと,それ以上は送れない
    while (fielders(u).length > MIN_FIELDERS) {
      const q = fielders(u).find((x) => !u.lineup.some((e) => e.pid === x.id)) ?? fielders(u)[0];
      if (toFarm(u, q.id)) break;
    }
    expect(fielders(u).length).toBeGreaterThanOrEqual(MIN_FIELDERS);
    expect(isLineupValid(u)).toBe(true);
    // 一軍が上限なら,上げられない
    expect(fromFarm(u, p.id, activePlayers(u).length)).not.toBeNull();
    expect(fromFarm(u, p.id, 99)).toBeNull();
    expect(isFarm(u, p)).toBe(false);
    // 二軍の投手は,登板の順番から外れる
    const pit = pitchersOf(u)[pitchersOf(u).length - 1];
    toFarm(u, pit.id);
    expect(u.pitchers.includes(pit.id)).toBe(false);
    fromFarm(u, pit.id, 99);
    expect(u.pitchers.includes(pit.id)).toBe(true);
  });

  it('二軍の若手も,毎週少しずつ経験を積む', () => {
    const c = newCareer('テスト');
    const u = userTeam(c);
    const p = fielders(u).find((x) => !u.lineup.some((e) => e.pid === x.id))!;
    p.age = 20; for (const k of keysOf(p)) { p[k] = 40; p.pot[k] = 90; }
    toFarm(u, p.id);
    const s0 = keysOf(p).reduce((a, k) => a + p[k], 0);
    for (let i = 0; i < 8; i++) playWeek(c, 'rest');
    expect(keysOf(p).reduce((a, k) => a + p[k], 0)).toBeGreaterThan(s0 + 1);
  });
});

describe('チームの戦術', () => {
  beforeEach(() => setRandom(seeded(4747)));
  afterEach(() => resetRandom());

  it('戦術を変えると浸透度が下がり,公式戦の週ごとに上がる', () => {
    const c = newCareer('テスト');
    expect(tacticPower(c)).toBeCloseTo(1, 5);
    setTactic(c, 'power');
    expect(c.tacticFam).toBe(FAM_START);
    const p0 = tacticPower(c);
    while (c.cal < 20) playWeek(c, 'mix');
    expect(c.tacticFam!).toBeGreaterThan(FAM_START);
    expect(tacticPower(c)).toBeGreaterThan(p0 * 0.9);
    setTactic(c, 'power');
    expect(c.tacticFam!).toBeGreaterThan(FAM_START);
  });

  it('戦術研究で浸透度が大きく上がる', () => {
    const c = newCareer('テスト');
    setTactic(c, 'speed');
    setMonthPlan(c, null, ['study']);
    expect(c.tacticFam).toBe(FAM_START + 25);
  });

  it('強打は本塁打を,機動力は盗塁を増やす(同じチームどうしで多くの試合)', () => {
    const run = (tactic: 'balance' | 'power' | 'speed') => {
      setRandom(seeded(99));
      const c = newCareer('テスト');
      c.tactic = tactic; c.tacticFam = 100;
      const u = userTeam(c);
      const fx = tacticFx(c);
      u.staffFx = fx.fx; u.runMult = fx.run;
      const opp = c.teams.find((t) => !t.user && t.players.length)!;
      let hr = 0, sb = 0;
      for (let i = 0; i < 200; i++) {
        const before = u.players.reduce((s, p) => [s[0] + p.stats.hr, s[1] + p.stats.sb], [0, 0]);
        const g = newGame(u, opp, false);
        stepToEnd(g);
        const after = u.players.reduce((s, p) => [s[0] + p.stats.hr, s[1] + p.stats.sb], [0, 0]);
        hr += after[0] - before[0]; sb += after[1] - before[1];
        for (const p of [...u.players, ...opp.players]) p.fatigue = 0;
      }
      return { hr, sb };
    };
    const base = run('balance'), power = run('power'), speed = run('speed');
    expect(power.hr).toBeGreaterThan(base.hr * 1.1);
    expect(speed.sb).toBeGreaterThan(base.sb * 1.3);
  });

  it('戦術に合う選手は,ドラフトのおすすめで点が上がる', () => {
    const c = newCareer('テスト');
    const fast = genPlayer(c, '野手', 50, { age: 20 }), slow = genPlayer(c, '野手', 50, { age: 20 });
    fast.speed = 85; slow.speed = 30;
    setTactic(c, 'speed');
    expect(tacticBonus(c, fast)).toBeGreaterThan(tacticBonus(c, slow));
    setTactic(c, 'balance');
    expect(tacticBonus(c, fast)).toBe(0);
  });
});

describe('ドラフトの人数', () => {
  it('どの階層でも,候補はその階層の全チームが指名できるだけいて,プレイヤーの番が来る', () => {
    for (const seed of [1, 2, 3]) {
      setRandom(seeded(500 + seed));
      const c = newCareer('テスト');
      playSeason(c, 'mix');
      const d = c.off!.draft;
      const teams = LEAGUES[c.off!.to].teams * LEAGUES[c.off!.to].count;
      expect(d.order.length).toBe(teams * DRAFT_ROUNDS);
      expect(d.pool.length + d.picks.length).toBeGreaterThanOrEqual(d.order.length);
      expect(d.done).toBe(false);
      resetRandom();
    }
  });
});

describe('ファンと人気', () => {
  beforeEach(() => setRandom(seeded(6161)));
  afterEach(() => resetRandom());

  it('勝てばファンが増え,ホームの勝ちと番狂わせはより増え,負ければ少し減る', () => {
    const c = newCareer('テスト');
    const f0 = fansOf(c);
    fansAfterGame(c, true, false, 1, false);
    const away = fansOf(c) - f0;
    const f1 = fansOf(c);
    fansAfterGame(c, true, true, 1, true);
    expect(fansOf(c) - f1).toBeGreaterThan(away);
    const f2 = fansOf(c);
    fansAfterGame(c, false, true, -3, false);
    expect(fansOf(c)).toBeLessThan(f2);
  });

  it('人気が高いほど収入が増え,自由契約の選手から見た魅力も上がる', () => {
    const c = newCareer('テスト');
    c.fans = market(c.level) * 0.5;
    const lowIncome = weeklyIncome(c), lowAppeal = faAppeal(c);
    c.fans = market(c.level) * 2;
    expect(weeklyIncome(c)).toBeGreaterThan(lowIncome * 1.3);
    expect(faAppeal(c)).toBeGreaterThan(lowAppeal);
  });

  it('上の階層に上がると,同じファンの数でも人気は下がる(市場が大きくなる)', () => {
    const c = newCareer('テスト');
    c.fans = market(0) * 2;
    const p0 = popularity(c);
    c.level = 1;
    expect(popularity(c)).toBeLessThan(p0);
  });

  it('1シーズン戦うと,ファンの数が動き,ファン行事で増える', () => {
    const c = newCareer('テスト');
    const f0 = fansOf(c);
    setMonthPlan(c, null, ['fan']);
    expect(fansOf(c)).toBeGreaterThan(f0);
    playSeason(c, 'mix');
    expect(fansOf(c)).not.toBe(f0);
  });
});

describe('勝負どころ', () => {
  beforeEach(() => setRandom(seeded(8080)));
  afterEach(() => resetRandom());

  /** プレイヤーが攻撃中の,8 回・同点・二塁に走者の場面を作る */
  function chance() {
    const c = newCareer('テスト');
    const u = userTeam(c), opp = c.teams.find((t) => !t.user)!;
    const g = newGame(opp, u, true);
    g.inning = 8; g.half = 0; g.outs = 1;
    const off = g.away;
    g.bases = [null, off.lineup[0].p, null];
    const b = off.lineup[off.bi].p;
    for (const k of keysOf(b)) b[k] = 30;
    const bench = fielders(u).find((p) => !off.lineup.some((e) => e.p.id === p.id))!;
    for (const k of keysOf(bench)) bench[k] = 80;
    return { c, g, b, bench };
  }

  it('終盤の接戦で得点圏に走者がいて,控えにずっといい打者がいると,代打の相談になる', () => {
    const { g, b, bench } = chance();
    const m = findMoment(g)!;
    expect(m.kind).toBe('pinch');
    expect(m.out).toBe(b);
    expect(m.in).toBe(bench);
    expect(m.managerSays).toBe(true);
    expect(m.onBase).toBe('二塁');
  });

  it('GMが代打を選ぶと打者が代わり,続投を選ぶと代わらない.相談は 1 試合に 1 回', () => {
    const a = chance();
    applyMoment(a.g, findMoment(a.g)!, 'yes');
    expect(a.g.away.lineup[a.g.away.bi].p).toBe(a.bench);
    expect(findMoment(a.g)).toBeNull();
    expect(a.g.moment!.went).toBe(true);
    const b = chance();
    applyMoment(b.g, findMoment(b.g)!, 'no');
    expect(b.g.away.lineup[b.g.away.bi].p).toBe(b.b);
    expect(b.g.moment!.choice).toBe('no');
  });

  it('勝負どころのあとの出来事は,その回の,相談より後のもの', () => {
    const { g } = chance();
    applyMoment(g, findMoment(g)!, 'yes');
    stepToEnd(g);
    const after = momentFollowUp(g);
    expect(after.length).toBeGreaterThan(0);
    for (const e of after) { expect(e.inning).toBe(8); expect(e.half).toBe(0); }
  });

  it('序盤や大差では相談しない', () => {
    const a = chance();
    a.g.inning = 3;
    expect(findMoment(a.g)).toBeNull();
    const b = chance();
    b.g.home.runs = 6;
    expect(findMoment(b.g)).toBeNull();
  });

  it('1 週の進行は勝負どころで止まり,答えると最後まで進む', () => {
    const c = newCareer('テスト');
    let moments = 0;
    for (let w = 0; w < 48 && c.phase === 'season'; w++) {
      const gen = weekGen(c, 'mix');
      let r = gen.next('auto');
      while (!r.done) { moments++; expect(['pinch', 'relief']).toContain(r.value.kind); r = gen.next(moments % 2 ? 'yes' : 'no'); }
      expect(r.value.menu).toBeDefined();
    }
    expect(moments).toBeGreaterThan(0);
    expect(isLineupValid(userTeam(c))).toBe(true);
  });
});

describe('球団の歴史と,タイトルの恩恵', () => {
  beforeEach(() => setRandom(seeded(9090)));
  afterEach(() => resetRandom());

  it('シーズン記録は,より良い成績が出たときだけ塗り替わり,知らせが出る', () => {
    const c = newCareer('テスト');
    const p = fielders(userTeam(c))[0];
    p.stats.hr = 10;
    expect(updateFranchise(c)).toEqual([]);
    expect(franchiseOf(c).best.hr.v).toBe(10);
    p.stats.hr = 8;
    expect(updateFranchise(c)).toEqual([]);
    p.stats.hr = 15;
    const news = updateFranchise(c);
    expect(news.some((n) => n.includes('球団新記録') && n.includes('本塁打'))).toBe(true);
    expect(franchiseOf(c).best.hr.v).toBe(15);
  });

  it('防御率は低いほど記録で,投球回が足りないと数えない', () => {
    const c = newCareer('テスト');
    const p = pitchersOf(userTeam(c))[0];
    Object.assign(p.stats, { outs: 30, r: 1 });
    updateFranchise(c);
    expect(franchiseOf(c).best.era).toBeUndefined();
    Object.assign(p.stats, { outs: 90, r: 20 });
    updateFranchise(c);
    const first = franchiseOf(c).best.era.v;
    Object.assign(p.stats, { outs: 90, r: 10 });
    updateFranchise(c);
    expect(franchiseOf(c).best.era.v).toBeLessThan(first);
  });

  it('5 シーズン以上いた選手は,引退で球団殿堂に入り,翌年から OB コーチの候補になる', () => {
    const c = newCareer('テスト');
    const p = fielders(userTeam(c))[0];
    p.seasons = Array.from({ length: 6 }, (_, i) => ({ season: i + 1, level: 2, team: 'X', age: 25 + i, stats: { ...emptyStats(), g: 20, h: 20, ab: 70 } }));
    expect(induct(c, p)).toContain('球団殿堂');
    const short = fielders(userTeam(c))[1];
    short.seasons = [];
    expect(induct(c, short)).toBeNull();
    expect(obCandidates(c)).toHaveLength(0);
    c.season++;
    refreshPool(c);
    const ob = c.staffPool.find((s) => s.ob)!;
    expect(ob.name).toBe(p.name);
    c.funds = 1e6;
    expect(hireStaff(c, ob.id)).toBeNull();
    refreshPool(c);
    expect(c.staffPool.some((s) => s.ob)).toBe(false);
  });

  it('優勝の賞金は上の大会ほど大きく,個人タイトルの選手は限界が広がる', () => {
    const c = newCareer('テスト');
    const f0 = c.funds;
    titlePerks(c, 'ama');
    const ama = c.funds - f0;
    const f1 = c.funds;
    titlePerks(c, 'world');
    expect(c.funds - f1).toBeGreaterThan(ama);
    const p = fielders(userTeam(c))[0];
    const k = keysOf(p).reduce((a, b) => (p[b] > p[a] ? b : a));
    const pot0 = p.pot[k];
    c.awards.push({ season: c.season, level: 0, kind: 'MVP', pid: p.id, name: p.name, team: 'x', text: '', mine: true });
    expect(awardPerks(c).length).toBe(1);
    expect(p.pot[k]).toBeGreaterThan(pot0);
  });
});

describe('ドラフトの入札・大物の争奪・有利なトレード', () => {
  beforeEach(() => setRandom(seeded(7373)));
  afterEach(() => resetRandom());

  it('1巡目は入札で,目玉選手が 3 人いて,全球団が 1 人ずつ交渉権を得てから 2 巡目に進む', () => {
    const c = newCareer('テスト');
    playSeason(c, 'mix');
    const d = c.off!.draft;
    expect(d.stars).toHaveLength(3);
    expect(lotteryOpen(d)).toBe(true);
    const teams = d.order.length / DRAFT_ROUNDS;
    // 目玉に入札する(外れたら,次の候補でもう一度)
    for (let i = 0; i < 10 && lotteryOpen(d); i++) {
      const target = d.pool.findIndex((p) => d.stars!.includes(p.id));
      pickDraft(c, target >= 0 ? target : 0);
    }
    expect(lotteryOpen(d)).toBe(false);
    const first = d.picks.filter((x) => x.round === 1);
    expect(first.length).toBe(teams);
    expect(new Set(first.map((x) => x.pid)).size).toBe(teams);
    expect(first.filter((x) => x.user)).toHaveLength(1);
    // 目玉は,たいてい競合する
    expect(d.lottery!.log.some((x) => x.includes('競合'))).toBe(true);
  });

  it('交渉権が決まった選手は候補から外れ,どの番号で入札しても重ならない', () => {
    const c = newCareer('テスト');
    playSeason(c, 'mix');
    const d = c.off!.draft;
    const star = d.pool.findIndex((p) => d.stars!.includes(p.id));
    pickDraft(c, star);
    const won = Object.values(d.lottery!.won).filter((x) => x >= 0);
    for (const id of won) expect(d.pool.some((p) => p.id === id)).toBe(false);
    // 外れても,先頭の候補に入札し続ければ必ず終わる
    for (let i = 0; i < 20 && lotteryOpen(d); i++) pickDraft(c, 0);
    expect(lotteryOpen(d)).toBe(false);
    const first = d.picks.filter((x) => x.round === 1);
    expect(new Set(first.map((x) => x.pid)).size).toBe(first.length);
  });

  it('1位を見送ると,プレイヤーは 1 巡目の指名なしで 2 巡目へ進む', () => {
    const c = newCareer('テスト');
    playSeason(c, 'mix');
    const d = c.off!.draft;
    pickDraft(c, -1);
    expect(lotteryOpen(d)).toBe(false);
    expect(d.picks.filter((x) => x.round === 1 && x.user)).toHaveLength(0);
    expect(d.picks.filter((x) => x.round === 1).length).toBe(d.order.length / DRAFT_ROUNDS - 1);
  });

  it('大物の自由契約選手は,上乗せするほど獲得しやすく,負けると他球団と契約する', () => {
    const c = newCareer('テスト');
    playSeason(c, 'mix');
    while (!c.off!.draft.done) pickDraft(c, -1);
    const p = genPlayer(c, '野手', LEAGUES[c.off!.to].base + 15, { age: 27 });
    c.fa.push(p);
    expect(isStarFA(c, p)).toBe(true);
    expect(faChance(c, p, 1.5)).toBeGreaterThan(faChance(c, p, 1));
    c.funds = 1e6;
    let won = 0, lost = 0;
    for (let i = 0; i < 30; i++) {
      const q = genPlayer(c, '野手', LEAGUES[c.off!.to].base + 15, { age: 27 });
      c.fa.push(q);
      // 予算に余裕を持たせる
      for (const x of userTeam(c).players) x.salary = 50;
      const r = offerFA(c, q.id, 1.5, signFreeAgent);
      if (r.error) { c.fa = c.fa.filter((x) => x !== q); continue; }
      if (r.won) { won++; expect(userTeam(c).players.includes(q)).toBe(true); releasePlayer(c, q.id); }
      else { lost++; expect(c.fa.includes(q)).toBe(false); expect(c.teams.some((t) => !t.user && t.players.includes(q))).toBe(true); }
    }
    expect(won + lost).toBeGreaterThan(10);
  });

  it('有利なトレードの申し出は,こちらの控えと,相手の主力の交換になる', () => {
    // 条件に合う選手がいるチームになるまで,何チームか作る
    let c = newCareer('テスト');
    let found: GameEvent | null = null;
    for (let k = 0; k < 8 && !found; k++) {
      if (k) c = newCareer('テスト');
      for (let i = 0; i < 300 && !found; i++) { c.tradeOffer = undefined; rollEvent(c); if (c.event?.title.includes('有利な申し出')) found = c.event; }
    }
    expect(found).not.toBeNull();
    const mine = findPlayer(userTeam(c), found!.pid!)!;
    const o = c.teams.find((t) => t.id === found!.teamId)!;
    const theirs = findPlayer(o, found!.pid2!)!;
    // こちらに有利だが,有利すぎない(出す価値は,もらう価値の 75〜95%)
    expect(playerValue(theirs)).toBeGreaterThan(playerValue(mine));
    const r = tradeRatio([mine], theirs);
    expect(r).toBeGreaterThanOrEqual(0.75);
    expect(r).toBeLessThanOrEqual(0.95);
    // 同じシーズンには,もうトレードの申し出は来ない
    expect(c.tradeOffer).toBe(c.season);
    let again = false;
    const keep = c.event;
    for (let i = 0; i < 200; i++) { rollEvent(c); if (c.event?.kind === 'trade') again = true; }
    expect(again).toBe(false);
    c.event = keep;
    resolveEvent(c, 'accept');
    expect(userTeam(c).players.includes(theirs)).toBe(true);
    expect(o.players.includes(mine)).toBe(true);
  });
});
