/** 週ごとの出来事.選手の相談や,チームの雰囲気など.DOM に依存しない. */
import { LABEL, MIN_FIELDERS, MIN_PITCHERS } from '../data/constants';
import { maybeLearn } from '../growth/abilities';
import { addChem } from '../growth/chemistry';
import { futureValue, growAttr, keysOf, playerValue, salaryOf } from '../growth/player';
import { PERS } from '../growth/personality';
import type { AttrKey, Career, GameEvent, Player, Team } from '../types';
import { clamp, pick, rand, ri, shuffle } from '../util/random';
import { leagueTeams } from './schedule';
import { autoLineup, autoPitchers, fielders, findByPos, findPlayer, pitchersOf } from './team';
import { earn, moneyScale, weeklyIncome } from './economy';
import { addTrust, fmtYen } from './finance';

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
  // 退団を考えるほどの不満
  (_c, t) => {
    const ps = t.players.filter((p) => p.morale <= 20 && !(p.inj && p.inj.weeks > 0));
    if (!ps.length) return null;
    const p = pick(ps);
    return {
      kind: 'unrest', pid: p.id, title: `${p.name}の不満`,
      body: `${p.name}(${PERS[p.pers].name})が,待遇や出場機会に不満を募らせ,GMに直談判に来ました.`,
      choices: [
        { key: 'raise', label: '昇給を約束する', hint: '年俸が上がり,やる気が大きく戻る.' },
        { key: 'talk', label: 'じっくり話を聞く', hint: 'やる気が少し戻る.うまくいけば大きく戻る.' },
        { key: 'release', label: '放出する', hint: '自由契約にする.' },
      ],
    };
  },
  // 怪我の相談
  (_c, t) => {
    const ps = t.players.filter((p) => p.inj && p.inj.weeks >= 2);
    if (!ps.length) return null;
    const p = pick(ps);
    return {
      kind: 'injTalk', pid: p.id, title: `${p.name}の怪我`,
      body: `${p.name}が${p.inj!.name}で,あと${p.inj!.weeks}週かかる見込みです.本人は「早く戻りたい」と言っています.`,
      choices: [
        { key: 'rush', label: '無理をしてでも早く戻す', hint: '2週ぶん早く戻れる.ただし悪化することもある.' },
        { key: 'heal', label: 'しっかり治す', hint: '予定どおり.疲れが抜け,調子も上がる.' },
      ],
    };
  },
  // 他球団からの引き抜き
  (c, t) => {
    const core = new Set<number>([...t.lineup.map((e) => e.pid), ...t.pitchers.slice(0, 5)]);
    const ps = t.players.filter((p) => !core.has(p.id) && p.age >= 23 && p.age <= 31 && playerValue(p) > 30);
    if (!ps.length) return null;
    const p = pick(ps);
    if ((p.role === '野手' ? fielders(t).length : pitchersOf(t).length) <= (p.role === '野手' ? MIN_FIELDERS : MIN_PITCHERS) + 1) return null;
    const o = pick(leagueTeams(c, c.level).filter((x) => !x.user));
    return {
      kind: 'poach', pid: p.id, teamId: o.id, title: `${o.name}が${p.name}を希望`,
      body: `${o.name}が,控えの${p.name}を${fmtYen(p.salary * 8)}で譲ってほしいと申し出ました.`,
      choices: [
        { key: 'sell', label: '譲る', hint: `${fmtYen(p.salary * 8)}が入る.選手は移籍する.` },
        { key: 'keep', label: '断る', hint: '選手は「必要とされている」と感じ,調子が上がる.' },
      ],
    };
  },
  // ファンイベント
  () => ({
    kind: 'fan', title: 'ファン感謝イベント',
    body: '後援会から,ファン感謝イベントの開催を提案されました.',
    choices: [
      { key: 'host', label: '開催する', hint: '資金が増え,信頼度も少し上がる.数人が疲れる.' },
      { key: 'skip', label: '練習に集中する', hint: '何も起きない.' },
    ],
  }),
  // あるある: 雨
  () => ({
    kind: 'rain', title: '雨で練習ができない',
    body: '朝から雨.グラウンドが使えず,選手たちが顔を見合わせています.',
    choices: [
      { key: 'indoor', label: '室内で軽く調整する', hint: '疲れが少し抜ける.' },
      { key: 'off', label: '思い切って休みにする', hint: '疲れが大きく抜け,数人の調子が上がる.' },
    ],
  }),
  // あるある: 寝坊
  (_c, t) => {
    const p = pick(t.players);
    return {
      kind: 'late', pid: p.id, title: `${p.name}が練習に遅刻`,
      body: `${p.name}が,集合時間に間に合いませんでした.「すみません,目覚ましが…」`,
      choices: [
        { key: 'scold', label: 'ビシッと叱る', hint: 'やる気は少し下がるが,チームが引き締まる.' },
        { key: 'laugh', label: '笑って許す', hint: '本人のやる気が上がる.' },
      ],
    };
  },
  // あるある: 差し入れ
  () => ({
    kind: 'gift', title: '商店街から差し入れ',
    body: '地元の商店街の人が,野菜やお米をたくさん持ってきてくれました.',
    choices: [
      { key: 'keep', label: '食材として受け取る', hint: '食材が2つ手に入る.' },
      { key: 'party', label: 'みんなで食べる', hint: '全員のやる気が少し上がる.' },
    ],
  }),
  // あるある: インタビュー
  () => ({
    kind: 'press', title: '記者のインタビュー',
    body: '地元の記者が,今シーズンの意気込みを聞きに来ました.',
    choices: [
      { key: 'bold', label: '強気に語る', hint: '当たれば信頼度が上がり,外れると下がる.' },
      { key: 'humble', label: '控えめに語る', hint: '信頼度が少し上がる.' },
    ],
  }),
  // スポンサー
  () => ({
    kind: 'sponsor', title: 'スポンサーの依頼',
    body: '地元の企業が,広告への出演と引き換えに協賛金を出したいと言っています.',
    choices: [
      { key: 'accept', label: '引き受ける', hint: '協賛金が入る.数人が疲れる.' },
      { key: 'decline', label: '断る', hint: '信頼度が少し上がる.「練習に集中するGM」と評判に.' },
    ],
  }),
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
  const t = userT(c);
  // 不満が限界の選手がいると,出来事になりやすい
  const angry = t.players.some((p) => p.morale <= 15);
  if (rand() > (angry ? 0.5 : EVENT_RATE)) return;
  if (angry) { for (const m of makers) { const e = m(c, t); if (e?.kind === 'unrest') { c.event = e; return; } } }
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
        text = `GMの言葉に${p.name}は奮い立ち,調子が大きく上がりました!`;
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
    case 'unrest':
      if (!p) break;
      if (key === 'raise') { p.salary = Math.max(p.salary, Math.round(salaryOf(p) * 1.1 / 10) * 10); p.morale = clamp(p.morale + 35, 0, 100); text = `${p.name}は昇給を喜び,やる気を取り戻しました.`; }
      else if (key === 'talk') { const ok = rand() < 0.4; p.morale = clamp(p.morale + (ok ? 30 : 10), 0, 100); text = ok ? `${p.name}は話を聞いてもらい,すっきりした表情です.` : `${p.name}は少し落ち着きました.`; }
      else if (fielders(t).length > MIN_FIELDERS && p.role === '野手' || pitchersOf(t).length > MIN_PITCHERS && p.role === '投手') {
        t.players = t.players.filter((x) => x !== p); t.pitchers = t.pitchers.filter((id) => id !== p.id); t.lineup = t.lineup.filter((x) => x.pid !== p.id);
        p.prev = t.name; c.fa.push(p);
        if (t.lineup.length < 9) autoLineup(t);
        text = `${p.name}を放出しました.`;
      } else text = `${p.name}は人数が足りないため,残ることになりました.`;
      break;
    case 'injTalk':
      if (!p || !p.inj) break;
      if (key === 'rush') {
        p.inj.weeks = Math.max(1, p.inj.weeks - 2);
        if (rand() < 0.35) { p.inj.weeks += 4; p.cond = clamp(p.cond - 1, 0, 4); text = `無理がたたり,${p.name}の怪我が悪化しました…(あと${p.inj.weeks}週)`; }
        else text = `${p.name}は予定より早く戻れそうです(あと${p.inj.weeks}週).`;
      } else { p.fatigue = Math.max(0, p.fatigue - 30); p.cond = clamp(p.cond + 1, 0, 4); text = `${p.name}はじっくり治すことになりました.`; }
      break;
    case 'poach': {
      const o = c.teams.find((x) => x.id === e.teamId);
      if (key !== 'sell' || !p || !o) { if (p) p.cond = clamp(p.cond + 1, 0, 4); text = `${p?.name ?? '選手'}は「必要とされている」と張り切っています.`; break; }
      earn(c, 'trade', p.salary * 8);
      t.players = t.players.filter((x) => x !== p);
      t.pitchers = t.pitchers.filter((id) => id !== p.id);
      t.lineup = t.lineup.filter((x) => x.pid !== p.id);
      o.players.push(p);
      if (p.role === '投手') o.pitchers.push(p.id);
      autoLineup(o); autoPitchers(o);
      if (t.lineup.length < 9) autoLineup(t);
      text = `${p.name}が${o.name}へ移籍しました.${fmtYen(p.salary * 8)}が入りました.`;
      break;
    }
    case 'fan':
      if (key === 'host') {
        earn(c, 'event', weeklyIncome(c) * 2);
        addTrust(c, 1.5);
        for (const x of shuffle(t.players).slice(0, 3)) x.fatigue = clamp(x.fatigue + 8, 0, 100);
        text = 'ファン感謝イベントは大盛況でした!資金が増えました.';
      } else text = '今回は見送り,練習に集中しました.';
      break;
    case 'rain':
      for (const x of t.players) x.fatigue = Math.max(0, x.fatigue - (key === 'off' ? 25 : 10));
      if (key === 'off') for (const x of shuffle(t.players).slice(0, 4)) x.cond = clamp(x.cond + 1, 0, 4);
      text = key === 'off' ? '思い切って休みにしたら,選手たちの表情が明るくなりました.' : '室内で軽く体を動かしました.';
      break;
    case 'late':
      if (!p) break;
      if (key === 'scold') { p.morale = clamp(p.morale - (p.pers === 'sensitive' ? 14 : p.pers === 'fighter' ? -4 : 8), 0, 100); text = `${p.name}は反省し,チームも引き締まりました.`; for (const x of t.players) x.cond = clamp(x.cond + (rand() < 0.2 ? 1 : 0), 0, 4); }
      else { p.morale = clamp(p.morale + 8, 0, 100); text = `${p.name}は「次は絶対に遅れません!」と頭を下げました.`; }
      break;
    case 'gift':
      if (key === 'keep') { for (let i = 0; i < 2; i++) c.pantry[pick(['rice', 'meat', 'fish', 'veg', 'fruit', 'egg'] as const)]++; text = '食材を2つ受け取りました.'; }
      else { for (const x of t.players) x.morale = clamp(x.morale + 3, 0, 100); text = 'みんなで食べて,チームが一つになりました.'; }
      break;
    case 'press':
      if (key === 'bold') { const ok = rand() < 0.55; addTrust(c, ok ? 3 : -3); text = ok ? '強気の発言が話題になり,期待が高まりました.' : '強気の発言が裏目に出て,批判されました…'; }
      else { addTrust(c, 1); text = '謙虚な姿勢が好感を呼びました.'; }
      break;
    case 'sponsor':
      if (key === 'accept') {
        earn(c, 'event', Math.round(moneyScale(c) * 0.05));
        for (const x of shuffle(t.players).slice(0, 3)) x.fatigue = clamp(x.fatigue + 8, 0, 100);
        text = '広告に出演し,協賛金を受け取りました.';
      } else { addTrust(c, 1); text = '「練習に集中するGM」と好評です.'; }
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
