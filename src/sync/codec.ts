/**
 * セーブの文字列を,サーバーに置くために縮める(gzip → base64).
 * セーブは数百万文字になるが,gzip で 1/6 ほどになり,Firestore の 1 文書(1MB)に収まる.
 * ブラウザと Node(18 以上)の CompressionStream を使う.
 */

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

function toBase64(bytes: Uint8Array): string {
  let s = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) s += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(s);
}

function fromBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes;
}

/** セーブの文字列を縮める */
export async function pack(text: string): Promise<string> {
  return toBase64(await pipe(new TextEncoder().encode(text), new CompressionStream('gzip')));
}

/** pack したものを元に戻す */
export async function unpack(b64: string): Promise<string> {
  return new TextDecoder().decode(await pipe(fromBase64(b64), new DecompressionStream('gzip')));
}
