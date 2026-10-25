/** ミッション.達成すると食材がもらえて,料理で練習の伸びを大きくできる. */
import { emptyPantry, ingName } from '../growth/meals';
import type { Career, Ingredient, Mission } from '../types';
import { pick, rand, ri, shuffle } from '../util/random';

interface Kind {
  key: string;
  make: () => { title: string; target: number };
  reward: () => Partial<Record<Ingredient, number>>;
}

const ING: Ingredient[] = ['rice', 'meat', 'fish', 'veg', 'fruit', 'egg'];
const some = (n: number): Partial<Record<Ingredient, number>> => {
  const out: Partial<Record<Ingredient, number>> = {};
  for (let i = 0; i < n; i++) { const k = pick(ING); out[k] = (out[k] ?? 0) + 1; }
  return out;
};

const KINDS: Kind[] = [
  { key: 'win', make: () => { const n = ri(2, 4); return { title: `${n}勝する`, target: n }; }, reward: () => some(2) },
  { key: 'streak', make: () => { const n = ri(2, 3); return { title: `${n}連勝する`, target: n }; }, reward: () => some(3) },
  { key: 'shutout', make: () => ({ title: '完封勝ちする', target: 1 }), reward: () => ({ ...some(2), meat: 1 }) },
  { key: 'score', make: () => { const n = ri(5, 7); return { title: `${n}点以上取って勝つ`, target: 1 }; }, reward: () => some(2) },
  { key: 'hr', make: () => { const n = ri(2, 4); return { title: `チームで${n}本塁打を打つ`, target: n }; }, reward: () => ({ ...some(1), meat: 1 }) },
  { key: 'k', make: () => { const n = ri(15, 25); return { title: `投手陣で${n}奪三振`, target: n }; }, reward: () => ({ ...some(1), fish: 1 }) },
  { key: 'upset', make: () => ({ title: '勝てないと言われた相手(予想40%未満)に勝つ', target: 1 }), reward: () => some(4) },
  { key: 'train', make: () => ({ title: '練習を3回続けて行う', target: 3 }), reward: () => ({ ...some(1), veg: 1 }) },
  { key: 'rest', make: () => ({ title: '休養を1回とる', target: 1 }), reward: () => ({ fruit: 1, egg: 1 }) },
];

export function newMission(c: Career, avoid: string[]): Mission {
  const k = pick(KINDS.filter((x) => !avoid.includes(x.key)).length ? KINDS.filter((x) => !avoid.includes(x.key)) : KINDS);
  const { title, target } = k.make();
  return { id: c.mid++, kind: k.key, title, target, progress: 0, reward: k.reward() };
}

/** 進行中のミッションが 3 つになるまで補充する */
export function refillMissions(c: Career): void {
  while (c.missions.length < 3) c.missions.push(newMission(c, c.missions.map((m) => m.kind)));
}

export function rewardText(r: Partial<Record<Ingredient, number>>): string {
  return (Object.entries(r) as [Ingredient, number][]).map(([k, n]) => `${ingName(k)}${n}`).join(' ');
}

export interface MissionCtx {
  win: boolean;
  us: number;
  them: number;
  hr: number;
  k: number;
  prob: number;
  menu: string;
}

/** 試合のあとにミッションの進み具合を更新する.達成したものは報酬を渡して知らせる. */
export function updateMissions(c: Career, x: MissionCtx): void {
  const streak = c.rec.streak;
  for (const m of c.missions) {
    switch (m.kind) {
      case 'win': if (x.win) m.progress++; break;
      case 'streak': m.progress = Math.max(m.progress, Math.min(m.target, streak)); break;
      case 'shutout': if (x.win && x.them === 0) m.progress++; break;
      case 'score': if (x.win && x.us >= Number(m.title.match(/\d+/)?.[0] ?? 5)) m.progress++; break;
      case 'hr': m.progress += x.hr; break;
      case 'k': m.progress += x.k; break;
      case 'upset': if (x.win && x.prob < 0.4) m.progress++; break;
      case 'train': m.progress = consecutive(c.lastMenus, x.menu); break;
      case 'rest': if (x.menu === 'rest') m.progress++; break;
      default: break;
    }
  }
  const done = c.missions.filter((m) => m.progress >= m.target);
  for (const m of done) {
    if (!c.pantry) c.pantry = emptyPantry();
    for (const [k, n] of Object.entries(m.reward) as [Ingredient, number][]) c.pantry[k] += n;
    c.news.push(`ミッション達成「${m.title}」 食材 ${rewardText(m.reward)} を手に入れた!`);
  }
  c.missions = c.missions.filter((m) => m.progress < m.target);
  // 試合のたびに,勝てば食材が少し手に入る
  if (x.win || rand() < 0.3) {
    const k = shuffle(ING)[0];
    c.pantry[k] += 1;
    c.news.push(`${x.win ? '勝利の差し入れ' : '差し入れ'}: ${ingName(k)}を1つもらった.`);
  }
  refillMissions(c);
}

/** 同じ練習を今回まで何回続けているか(最大 3) */
function consecutive(prev: string[], menu: string): number {
  const arr = [...prev, menu];
  let n = 0;
  for (let i = arr.length - 1; i >= 0 && arr[i] === menu; i--) n++;
  return Math.min(3, n);
}
