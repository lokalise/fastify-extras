import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    watch: false,
    threads: false,
    environment: 'node',
    reporters: ['verbose'],
    coverage: {
      include: ['lib/**/*.ts'],
      exclude: [
        'lib/**/*.spec.ts',
        'lib/types.ts',
        'lib/index.ts'
      ],
      reporter: ['text'],
      all: true,
      lines: 65,
      functions: 80,
      branches: 85,
      statements: 65,
    },
  },
})
