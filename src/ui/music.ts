/**
 * BGM の楽譜.ファミコン風の 4 チャンネル(メロディ,和音のアルペジオ,ベース,ドラム).
 * 音は鳴らさず,楽譜を「この拍に,この高さの音」に直すところまでを受け持つ(テストできるように).
 */

export type Scene = 'title' | 'home' | 'game' | 'off';

export interface Song {
  /** 1 分あたりの拍(4 分音符).1 ステップは 8 分音符. */
  bpm: number;
  /** 小節ごとのコード(C, Am, F#m, Bb など) */
  chords: string[];
  /** 小節ごとのメロディ.8 ステップを空白で区切る.「-」は前の音をのばす,「.」は休み. */
  melody: string[];
  /** メロディの音色 */
  lead: 'p25' | 'p50' | 'tri';
  /** ベースの刻み方.long: 1 小節に 2 回,drive: 8 分で刻む,walk: 根音と 5 度を交互に */
  bass: 'long' | 'drive' | 'walk';
  /** アルペジオを入れるか */
  arp: boolean;
  /** ドラム.k: キック,s: スネア,h: ハイハット,.: なし(8 ステップ) */
  drums?: string;
}

export const SONGS: Record<Scene, Song> = {
  // タイトル: 堂々とした行進曲
  title: {
    bpm: 112, lead: 'p25', bass: 'walk', arp: true, drums: 'k.h.s.h.',
    chords: ['C', 'G', 'Am', 'F', 'C', 'G', 'F', 'G'],
    melody: [
      'E5 - G5 - C6 - B5 A5', 'G5 - - - D5 - G5 -', 'A5 - C6 - E6 - D6 C6', 'C6 - A5 - F5 - - -',
      'E5 - G5 - C6 - D6 E6', 'D6 - B5 - G5 - A5 B5', 'C6 - A5 - F5 - A5 C6', 'B5 - - - G5 - - -',
    ],
  },
  // ホーム: のどかな練習場
  home: {
    bpm: 96, lead: 'tri', bass: 'long', arp: true, drums: 'k...h...',
    chords: ['F', 'Dm', 'Gm', 'C', 'F', 'Am', 'Bb', 'C'],
    melody: [
      'A4 - C5 - F5 - E5 -', 'D5 - - - A4 - - -', 'Bb4 - D5 - G5 - F5 -', 'E5 - - - C5 - - -',
      'A4 - C5 - F5 - A5 -', 'G5 - E5 - C5 - E5 -', 'F5 - D5 - Bb4 - D5 -', 'C5 - - - - - . .',
    ],
  },
  // 試合: 勢いのある応援歌
  game: {
    bpm: 144, lead: 'p50', bass: 'drive', arp: false, drums: 'khshkhsh',
    chords: ['Em', 'C', 'G', 'D', 'Em', 'C', 'D', 'D'],
    melody: [
      'E5 E5 . G5 . B5 . G5', 'E5 . C5 . E5 G5 E5 .', 'D5 D5 . G5 . B5 . D6', 'C6 . A5 . F#5 . D5 .',
      'E5 E5 . G5 . B5 . E6', 'D6 . C6 . B5 . G5 .', 'A5 . F#5 . A5 . D6 .', 'F#5 . A5 . D6 - - .',
    ],
  },
  // オフ: 1 年をふり返る静かな曲
  off: {
    bpm: 84, lead: 'tri', bass: 'long', arp: true,
    chords: ['Am', 'F', 'C', 'G', 'Am', 'F', 'G', 'E'],
    melody: [
      'A4 - C5 - E5 - - -', 'F5 - E5 - C5 - - -', 'E5 - G5 - C5 - - -', 'D5 - - - B4 - - -',
      'A4 - C5 - E5 - A5 -', 'G5 - F5 - E5 - C5 -', 'D5 - B4 - G4 - B4 -', 'G#4 - - - B4 - - -',
    ],
  },
};

const NOTE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** 「C#5」のような音名を MIDI の番号に.読めなければ null. */
export function midi(name: string): number | null {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(name);
  if (!m) return null;
  return 12 * (Number(m[3]) + 1) + NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}

export const freq = (m: number): number => 440 * 2 ** ((m - 69) / 12);

/** コードの根音(オクターブ 0 の MIDI 番号からの差)と,構成音の差 */
export function chordTones(chord: string): { root: number; tones: number[] } {
  const m = /^([A-G])(#|b)?(m?)$/.exec(chord);
  if (!m) return { root: 0, tones: [0, 4, 7] };
  const root = (NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
  return { root, tones: m[3] ? [0, 3, 7] : [0, 4, 7] };
}

/** 1 ステップで鳴らす音 */
export interface StepNotes {
  /** メロディ: 音の高さと長さ(ステップ数).のばしの途中なら null. */
  lead: { midi: number; len: number } | null;
  bass: number | null;
  arp: number | null;
  drum: 'k' | 's' | 'h' | null;
}

export const STEPS_PER_BAR = 8;
export const songSteps = (s: Song): number => s.melody.length * STEPS_PER_BAR;

/** 曲の step 番目(くり返し込み)に鳴らす音 */
export function notesAt(s: Song, step: number): StepNotes {
  const total = songSteps(s);
  const k = ((step % total) + total) % total;
  const bar = Math.floor(k / STEPS_PER_BAR), i = k % STEPS_PER_BAR;
  const toks = s.melody[bar].split(/\s+/);
  let lead: StepNotes['lead'] = null;
  const m = midi(toks[i]);
  if (m !== null) {
    let len = 1;
    while (i + len < STEPS_PER_BAR && toks[i + len] === '-') len++;
    lead = { midi: m, len };
  }
  const { root, tones } = chordTones(s.chords[bar % s.chords.length]);
  const low = 36 + root; // C2 あたり
  let bass: number | null = null;
  if (s.bass === 'drive') bass = i % 2 === 0 ? low : low + 12;
  else if (s.bass === 'walk') bass = i % 2 === 0 ? (i % 4 === 0 ? low : low + 7) : null;
  else bass = i % 4 === 0 ? low : null;
  const arp = s.arp ? 60 + root + tones[i % tones.length] + (i >= 6 ? 12 : 0) : null;
  const d = s.drums?.[i];
  return { lead, bass, arp, drum: d === 'k' || d === 's' || d === 'h' ? d : null };
}
