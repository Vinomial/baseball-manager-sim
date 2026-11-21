import { defineConfig } from '@playwright/test';

/** 同期の画面テスト.開発サーバーを ?emulator 付きで開き,Firebase のエミュレーターにつなぐ. */
export default defineConfig({
  testDir: 'tests/e2e-sync',
  timeout: 120_000,
  reporter: 'list',
  webServer: {
    command: 'npx vite --port 5199 --strictPort',
    url: 'http://localhost:5199/',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
