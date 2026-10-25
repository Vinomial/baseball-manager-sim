/**
 * 効果音と BGM.音声ファイルは使わず,Web Audio で小さな電子音を鳴らす(ドット風の雰囲気).
 * ブラウザの決まりで,最初の操作のあとからしか鳴らせない.
 */
const KEY_SE = 'baseball-manager-sim/se';
const KEY_BGM = 'baseball-manager-sim/bgm';
const KEY_VOL = 'baseball-manager-sim/vol';
const KEY_VIB = 'baseball-manager-sim/vib';

function read(key: string, def: boolean): boolean {
  try { const v = localStorage.getItem(key); return v === null ? def : v === '1'; } catch { return def; }
}
function write(key: string, v: boolean): void {
  try { localStorage.setItem(key, v ? '1' : '0'); } catch { /* 保存できなくても動く */ }
}

function readVol(): { se: number; bgm: number } {
  try {
    const v = JSON.parse(localStorage.getItem(KEY_VOL) ?? '{}') as { se?: number; bgm?: number };
    return { se: typeof v.se === 'number' ? v.se : 0.7, bgm: typeof v.bgm === 'number' ? v.bgm : 0.5 };
  } catch { return { se: 0.7, bgm: 0.5 }; }
}

export const sound = { se: read(KEY_SE, true), bgm: read(KEY_BGM, false), vib: read(KEY_VIB, true), vol: readVol() };

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let seBus: GainNode | null = null;
let bgmBus: GainNode | null = null;

function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    try {
      ctx = new C(); master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
      seBus = ctx.createGain(); bgmBus = ctx.createGain(); seBus.connect(master); bgmBus.connect(master);
      applyVolumes();
    } catch { return null; }
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => undefined);
  return ctx;
}

function applyVolumes(): void {
  if (seBus) seBus.gain.value = sound.vol.se;
  if (bgmBus) bgmBus.gain.value = sound.vol.bgm;
}

function tone(freq: number, dur: number, type: OscillatorType = 'square', vol = 0.12, delay = 0, slideTo?: number, bgm = false): void {
  const a = ac();
  const bus = bgm ? bgmBus : seBus;
  if (!a || !bus) return;
  const t = a.currentTime + delay;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(bus);
  o.start(t); o.stop(t + dur + 0.02);
}

function noise(dur: number, vol = 0.15, delay = 0, hp = 800): void {
  const a = ac();
  if (!a || !seBus) return;
  const t = a.currentTime + delay;
  const buf = a.createBuffer(1, Math.max(1, Math.floor(a.sampleRate * dur)), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  s.buffer = buf; f.type = 'highpass'; f.frequency.value = hp;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(seBus);
  s.start(t);
}

const on = (f: () => void) => () => { if (sound.se) f(); };

/** 効果音.SE が OFF のときは鳴らさない. */
export const sfx = {
  tap: on(() => tone(880, 0.04, 'square', 0.05)),
  ok: on(() => { tone(660, 0.07, 'square', 0.08); tone(990, 0.1, 'square', 0.08, 0.07); }),
  coin: on(() => { tone(1320, 0.06, 'square', 0.07); tone(1760, 0.12, 'square', 0.07, 0.06); }),
  warn: on(() => { vibrate([60, 40, 60]); tone(300, 0.16, 'sawtooth', 0.09); tone(240, 0.22, 'sawtooth', 0.09, 0.16); }),
  hit: on(() => { noise(0.07, 0.25, 0, 1500); tone(220, 0.08, 'triangle', 0.12); }),
  hr: on(() => { vibrate(60); noise(0.1, 0.3, 0, 1200); tone(180, 0.1, 'triangle', 0.14); tone(523, 0.1, 'square', 0.08, 0.12); tone(659, 0.1, 'square', 0.08, 0.22); tone(784, 0.25, 'square', 0.08, 0.32); }),
  strike: on(() => { noise(0.06, 0.2, 0, 2500); tone(400, 0.09, 'square', 0.07, 0, 150); }),
  out: on(() => tone(200, 0.12, 'triangle', 0.09, 0, 120)),
  walk: on(() => { tone(700, 0.05, 'square', 0.06); tone(700, 0.05, 'square', 0.06, 0.08); }),
  win: on(() => { vibrate([40, 40, 80]); [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, 'square', 0.09, i * 0.12)); tone(1047, 0.4, 'square', 0.09, 0.5); }),
  lose: on(() => { [392, 330, 262].forEach((f, i) => tone(f, 0.22, 'triangle', 0.1, i * 0.18)); }),
  level: on(() => { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.12, 'square', 0.09, i * 0.09)); }),
};

/** 試合の結果で,勝ち負けの音を出す */
export const resultSound = (win: boolean | null): void => { if (win === true) sfx.win(); else if (win === false) sfx.lose(); };

/* ===== BGM(場面ごとのかんたんな音形のくりかえし) ===== */
export type Scene = 'title' | 'home' | 'game' | 'off';
interface Tune { melody: number[]; bass: number[]; ms: number; wave: OscillatorType; }
const TUNES: Record<Scene, Tune> = {
  title: { melody: [523, 0, 659, 0, 784, 0, 659, 0, 587, 0, 698, 0, 880, 0, 784, 0], bass: [131, 175, 196, 131], ms: 300, wave: 'triangle' },
  home: { melody: [523, 0, 659, 0, 784, 659, 523, 0, 587, 0, 698, 0, 784, 698, 587, 0, 659, 0, 784, 0, 880, 784, 659, 0, 587, 659, 523, 0, 392, 0, 0, 0], bass: [131, 131, 196, 196, 175, 175, 196, 196], ms: 230, wave: 'square' },
  game: { melody: [659, 659, 0, 784, 880, 0, 784, 659, 523, 0, 659, 0, 784, 880, 988, 0, 880, 0, 784, 0, 659, 784, 659, 0, 587, 0, 659, 0, 523, 0, 0, 0], bass: [131, 196, 131, 196, 175, 262, 175, 262], ms: 170, wave: 'square' },
  off: { melody: [784, 0, 988, 0, 1175, 988, 784, 0, 880, 0, 1047, 0, 1319, 1047, 880, 0], bass: [196, 262, 196, 330], ms: 260, wave: 'triangle' },
};
let bgmTimer: number | null = null;
let step = 0;
let scene: Scene = 'home';

function bgmTick(): void {
  if (!sound.bgm) return;
  const t = TUNES[scene];
  const m = t.melody[step % t.melody.length];
  if (m) tone(m, t.ms / 1000 * 0.75, t.wave, 0.04, 0, undefined, true);
  if (step % 4 === 0) tone(t.bass[(step / 4) % t.bass.length], t.ms / 1000 * 2, 'triangle', 0.06, 0, undefined, true);
  step++;
}

function restartTimer(): void {
  if (bgmTimer !== null) { window.clearInterval(bgmTimer); bgmTimer = null; }
  if (!sound.bgm || !ac()) return;
  bgmTimer = window.setInterval(bgmTick, TUNES[scene].ms);
}

export function startBgm(): void {
  if (!sound.bgm || bgmTimer !== null || !ac()) return;
  restartTimer();
}
export function stopBgm(): void {
  if (bgmTimer !== null) { window.clearInterval(bgmTimer); bgmTimer = null; }
}
/** 場面に合わせて,BGM を切り替える */
export function setScene(s: Scene): void {
  if (s === scene) return;
  scene = s;
  step = 0;
  if (bgmTimer !== null) restartTimer();
}

/** スマホの振動(対応している端末だけ) */
export function vibrate(ms: number | number[]): void {
  if (sound.vib && typeof navigator !== 'undefined' && 'vibrate' in navigator) { try { navigator.vibrate(ms); } catch { /* 無視 */ } }
}

export function setVolume(kind: 'se' | 'bgm', v: number): void {
  sound.vol[kind] = Math.max(0, Math.min(1, v));
  try { localStorage.setItem(KEY_VOL, JSON.stringify(sound.vol)); } catch { /* 無視 */ }
  applyVolumes();
}
export function setVib(v: boolean): void { sound.vib = v; write(KEY_VIB, v); if (v) vibrate(40); }

export function setSe(v: boolean): void { sound.se = v; write(KEY_SE, v); if (v) sfx.ok(); }
export function setBgm(v: boolean): void { sound.bgm = v; write(KEY_BGM, v); if (v) startBgm(); else stopBgm(); }
/** 最初の操作で音声を使えるようにし,BGM が ON なら始める */
export function unlockAudio(): void { ac(); startBgm(); }
