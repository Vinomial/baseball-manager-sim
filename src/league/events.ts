/** 週ごとの出来事.選手の相談や,チームの雰囲気など.DOM に依存しない. */
import { LABEL, MIN_FIELDERS, MIN_PITCHERS } from '../data/constants';
import { maybeLearn } from '../growth/abilities';
import { addChem } from '../growth/chemistry';
import { futureValue, growAttr, keysOf, playerValue } from '../growth/player';
import type { AttrKey, Career, GameEvent, Player, Team } from '../types';
import { clamp, pick, rand, ri, shuffle } from '../util/random';
import { leagueTeams } from './schedule';
import { autoLineup, autoPitchers, fielders, findByPos, findPlayer, pitchersOf } from './team';

/** 1 週ごとに出来事が起きる確率 */
export const EVENT_RATE = 0.2;

const userT = (c: Career): Team => c.teams.find((t) => t.user)!;
const bestKey = (p: Player): AttrKey => keysOf(p).reduce((a, b) => (p[b] > p[a] ? b : a));
const weakKey = (p: Player): AttrKey => keysOf(p).reduce((a, b) => (p[b] < p[a] ? b : a));

type Maker = (c: Career, t: Team) => GameEvent | null;

const makers: Maker[] = [
  // 自主練
  (_c, t) => {
    const ps = t.players.filter((p) => p.age <= 27 && keysOf(p).some((k) => p.pot[k] - p[k] > 6));
    if (!ps.length) return null;
    const p = pick(ps);
    return {
      kind: 'selfTrain', pid: p.id, title: `${p.name}の自主練`,
      body: `${p.name}が,居残りで自主練をしたいと言っています.やる気は十分ですが,体への負担も気になります.`,
      choices: [
        { key: 'allow', label: '許可する', hint: '能力が伸びやすい.疲れがたまる.' },
        { key: 'stop', label: '休ませる', hint: '体を休めて,調子を整える.' },
      ],
    };
  },
  // 不調の相談
  (_c, t) => {
    const ps = t.players.filter((p) => p.cond <= 1);
    if (!ps.length) return null;
    const p = pick(ps);
    return {
      kind: 'slump', pid: p.id, title: `${p.name}の不調`,
      body: `${p.name}が,ここのところ思うようにいかず,悩んでいます.`,
      choices: [
        { key: 'rest', label: '少し休ませる', hint: '調子と疲れが戻る.' },
        { key: 'cheer', label: '声をかけて励ます', hint: '立ち直ればよく上がるが,うまくいかないことも.' },
      ],
    };
  },
  // 若手の才能開花
  (_c, t) => {
    const ps = t.players.filter((p) => p.age <= 23);
    if (!ps.length) return null;
    const p = pick(ps);
    return {
      kind: 'spark', pid: p.id, title: `${p.name}に光るものが`,
      body: `若手の${p.name}が,練習で目を引くプレーを見せました.このまま伸ばせば,大化けするかもしれません.`,
      choices: [
        { key: 'coach', label: '付きっきりで指導する', hint: `${LABEL[bestKey(p)]}の上限が上がる.疲れがたまる.` },
        { key: 'watch', label: '見守る', hint: '少しだけ能力が伸びる.' },
      ],
    };
  },
  // ベテランの進退
  (_c, t) => {
    const ps = t.players.filter((p) => p.age >= 33);
    if (!ps.length) return null;
    const p = pick(ps);
    return {
      kind: 'veteran', pid: p.id, title: `${p.name}の進退`,
      body: `${p.age}歳の${p.name}が,現役を続けるべきか悩んでいます.`,
      choices: [
        { key: 'stay', label: '残ってほしいと伝える', hint: '調子が上がり,チームの連携も深まる.' },
        { key: 'retire', label: '引退を認める', hint: '今すぐ引退する.登録枠があく.' },
      ],
    };
  },
  // チームの雰囲気
  () => ({
    kind: 'spirit', title: 'チームの雰囲気',
    body: '連戦で,チームの空気が少し重くなっています.',
    choices: [
      { key: 'party', label: '食事会を開く', hint: 'バッテリーと二遊間の連携が深まる.' },
      { key: 'drill', label: '練習量を増やす', hint: '全員の能力が少し伸びるが,疲れがたまる.' },
    ],
  }),
  // ベテランが若手を指導
  (_c, t) => {
    const vets = t.players.filter((p) => p.age >= 30), kids = t.players.filter((p) => p.age <= 24);
    const pairs = vets.flatMap((v) => kids.filter((k) => k.role === v.role).map((k) => [v, k] as const));
    if (!pairs.length) return null;
    const [v, k] = pick(pairs);
    return {
      kind: 'mentor', pid: v.id, pid2: k.id, title: '先輩から後輩へ',
      body: `ベテランの${v.name}が,若手の${k.name}に技術を教えたいと申し出ました.`,
      choices: [
        { key: 'ok', label: '任せる', hint: `${k.name}が伸びる.${v.name}は少し疲れる.` },
        { key: 'no', label: '断る', hint: '何も起きない.' },
      ],
    };
  },
  // 他球団からのトレード打診
  (c, t) => {
    const core = new Set<number>([...t.lineup.map((e) => e.pid), ...t.pitchers.slice(0, 5)]);
    const mine = t.players.filter((p) => !core.has(p.id) && p.age <= 25 && futureValue(p) > playerValue(p) + 6);
    if (!mine.length) return null;
    const p = pick(mine);
    const others = leagueTeams(c, c.level).filter((x) => !x.user);
    const cand = shuffle(others).flatMap((o) => o.players.filter((q) => q.role === p.role && q.age >= 28 && playerValue(q) >= playerValue(p) + 5).map((q) => ({ o, q })));
    if (!cand.length) return null;
    const { o, q } = cand.reduce((a, b) => (playerValue(b.q) > playerValue(a.q) ? b : a));
    return {
      kind: 'trade', pid: p.id, pid2: q.id, teamId: o.id, title: `${o.name}からトレードの打診`,
      body: `${o.name}が,若手の${p.name}(${p.age}歳,将来性あり)と,${q.age}歳の${q.name}(今の力は${Math.round(playerValue(q))})との交換を提案してきました.`,
      choices: [
        { key: 'accept', label: '応じる', hint: `${q.name}を得て,${p.name}を出す.今は強くなるが,先は短い.` },
        { key: 'refuse', label: '断る', hint: '今のまま.' },
      ],
    };
  },
];

/** 週のはじめに,確率で出来事を起こす. */
export function rollEvent(c: Career): void {
  c.event = null;
  if (rand() > EVENT_RATE) return;
  const t = userT(c);
  for (const m of shuffle(makers)) {
    const e = m(c, t);
    if (e) { c.event = e; return; }
  }
}

/** 選択を反映する.結果の文章を返す. */
export function resolveEvent(c: Career, key: string): string {
  const e = c.event;
  if (!e) return '';
  const t = userT(c);
  const p = e.pid !== undefined ? findPlayer(t, e.pid) : undefined;
  const q = e.pid2 !== undefined ? findPlayer(t, e.pid2) : undefined;
  let text = '';
  switch (e.kind) {
    case 'selfTrain':
      if (!p) break;
      if (key === 'allow') {
        const k = weakKey(p);
        growAttr(p, k, 3);
        p.fatigue = clamp(p.fatigue + 25, 0, 100);
        text = `${p.name}は夜遅くまで汗を流し,${LABEL[k]}に手応えをつかみました.`;
        const learned = maybeLearn(p, p.role === '投手' ? 'pitch' : 'bat', 0.4);
        if (learned) text += learned;
      } else {
        p.cond = clamp(p.cond + 1, 0, 4);
        p.fatigue = Math.max(0, p.fatigue - 20);
        text = `${p.name}はしっかり休み,調子が上向きました.`;
      }
      break;
    case 'slump':
      if (!p) break;
      if (key === 'rest') {
        p.cond = clamp(p.cond + 2, 0, 4); p.fatigue = Math.max(0, p.fatigue - 30);
        text = `${p.name}は休養で調子を取り戻しました.`;
      } else if (rand() < 0.55) {
        p.cond = clamp(p.cond + 3, 0, 4);
        text = `監督の言葉に${p.name}は奮い立ち,調子が大きく上がりました!`;
      } else {
        p.cond = clamp(p.cond - 1, 0, 4);
        text = `${p.name}にはうまく届かず,さらに落ち込んでしまいました.`;
      }
      break;
    case 'spark':
      if (!p) break;
      if (key === 'coach') {
        const k = bestKey(p);
        p.pot[k] = clamp(p.pot[k] + ri(4, 9), p[k], 99);
        growAttr(p, k, 1.5);
        p.fatigue = clamp(p.fatigue + 20, 0, 100);
        text = `${p.name}の${LABEL[k]}の伸びしろが広がりました.`;
      } else {
        growAttr(p, bestKey(p), 1);
        text = `${p.name}は自分のペースで伸びています.`;
      }
      break;
    case 'veteran':
      if (!p) break;
      if (key === 'stay') {
        p.cond = clamp(p.cond + 2, 0, 4);
        const cat = findByPos(t, '捕');
        if (cat && p.role === '投手') addChem(t, cat.id, p.id, 8);
        text = `${p.name}は「もう一年やります」と笑顔で応じました.`;
      } else if (p.role === '野手' && fielders(t).length <= MIN_FIELDERS) {
        text = `${p.name}は残ることになりました(野手が足りないため).`;
      } else if (p.role === '投手' && pitchersOf(t).length <= MIN_PITCHERS) {
        text = `${p.name}は残ることになりました(投手が足りないため).`;
      } else {
        t.players = t.players.filter((x) => x !== p);
        t.pitchers = t.pitchers.filter((id) => id !== p.id);
        if (t.lineup.some((x) => x.pid === p.id) || t.lineup.length < 9) autoLineup(t);
        autoPitchers(t);
        text = `${p.name}は現役を引退しました.長い間,ありがとう!`;
      }
      break;
    case 'spirit':
      if (key === 'party') {
        const cat = findByPos(t, '捕'), a = findByPos(t, '二'), b = findByPos(t, '遊');
        if (cat) for (const id of t.pitchers) addChem(t, cat.id, id, 6);
        if (a && b) addChem(t, a.id, b.id, 8);
        text = '食事会でチームの空気が明るくなり,連携が深まりました.';
      } else {
        for (const x of t.players) { for (const k of keysOf(x)) growAttr(x, k, 0.5); x.fatigue = clamp(x.fatigue + 12, 0, 100); }
        text = '厳しい練習で,全員が少しずつ力をつけました.';
      }
      break;
    case 'mentor':
      if (!p || !q) break;
      if (key === 'ok') {
        for (const k of keysOf(q)) growAttr(q, k, 1);
        p.fatigue = clamp(p.fatigue + 10, 0, 100);
        text = `${q.name}は${p.name}の教えで,技術を磨きました.${p.name}との間に師弟の絆が生まれました.`;
        if (!t.bonds.some(([a, b]) => a === p.id && b === q.id)) { t.bonds.push([p.id, q.id]); if (t.bonds.length > 4) t.bonds.shift(); }
      } else text = '今回は見送りました.';
      break;
    case 'trade': {
      if (key !== 'accept' || !p || e.teamId === undefined || e.pid2 === undefined) { text = '申し出を断りました.'; break; }
      const o = c.teams.find((x) => x.id === e.teamId);
      const r = o && findPlayer(o, e.pid2);
      if (!o || !r) { text = '相手の事情で話は流れました.'; break; }
      t.players = t.players.filter((x) => x !== p);
      t.pitchers = t.pitchers.filter((id) => id !== p.id);
      o.players = o.players.filter((x) => x !== r);
      o.pitchers = o.pitchers.filter((id) => id !== r.id);
      o.lineup = o.lineup.filter((x) => x.pid !== r.id);
      t.players.push(r); o.players.push(p);
      if (r.role === '投手') t.pitchers.push(r.id);
      if (p.role === '投手') o.pitchers.push(p.id);
      autoLineup(t); autoPitchers(t); autoLineup(o); autoPitchers(o);
      text = `${p.name}と${r.name}のトレードが成立しました.`;
      break;
    }
    default: break;
  }
  c.event = null;
  const fatigueHit = p && p.fatigue > 70 ? `(${p.name}は疲れがたまっています)` : '';
  return text + fatigueHit;
}
