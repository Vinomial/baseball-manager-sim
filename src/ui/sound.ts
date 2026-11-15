/**
 * 効果音と BGM.音声ファイルは使わず,Web Audio で小さな電子音を鳴らす(ドット風の雰囲気).
 * ブラウザの決まりで,最初の操作のあとからしか鳴らせない.
 */
import { freq, notesAt, SONGS, type Scene } from './music';

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

/* ===== BGM(ファミコン風の 4 チャンネル.楽譜は music.ts) ===== */
export type { Scene };

/** 矩形波の幅(25% や 12.5%)を変えた音色.ファミコンらしい細い音になる. */
const pulses = new Map<number, PeriodicWave>();
function pulse(a: AudioContext, duty: number): PeriodicWave {
  let w = pulses.get(duty);
  if (!w) {
    const n = 32, re = new Float32Array(n), im = new Float32Array(n);
    for (let k = 1; k < n; k++) re[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
    w = a.createPeriodicWave(re, im);
    pulses.set(duty, w);
  }
  return w;
}

/** BGM の 1 音.t は AudioContext の時刻.音の頭と終わりを少しなめらかにして,プツッという音を防ぐ. */
function voice(a: AudioContext, hz: number, t: number, dur: number, wave: 'p12' | 'p25' | 'p50' | 'tri', vol: number): void {
  if (!bgmBus) return;
  const o = a.createOscillator(), g = a.createGain();
  if (wave === 'tri') o.type = 'triangle';
  else if (wave === 'p50') o.type = 'square';
  else o.setPeriodicWave(pulse(a, wave === 'p25' ? 0.25 : 0.125));
  o.frequency.setValueAtTime(hz, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.01);
  g.gain.setValueAtTime(vol, t + Math.max(0.02, dur - 0.04));
  g.gain.linearRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(bgmBus);
  o.start(t); o.stop(t + dur + 0.02);
}

let noiseBuf: AudioBuffer | null = null;
function drum(a: AudioContext, kind: 'k' | 's' | 'h', t: number): void {
  if (!bgmBus) return;
  if (kind === 'k') {
    // キック: 音程が急に下がる三角波
    const o = a.createOscillator(), g = a.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(0.22, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    o.connect(g); g.connect(bgmBus); o.start(t); o.stop(t + 0.16);
    return;
  }
  if (!noiseBuf) {
    noiseBuf = a.createBuffer(1, Math.floor(a.sampleRate * 0.2), a.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  s.buffer = noiseBuf; f.type = 'highpass'; f.frequency.value = kind === 'h' ? 7000 : 1800;
  const len = kind === 'h' ? 0.035 : 0.12, vol = kind === 'h' ? 0.035 : 0.09;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  s.connect(f); f.connect(g); g.connect(bgmBus);
  s.start(t); s.stop(t + len + 0.02);
}

let bgmTimer: number | null = null;
let step = 0;
let nextAt = 0;
let scene: Scene = 'home';

/** 少し先(0.15 秒)までの音を,オーディオの時計で予約する.タイマーのずれでテンポが乱れない. */
function schedule(): void {
  const a = ac();
  if (!a || !sound.bgm) return;
  const song = SONGS[scene];
  const dt = 30 / song.bpm;
  if (nextAt < a.currentTime) nextAt = a.currentTime + 0.05;
  while (nextAt < a.currentTime + 0.15) {
    const n = notesAt(song, step);
    if (n.lead) voice(a, freq(n.lead.midi), nextAt, dt * n.lead.len * 0.92, song.lead, song.lead === 'tri' ? 0.09 : 0.035);
    if (n.bass !== null) voice(a, freq(n.bass), nextAt, dt * (song.bass === 'long' ? 3.6 : 0.9), 'tri', 0.1);
    if (n.arp !== null) voice(a, freq(n.arp), nextAt, dt * 0.5, 'p12', 0.014);
    if (n.drum) drum(a, n.drum, nextAt);
    nextAt += dt;
    step++;
  }
}

function restartTimer(): void {
  if (bgmTimer !== null) { window.clearInterval(bgmTimer); bgmTimer = null; }
  const a = ac();
  if (!sound.bgm || !a) return;
  nextAt = a.currentTime + 0.05;
  bgmTimer = window.setInterval(schedule, 25);
}

export function startBgm(): void {
  if (!sound.bgm || bgmTimer !== null || !ac()) return;
  restartTimer();
}
export function stopBgm(): void {
  if (bgmTimer !== null) { window.clearInterval(bgmTimer); bgmTimer = null; }
}
/** 場面に合わせて,BGM を切り替える(曲の頭から) */
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
