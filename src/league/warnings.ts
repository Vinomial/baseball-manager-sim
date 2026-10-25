/** 休んだほうがいいなどの忠告.DOM に依存しない. */
import { payroll, budgetFor } from './finance';
import { effectiveLineup } from './team';
import type { Career, Player } from '../types';

export interface Warning { level: 'info' | 'warn' | 'bad'; text: string; }

const userT = (c: Career) => c.teams.find((t) => t.user)!;

/** 先発として出る選手の疲れ具合 */
function starters(c: Career): Player[] {
  const t = userT(c);
  const lineup = effectiveLineup(t).map((e) => t.players.find((p) => p.id === e.pid)!).filter(Boolean);
  const sp = t.pitchers.slice(0, 3).map((id) => t.players.find((p) => p.id === id)!).filter(Boolean);
  return [...lineup, ...sp];
}

export function warnings(c: Career, menu: string, practice: boolean): Warning[] {
  const t = userT(c);
  const out: Warning[] = [];
  const s = starters(c);
  const tired = s.filter((p) => p.fatigue >= 80 && !(p.inj && p.inj.weeks > 0));
  const avg = t.players.reduce((a, p) => a + p.fatigue, 0) / t.players.length;
  if (menu !== 'rest') {
    if (tired.length >= 3 || avg >= 60) out.push({ level: 'bad', text: `疲れがかなりたまっています(疲労80以上の先発が${tired.length}人,平均${Math.round(avg)}).このまま進むと怪我をしやすく,力も落ちます.休養をおすすめします.` });
    else if (tired.length >= 1 || avg >= 45) out.push({ level: 'warn', text: `疲れがたまってきています(疲労80以上の先発が${tired.length}人,平均${Math.round(avg)}).そろそろ休養を考えましょう.` });
    if (menu === 'stam' && avg >= 35) out.push({ level: 'warn', text: '「走り込み」は疲れがたまりやすい練習です.疲れ気味のときは避けましょう.' });
  }
  if (practice && avg >= 40) out.push({ level: 'warn', text: '練習試合は疲れがたまります.いまは見送ったほうがよさそうです.' });
  const hurtStarters = s.filter((p) => p.inj && p.inj.weeks > 0).length;
  if (hurtStarters) out.push({ level: 'info', text: `先発の${hurtStarters}人が怪我で休んでいます.控えが代わりに出ますが,戦力は落ちます.` });
  if (c.trust < 30) out.push({ level: 'bad', text: 'GMの信頼度が低く,解任の危機です.勝ち星を重ねましょう.' });
  else if (c.trust < 45) out.push({ level: 'warn', text: 'GMの信頼度が下がっています.' });
  if (payroll(t) > budgetFor(c)) out.push({ level: 'warn', text: '年俸の総額が予算を超えています.開幕前に整理しないと信頼度が下がります.' });
  return out;
}

/** 進む前に確認したいほど,疲れがたまっているか.たまっていれば理由を返す. */
export function confirmMessage(c: Career, menu: string, practice: boolean): string | null {
  const w = warnings(c, menu, practice).find((x) => x.level === 'bad' && x.text.startsWith('疲れ'));
  return w ? w.text : null;
}
