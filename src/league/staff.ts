/** 監督・コーチ.GM(あなた)が雇い,チームの成長や試合に効く. */
import { GIVEN_NAMES, SURNAMES } from '../data/constants';
import type { AttrKey, Career, ManagerStyle, Player, Staff, StaffRole } from '../types';
import { clamp, pick, randn, ri } from '../util/random';
import { moneyScale, spend } from './economy';

export const ROLES: StaffRole[] = ['manager', 'batting', 'pitching', 'defense', 'trainer', 'mental'];

export const ROLE_INFO: Record<StaffRole, { name: string; desc: string }> = {
  manager: { name: '監督', desc: '試合の作戦(攻め方・守り方)を決め,オーダーの組み方にも関わります.' },
  batting: { name: '打撃コーチ', desc: 'ミートとパワーの伸びが大きくなります.' },
  pitching: { name: '投手コーチ', desc: '球威と制球の伸びが大きくなります.' },
  defense: { name: '守備走塁コーチ', desc: '守備と走力の伸びが大きくなります.' },
  trainer: { name: 'トレーナー', desc: 'スタミナの伸び,怪我の起きにくさ,疲れのたまりにくさが良くなります.' },
  mental: { name: 'メンタルコーチ', desc: '選手のやる気が上がりやすく,不満がたまりにくくなります.' },
};

export const STYLE_INFO: Record<ManagerStyle, { name: string; desc: string }> = {
  aggressive: { name: '攻撃型', desc: '本塁打と安打が増えるが,守りは少し甘くなる.' },
  defensive: { name: '守備型', desc: '守備と併殺が強くなるが,本塁打は少し減る.' },
  balanced: { name: '堅実型', desc: '攻守とも,少しずつ底上げされる.' },
  developer: { name: '育成型', desc: '24歳以下の選手の練習の伸びが大きくなる.' },
};

/** 能力(1〜100)を星(0.5〜5)にする */
export const staffStars = (skill: number): number => clamp(Math.round((skill / 20) * 2) / 2, 0.5, 5);

/** 年俸(万円).能力が高いほど急に高くなる.リーグが上がると,お金の目安が大きくなる. */
export const staffSalary = (c: Career, skill: number): number =>
  Math.max(10, Math.round((moneyScale(c) * (0.006 + (skill / 100) ** 2 * 0.07)) / 10) * 10);

/** 契約金(年俸の半分) */
export const signingBonus = (s: Staff): number => Math.round(s.salary * 0.5);
/** 解雇のときの退職金(年俸の 1/4) */
export const severance = (s: Staff): number => Math.round(s.salary * 0.25);

export function genStaff(c: Career, role: StaffRole): Staff {
  const skill = clamp(Math.round(42 + c.level * 5 + randn() * 14), 15, 95);
  return {
    id: c.nid++, name: `${pick(SURNAMES)} ${pick(GIVEN_NAMES)}`, role, age: ri(38, 62), skill,
    style: role === 'manager' ? pick<ManagerStyle>(['aggressive', 'defensive', 'balanced', 'developer']) : undefined,
    salary: staffSalary(c, skill), years: 0,
  };
}

/** 雇える候補を作り直す(各役割 3 人) */
export function refreshPool(c: Career): void {
  c.staffPool = ROLES.flatMap((r) => Array.from({ length: 3 }, () => genStaff(c, r)));
}

export const staffCost = (c: Career): number => ROLES.reduce((s, r) => s + (c.staff[r]?.salary ?? 0), 0);

/** 雇う.できないときは理由を返す.いまの人がいれば,退職金を払って入れ替える. */
export function hireStaff(c: Career, id: number): string | null {
  const s = c.staffPool.find((x) => x.id === id);
  if (!s) return '候補が見つかりません.';
  const old = c.staff[s.role];
  const need = signingBonus(s) + (old ? severance(old) : 0);
  if (c.funds < need) return '資金が足りません(契約金と退職金が必要です).';
  spend(c, 'hire', need);
  c.staff[s.role] = { ...s, years: 0 };
  c.staffPool = c.staffPool.filter((x) => x.id !== id);
  return null;
}

export function fireStaff(c: Career, role: StaffRole): string | null {
  const s = c.staff[role];
  if (!s) return null;
  if (c.funds < severance(s)) return '資金が足りません(退職金が必要です).';
  spend(c, 'hire', severance(s));
  c.staff[role] = null;
  return null;
}

/** 1 週ぶんの給料を払う.払えない分は,GMの信頼度が下がる. */
export function paySalaries(c: Career): number {
  const weekly = staffCost(c) / 48;
  if (c.funds >= weekly) { spend(c, 'staff', weekly); return 0; }
  const short = weekly - c.funds;
  spend(c, 'staff', c.funds);
  return short;
}

/** 毎年,スタッフが年をとる.定年(65歳)で退職し,経験で少し力がつく. */
export function ageStaff(c: Career): string[] {
  const out: string[] = [];
  for (const r of ROLES) {
    const s = c.staff[r];
    if (!s) continue;
    s.age++; s.years++;
    if (s.years % 2 === 0 && s.skill < 90) s.skill += 1;
    if (s.age >= 65) { c.staff[r] = null; out.push(`${ROLE_INFO[r].name}の${s.name}が退職しました.`); }
  }
  return out;
}

/* ===== 効果 ===== */

const eff = (skill: number | undefined): number => ((skill ?? 50) - 50) / 50; // -1〜+1

/** コーチごとの,練習の伸びの倍率.空席は標準(1.0). */
export function staffTrainMult(c: Career, p: Player, k: AttrKey): number {
  let m = 1;
  const want: Partial<Record<AttrKey, StaffRole>> = { meet: 'batting', power: 'batting', velo: 'pitching', ctrl: 'pitching', field: 'defense', speed: 'defense', stam: 'trainer' };
  const role = want[k];
  if (role && c.staff[role]) m *= 1 + eff(c.staff[role]!.skill) * 0.12;
  const mg = c.staff.manager;
  if (mg?.style === 'developer' && p.age <= 24) m *= 1 + 0.06 + eff(mg.skill) * 0.03;
  return m;
}

/** 監督の作戦による,試合の補正 */
export function managerFx(c: Career): { hit: number; hr: number; k: number; dp: number; def: number; cmd: number } {
  const f = { hit: 0, hr: 0, k: 0, dp: 0, def: 0, cmd: 0 };
  const m = c.staff.manager;
  if (!m) return f;
  const s = eff(m.skill);
  f.hit += 0.006 * s; f.cmd += 1.5 * s;
  const w = 0.5 + m.skill / 100;
  if (m.style === 'aggressive') { f.hr += 0.012 * w; f.hit += 0.004 * w; f.def -= 1.5 * w; }
  else if (m.style === 'defensive') { f.def += 3 * w; f.dp += 0.04 * w; f.hr -= 0.006 * w; }
  else if (m.style === 'balanced') { f.hit += 0.004 * w; f.def += 1 * w; f.cmd += 1 * w; }
  return f;
}

/** トレーナーによる,怪我の起きにくさの倍率と,疲れのたまりにくさ */
export const trainerInjuryScale = (c: Career): number => 1 - eff(c.staff.trainer?.skill) * 0.25;
export const trainerLoadScale = (c: Career): number => 1 - eff(c.staff.trainer?.skill) * 0.15;
/** メンタルコーチによる,毎週のやる気の増減 */
export const mentalBoost = (c: Career): number => eff(c.staff.mental?.skill) * 0.9;
/** 監督の力による,おまかせオーダーのぶれ(大きいほど雑).いない場合はやや雑. */
export const lineupNoise = (c: Career): number => (c.staff.manager ? Math.max(0, (75 - c.staff.manager.skill) / 12) : 4);

