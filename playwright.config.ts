import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';
dotenv.config();

const isCI = !!process.env['CI'];
const isHeaded = process.env['HEADLESS'] === 'false';
const baseURL = process.env['BASE_URL'] ?? 'https://the-internet.herokuapp.com';

export default defineConfig({
  testDir: './src/tests',
  testMatch: '**/*.spec.ts',
  globalSetup: './src/utils/globalSetup.ts',

  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: true, // tests within a file run in parallel across workers
  workers: isCI ? 4 : 2, // local: 2 workers so parallel actually fires
  retries: isCI ? 2 : 1,

  reporter: [
    ['./src/utils/FrameworkReporter.ts'],
    ['list'],
    ['html', { outputFolder: 'test-results/html-report', open: 'never' }],
    ['json', { outputFile: 'test-results/report.json' }],
  ],

  use: {
    baseURL,
    headless: !isHeaded,
    viewport: { width: 1280, height: 720 },
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // Trace retained on failure — enables one-click debugging via:
    // npx playwright show-trace test-results/artifacts/.../trace.zip
    trace: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 60_000,
    ignoreHTTPSErrors: isCI ? false : process.env['IGNORE_HTTPS_ERRORS'] === 'true',
    launchOptions: {
      slowMo: isHeaded ? 50 : 0,
    },
  },

  projects: [
    {
      name: 'smoke',
      testMatch: '**/smoke/**/*.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'smoke:firefox',
      testMatch: '**/smoke/**/*.spec.ts',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'smoke:safari',
      testMatch: '**/smoke/**/*.spec.ts',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'sanity',
      testMatch: '**/sanity/**/*.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'regression',
      testMatch: '**/regression/**/*.spec.ts',
      fullyParallel: false,
      workers: 1, // regression tests have ordering dependencies
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'orangeHRM',
      testMatch: '**/mainTests/orangeHRM_employ*.spec.ts',
      use: { ...devices['Desktop Chrome'], actionTimeout: 15_000 },
      workers: 1,
    },
    {
      name: 'orangeHRM:leave',
      testMatch: '**/mainTests/orangeHRM_leave_management.spec.ts',
      use: { ...devices['Desktop Chrome'], actionTimeout: 20_000 },
      workers: 1,
    },
    // demo runs all demo tests — sub-projects below run individually
    // { name: "demo", testMatch: "**/demo/**/*.spec.ts", ... } — disabled to avoid duplicates
    {
      name: 'demo:ecommerce',
      testMatch: '**/demo/ecommerce_demomart.spec.ts',
      use: { ...devices['Desktop Chrome'], actionTimeout: 15_000 },
      workers: 1,
    },
    {
      name: 'demo:banking',
      testMatch: '**/demo/banking_demobank.spec.ts',
      use: { ...devices['Desktop Chrome'], actionTimeout: 15_000 },
      workers: 1,
    },
    {
      name: 'demo:healthcare',
      testMatch: '**/demo/healthcare_medicare.spec.ts',
      use: { ...devices['Desktop Chrome'], actionTimeout: 15_000 },
      workers: 1,
    },
    {
      name: 'demo:all-layers',
      testMatch: '**/demo/all_layers_e2e.spec.ts',
      use: { ...devices['Desktop Chrome'], actionTimeout: 20_000 },
      workers: 1,
    },
    {
      name: 'demo:internet',
      testMatch: '**/demo/internet_e2e.spec.ts',
      use: { ...devices['Desktop Chrome'], actionTimeout: 15_000 },
      workers: 1,
    },
    // ── Uncomment to enable additional browsers ──────────────────────────────
    // { name: "firefox",       use: { ...devices["Desktop Firefox"] } },
    // { name: "webkit",        use: { ...devices["Desktop Safari"]  } },
    // { name: "mobile-chrome", use: { ...devices["Pixel 5"]         } }
  ],

  outputDir: 'test-results/artifacts',
});
