import { defineConfig } from 'vitest/config';

// Tests run real git in temp repos, which is slow on Windows; keep files sequential.
export default defineConfig({ test: { testTimeout: 60000, fileParallelism: false } });
