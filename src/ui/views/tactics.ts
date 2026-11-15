import { bestTactic, tacticDef, tacticFit, tacticFx, TACTICS } from '../../league/tactics';
import type { Career } from '../../types';
import { esc } from '../../util/format';

const pct = (v: number): string => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`;

export function tacticSummary(c: Career): string {
  return `${tacticDef(c.tactic).name} / 浸透度 ${Math.round(c.tacticFam ?? 100)}`;
}

/** チームの戦術.選ぶと,浸透度が下がってから少しずつ上がる. */
export function tacticHTML(c: Career): string {
  const d = tacticDef(c.tactic), fam = Math.round(c.tacticFam ?? 100), fit = tacticFit(c), best = bestTactic(c);
  const { fx, run } = tacticFx(c);
  const effects = [
    fx.hr ? `本塁打 ${pct(fx.hr)}` : '', fx.hit ? `安打 ${pct(fx.hit)}` : '', fx.k ? `三振 ${pct(fx.k)}` : '',
    fx.def ? `守備 +${fx.def.toFixed(1)}` : '', fx.cmd ? `制球 +${fx.cmd.toFixed(1)}` : '', run !== 1 ? `盗塁の多さ ×${run.toFixed(2)}` : '',
  ].filter(Boolean).join(' / ');
  return `<p class="small muted" style="margin:0 0 6px">戦術を決めると,試合の中身と,ドラフト・自由契約のおすすめが変わります.同じ戦術を続けるほど浸透し(公式戦の週に +4,戦術研究で +25),変えると浸透度が下がります.</p>
  <div class="mchips" role="group" aria-label="戦術">${TACTICS.map((t) => `<button class="mchip" data-a="tactic" data-k="${t.key}" aria-pressed="${t.key === d.key}"><b>${t.name}${t.key === best ? '<span class="rec star">★</span>' : ''}</b></button>`).join('')}</div>
  <div class="card advice" style="margin-top:8px"><p style="margin:0"><b>${d.name}</b> <span class="small muted">${esc(d.desc)}</span></p>
  ${d.fit.length ? `<div class="chem"><span class="who">浸透度 ${fam}</span><span class="bar"><i style="width:${fam}%"></i></span></div>
  <div class="chem"><span class="who">噛み合い ×${fit.toFixed(2)}</span><span class="bar"><i style="width:${((fit - 0.5) / 1) * 100}%;${fit < 0.9 ? 'background:var(--bad)' : ''}"></i></span></div>` : ''}
  <p class="small" style="margin:4px 0 0">${effects ? `いまの効き目: ${effects}` : '補正はありません.'}</p>
  ${best !== d.key ? `<p class="small muted" style="margin:4px 0 0">いまの顔ぶれに合うのは「${tacticDef(best).name}」です.</p>` : ''}</div>`;
}
