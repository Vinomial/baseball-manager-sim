/** 球種と特殊能力.DOM に依存しない. */
import type { PitchKey, Player, SkillKey } from '../types';
import { clamp, pick, rand, ri } from '../util/random';
import { playerValue } from './player';

export interface PitchDef { key: PitchKey; name: string; desc: string; }
export interface SkillDef { key: SkillKey; name: string; desc: string; role: '野手' | '投手'; }

export const PITCHES: PitchDef[] = [
  { key: 'slider', name: 'スライダー', desc: '空振りが取りやすくなる' },
  { key: 'curve', name: 'カーブ', desc: 'コントロールが安定する' },
  { key: 'fork', name: 'フォーク', desc: '空振りが大きく増えるが,制球が少し乱れる' },
  { key: 'change', name: 'チェンジアップ', desc: '打たれにくくなる' },
  { key: 'sinker', name: 'シンカー', desc: 'ゴロが増え,併殺が取りやすくなる' },
  { key: 'cutter', name: 'カットボール', desc: '芯を外して打たれにくくなる' },
];

export const SKILLS: SkillDef[] = [
  { key: 'clutch', name: 'チャンス◎', desc: '得点圏で打撃が上がる', role: '野手' },
  { key: 'contact', name: '巧打', desc: '三振しにくく,当たりやすい', role: '野手' },
  { key: 'slugger', name: '長距離砲', desc: '本塁打が出やすい', role: '野手' },
  { key: 'eye', name: '選球眼', desc: '四球を選びやすく,三振が減る', role: '野手' },
  { key: 'runner', name: '俊足', desc: '塁を余分に進みやすい', role: '野手' },
  { key: 'glove', name: '守備職人', desc: 'チームの守備力が上がる', role: '野手' },
  { key: 'closer', name: '抑え◎', desc: '中継ぎで登板すると球威が上がる', role: '投手' },
  { key: 'iron', name: '鉄腕', desc: '球数が増えても落ちにくい', role: '投手' },
  { key: 'ace', name: 'エース', desc: '先発すると球威と制球が上がる', role: '投手' },
  { key: 'killer', name: '奪三振', desc: '三振を取りやすい', role: '投手' },
];

export const pitchName = (k: PitchKey): string => PITCHES.find((x) => x.key === k)!.name;
export const skillName = (k: SkillKey): string => SKILLS.find((x) => x.key === k)!.name;
export const skillDef = (k: SkillKey): SkillDef => SKILLS.find((x) => x.key === k)!;

/** 新しい選手の球種・特殊能力.力が高いほど持ちやすい. */
export function genAbilities(p: Player, base: number): void {
  const edge = clamp((playerValue(p) - base) / 60, -0.1, 0.25);
  p.pitches = {};
  p.skills = [];
  if (p.role === '投手') {
    const n = clamp(Math.round(1 + rand() * 1.6 + edge * 4), 1, 3);
    for (let i = 0; i < n; i++) {
      const k = pick(PITCHES).key;
      p.pitches[k] = clamp((p.pitches[k] ?? 0) + ri(1, 2 + (edge > 0.08 ? 1 : 0)), 1, 5);
    }
  }
  const pool = SKILLS.filter((s) => s.role === p.role);
  for (let i = 0; i < 2; i++) {
    if (rand() < 0.1 + edge + (i === 0 ? 0.08 : 0) - i * 0.07) {
      const s = pick(pool).key;
      if (!p.skills.includes(s)) p.skills.push(s);
    }
  }
}

/** 練習メニューごとに身につきやすい能力 */
const LEARN: Record<string, { pitch?: boolean; skills: SkillKey[] }> = {
  bat: { skills: ['contact', 'slugger', 'eye', 'clutch'] },
  run: { skills: ['runner'] },
  field: { skills: ['glove'] },
  pitch: { pitch: true, skills: ['killer', 'ace'] },
  stam: { skills: ['iron', 'closer'] },
  mix: { skills: [] },
};

/** 練習のあと,ごくまれに球種や特殊能力を身につける.身につけたら文章を返す. */
export function maybeLearn(p: Player, menu: string, chance: number): string | null {
  const l = LEARN[menu];
  if (!l || rand() > chance) return null;
  // 能力の高い選手ほど身につけやすい
  if (p.role === '投手' && l.pitch) {
    const k = pick(PITCHES).key;
    const lv = p.pitches[k] ?? 0;
    if (lv >= 5) return null;
    p.pitches[k] = lv + 1;
    return lv === 0 ? `${p.name}が新球種「${pitchName(k)}」を覚えた!` : `${p.name}の「${pitchName(k)}」がレベル${lv + 1}に上がった!`;
  }
  const cands = l.skills.filter((s) => skillDef(s).role === p.role && !p.skills.includes(s));
  if (!cands.length || p.skills.length >= 3) return null;
  const s = pick(cands);
  p.skills.push(s);
  return `${p.name}が特殊能力「${skillName(s)}」を身につけた!`;
}

/** 特殊能力と球種の見た目の一覧.表示用. */
export function abilityLabels(p: Player): string[] {
  const out: string[] = [];
  for (const k of Object.keys(p.pitches) as PitchKey[]) out.push(`${pitchName(k)}${p.pitches[k] && p.pitches[k]! > 1 ? ` Lv${p.pitches[k]}` : ''}`);
  for (const s of p.skills) out.push(skillName(s));
  return out;
}

