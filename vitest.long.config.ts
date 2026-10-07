import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['game/tests/long/**/*.test.ts'], testTimeout: 900000 } });
