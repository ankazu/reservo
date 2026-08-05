import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

const rootDir = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  plugins: [vue()],
  test: {
    setupFiles: ['./test/setup.ts'],
  },
  resolve: {
    alias: {
      '~~': rootDir,
    },
  },
})
