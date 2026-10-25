/**
 * 試合シミュレーション.DOM に依存しない純粋なロジック.
 * 1打席ずつ step() で進める.
 */
import { getChem } from '../growth/chemistry';
import { eff } from '../growth/player';
import { findCombos, sumFx } from '../league/combos';
import { effectiveLineup, fit, getPlayer } from '../league/team';
import { isHurt } from '../league/health';
import type { PitchKey } from '../types';
import type { Game, PlayKind, Player, Side, Team } from '../types';
import { clamp, pick, rand } from '../util/random';

/** この球数を超えると能力が落ち始める */
export const pitchLimit = (p: Player): number => 45 + p.stam * 0.9 - p.fatigue * 0.4 + (p.skills.includes('iron') ? 12 : 0);

/** 球種の効果.レベルが高いほど大きい. */
export function pitchFx(p: Player): { V: number; C: number; hit: number; dp: number } {
  const lv = (k: PitchKey) => p.pitches[k] ?? 0;
  return {
    V: lv('slider') * 1.3 + lv('fork') * 1.8,
    C: lv('curve') * 1.2 - lv('fork') * 0.5,
    hit: -(lv('change') * 0.004 + lv('cutter') * 0.004),
    dp: lv('sinker') * 0.03,
  };
}

export function makeSide(t: Team): Side {
  const eLineup = effectiveLineup(t);
  const lineup = eLineup.map((e) => ({ p: getPlayer(t, e.pid), pos: e.pos }));
  const F = lineup.filter((e) => e.pos !== '指');
  const get = (x: string) => {
    const e = lineup.find((y) => y.pos === x);
    if (!e) throw new Error(`${t.name}: ${x} がいません`);
    return e.p;
  };
  const sec = get('二'), ss = get('遊');
  const glove = F.filter((e) => e.p.skills.includes('glove')).length * 6 / F.length;
  let D = F.reduce((s, e) => s + eff(e.p, 'field') + fit(e.p, e.pos), 0) / F.length + getChem(t, sec.id, ss.id) * 0.06 + glove;
  // 先発ローテーション(怪我人は飛ばす)
  const healthy = t.pitchers.filter((id) => !isHurt(getPlayer(t, id)));
  const rot = (healthy.length >= 3 ? healthy : t.pitchers).slice(0, 3);
  let sp = getPlayer(t, rot[t.rotIdx % rot.length]);
  if (sp.fatigue > 60) {
    sp = rot.map((id) => getPlayer(t, id)).sort((a, b) => a.fatigue - b.fatigue)[0];
  }
  const cs = findCombos({ ...t, lineup: eLineup }, sp.id);
  const fx = sumFx(cs);
  if (t.staffFx) for (const k of Object.keys(fx) as (keyof typeof fx)[]) fx[k] += t.staffFx[k] ?? 0;
  D += fx.def;
  return {
    team: t, lineup, D, fx, combos: cs.filter((c) => c.active).map((c) => c.name), catcher: get('捕'), sec, ss, bi: 0,
    pitcher: sp, starter: sp, used: [sp], pc: 0, pr: 0, pcBy: { [sp.id]: 0 },
    runs: 0, hits: 0, inn: [],
  };
}

export function newGame(home: Team, away: Team, logOn = true): Game {
  const g: Game = {
    home: makeSide(home), away: makeSide(away),
    inning: 1, half: 0, outs: 0, bases: [null, null, null], log: [], logOn, over: false, snap: {}, injured: [],
  };
  for (const t of [home, away]) for (const p of t.players) g.snap[p.id] = { ...p.stats };
  g.away.inn.push(0);
  return g;
}

export const offense = (g: Game): Side => (g.half ? g.home : g.away);
export const defense = (g: Game): Side => (g.half ? g.away : g.home);
/** プレイヤーのチームの側 */
export const userSide = (g: Game): Side => (g.home.team.user ? g.home : g.away);

function kindOf(text: string): PlayKind {
  if (text.includes('ホームラン')) return 'hr';
  if (text.includes('三塁打') || text.includes('二塁打')) return 'xbh';
  if (text.includes('エラー')) return 'err';
  if (text.includes('ヒット') || text.includes('内野安打')) return 'hit';
  if (text.includes('四球') || text.includes('フォアボール') || text.includes('敬遠')) return 'bb';
  if (text.includes('三振')) return 'k';
  if (text.includes('併殺')) return 'dp';
  if (text.includes('犠牲フライ')) return 'sf';
  if (text.includes('フライ')) return 'fly';
  if (text.includes('ゴロ')) return 'gro';
  return 'info';
}

function log(g: Game, t: string, hl = false, kind?: PlayKind): void {
  if (!g.logOn) return;
  const off = offense(g), def = defense(g);
  g.log.unshift({
    tag: `${g.inning}回${g.half ? '裏' : '表'}`, t, hl, a: g.away.runs, h: g.home.runs,
    inning: g.inning, half: g.half, kind: kind ?? 'info', outs: g.outs,
    bases: [g.bases[0]?.name ?? '', g.bases[1]?.name ?? '', g.bases[2]?.name ?? ''],
    batter: off.lineup[off.bi].p.name, pitcher: def.pitcher.name,
  });
  if (g.log.length > 400) g.log.length = 400;
}

function pitcherEff(def: Side): { V: number; C: number; K: number; hit: number; dp: number } {
  const p = def.pitcher;
  const tired = Math.max(0, def.pc - pitchLimit(p)) * 0.7;
  const f = pitchFx(p);
  const starter = p === def.starter;
  const role = (p.skills.includes('closer') && !starter ? 6 : 0) + (p.skills.includes('ace') && starter ? 3 : 0);
  return {
    V: eff(p, 'velo') - tired + f.V + role,
    C: eff(p, 'ctrl') - tired + getChem(def.team, p.id, def.catcher.id) * 0.1 + f.C + def.fx.cmd + (p.skills.includes('ace') && starter ? 3 : 0),
    K: p.skills.includes('killer') ? 0.03 : 0,
    hit: f.hit,
    dp: f.dp,
  };
}

/** まだ登板していない,疲れていない中継ぎ */
function relievers(def: Side): Player[] {
  return def.team.pitchers.slice(3)
    .map((id) => getPlayer(def.team, id))
    .filter((x) => !def.used.includes(x) && x.fatigue < 70 && !isHurt(x));
}

function changePitcher(g: Game, def: Side, np: Player): void {
  log(g, `${def.team.name}: 投手交代 ${def.pitcher.name} → ${np.name}`, false, 'sub');
  def.pitcher = np;
  def.used.push(np);
  def.pc = 0;
  def.pr = 0;
  def.pcBy[np.id] = 0;
}

function autoPitch(g: Game, def: Side): void {
  const p = def.pitcher;
  if (def.pc > pitchLimit(p) + 6 || def.pr >= 6) {
    const r = relievers(def).sort((a, b) => (b.velo * 1.2 + b.ctrl) - (a.velo * 1.2 + a.ctrl));
    if (r.length) changePitcher(g, def, r[0]);
  }
}

function addPitches(def: Side, n: number): void {
  def.pc += n;
  def.pcBy[def.pitcher.id] = (def.pcBy[def.pitcher.id] ?? 0) + n;
}

function scoreRun(off: Side, def: Side, batter: Player | null): void {
  off.runs++;
  off.inn[off.inn.length - 1]++;
  def.pr++;
  def.pitcher.stats.r++;
  if (batter) batter.stats.rbi++;
}

function addOut(g: Game, def: Side, n: number): void {
  g.outs += n;
  def.pitcher.stats.outs += n;
}

function forceWalk(g: Game, off: Side, def: Side, b: Player): void {
  const B = g.bases;
  if (B[0]) {
    if (B[1]) {
      if (B[2]) scoreRun(off, def, b);
      B[2] = B[1];
    }
    B[1] = B[0];
  }
  B[0] = b;
}

/** 盗塁を試みる.試みたら true(アウトで 3 つ目なら,そのまま攻守交代). */
function tryTheft(g: Game, off: Side, def: Side): boolean {
  const B = g.bases;
  if (g.outs >= 2) return false;
  // 点差が大きいときは走らない
  const diff = off.runs - def.runs;
  if (Math.abs(diff) >= 5) return false;
  const from = B[0] && !B[1] ? 0 : B[1] && !B[2] ? 1 : -1;
  if (from < 0) return false;
  const r = B[from] as Player;
  const sp = eff(r, 'speed') + (r.skills.includes('runner') ? 15 : 0);
  // 走る確率: 打線の中で足が速いほど高い(リーグの高さには左右されない).1 塁からのほうが多い.
  const ref = off.lineup.reduce((a, e) => a + e.p.speed, 0) / off.lineup.length;
  const want = clamp(0.065 + (sp - ref) * 0.006 + (r.skills.includes('runner') ? 0.03 : 0), 0, 0.2) * (from === 0 ? 1 : 0.6);
  if (rand() >= want) return false;
  const pr = clamp(0.64 + (sp - 50) * 0.012 - (eff(def.catcher, 'field') - 50) * 0.006, 0.2, 0.95);
  addPitches(def, 1);
  if (rand() < pr) {
    B[from + 1] = r; B[from] = null; r.stats.sb++;
    log(g, `${r.name},${from === 0 ? '二' : '三'}盗成功!`, true, 'info');
  } else {
    B[from] = null;
    addOut(g, def, 1);
    log(g, `${r.name},盗塁失敗.`, false, 'info');
  }
  return true;
}

/** 1打席進める. */
export function step(g: Game): void {
  if (g.over) return;
  const off = offense(g), def = defense(g);
  autoPitch(g, def);
  const b = off.lineup[off.bi].p, nm = b.name, before = off.runs;

  // 盗塁(作戦は自動.足の速い走者が,隙を見て走る)
  if (tryTheft(g, off, def)) { if (g.outs >= 3) endHalf(g); return; }

  const pe = pitcherEff(def), { V, C } = pe;
  const has = (k: Player['skills'][number]) => b.skills.includes(k);
  const scoring = !!g.bases[1] || !!g.bases[2];
  const M = eff(b, 'meet') + (has('contact') ? 4 : 0) + (has('clutch') && scoring ? 8 : 0);
  const Pw = eff(b, 'power') + (has('slugger') ? 12 : 0);
  const Sp = eff(b, 'speed') + (has('runner') ? 15 : 0);
  b.stats.pa++;
  let text = '', hl = false;

  const pK = clamp(0.18 + (V - M) * 0.004 + pe.K + off.fx.k - (has('contact') ? 0.03 : 0) - (has('eye') ? 0.02 : 0), 0.05, 0.42);
  // 投手の制球を打者のミートと比べる.リーグの高さではなく,力の差で決まる
  const pBB = clamp(0.105 + (M - C) * 0.0025 + (has('eye') ? 0.03 : 0), 0.02, 0.2);
  const r = rand();
  if (r < pBB) {
    addPitches(def, 5); forceWalk(g, off, def, b); b.stats.bb++; def.pitcher.stats.bba++;
    text = `${nm},${pick(['四球', 'フォアボール', '見極めて四球'])}.`;
  } else if (r < pBB + pK) {
    addPitches(def, 5); addOut(g, def, 1);
    b.stats.ab++; b.stats.so++; def.pitcher.stats.k++;
    const fast = V >= 75;
    text = `${nm},${pick(fast ? ['ストレートで空振り三振', '力でねじ伏せ三振'] : ['空振り三振', '見逃し三振', '変化球で空振り三振'])}.`;
    const k = def.pitcher.stats.k - (g.snap[def.pitcher.id]?.k ?? 0);
    if ([5, 8, 10, 12, 15].includes(k)) text += `(${k}個目の三振)`;
  } else {
    addPitches(def, 3); b.stats.ab++;
    const pH = clamp(0.3 + (M - V) * 0.0035 - (def.D - (M + V) / 2 - 4) * 0.0025 - clamp(def.D - 50, -20, 10) * 0.0012 + off.fx.hit + pe.hit, 0.15, 0.46);
    if (rand() < 0.012 + Math.max(0, 55 - def.D) * 0.0012) {
      if (g.bases[2]) scoreRun(off, def, null);
      g.bases = [b, g.bases[0], g.bases[1]];
      text = `${nm}の打球をエラー!出塁.`;
    } else if (rand() < pH) {
      text = hit(g, off, def, b, Pw, Sp);
      hl = true;
    } else {
      text = inPlayOut(g, off, def, b, Sp);
    }
  }

  const d = off.runs - before;
  if (d > 0) {
    text += ` ${d}点!`; hl = true;
    const prev = before - def.runs, now = off.runs - def.runs;
    if (prev < 0 && now === 0) text += '同点!';
    else if (prev < 0 && now > 0) text += '逆転!';
    else if (prev === 0 && now > 0) text += '勝ち越し!';
  }
  log(g, text, hl, kindOf(text));
  off.bi = (off.bi + 1) % 9;

  if (g.half === 1 && g.inning >= 9 && g.home.runs > g.away.runs) {
    log(g, 'サヨナラ!', true);
    finish(g);
    return;
  }
  if (g.outs >= 3) endHalf(g);
}

/** 今日のヒット数に応じた一言 */
function hitNote(g: Game, b: Player): string {
  const n = b.stats.h - (g.snap[b.id]?.h ?? 0);
  return n === 2 ? '(今日2本目)' : n === 3 ? '(猛打賞!)' : n >= 4 ? `(今日${n}安打!)` : '';
}

function hit(g: Game, off: Side, def: Side, b: Player, Pw: number, Sp: number): string {
  return hitText(g, off, def, b, Pw, Sp) + hitNote(g, b);
}

function hitText(g: Game, off: Side, def: Side, b: Player, Pw: number, Sp: number): string {
  const nm = b.name;
  b.stats.h++; off.hits++; def.pitcher.stats.ha++;
  const hr = clamp(0.045 + (Pw - 50) * 0.0016 + (Pw - eff(def.pitcher, 'velo')) * 0.002 + off.fx.hr, 0.01, 0.3);
  const tr = clamp(0.02 + (Sp - 50) * 0.001, 0.005, 0.06);
  const db = clamp(0.18 + (Pw - 50) * 0.002, 0.08, 0.3);
  const x = rand();
  const [r1, r2, r3] = g.bases;
  if (x < hr) {
    let n = 1;
    for (const q of [r1, r2, r3]) if (q) { scoreRun(off, def, b); n++; }
    scoreRun(off, def, b);
    b.stats.hr++;
    g.bases = [null, null, null];
    const spot = pick(['バックスクリーン', 'レフトスタンド', 'ライトスタンド', '左中間スタンド', '右中間スタンド']);
    return `${nm},${spot}へ${n === 4 ? '満塁' : n === 1 ? 'ソロ' : n + 'ラン'}ホームラン!(今季${b.stats.hr}号)`;
  }
  if (x < hr + tr) {
    for (const q of [r1, r2, r3]) if (q) scoreRun(off, def, b);
    b.stats.t3++;
    g.bases = [null, null, b];
    return `${nm},${pick(['右中間', '左中間'])}三塁打!`;
  }
  if (x < hr + tr + db) {
    if (r3) scoreRun(off, def, b);
    if (r2) scoreRun(off, def, b);
    b.stats.d2++;
    const nb: (Player | null)[] = [null, b, null];
    if (r1) {
      if (rand() < 0.4 + (eff(r1, 'speed') - 50) * 0.01) scoreRun(off, def, b);
      else nb[2] = r1;
    }
    g.bases = nb;
    return `${nm},${pick(['左中間', '右中間', 'レフト線', 'ライト線'])}二塁打!`;
  }
  if (r3) scoreRun(off, def, b);
  const nb: (Player | null)[] = [b, null, null];
  if (r2) {
    if (rand() < 0.55 + (eff(r2, 'speed') - 50) * 0.008) scoreRun(off, def, b);
    else nb[2] = r2;
  }
  if (r1) {
    if (!nb[2] && rand() < 0.3 + (eff(r1, 'speed') - 50) * 0.006) nb[2] = r1;
    else nb[1] = r1;
  }
  g.bases = nb;
  return `${nm},${pick(['センター前ヒット', 'レフト前ヒット', 'ライト前ヒット', '内野安打'])}.`;
}

function inPlayOut(g: Game, off: Side, def: Side, b: Player, Sp: number): string {
  const nm = b.name, B = g.bases;
  if (rand() < 0.5) {
    // ゴロ
    const dpP = clamp(0.45 + getChem(def.team, def.sec.id, def.ss.id) * 0.002 - (Sp - 50) * 0.004 + def.fx.dp + pitchFx(def.pitcher).dp, 0.1, 0.75);
    if (B[0] && g.outs < 2 && rand() < dpP) {
      addOut(g, def, 2); B[0] = null;
      if (g.outs < 3) {
        if (B[2]) { scoreRun(off, def, null); B[2] = null; }
        if (B[1]) { B[2] = B[1]; B[1] = null; }
      }
      return `${nm},${pick(['ショート', 'セカンド', 'サード'])}ゴロ併殺打.`;
    }
    addOut(g, def, 1);
    if (g.outs < 3) {
      if (B[2] && rand() < 0.45) { scoreRun(off, def, b); B[2] = null; }
      if (B[1] && !B[2]) { B[2] = B[1]; B[1] = null; }
      if (B[0] && !B[1]) { B[1] = B[0]; B[0] = null; }
    }
    return `${nm},${pick(['ショートゴロ', 'セカンドゴロ', 'サードゴロ', 'ファーストゴロ', 'ピッチャーゴロ'])}.`;
  }
  // フライ
  addOut(g, def, 1);
  if (g.outs < 3 && B[2] && rand() < 0.55 + (eff(B[2], 'speed') - 50) * 0.006) {
    scoreRun(off, def, b); B[2] = null;
    return `${nm},犠牲フライ.`;
  }
  return `${nm},${pick(['センターフライ', 'レフトフライ', 'ライトフライ', 'セカンドフライ', 'ファウルフライ'])}.`;
}

function endHalf(g: Game): void {
  g.outs = 0;
  g.bases = [null, null, null];
  const H = g.home.runs, A = g.away.runs;
  if (g.half === 0) {
    if (g.inning >= 9 && H > A) { finish(g); return; }
    g.half = 1;
    g.home.inn.push(0);
  } else {
    if (g.inning >= 9 && H !== A) { finish(g); return; }
    if (g.inning >= 12) { finish(g); return; }
    g.inning++;
    g.half = 0;
    g.away.inn.push(0);
  }
}

export function finish(g: Game): void {
  g.over = true;
  log(g, `試合終了 ${g.away.team.name} ${g.away.runs} - ${g.home.runs} ${g.home.team.name}`, true);
}

/** 試合終了まで進める */
export function stepToEnd(g: Game): void {
  let n = 0;
  while (!g.over && n++ < 500) step(g);
  if (!g.over) finish(g);
}
