import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: process.env.BASE_PATH ?? './',
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
