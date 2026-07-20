import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
var config = {
    plugins: [react()],
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: './src/test/setup.ts',
    },
};
export default defineConfig(config);
