/** 用語の説明.タップで意味が見られる. */
import { esc } from '../util/format';

export const TERMS: Record<string, { name: string; text: string }> = {
  ovr: { name: '総合値', text: '力を 0〜100 の 1 つの数字にしたものです(文字はランク: 90以上S,80以上A,…).選手は,野手がミート35%・パワー30%・走力15%・守備20%,投手が球威40%・制球35%・スタミナ25%の重み付けです.チームは,先発9人と投手上位5人の平均で,差が5あると勝率はおよそ7割になります.' },
  pot: { name: '素質(伸びしろ)', text: '選手が将来どこまで伸びるかの目安です.上限に近づくほど伸びにくくなります.若い選手ほど伸びやすく,成長タイプ(早熟・普通・晩成)でピークの年齢が変わります.' },
  trust: { name: 'GMの信頼度', text: '球団があなたをどれだけ信頼しているかです.高いと練習の伸び,調子,予算,自由契約の入団に良い影響があります.勝つと思われていた試合に勝つほど上がり,0 になると解任されます.' },
  prob: { name: '予想勝率', text: '両チームの総合力の差から出した,今日の勝つ確率です.低い相手に勝つと信頼度が大きく上がります.' },
  fatigue: { name: '疲労', text: '練習や試合でたまります.高いと力が落ち,怪我もしやすくなります.休養や料理で回復できます.' },
  cond: { name: '調子', text: '絶不調から絶好調までの 5 段階です.試合での力に少し影響し,練習や休養,出来事で変わります.' },
  focus: { name: '重点', text: '練習メニューで特に大きく伸びる能力です.重点以外の能力も,少しずつ伸びます.' },
  budget: { name: '予算', text: '1 年間に払える年俸の上限です.同じリーグの他チームの平均に,GMの信頼度と前年の成績が掛かります.超えたまま開幕すると信頼度が下がります.' },
  chem: { name: '連携', text: '選手どうしの相性です.一緒に試合に出たり,守備練習・投球練習をすると深まります.バッテリーは制球に,二遊間は守備と併殺に効きます.' },
  combo: { name: 'コンボ', text: 'オーダーが条件を満たすと発動する追い風です.条件はオーダータブで確認できます.' },
  sub: { name: 'サブポジ', text: 'コンバートで覚えた,以前の守備位置です.その位置を守っても,守備の落ち込みが小さくて済みます.' },
  fa: { name: '自由契約(FA)', text: 'どのチームとも契約していない選手です.チームが強く,リーグが上ほど入団してくれます.' },
  salary: { name: '年俸', text: '選手に払うお金です.力が高いほど急に高くなります.毎年,力に合わせて見直されます.' },
  fund: { name: '資金', text: '入場収入や食材の売却で増えるお金です.施設の強化に使います.年俸の予算とは別です.' },
  meal: { name: '料理', text: '食材を集めて作ると,数週間のあいだ練習の伸びが大きくなります.食堂を強くすると効き目が増します.' },
  po: { name: 'プレーオフ', text: 'リーグ戦の上位 4 チームが,11 月に行う勝ち抜き戦です.準決勝は 3 戦先に 2 勝,決勝は 5 戦先に 3 勝で決まります.' },
  cup: { name: '全日本選手権', text: '年末に,すべてのリーグのチームが 1 つのトーナメントで戦う大会です.下のリーグのチームが上のリーグに勝つと,大きな話題になります.' },
};

/** 用語をタップできる形にする */
export function term(key: string, label?: string): string {
  const t = TERMS[key];
  return `<button class="term" data-a="term" data-k="${key}">${esc(label ?? t.name)}</button>`;
}

export function termSheet(key: string): string {
  const t = TERMS[key];
  if (!t) return '';
  return `<div class="sheet-bg" data-a="term-close"></div><div class="sheet" role="dialog" aria-label="${esc(t.name)}の説明">
  <div class="sheet-h"><b>${esc(t.name)}</b><button class="btn ghost" data-a="term-close" aria-label="閉じる">✕</button></div>
  <p style="margin:0">${esc(t.text)}</p></div>`;
}

export function glossarySheet(): string {
  return `<div class="sheet-bg" data-a="term-close"></div><div class="sheet" role="dialog" aria-label="用語集">
  <div class="sheet-h"><b>用語集</b><button class="btn ghost" data-a="term-close" aria-label="閉じる">✕</button></div>
  ${Object.values(TERMS).map((t) => `<div><b>${esc(t.name)}</b><p class="small muted" style="margin:2px 0 8px">${esc(t.text)}</p></div>`).join('')}</div>`;
}
