import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

/** Embeds the favicon as a data URI so the standalone build is truly one file. */
function inlineFavicon(): Plugin {
  return {
    name: 'stocksense-inline-favicon',
    transformIndexHtml(html) {
      const svg = readFileSync(fileURLToPath(new URL('./public/favicon.svg', import.meta.url)), 'utf8');
      const dataUri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
      return html.replace(/href="\/favicon\.svg"/, `href="${dataUri}"`);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.VITE_DEV_API_PROXY || 'http://localhost:4000';
  // `vite build --mode standalone` produces a single self-contained index.html in which the
  // REST API runs inside the browser (see src/standalone). Every other mode talks to the real backend.
  const standalone = mode === 'standalone';

  return {
    plugins: [react(), tailwindcss(), ...(standalone ? [viteSingleFile({ removeViteModuleLoader: true }), inlineFavicon()] : [])],
    resolve: {
      alias: {
        '@local-api': fileURLToPath(new URL(standalone ? './src/standalone/localApi.ts' : './src/lib/localApi.ts', import.meta.url)),
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    define: { 'import.meta.env.VITE_STANDALONE': JSON.stringify(standalone ? 'true' : 'false') },
    server: {
      port: 5173,
      proxy: { '/api': { target: apiTarget, changeOrigin: true } },
    },
    preview: { port: 4173 },
    build: standalone
      ? { outDir: 'dist-standalone', emptyOutDir: true, copyPublicDir: false, sourcemap: false, chunkSizeWarningLimit: 4000 }
      : {
          sourcemap: false,
          chunkSizeWarningLimit: 900,
          rollupOptions: {
            output: {
              manualChunks: {
                react: ['react', 'react-dom', 'react-router-dom'],
                charts: ['recharts'],
                query: ['@tanstack/react-query'],
              },
            },
          },
        },
  };
});
