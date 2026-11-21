/**
 * 2 台の端末の同期を,ブラウザで確かめる.Firebase のエミュレーターを相手にする(本番には通信しない).
 * 使い方: npm run e2e:sync   (Java が必要)
 */
import { expect, test, chromium, type Page } from '@playwright/test';

// SYNC_URL と SYNC_EMAIL を指定すると,本物のプロジェクトでも試せる(使ったアカウントはあとで消すこと)
const URL = process.env.SYNC_URL ?? 'http://localhost:5199/?emulator';
const EMAIL = process.env.SYNC_EMAIL ?? 'a@example.com';
const errs: string[] = [];
async function open(): Promise<Page> {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`));
  p.on('dialog', (d) => d.accept());
  await p.goto(URL);
  return p;
}
async function login(p: Page, first: boolean) {
  await p.click('[data-a="sync-open"]');
  await p.fill('#sync-email', EMAIL);
  await p.fill('#sync-pw', 'secret123');
  await p.click(first ? '[data-a="sync-up"]' : '[data-a="sync-in"]');
  await expect(p.locator('.sheet')).toContainText('でログインしています', { timeout: 20000 });
}
test('ログイン,取り込み,食い違ったときの選択', async () => {
  test.setTimeout(120000);
  const A = await open();
  await A.click('[data-a="screen"][data-k="new"]');
  await A.fill('#tname', '同期テスト');
  await A.click('[data-a="new"]');
  for (let i = 0; i < 3; i++) { await A.click('[data-a="start"]'); await A.click('[data-a="tab"][data-k="home"]'); }
  await A.click('[data-a="menu-open"]');
  await login(A, true);
  await expect(A.locator('#sync-last')).not.toContainText('まだ', { timeout: 20000 });
  if (process.env.SHOT) await A.screenshot({ path: `${process.env.SHOT}/login.png` });

  const B = await open();
  await expect(B.locator('[data-a="sync-open"]')).toBeVisible();
  await login(B, false);
  await B.click('[data-a="sync-close"]');
  await expect(B.locator('.start')).toContainText('同期テスト', { timeout: 20000 });
  await B.click('[data-a="screen"][data-k="play"]');
  const weekB = await B.locator('header .stat').innerText();
  const weekA = await A.locator('header .stat').innerText();
  expect(weekB).toBe(weekA);

  // B で進めて送る → A は進めていないので取り込む
  await B.click('[data-a="start"]'); await B.click('[data-a="tab"][data-k="home"]');
  await B.click('[data-a="menu-open"]'); await B.click('[data-a="sync-open"]'); await B.click('[data-a="sync-now"]');
  await expect(B.locator('[data-a="sync-now"]')).toBeEnabled({ timeout: 20000 });
  await expect(B.locator('#sync-last')).not.toContainText('まだ');
  await A.click('[data-a="sync-now"]');
  await expect(A.locator('.toast')).toContainText('ほかの端末の進み', { timeout: 20000 });
  await A.click('[data-a="sync-close"]');
  expect(await A.locator('header .stat').innerText()).toBe(await B.locator('header .stat').innerText());

  // 両方で進める → 聞かれる
  await B.click('[data-a="sync-close"]');
  await A.click('[data-a="start"]'); await A.click('[data-a="tab"][data-k="home"]');
  await B.click('[data-a="start"]'); await B.click('[data-a="tab"][data-k="home"]');
  await B.click('[data-a="start"]'); await B.click('[data-a="tab"][data-k="home"]');
  await B.click('[data-a="menu-open"]'); await B.click('[data-a="sync-open"]'); await B.click('[data-a="sync-now"]');
  await expect(B.locator('[data-a="sync-now"]')).toBeEnabled({ timeout: 20000 });
  await expect(B.locator('#sync-msg')).toHaveText('');
  await A.click('[data-a="menu-open"]'); await A.click('[data-a="sync-open"]'); await A.click('[data-a="sync-now"]');
  await expect(A.locator('[aria-label="どちらのセーブを残しますか"]')).toBeVisible({ timeout: 20000 });
  if (process.env.SHOT) await A.screenshot({ path: `${process.env.SHOT}/conflict.png` });
  await A.click('[data-a="sync-keep"][data-k="remote"]');
  await expect(A.locator('.toast')).toContainText('ほかの端末の進み', { timeout: 20000 });
  await A.click('[data-a="sync-close"]');
  expect(await A.locator('header .stat').innerText()).toBe(await B.locator('header .stat').innerText());
  expect(errs).toEqual([]);
});
