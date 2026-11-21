/**
 * 端末間の同期に使う Firebase の設定.
 * Firebase の管理画面(プロジェクトの設定 → マイアプリ → ウェブアプリ)の firebaseConfig をそのまま写す.
 * この値は公開してよいもの(だれのデータを読み書きできるかは firestore.rules で決まる).
 * null のあいだは,同期のボタンを出さない.
 */
export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId: string;
}

const PROD_CONFIG: FirebaseConfig | null = {
  apiKey: 'AIzaSyCJa56sXsSJEiqzFg0ydyFV-_3KvurLXOg',
  authDomain: 'diamond-kantoku.firebaseapp.com',
  projectId: 'diamond-kantoku',
  storageBucket: 'diamond-kantoku.firebasestorage.app',
  messagingSenderId: '440348490366',
  appId: '1:440348490366:web:0972bda0bcbfe60717362f',
};

/**
 * 開発サーバーで ?emulator を付けて開くと,手元のエミュレーター(npm run emulators)につなぐ.
 * 本物のプロジェクトがなくても,同期を試せる.
 */
export const USE_EMULATOR = import.meta.env.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).has('emulator');

export const FIREBASE_CONFIG: FirebaseConfig | null = USE_EMULATOR
  ? { apiKey: 'demo-key', authDomain: 'localhost', projectId: 'demo-diamond', appId: 'demo-app' }
  : PROD_CONFIG;

/** サーバーの文書を置く場所(saves/{uid}) */
export const COLLECTION = 'saves';
