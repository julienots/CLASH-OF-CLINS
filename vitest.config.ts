import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['game/tests/**/*.test.ts', 'server/tests/**/*.test.ts'], exclude: ['game/tests/long/**'], testTimeout: 60000 } });
