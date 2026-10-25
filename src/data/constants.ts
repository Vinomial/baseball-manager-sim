import type { AttrKey, BatKey, GrowthType, LineupPos, PitKey, Pos } from '../types';

export interface League {
  name: string;
  /** 所属チームの平均的な能力値 */
  base: number;
  /** チーム数(プレイヤーを含む) */
  teams: number;
  /** 同じ相手と何回戦うか.1シーズンの試合数 = (teams - 1) * rounds */
  rounds: number;
  /** 登録できる選手の上限 */
  roster: number;
}

/** リーグが上がるほど,チーム数と試合数が増える. */
export const LEAGUES: League[] = [
  { name: '草野球リーグ', base: 32, teams: 6, rounds: 2, roster: 22 },
  { name: '社会人リーグ', base: 44, teams: 6, rounds: 3, roster: 24 },
  { name: '独立リーグ', base: 56, teams: 8, rounds: 3, roster: 26 },
  { name: 'プロリーグ', base: 68, teams: 8, rounds: 4, roster: 28 },
  { name: 'メジャーリーグ', base: 78, teams: 8, rounds: 4, roster: 30 },
];

export const gamesPerSeason = (level: number): number => (LEAGUES[level].teams - 1) * LEAGUES[level].rounds;

export const TEAM_NAMES: string[][] = [
  ['河川敷ドリームス', '商店街クラッカーズ', '早朝ボンバーズ', '銭湯ラッコーズ', '土手ワンダーズ', '公民館パイレーツ', '月曜ナイトオウルズ'],
  ['湾岸製鉄', '北辰電機', '港湾運輸', '東邦化学', '中央ガス', '大和精機', '白鷺紡績', '瑞穂鉄道'],
  ['房総シーガルズ', '甲信アルプス', '瀬戸内オーシャンズ', '北陸サンダーズ', '南九州ボルケーノ', '東北スノーベアーズ', '山陰ライトハウス', '四国ブレイカーズ'],
  ['東京ユニコーンズ', '大阪フェニックス', '名古屋グリフォンズ', '福岡ドラゴンフライ', '札幌ポラリス', '横浜ベイウルフ', '仙台オウルズ', '神戸シーホークス'],
  ['ニューヨーク・キングス', 'ロサンゼルス・サンライズ', 'シカゴ・ウィンドミルズ', 'ボストン・ハーバーズ', 'ダラス・ガンスリンガーズ', 'シアトル・レインメーカー', 'マイアミ・パームス', 'サンフランシスコ・フォッグス', 'トロント・ノーザンズ'],
];

/** 各リーグの境目で入れ替わるチーム数.moves[l] は,リーグ l と l+1 の間. */
export const MOVES: number[] = [1, 1, 2, 1];

export const POS: Pos[] = ['捕', '一', '二', '三', '遊', '左', '中', '右'];
export const ALL_POS: LineupPos[] = [...POS, '指'];
export const POS_NAME: Record<LineupPos | '投', string> = {
  捕: '捕手', 一: '一塁', 二: '二塁', 三: '三塁', 遊: '遊撃', 左: '左翼', 中: '中堅', 右: '右翼', 指: '指名打者', 投: '投手',
};

export const BAT_KEYS: BatKey[] = ['meet', 'power', 'speed', 'field'];
export const PIT_KEYS: PitKey[] = ['velo', 'ctrl', 'stam'];
export const ALL_KEYS: AttrKey[] = [...BAT_KEYS, ...PIT_KEYS];
export const LABEL: Record<AttrKey, string> = {
  meet: 'ミート', power: 'パワー', speed: '走力', field: '守備', velo: '球威', ctrl: '制球', stam: 'スタミナ',
};

export const TYPES: GrowthType[] = ['早熟', '普通', '晩成'];
/** 成長タイプごとの伸び盛りの年齢 [開始, 終了] */
export const PEAK: Record<GrowthType, [number, number]> = { 早熟: [16, 22], 普通: [20, 27], 晩成: [24, 31] };

/** 調子の表示 [名前, 記号] */
export const COND: [string, string][] = [['絶不調', '↓'], ['不調', '↘'], ['普通', '→'], ['好調', '↗'], ['絶好調', '↑']];

/** リーグごとの登録上限 */
export const rosterMax = (level: number): number => LEAGUES[level].roster;
/** ドラフトの指名ラウンド数 */
export const DRAFT_ROUNDS = 2;
export const MIN_FIELDERS = 10;
export const MIN_PITCHERS = 5;

export const SURNAMES = ['佐藤', '鈴木', '高橋', '田中', '伊藤', '渡辺', '山本', '中村', '小林', '加藤', '吉田', '山田', '佐々木', '山口', '松本', '井上', '木村', '林', '斎藤', '清水', '山崎', '森', '池田', '橋本', '阿部', '石川', '山下', '中島', '石井', '小川', '前田', '岡田', '長谷川', '藤田', '後藤', '近藤', '村上', '遠藤', '青木', '坂本', '福田', '西村', '太田', '原田', '柴田', '酒井', '工藤', '横山', '宮崎', '宮本', '内田', '高木', '安藤', '谷口', '大野', '丸山', '今井', '河野', '藤原', '小野'];
export const GIVEN_NAMES = ['翔太', '大輝', '蓮', '悠斗', '陽翔', '湊', '颯', '健太', '拓海', '優斗', '直樹', '和也', '亮', '匠', '大和', '海斗', '樹', '隼人', '誠', '航', '慎吾', '智也', '俊介', '雄大', '光', '遼', '駿', '陸', '恭平', '聡', '涼', '啓太', '一輝', '賢人', '晴', '奏太', '壮真', '康介', '佑樹', '大地'];

export interface DiffDef { name: string; desc: string; ai: number; budget: number; injury: number; trustUp: number; trustDown: number; growth: number; }

/** 難易度.ai は AI チームの成長,injury は怪我の起きやすさ. */
export const DIFFS: Record<'easy' | 'normal' | 'hard', DiffDef> = {
  easy: { name: 'やさしい', desc: '相手は伸びにくく,予算と信頼度に余裕があります.怪我も少なめです.', ai: 0.8, budget: 1.1, injury: 0.6, trustUp: 1.25, trustDown: 0.8, growth: 1.1 },
  normal: { name: 'ふつう', desc: 'ちょうどよい手ごたえです.', ai: 1, budget: 1, injury: 1, trustUp: 1, trustDown: 1, growth: 1 },
  hard: { name: 'やり込み', desc: '相手は強く伸び,予算は厳しく,信頼度も下がりやすい.怪我も多めです.', ai: 1.2, budget: 0.93, injury: 1.3, trustUp: 0.9, trustDown: 1.2, growth: 0.95 },
};

/** 外国人選手の名前.上のリーグほど多い. */
export const FOREIGN_FIRST = ['ジョン', 'マイク', 'ジェイソン', 'ブランドン', 'カルロス', 'ミゲル', 'ホセ', 'ルイス', 'ラファエル', 'ディエゴ', 'アンドレ', 'フアン', 'ペドロ', 'トニー', 'ケビン', 'ライアン', 'タイラー', 'ダリオ', 'エリック', 'パク', 'キム', 'リー', 'ワン', 'チェン', 'リャン', 'ジョーダン', 'マーカス', 'ロベルト', 'ハビエル', 'オスカー', 'サミュエル', 'ネイサン'];
export const FOREIGN_LAST = ['スミス', 'ジョンソン', 'ウィリアムズ', 'ブラウン', 'ジョーンズ', 'ミラー', 'デイビス', 'ロドリゲス', 'ガルシア', 'マルティネス', 'エルナンデス', 'ロペス', 'ゴンザレス', 'ペレス', 'サンチェス', 'ラミレス', 'トーレス', 'フローレス', 'ディアス', 'クルーズ', 'リベラ', 'モラレス', 'ジョルダン', 'ウィルソン', 'テイラー', 'アンダーソン', 'トーマス', 'ジャクソン', 'ホワイト', 'ハリス', 'マーティン', 'キム', 'パク', 'イ', 'チョ', 'リン', 'ワン'];
