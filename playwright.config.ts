import {defineConfig, devices} from '@playwright/test';

const baseURL = process.env.QUERENT_BASE_URL || 'http://127.0.0.1:3000';

// In CI (or locally with QUERENT_WEBSERVER=1) Playwright starts the production server
// itself. Otherwise it targets an app you already run at QUERENT_BASE_URL.
// The E2E suite and its local Supabase setup come with task B8.
const startServer = !!process.env.CI || process.env.QUERENT_WEBSERVER === '1';
const port = new URL(baseURL).port || '3000';

export default defineConfig({
  testDir: './e2e',
  timeout: 300_000,
  expect: {timeout: 45_000},
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI
    ? [['list'], ['github'], ['html', {open: 'never'}]]
    : [['list'], ['html', {open: 'never'}]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {name: 'chromium', use: {...devices['Desktop Chrome']}},
  ],
  webServer: startServer
    ? {
        // Requires a prior `npm run build`.
        command: 'npm run start',
        url: baseURL,
        reuseExistingServer: false,
        timeout: 120_000,
        stdout: 'pipe',
        stderr: 'pipe',
        env: {
          PORT: port,
          QUERENT_SCRIPTED: '1',
          ANTHROPIC_API_KEY: '',
          NEXT_TELEMETRY_DISABLED: '1',
        },
      }
    : undefined,
});
