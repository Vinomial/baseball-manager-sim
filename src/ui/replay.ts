/**
 * 試合の再生.結果を 1 打席ずつ,ドット風のグラウンドで再現する.
 * 再生中に画面全体を描き直さないよう,この部品は自分で DOM を更新する.
 */
import type { Game, LogEntry, PlayKind } from '../types';
import { esc } from '../util/format';
import { sfx } from './sound';

interface Frame {
  inning: number;
  half: 0 | 1;
  outs: number;
  bases: [string, string, string];
  a: number;
  h: number;
  text: string;
  kind: PlayKind | 'start' | 'end';
  batter: string;
  pitcher: string;
  hl: boolean;
}

const HOME = [100, 160], BASE = [[150, 110], [100, 60], [50, 110]];
const FIELDERS = [[100, 112], [100, 168], [143, 100], [122, 78], [78, 78], [57, 100], [45, 55], [100, 35], [155, 55]];
const KIND_LABEL: Record<string, string> = {
  k: '三振', bb: '四球', hit: '安打', xbh: '長打', hr: 'ホームラン!', gro: 'ゴロ', fly: 'フライ', dp: '併殺', sf: '犠飛', err: 'エラー', sub: '交代', end: '試合終了',
};
const BALL: Record<string, number[][]> = {
  hit: [[60, 70], [100, 62], [140, 70], [120, 98], [80, 98]],
  xbh: [[28, 48], [172, 48], [100, 14]],
  hr: [[100, -8], [30, 8], [170, 8]],
  gro: [[78, 98], [122, 98], [100, 104]],
  fly: [[60, 52], [100, 40], [140, 52]],
  sf: [[100, 40]],
  dp: [[80, 100]],
  err: [[78, 98], [122, 98]],
};

export function buildFrames(g: Game): Frame[] {
  const chron: LogEntry[] = [...g.log].reverse();
  const frames: Frame[] = [{ inning: 1, half: 0, outs: 0, bases: ['', '', ''], a: 0, h: 0, text: 'プレイボール!', kind: 'start', batter: '', pitcher: '', hl: false }];
  for (const e of chron) {
    const over = e.t.startsWith('試合終了');
    frames.push({
      inning: e.inning, half: e.half, outs: Math.min(3, e.outs), bases: e.outs >= 3 ? ['', '', ''] : e.bases,
      a: e.a, h: e.h, text: e.t, kind: over ? 'end' : e.kind, batter: e.batter, pitcher: e.pitcher, hl: e.hl,
    });
  }
  return frames;
}

interface RS { game: Game | null; frames: Frame[]; idx: number; playing: boolean; speed: number; timer: number | null; }
const rs: RS = { game: null, frames: [], idx: 0, playing: false, speed: 1, timer: null };

export function replayHTML(g: Game): string {
  const dots = FIELDERS.map(([x, y]) => `<rect x="${x - 2}" y="${y - 2}" width="4" height="4" fill="${'var(--ink)'}" opacity=".35"/>`).join('');
  return `<div class="card replay" id="replay" data-replay>
  <div class="rp-board px"><span class="rp-t">${esc(g.away.team.name)}</span><b class="rp-a">0</b><span class="rp-sep">-</span><b class="rp-h">0</b><span class="rp-t">${esc(g.home.team.name)}</span></div>
  <div class="rp-info px"><span class="rp-inn">1回表</span><span class="lamps">アウト <span class="lamp"></span><span class="lamp"></span></span></div>
  <svg viewBox="0 0 200 175" class="rp-field" role="img" aria-label="試合の再生">
    <path d="M100 168 L8 76 A130 130 0 0 1 192 76 Z" fill="var(--grass)"/>
    <path d="M100 160 L150 110 L100 60 L50 110 Z" fill="var(--dirt)"/>
    <path d="M100 148 L138 110 L100 72 L62 110 Z" fill="var(--grass2)"/>
    <circle cx="100" cy="110" r="7" fill="var(--dirt)"/>
    <rect x="94" y="154" width="12" height="12" transform="rotate(45 100 160)" fill="#fff"/>
    <rect class="rp-b0" x="144" y="104" width="12" height="12" transform="rotate(45 150 110)" fill="#fff" stroke="#0005"/>
    <rect class="rp-b1" x="94" y="54" width="12" height="12" transform="rotate(45 100 60)" fill="#fff" stroke="#0005"/>
    <rect class="rp-b2" x="44" y="104" width="12" height="12" transform="rotate(45 50 110)" fill="#fff" stroke="#0005"/>
    ${dots}
    <g class="rp-runners"></g>
    <circle class="rp-ball" r="3" cx="100" cy="160" fill="#fff" stroke="#000" stroke-width="1" opacity="0"/>
    <text class="rp-label px" x="100" y="96" text-anchor="middle" font-size="16"></text>
  </svg>
  <p class="rp-text" aria-live="polite">プレイボール!</p>
  <p class="rp-who small muted"></p>
  <div class="rp-ctl">
    <button class="btn ghost" data-r="first" aria-label="最初から">⏮</button>
    <button class="btn ghost" data-r="prev" aria-label="ひとつ戻る">◀</button>
    <button class="btn" data-r="play" aria-label="再生">▶ 再生</button>
    <button class="btn ghost" data-r="next" aria-label="ひとつ進む">▶|</button>
    <button class="btn ghost" data-r="last" aria-label="最後へ">⏭</button>
    <button class="btn ghost" data-r="speed" aria-label="速さ">×1</button>
  </div>
  <input type="range" class="rp-seek" min="0" max="${Math.max(0, g.log.length)}" value="0" aria-label="場面を選ぶ">
  </div>`;
}

function stop(): void {
  if (rs.timer !== null) { window.clearInterval(rs.timer); rs.timer = null; }
  rs.playing = false;
}

/** 描画後に呼ぶ.#replay があれば,そこに再生の動きを付ける. */
export function initReplay(root: HTMLElement, g: Game | null): void {
  stop();
  const el = root.querySelector<HTMLElement>('[data-replay]');
  if (!el || !g) return;
  if (rs.game !== g) { rs.game = g; rs.frames = buildFrames(g); rs.idx = 0; rs.speed = 1; }
  const runners = el.querySelector<SVGGElement>('.rp-runners')!;
  const ball = el.querySelector<SVGCircleElement>('.rp-ball')!;
  const label = el.querySelector<SVGTextElement>('.rp-label')!;
  const seek = el.querySelector<HTMLInputElement>('.rp-seek')!;
  seek.max = String(rs.frames.length - 1);
  const dots = new Map<string, SVGGElement>();
  const q = (s: string) => el.querySelector<HTMLElement>(s)!;
  const move = (d: SVGGElement, p: number[]) => { d.style.transform = `translate(${p[0]}px,${p[1]}px)`; };
  const dur = () => `${Math.max(0.12, 0.5 / rs.speed)}s`;

  const place = (f: Frame, prev: Frame | null, animate: boolean) => {
    const scored = !!prev && (f.a + f.h > prev.a + prev.h);
    const want = new Map<string, number>();
    f.bases.forEach((n, i) => { if (n) want.set(n, i); });
    for (const [name, d] of [...dots]) {
      if (!want.has(name)) {
        dots.delete(name);
        if (animate && scored) move(d, HOME);
        d.style.opacity = '0';
        window.setTimeout(() => d.remove(), animate ? 600 : 0);
      }
    }
    for (const [name, i] of want) {
      let d = dots.get(name);
      if (!d) {
        d = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        d.setAttribute('class', 'rp-dot');
        d.innerHTML = `<circle r="5.5" fill="var(--sel)" stroke="#000" stroke-width="1"/>`;
        d.style.transition = 'none';
        move(d, animate && prev && prev.bases.indexOf(name) < 0 ? HOME : BASE[i]);
        runners.appendChild(d);
        dots.set(name, d);
        void d.getBoundingClientRect();
      }
      d.style.transition = animate ? `transform ${dur()} linear, opacity ${dur()}` : 'none';
      d.style.opacity = '1';
      move(d, BASE[i]);
    }
    for (let i = 0; i < 3; i++) el.querySelector(`.rp-b${i}`)!.setAttribute('fill', f.bases[i] ? 'var(--sel)' : '#fff');
  };

  const flash = (f: Frame, animate: boolean) => {
    label.textContent = KIND_LABEL[f.kind] ?? '';
    label.classList.remove('pop'); void (label as unknown as HTMLElement).getBoundingClientRect?.();
    if (animate && label.textContent) label.classList.add('pop');
    const spots = BALL[f.kind];
    if (!animate || !spots) { ball.setAttribute('opacity', '0'); return; }
    const t = spots[Math.floor(Math.random() * spots.length)];
    ball.style.transition = 'none'; ball.setAttribute('opacity', '1');
    ball.style.transform = 'translate(0px,0px)';
    void (ball as unknown as HTMLElement).getBoundingClientRect?.();
    ball.style.transition = `transform ${dur()} ease-out, opacity .3s ${dur()}`;
    ball.style.transform = `translate(${t[0] - 100}px,${t[1] - 160}px)`;
    window.setTimeout(() => ball.setAttribute('opacity', '0'), 420 / rs.speed + 100);
  };

  const playFor = (k: string) => {
    if (k === 'hr') sfx.hr();
    else if (k === 'hit' || k === 'xbh' || k === 'err') sfx.hit();
    else if (k === 'k') sfx.strike();
    else if (k === 'bb') sfx.walk();
    else if (['gro', 'fly', 'dp', 'sf'].includes(k)) sfx.out();
    else if (k === 'end') sfx.ok();
  };
  let shown = -1;
  const show = (i: number, animate: boolean) => {
    i = Math.max(0, Math.min(rs.frames.length - 1, i));
    const f = rs.frames[i], prev = animate && i === shown + 1 ? rs.frames[shown] : null;
    if (!prev) { for (const d of dots.values()) d.remove(); dots.clear(); }
    rs.idx = i; shown = i;
    q('.rp-a').textContent = String(f.a);
    q('.rp-h').textContent = String(f.h);
    q('.rp-inn').textContent = f.kind === 'end' ? '試合終了' : `${f.inning}回${f.half ? '裏' : '表'}`;
    el.querySelectorAll('.lamp').forEach((l, k) => l.classList.toggle('on', f.outs > k));
    const t = q('.rp-text');
    t.textContent = f.text;
    t.classList.toggle('hl', f.hl);
    q('.rp-who').textContent = f.batter ? `打者 ${f.batter} / 投手 ${f.pitcher}` : '';
    seek.value = String(i);
    if (animate) playFor(f.kind);
    place(f, prev, animate);
    flash(f, animate);
    const play = el.querySelector<HTMLButtonElement>('[data-r="play"]')!;
    play.textContent = rs.playing ? '⏸ 停止' : (i >= rs.frames.length - 1 ? '↻ もう一度' : '▶ 再生');
  };

  const tick = () => {
    if (!document.body.contains(el)) { stop(); return; }
    if (rs.idx >= rs.frames.length - 1) { stop(); show(rs.idx, false); return; }
    show(rs.idx + 1, true);
  };
  const start = () => {
    if (rs.idx >= rs.frames.length - 1) show(0, false);
    rs.playing = true;
    rs.timer = window.setInterval(tick, 1100 / rs.speed);
    show(rs.idx, false);
  };

  el.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-r]');
    if (!b) return;
    const r = b.dataset.r;
    if (r === 'play') { if (rs.playing) { stop(); show(rs.idx, false); } else start(); return; }
    const wasPlaying = rs.playing;
    stop();
    if (r === 'first') show(0, false);
    else if (r === 'last') show(rs.frames.length - 1, false);
    else if (r === 'next') show(rs.idx + 1, true);
    else if (r === 'prev') show(rs.idx - 1, false);
    else if (r === 'speed') {
      rs.speed = rs.speed === 1 ? 2 : rs.speed === 2 ? 4 : 1;
      b.textContent = `×${rs.speed}`;
      if (wasPlaying) start();
    }
  });
  seek.addEventListener('input', () => { stop(); show(Number(seek.value), false); });
  el.querySelector<HTMLElement>('[data-r="speed"]')!.textContent = `×${rs.speed}`;
  show(rs.idx, false);
}
