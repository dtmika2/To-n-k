import base from './playwright.config';
import { defineConfig } from '@playwright/test';

/** `npm run soak`: the long unattended-day simulation (kept out of the regular e2e run). */
export default defineConfig({
  ...base,
  testDir: 'tests/soak',
  timeout: 60 * 60_000,
});
