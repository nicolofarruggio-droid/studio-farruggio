import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/e2e/**'],
    environment: 'node',
    testTimeout: 30000,
    // ogni file di test del database crea istanze di Postgres in memoria (PGlite): pochi processi alla volta
    maxWorkers: 2,
    hookTimeout: 60000,
  },
})
