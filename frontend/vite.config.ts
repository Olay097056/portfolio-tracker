import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const config = {
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
} as any;

export default defineConfig(config);
