/**
 * 球団の歴史.シーズン記録(球団新記録),球団殿堂,OB のコーチ,優勝や個人タイトルの恩恵.DOM に依存しない.
 */
import { LABEL, LEAGUES } from '../data/constants';
import { keysOf } from '../growth/player';
import type { AttrKey, Career, Player, Staff, StaffRole, Stats } from '../types';
import { clamp } from '../util/random';
import { earn, moneyScale } from './economy';
import { careerStats, fmt3, seasonCount } from './leaders';
import { addStory } from './story';

export interface BestRow { v: number; name: string; season: number; text: string; }
export interface HallRow { name: string; pos: string; season: number; years: number; line: string; level: number; }
export interface Franchise { best: Record<string, BestRow>; hall: HallRow[]; /** コーチに呼んだ OB の名前 */ hired: string[]; }

const empty = (): Franchise => ({ best: {}, hall: [], hired: [] });
export const franchiseOf = (c: Career): Franchise => (c.franchise ??= empty());

interface RecordDef { key: string; name: string; bat: boolean; value: (s: Stats) => number | null; text: (v: number) => string; low?: boolean; }

/** シーズン記録の種目.打率と防御率は,規定(試合数に見合う打席・投球回)を満たしたときだけ */
export const RECORDS: RecordDef[] = [
  { key: 'hr', name: '本塁打', bat: true, value: (s) => s.hr, text: (v) => `${v}本` },
  { key: 'h', name: '安打', bat: true, value: (s) => s.h, text: (v) => `${v}本` },
  { key: 'rbi', name: '打点', bat: true, value: (s) => s.rbi, text: (v) => `${v}打点` },
  { key: 'sb', name: '盗塁', bat: true, value: (s) => s.sb, text: (v) => `${v}盗塁` },
  { key: 'avg', name: '打率', bat: true, value: (s) => (s.pa >= s.g * 3 && s.g >= 8 && s.ab ? s.h / s.ab : null), text: (v) => fmt3(v) },
  { key: 'w', name: '勝利', bat: false, value: (s) => s.w, text: (v) => `${v}勝` },
  { key: 'k', name: '奪三振', bat: false, value: (s) => s.k, text: (v) => `${v}個` },
  { key: 'era', name: '防御率', bat: false, value: (s) => (s.outs >= 60 ? (s.r * 27) / s.outs : null), text: (v) => v.toFixed(2), low: true },
];

/** シーズンの終わりに,自チームの選手の成績で球団記録を更新する.新記録の知らせを返す. */
export function updateFranchise(c: Career): string[] {
  const f = franchiseOf(c), u = c.teams.find((t) => t.user)!;
  const out: string[] = [];
  for (const r of RECORDS) {
    for (const p of u.players) {
      if ((p.role === '野手') !== r.bat) continue;
      const v = r.value(p.stats);
      if (v === null || v <= 0) continue;
      const cur = f.best[r.key];
      if (cur && (r.low ? v >= cur.v : v <= cur.v)) continue;
      f.best[r.key] = { v, name: p.name, season: c.season, text: r.text(v) };
      if (cur) {
        out.push(`球団新記録!${p.name}がシーズン${r.name}${r.text(v)}(これまでは${cur.name}の${cur.text})`);
        addStory(c, p, `シーズン${r.name}${r.text(v)}の球団新記録を作った.`);
      }
    }
  }
  return out;
}

/** 自チームで長く活躍して引退した選手を,球団殿堂に入れる(5 シーズン以上) */
export function induct(c: Career, p: Player): string | null {
  const years = seasonCount(p);
  if (years < 5) return null;
  const s = careerStats(p, false);
  const line = p.role === '野手'
    ? `通算${s.g}試合 打率${s.ab ? fmt3(s.h / s.ab) : '---'} ${s.hr}本塁打`
    : `通算${s.g}登板 ${s.w}勝 ${s.k}奪三振`;
  const level = Math.max(0, ...p.seasons.map((x) => x.level));
  franchiseOf(c).hall.push({ name: p.name, pos: p.pos, season: c.season, years, line, level });
  return `${p.name}が球団殿堂入り(${years}シーズン,${line}).`;
}

/** 殿堂入りした OB のうち,コーチの候補に来てくれる人.引退の翌年から,まだ呼んでいない人. */
export function obCandidates(c: Career): HallRow[] {
  const f = franchiseOf(c);
  return f.hall.filter((h) => h.season < c.season && !f.hired.includes(h.name));
}

/** OB をコーチの候補にする.選手としての格と最高のリーグで腕が決まり,恩返しで年俸は安い. */
export function obStaff(c: Career, h: HallRow, salaryOf: (skill: number) => number): Staff {
  const role: StaffRole = h.pos === '投' ? 'pitching' : 'batting';
  const skill = clamp(Math.round(50 + h.level * 6 + h.years), 30, 95);
  return { id: c.nid++, name: h.name, role, age: 40, skill, salary: Math.round(salaryOf(skill) * 0.6 / 10) * 10, years: 0, ob: true };
}

/** 選手の能力のうち,いちばん高いもの */
const bestKey = (p: Player): AttrKey => keysOf(p).reduce((a, b) => (p[b] > p[a] ? b : a));

/** 優勝の恩恵: 賞金,全員のやる気,自信による限界の小さな広がり */
export function titlePerks(c: Career, kind: 'league' | 'ama' | 'jp' | 'world'): string {
  const u = c.teams.find((t) => t.user)!;
  const rate = kind === 'league' ? 0.12 + c.level * 0.02 : kind === 'ama' ? 0.15 : kind === 'jp' ? 0.25 : 0.4;
  const prize = Math.round((moneyScale(c) * rate) / 10) * 10;
  earn(c, 'goal', prize);
  for (const p of u.players) {
    p.morale = clamp(p.morale + 10, 0, 100);
    const k = bestKey(p);
    p.pot[k] = clamp(p.pot[k] + 1, 0, 99);
  }
  const name = kind === 'league' ? LEAGUES[c.level].name : kind === 'ama' ? '全日本アマチュア選手権' : kind === 'jp' ? '日本選手権' : 'ワールドチャンピオンシップ';
  return `${name}優勝の賞金 ${prize}万円を受け取りました.選手たちは自信をつけ,やる気と限界が少し上がりました.`;
}

/** 個人タイトルの恩恵: その選手の得意な能力の限界が広がり,やる気が上がる */
export function awardPerks(c: Career): string[] {
  const u = c.teams.find((t) => t.user)!;
  const out: string[] = [];
  const mine = c.awards.filter((a) => a.season === c.season && a.mine);
  for (const a of mine) {
    const p = u.players.find((x) => x.id === a.pid);
    if (!p) continue;
    const k = bestKey(p);
    p.pot[k] = clamp(p.pot[k] + 3, 0, 99);
    p.morale = clamp(p.morale + 10, 0, 100);
    out.push(`${p.name}は${a.kind}の自信で,${LABEL[k]}の限界が広がりました.`);
  }
  return out;
}
