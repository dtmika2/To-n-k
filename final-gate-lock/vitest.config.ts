import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/state/**/*.ts', 'src/config.ts', 'src/wheel/Eye.ts', 'src/wheel/BlinkCoordinator.ts', 'src/wheel/snap.ts'],
      reporter: ['text', 'json-summary'],
    },
  },
});
