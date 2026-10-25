import { expect, test, type Page } from '@playwright/test';

/** 画面のエラーを集める */
function watchErrors(page: Page): string[] {
  const errs: string[] = [];
  page.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(`console: ${m.text()}`); });
  return errs;
}

async function newGame(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.click('[data-a="screen"][data-k="new"]');
  await page.click('[data-a="new"]');
  await expect(page.locator('[data-a="start"]')).toBeVisible();
}

test('新しく始めて,1週進められる', async ({ page }) => {
  const errs = watchErrors(page);
  await newGame(page);
  await expect(page.locator('header')).toContainText('ダイヤモンド監督');
  await page.click('[data-a="start"]');
  await page.click('[data-a="tab"][data-k="home"]');
  await expect(page.locator('main')).toContainText('2週');
  expect(errs).toEqual([]);
});

test('すべての画面で横にはみ出さず,エラーも出ない', async ({ page }) => {
  const errs = watchErrors(page);
  await newGame(page);
  for (let i = 0; i < 14; i++) { await page.click('[data-a="start"]'); await page.click('[data-a="tab"][data-k="home"]'); }
  const overflow = async (name: string) => {
    const w = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(w, `${name} が横にはみ出している`).toBeLessThanOrEqual(1);
  };
  await overflow('ホーム');
  for (const t of ['team', 'table', 'gm', 'rec']) { await page.click(`[data-a="tab"][data-k="${t}"]`); await overflow(t); }
  for (const s of ['players', 'order', 'power']) { await page.click('[data-a="tab"][data-k="team"]'); await page.click(`[data-a="sub"][data-k="${s}"]`); await overflow(s); }
  expect(errs).toEqual([]);
});

test('セーブして読み込み直すと,続きから遊べる', async ({ page }) => {
  const errs = watchErrors(page);
  await newGame(page);
  await page.click('[data-a="start"]');
  await page.reload();
  await expect(page.locator('[data-a="screen"][data-k="play"]')).toBeVisible();
  await page.click('[data-a="screen"][data-k="play"]');
  await expect(page.locator('header')).toContainText('1季');
  expect(errs).toEqual([]);
});

test('メニューから,文字サイズ,テーマ,タイトルへの移動ができる', async ({ page }) => {
  const errs = watchErrors(page);
  await newGame(page);
  await page.click('[data-a="menu-open"]');
  await page.click('[data-a="font"][data-k="l"]');
  expect(await page.evaluate(() => document.documentElement.style.getPropertyValue('--fs'))).toBe('1.15');
  await page.click('[data-a="theme"][data-k="dark"]');
  expect(await page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe('dark');
  await page.click('.sheet [data-a="screen"][data-k="title"]');
  await expect(page.locator('[data-a="screen"][data-k="play"]')).toBeVisible();
  expect(errs).toEqual([]);
});

test('想定外のエラーでも,バックアップを案内する画面が出る', async ({ page }) => {
  await newGame(page);
  await page.evaluate(() => setTimeout(() => { throw new Error('テスト用'); }, 0));
  await expect(page.locator('#crash')).toBeVisible();
  await expect(page.locator('#crash')).toContainText('セーブは無事');
});

test('年末まで進めると,オフシーズンの画面になる', async ({ page }) => {
  const errs = watchErrors(page);
  await newGame(page);
  await page.click('[data-a="auto-season"]');
  await expect(page.locator('[data-a="ostep"]').first()).toBeVisible({ timeout: 90_000 });
  await expect(page.locator('main')).toContainText('1年の振り返り');
  await page.click('[data-a="ostep"][data-k="1"]');
  await page.click('[data-a="ostep"][data-k="1"]');
  expect(errs.filter((e) => !e.includes('テスト用'))).toEqual([]);
});

test('1か月まとめて進められ,ホームは今週の内容にしぼられている', async ({ page }) => {
  const errs = watchErrors(page);
  await newGame(page);
  await expect(page.locator('.tiles')).toBeVisible();
  await page.click('[data-a="month"]');
  await expect(page.locator('header')).toContainText('2月', { timeout: 30_000 });
  // 資金・施設・スタッフは GM 画面にある
  await expect(page.locator('main')).not.toContainText('スタッフ(監督・コーチ)');
  await page.click('[data-a="tab"][data-k="gm"]');
  await expect(page.locator('main')).toContainText('スタッフ(監督・コーチ)');
  expect(errs).toEqual([]);
});

test('練習の決め方を切り替えられる', async ({ page }) => {
  await newGame(page);
  await page.click('[data-a="train-mode"][data-k="fixed"]');
  await expect(page.locator('[data-a="train-mode"][data-k="fixed"]')).toHaveAttribute('aria-pressed', 'true');
  await page.click('[data-a="train-mode"][data-k="manual"]');
  await expect(page.locator('[data-a="train-mode"][data-k="manual"]')).toHaveAttribute('aria-pressed', 'true');
});

test('ドラフトで指名すると,育成方針を決めるシートが出る', async ({ page }) => {
  const errs = watchErrors(page);
  await newGame(page);
  await page.click('[data-a="auto-season"]');
  await expect(page.locator('[data-a="ostep"]').first()).toBeVisible({ timeout: 90_000 });
  await page.click('[data-a="ostep"][data-k="1"]');
  await page.click('[data-a="ostep"][data-k="1"]');
  await page.locator('[data-a="draft"]').first().click();
  await expect(page.locator('.sheet[aria-label="育成方針を決める"]')).toBeVisible();
  await page.locator('[data-a="plan-set"]').first().click();
  await expect(page.locator('.sheet[aria-label="育成方針を決める"]')).toHaveCount(0);
  expect(errs).toEqual([]);
});
