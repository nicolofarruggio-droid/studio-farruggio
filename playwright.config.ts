import { defineConfig, devices } from '@playwright/test'

// Test end-to-end: richiedono lo stack locale acceso (npm run locale:reset) e il sito.
// Con E2E_URL si usa un sito già avviato; altrimenti Playwright avvia `npm run start` (dopo `npm run build`).
const url = process.env.E2E_URL ?? 'http://localhost:3000'

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: url,
    locale: 'it-IT',
    timezoneId: 'Europe/Rome',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'computer', use: { ...devices['Desktop Chrome'] } },
    { name: 'telefono', use: { ...devices['Pixel 7'] }, grep: /@telefono/ },
  ],
  webServer: process.env.E2E_URL
    ? undefined
    : { command: 'npm run start', url, reuseExistingServer: true, timeout: 120_000 },
})
