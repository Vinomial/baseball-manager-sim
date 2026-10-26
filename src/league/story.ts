/** 起承転結(シーズンの物語),選手のヒストリー,名場面アルバム,特訓目標. */
import { LABEL } from '../data/constants';
import type { AttrKey, Career, Player } from '../types';
import { goalProgress } from './goals';
import { downCount, upCount } from './finance';
import { standings } from './schedule';

export type Phase = 'ki' | 'sho' | 'ten' | 'ketsu';

export const PHASES: [Phase, string, string][] = [['ki', '起', '開幕前'], ['sho', '承', '序盤〜中盤'], ['ten', '転', '終盤戦'], ['ketsu', '結', 'プレーオフ〜年末']];

/** その年の章のタイトル(リーグごと) */
const CHAPTER: string[] = ['河川敷の挑戦', '仕事と野球の両立', '夢への分かれ道', 'プロの壁', '世界の頂点へ'];

export function phaseOf(c: Career): Phase {
  return c.cal < 12 ? 'ki' : c.cal < 26 ? 'sho' : c.cal < 40 ? 'ten' : 'ketsu';
}

export const chapterTitle = (c: Career): string => `第${c.season}季「${CHAPTER[c.level] ?? ''}」`;

/** いまの場面の一言.状況によって変わる. */
export function storyBeat(c: Career): string {
  const ph = phaseOf(c);
  const lg = c.leagues[c.level];
  const tbl = standings(c);
  const rank = tbl.findIndex((r) => r.t.id === c.userId) + 1;
  const n = tbl.length;
  const up = upCount(c.level), down = downCount(c.level);
  const first = c.goals[0];
  if (ph === 'ki') return first ? `今季の目標は「${first.text}」.${c.week === 0 ? '準備を整えて,開幕を迎えよう.' : ''}` : '準備を整えて,開幕を迎えよう.';
  if (ph === 'sho') {
    if (rank === 1) return 'チームは首位をひた走る.この調子を保てるか.';
    if (up && rank <= up) return `昇格圏の${rank}位.気を抜かず,勝ち星を積み上げよう.`;
    if (down && rank > n - down) return `いまは${rank}位で降格圏.立て直しが急務だ.`;
    return first ? `${rank}位.目標「${first.text}」まで,${goalProgress(c, first)}.` : `${rank}位で序盤戦.`;
  }
  if (ph === 'ten') {
    const left = lg.schedule.length - lg.week;
    if (up && rank <= up) return `昇格圏の${rank}位で,残り${left}試合.ここが勝負どころだ!`;
    if (down && rank > n - down) return `残留争いの${rank}位.残り${left}試合,一戦も落とせない!`;
    if (rank <= 4) return `プレーオフ圏の${rank}位.残り${left}試合で,順位を上げたい.`;
    return `${rank}位で終盤戦.残り${left}試合,意地を見せよう.`;
  }
  if (c.cal < 42) return 'プレーオフの季節.頂点まで,あと少し.';
  if (c.cal < 48) return '全リーグが集まる全日本選手権.下剋上を狙おう!';
  return '1年の締めくくり.';
}

/** 選手のヒストリーに 1 行足す */
export function addStory(c: Career, p: Player, text: string): void {
  (p.story ??= []).push({ season: c.season, text });
  if (p.story.length > 30) p.story.shift();
}

/** 名場面アルバムに足す */
export function addAlbum(c: Career, kind: 'game' | 'title' | 'promo' | 'milestone', text: string, pid?: number): void {
  c.album.push({ season: c.season, cal: c.cal, kind, text, pid });
  if (c.album.length > 80) c.album.shift();
}

/** 名場面にするほどの試合の見出しか */
export const isNotableHeadline = (h: string): boolean => /サヨナラ|逆転|完封|ノーヒット|大勝|延長/.test(h);

/* ===== 特訓目標(レギュラー特訓) ===== */

export const TRAIN_SLOTS = 3;
export const TRAIN_STEPS = [5, 8, 12];

export function trainingCount(c: Career): number {
  return c.teams.find((t) => t.user)!.players.filter((p) => p.train && p.train.season === c.season).length;
}

/** 特訓目標を決める.できないときは理由を返す. */
export function setTrainGoal(c: Career, p: Player, attr: AttrKey, up: number): string | null {
  if (p.train && p.train.season === c.season) return 'すでに今年の特訓目標があります.';
  if (trainingCount(c) >= TRAIN_SLOTS) return `特訓は同時に${TRAIN_SLOTS}人までです.`;
  if (p.pot[attr] - p[attr] < up * 0.6) return `${LABEL[attr]}は上限に近く,この目標は厳しそうです.`;
  p.train = { attr, target: Math.round(p[attr]) + up, from: Math.round(p[attr]), season: c.season };
  return null;
}

/** 1 年の終わりに,特訓目標を判定する.結果の文章を返す. */
export function judgeTrainGoals(c: Career): string[] {
  const out: string[] = [];
  for (const p of c.teams.find((t) => t.user)!.players) {
    const t = p.train;
    if (!t || t.season !== c.season) continue;
    if (p[t.attr] >= t.target) {
      p.pot[t.attr] = Math.min(99, p.pot[t.attr] + 8);
      p.morale = Math.min(100, p.morale + 25);
      out.push(`${p.name}が特訓目標を達成!(${LABEL[t.attr]} ${t.from}→${Math.round(p[t.attr])})`);
      addStory(c, p, `特訓で${LABEL[t.attr]}を${t.from}から${Math.round(p[t.attr])}まで伸ばした.`);
    } else out.push(`${p.name}の特訓目標(${LABEL[t.attr]}${t.target})は届きませんでした.`);
    p.train = null;
  }
  return out;
}

