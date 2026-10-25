/** 練習の決め方(おまかせ・固定・手動)と,まとめて進めるときの止まりどき. */
import { adviseTraining, leagueAvgAttrs } from '../growth/advisor';
import type { MenuKey } from '../growth/training';
import { MENUS } from '../growth/training';
import type { Career } from '../types';
import { TRAIN_PER_WEEK, WEEKS_PER_YEAR, weekInfo } from './calendar';
import { trustGrowth } from './finance';
import { confirmMessage } from './warnings';

/** いま,おすすめの練習 */
export function recommendedMenu(c: Career): MenuKey {
  const u = c.teams.find((t) => t.user)!;
  const left = WEEKS_PER_YEAR - c.cal;
  return adviseTraining(u, leagueAvgAttrs(c), left, TRAIN_PER_WEEK * trustGrowth(c.trust) * weekInfo(c).trainMult, c.meal).best;
}

/**
 * 今週の練習.自分で選んでいればそれ.そうでなければ,決め方の設定に従う.
 * @param picked 今週,自分で選んだ練習(なければ null)
 */
export function chooseMenu(c: Career, picked: MenuKey | null, current: MenuKey): MenuKey {
  if (picked) return picked;
  if (c.auto.train === 'fixed' && c.auto.fixed in MENUS) return c.auto.fixed as MenuKey;
  if (c.auto.train === 'recommend') return recommendedMenu(c);
  return current;
}

/** まとめて進めている途中で,止まったほうがいい理由.なければ null. */
export function stopReason(c: Career, menu: string): string | null {
  if (c.phase !== 'season') return null;
  if (c.fired) return '解任されました.';
  if (c.event) return `出来事「${c.event.title}」が起きました.`;
  const w = confirmMessage(c, menu, false);
  if (w) return '疲れがたまっています.休養を考えましょう.';
  const hurt = c.news.find((n) => n.includes('離脱'));
  if (hurt) return hurt;
  const info = weekInfo(c);
  if (info.userGame === 'playoff' || info.userGame === 'cup') return `${info.title}が始まります.`;
  return null;
}
