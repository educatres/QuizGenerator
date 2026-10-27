import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './src/test',
  testMatch: '**/*.e2e.ts',
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  webServer: { command: 'npm run preview', port: 4173, reuseExistingServer: true },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
