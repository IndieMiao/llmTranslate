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
      main: {
        entry: 'electron/main/index.ts',
        vite: {
          resolve: {
            alias: {
              '@shared': path.resolve(__dirname, 'shared'),
            },
          },
          build: {
            rollupOptions: {
              external: ['better-sqlite3', 'electron-store', 'electron-log'],
            },
          },
          plugins: [
            {
              name: 'inject-esm-dirname',
              renderChunk(code: string) {
                const banner = `import { fileURLToPath as __fileURLToPath } from 'node:url';
import { dirname as __dirname_fn } from 'node:path';
const __filename = __fileURLToPath(import.meta.url);
const __dirname = __dirname_fn(__filename);
`;
                return { code: banner + code, map: null };
              },
            },
          ],
        },
      },
      preload: {
        input: 'electron/preload.ts',
        vite: {
          resolve: {
            alias: {
              '@shared': path.resolve(__dirname, 'shared'),
            },
          },
        },
      },
      renderer: {},
    }),
  ],
  build: { outDir: 'dist' },
});
