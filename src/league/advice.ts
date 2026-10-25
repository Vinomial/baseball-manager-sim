/** GMへのおすすめ.ドラフトと自由契約で,どの選手が今のチームに合うかを示す. */
import { POS_NAME } from '../data/constants';
import { keysOf, playerValue } from '../growth/player';
import type { Player, Team } from '../types';
import { fielders, findPlayer, pitchersOf } from './team';

export interface Advice {
  score: number;
  tags: string[];
  reason: string;
  star: boolean;
}

/** ドラフト候補の能力の見積もり.幅の真ん中を使う. */
export function estimated(p: Player): Player {
  if (!p.scout) return p;
  const q: Player = { ...p };
  for (const k of keysOf(p)) {
    const r = p.scout[k];
    if (r) q[k] = (r[0] + r[1]) / 2;
  }
  return q;
}

/** 見積もりの伸びしろ(能力値の平均で表した上限). */
function estPot(p: Player): number {
  if (p.scoutPot) return (p.scoutPot[0] + p.scoutPot[1]) / 2;
  const ks = keysOf(p);
  return ks.reduce((s, k) => s + p.pot[k], 0) / ks.length;
}

function starters(t: Team, role: '野手' | '投手'): Player[] {
  if (role === '野手') return t.lineup.map((e) => findPlayer(t, e.pid)).filter((p): p is Player => !!p);
  return t.pitchers.slice(0, 5).map((id) => findPlayer(t, id)).filter((p): p is Player => !!p);
}

/** その守備位置を,いま守っている先発(なければ undefined) */
function incumbentAt(t: Team, p: Player): Player | undefined {
  const e = t.lineup.find((x) => x.pos === p.pos);
  return e ? findPlayer(t, e.pid) : undefined;
}

/** その守備位置を守れる控え(先発以外)の人数 */
function depthAt(t: Team, p: Player): number {
  const inL = new Set(t.lineup.map((e) => e.pid));
  return fielders(t).filter((x) => !inL.has(x.id) && (x.pos === p.pos || x.alt?.includes(p.pos as never))).length;
}

/** 候補をチームに照らして評価する.いまそのポジションを守っている選手の力と年齢,控えの人数を考える.上位 3 人に ★ を付ける. */
export function advise(t: Team, pool: Player[], extra: (p: Player) => number = () => 0): Map<number, Advice> {
  const out = new Map<number, Advice>();
  const worst = (role: '野手' | '投手') => {
    const s = starters(t, role);
    return s.length ? Math.min(...s.map(playerValue)) : 0;
  };
  const rot = starters(t, '投手').sort((a, b) => playerValue(a) - playerValue(b));
  const pots = pool.map((p) => estPot(estimated(p))).sort((a, b) => b - a);
  const potCut = pots[Math.min(2, pots.length - 1)] ?? 0;
  for (const p of pool) {
    const e = estimated(p);
    const v = playerValue(e), pot = estPot(p);
    const tags: string[] = [], why: string[] = [];
    let score = v * 0.5 + pot * 0.5 + extra(p);
    if (p.role === '野手') {
      const inc = incumbentAt(t, p), pn = POS_NAME[p.pos];
      if (inc) {
        const iv = playerValue(inc);
        const edge = v - iv;
        if (edge > 2) { tags.push('ポジションを奪える'); score += 4 + Math.min(6, edge * 0.4); why.push(`${pn}の${inc.name}(${inc.age}歳,総合${Math.round(iv)})より力があり,レギュラーを争えます`); }
        else if (inc.age >= 32 && edge > -10) { tags.push('後継候補'); score += 4; why.push(`${pn}の${inc.name}は${inc.age}歳.次の世代として育てたい選手です`); }
        else if (edge < -10 && pot < iv + 6) { tags.push('出番は先'); score -= 3; why.push(`${pn}は${inc.name}(総合${Math.round(iv)})が固めていて,出番は先になりそうです`); }
        else if (edge <= 2) why.push(`${pn}は${inc.name}(総合${Math.round(iv)})が守っています.競争相手になります`);
      } else if (v > worst('野手') + 1) { tags.push('即戦力'); score += 3; why.push('先発の穴を争える力があります'); }
      if (depthAt(t, p) === 0) { tags.push('控え不在'); score += 3; why.push(`${pn}の控えがいません`); }
      if (p.pos === '捕' && fielders(t).filter((x) => x.pos === '捕').length < 2) { tags.push('捕手不足'); score += 4; why.push('控えの捕手がいません'); }
    } else {
      const fifth = rot.length ? rot[0] : undefined;
      if (fifth && v > playerValue(fifth) + 1) { tags.push('ローテーション候補'); score += 4; why.push(`先発の${fifth.name}(総合${Math.round(playerValue(fifth))})を上回る力があります`); }
      else if (v > worst('投手') + 1) { tags.push('即戦力'); score += 3; why.push('先発ローテーションに入れる力があります'); }
      if (pitchersOf(t).length < 7) { tags.push('補強'); score += 3; why.push('投手の層が薄いので補強になります'); }
    }
    if (pot >= potCut && pot >= v + 8) { tags.push('素質'); score += 3; why.push('伸びしろが大きく,育てがいがあります'); }
    out.set(p.id, { score, tags, reason: why[0] ?? '平均的な選手です', star: false });
  }
  [...out.entries()].sort((a, b) => b[1].score - a[1].score).slice(0, 3).forEach(([id]) => { out.get(id)!.star = true; });
  return out;
}
