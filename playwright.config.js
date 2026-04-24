import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: 'ui.test.js',
  use: {
    baseURL: 'http://localhost:3000',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node index.js',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
