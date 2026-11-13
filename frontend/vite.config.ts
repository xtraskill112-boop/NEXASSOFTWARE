import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { existsSync, readFileSync } from 'node:fs';
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
  // Single-file editions:
  //   --mode standalone : offline demo, REST API runs in the browser on localStorage (src/standalone)
  //   --mode firebase   : Firebase Authentication + Cloud Firestore (src/firebase)
  // Every other mode talks to the Express backend.
  const firebase = mode === 'firebase';
  const singleFile = mode === 'standalone' || firebase;
  // Firebase web config for the Firebase edition: VITE_FIREBASE_CONFIG env var, else firebase/web-config.json.
  const webConfigPath = fileURLToPath(new URL('../firebase/web-config.json', import.meta.url));
  const firebaseConfig = firebase ? env.VITE_FIREBASE_CONFIG || (existsSync(webConfigPath) ? JSON.stringify(JSON.parse(readFileSync(webConfigPath, 'utf8'))) : '') : '';
  const localApiModule = mode === 'standalone' ? './src/standalone/localApi.ts' : firebase ? './src/firebase/localApi.ts' : './src/lib/localApi.ts';

  return {
    plugins: [react(), tailwindcss(), ...(singleFile ? [viteSingleFile({ removeViteModuleLoader: true }), inlineFavicon()] : [])],
    resolve: {
      alias: {
        '@local-api': fileURLToPath(new URL(localApiModule, import.meta.url)),
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    define: {
      'import.meta.env.VITE_STANDALONE': JSON.stringify(singleFile ? 'true' : 'false'),
      'import.meta.env.VITE_FIREBASE_CONFIG': JSON.stringify(firebaseConfig),
    },
    server: {
      port: 5173,
      proxy: { '/api': { target: apiTarget, changeOrigin: true } },
    },
    preview: { port: 4173 },
    build: singleFile
      ? { outDir: firebase ? 'dist-firebase' : 'dist-standalone', emptyOutDir: true, copyPublicDir: false, sourcemap: false, chunkSizeWarningLimit: 6000 }
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
