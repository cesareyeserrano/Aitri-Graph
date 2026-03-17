import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 15000,
  use: {
    baseURL: 'http://localhost:4000',
    browserName: 'chromium',
    headless: true,
  },
  webServer: {
    command: 'PORT=4000 node server.js',
    url: 'http://localhost:4000',
    reuseExistingServer: true,
  },
});
