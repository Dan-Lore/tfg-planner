import path from 'node:path';
import { copyFileSync } from 'node:fs';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const base = process.env.VITE_BASE_PATH || env.VITE_BASE_PATH || '/';

  return {
    base,
    server: {
      host: true,
      port: 5173,
    },
    plugins: [
      react(),
      {
        name: 'gh-pages-spa-fallback',
        closeBundle() {
          if (base === '/') return;
          const outDir = path.resolve(__dirname, 'dist');
          copyFileSync(path.join(outDir, 'index.html'), path.join(outDir, '404.html'));
        },
      },
    ],
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/')) {
              return 'vendor-react';
            }
            if (id.includes('@xyflow/react')) return 'vendor-xyflow';
            if (id.includes('i18next') || id.includes('react-i18next')) return 'vendor-i18n';
          },
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
  };
});
