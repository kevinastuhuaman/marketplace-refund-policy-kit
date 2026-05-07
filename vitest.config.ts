import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Vitest needs its own root (the repo root) since vite.config.ts sets root to src/simulator
// for the dev server / build.
export default defineConfig({
  root: __dirname,
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
  resolve: {
    alias: {
      '@engine': path.resolve(__dirname, 'src/engine'),
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
