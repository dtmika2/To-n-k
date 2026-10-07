import { defineConfig } from '@playwright/test';

/**
 * Runs against the production build (`vite preview`) so the service worker is real.
 * Uses the system Chrome; headless Chrome on this machine gets real GPU WebGL via ANGLE.
 * The viewport mimics the Galaxy Tab S11 in landscape (2560 × 1600 px at DPR 2).
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    channel: 'chrome',
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
    launchOptions: {
      args: ['--ignore-gpu-blocklist', '--use-angle=d3d11', '--autoplay-policy=no-user-gesture-required'],
    },
  },
  webServer: {
    command: 'npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
