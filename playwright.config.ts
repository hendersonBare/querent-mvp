import {defineConfig, devices} from '@playwright/test';

const baseURL = process.env.QUERENT_BASE_URL || 'http://127.0.0.1:3000';

// In CI (or locally with QUERENT_WEBSERVER=1) Playwright resets the DB and starts
// the production server itself. Otherwise it targets an app you already run at
// QUERENT_BASE_URL, as before.
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
        command: 'npm run db:reset && npm run start',
        url: baseURL,
        reuseExistingServer: false,
        timeout: 120_000,
        stdout: 'pipe',
        stderr: 'pipe',
        env: {
          PORT: port,
          QUERENT_SCRIPTED: '1',
          ANTHROPIC_API_KEY: '',
          // No real fuel price API either: next start never overrides a variable already set, even to ''.
          OILPRICEAPI_KEY: '',
          NEXT_TELEMETRY_DISABLED: '1',
          // Every E2E run uses the mockup's dates (spec §2), and specs may reset the database
          // through the test-only POST /api/test/reset (e2e/golden-quote-flow.spec.ts).
          QUERENT_SEED_DATE: '2026-09-23',
          QUERENT_E2E_RESET: '1',
          // The feature flags (decision 48) are off by default in the product. The E2E server runs with them
          // on, unless the shell sets them, so the freight specs (free-delivery, demo-script act 5) reach their
          // sections; e2e/frames-settings.spec.ts starts its own flags-off and flags-on servers.
          FEATURE_FREE_DELIVERY_PRICING: process.env.FEATURE_FREE_DELIVERY_PRICING ?? '1',
          FEATURE_RECOVERY_POOL: process.env.FEATURE_RECOVERY_POOL ?? '1',
          FEATURE_DELIVERY_COST_MODEL: process.env.FEATURE_DELIVERY_COST_MODEL ?? '1',
        },
      }
    : undefined,
});
