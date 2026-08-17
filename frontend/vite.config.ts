/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    // Deterministic test env: do NOT depend on .env files (they vary per machine
    // and .env.local leaks into every Vite mode). client.ts defaults BASE_URL to
    // same-origin '' for prod, so tests pin the localhost base explicitly.
    env: { VITE_API_BASE_URL: 'http://localhost:8000' },
  },
});
