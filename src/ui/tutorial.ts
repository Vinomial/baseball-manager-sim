/** はじめてガイド.最初の数週間,ホームに短い案内を出す. */
import { prefs } from './prefs';

export const STEPS: { title: string; text: string }[] = [
  { title: 'ようこそ', text: '草野球チームの監督になって,プロリーグの頂点を目指します.毎週,練習を選んで「試合へ」を押すだけ.試合は自動で進みます.' },
  { title: '練習を選ぶ', text: '練習メニューは,選んだ能力が重点的に伸びます(ほかも少し伸びます).★おすすめは,チームの弱点から選んだものです.' },
  { title: '試合と結果', text: '試合のあとは「試合」タブで,戦評,ボックススコア,アニメ再生が見られます.結果をとばしたいときは,メニューで切り替えられます.' },
  { title: '疲れと怪我', text: '練習や試合で疲れがたまり,怪我もします.疲れが高いときは「休養」を選びましょう.忠告が出たら,従うのがおすすめです.' },
  { title: 'オーダーを整える', text: '「チーム」タブの「オーダー」で,打順と守備位置を変えられます.条件がそろうと「コンボ」が発動します.' },
  { title: 'お金・ミッション・料理', text: 'ホームの下のほうで,ミッションを達成して食材を集め,料理で練習を強化できます.資金で施設も強くできます.' },
  { title: 'シーズンが終わると', text: '1年が終わると,結果,戦力外,ドラフト,自由契約の順に進みます.上位2チームは昇格です.さあ,はじめましょう!' },
];

export const tutorialActive = (): boolean => prefs.tutOn && prefs.tut < STEPS.length;

export function tutorialCard(): string {
  if (!tutorialActive()) return '';
  const s = STEPS[prefs.tut];
  return `<div class="card tut"><p style="margin:0"><span class="rec star">📘 はじめてガイド ${prefs.tut + 1}/${STEPS.length}</span> <b>${s.title}</b></p>
  <p class="small" style="margin:6px 0">${s.text}</p>
  <div class="row"><button class="btn" data-a="tut-next">${prefs.tut + 1 >= STEPS.length ? 'はじめる' : '次へ'}</button><button class="btn ghost" data-a="tut-skip">ガイドをとばす</button></div></div>`;
}
