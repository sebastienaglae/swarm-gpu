import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  build: {
    sourcemap: mode !== 'production',
    target: 'es2022',
  },
  server: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
  },
}));
