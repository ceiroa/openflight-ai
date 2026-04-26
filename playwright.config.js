import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '*.test.js',
  use: {
    baseURL: 'http://127.0.0.1:3100',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'powershell -Command "$env:PORT=3100; node index.js"',
    url: 'http://127.0.0.1:3100',
    reuseExistingServer: false,
  },
});
