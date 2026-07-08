import path from 'node:path';
import { copyFileSync, createReadStream, existsSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const PACK_LANG_RE = /^\/data\/packs\/[^/]+\/pack\.lang\.json\.gz$/;

function resolvePackLangPathname(reqUrl: string | undefined, base: string): string | null {
  if (!reqUrl) return null;
  const pathname = reqUrl.split('?')[0];
  const normalizedBase =
    base === '/' ? '' : base.endsWith('/') ? base.slice(0, -1) : base;
  const pathOnly =
    normalizedBase && pathname.startsWith(normalizedBase)
      ? pathname.slice(normalizedBase.length)
      : pathname;
  return PACK_LANG_RE.test(pathOnly) ? pathOnly : null;
}

/** Serve pack.lang.json.gz as raw gzip bytes (no Content-Encoding) for client-side gunzip. */
function packLangRawGzipPlugin(base: string): Plugin {
  const createHandler = (staticRoot: string) => {
    return (req: IncomingMessage, res: ServerResponse, next: () => void) => {
      const rel = resolvePackLangPathname(req.url, base);
      if (!rel) return next();
      const filePath = path.join(staticRoot, rel.slice(1));
      if (!existsSync(filePath)) return next();
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/gzip');
      res.setHeader('Cache-Control', 'no-cache');
      createReadStream(filePath).pipe(res);
    };
  };
  const publicRoot = path.resolve(__dirname, 'public');
  const distRoot = path.resolve(__dirname, 'dist');
  return {
    name: 'pack-lang-raw-gzip',
    configureServer(server) {
      server.middlewares.use(createHandler(publicRoot));
    },
    configurePreviewServer(server) {
      server.middlewares.use(createHandler(distRoot));
    },
  };
}

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
      packLangRawGzipPlugin(base),
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
