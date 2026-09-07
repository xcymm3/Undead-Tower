import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  workers: 1,
  use: { headless: true, baseURL: 'http://127.0.0.1:5175', viewport: { width: 1440, height: 900 }, channel: 'chrome', launchOptions: { args: ['--mute-audio', '--autoplay-policy=no-user-gesture-required'] }, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: process.env.UNDEAD_MANAGED_TEST_SERVER ? undefined : { command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5175 --strictPort', url: 'http://127.0.0.1:5175', reuseExistingServer: true },
});
