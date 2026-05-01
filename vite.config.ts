import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron/simple';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@shared': path.resolve(__dirname, 'shared'),
    },
  },
  plugins: [
    react(),
    electron({
      main: { entry: 'electron/main/index.ts' },
      preload: { input: 'electron/preload.ts' },
      renderer: {},
    }),
  ],
  build: { outDir: 'dist' },
});
