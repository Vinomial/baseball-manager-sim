/** 監督へのおすすめ.ドラフトと自由契約で,どの選手が今のチームに合うかを示す. */
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

/** 候補をチームに照らして評価する.上位 3 人に ★ を付ける. */
export function advise(t: Team, pool: Player[], extra: (p: Player) => number = () => 0): Map<number, Advice> {
  const out = new Map<number, Advice>();
  const L = starters(t, '野手');
  const weakBat = L.length ? L.reduce((a, b) => (playerValue(b) < playerValue(a) ? b : a)) : null;
  const weakPos = weakBat ? t.lineup.find((e) => e.pid === weakBat.id)?.pos : undefined;
  const worst = (role: '野手' | '投手') => {
    const s = starters(t, role);
    return s.length ? Math.min(...s.map(playerValue)) : 0;
  };
  const pots = pool.map((p) => estPot(estimated(p))).sort((a, b) => b - a);
  const potCut = pots[Math.min(2, pots.length - 1)] ?? 0;
  for (const p of pool) {
    const e = estimated(p);
    const v = playerValue(e), pot = estPot(p);
    const tags: string[] = [], why: string[] = [];
    let score = v * 0.5 + pot * 0.5 + extra(p);
    if (v > worst(p.role) + 1) {
      tags.push('即戦力'); score += 4;
      why.push(p.role === '野手' ? `先発の${weakPos && weakPos !== '指' ? POS_NAME[weakPos] : '穴'}を争える力があります` : '先発ローテーションに入れる力があります');
    }
    if (pot >= potCut && pot >= v + 8) { tags.push('素質'); score += 3; why.push('伸びしろが大きく,育てがいがあります'); }
    if (p.role === '投手' && pitchersOf(t).length < 7) { tags.push('補強'); score += 3; why.push('投手の層が薄いので補強になります'); }
    if (p.role === '野手' && weakPos && weakPos !== '指' && p.pos === weakPos) { tags.push('ポジション補強'); score += 3; why.push(`${POS_NAME[weakPos]}を補強できます`); }
    if (p.role === '野手' && p.pos === '捕' && fielders(t).filter((x) => x.pos === '捕').length < 2) { tags.push('捕手不足'); score += 4; why.push('控えの捕手がいません'); }
    out.set(p.id, { score, tags, reason: why[0] ?? '平均的な選手です', star: false });
  }
  [...out.entries()].sort((a, b) => b[1].score - a[1].score).slice(0, 3).forEach(([id]) => { out.get(id)!.star = true; });
  return out;
}

