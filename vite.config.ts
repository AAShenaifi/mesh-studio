import { defineConfig, type Plugin, type Connect } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Same headers as public/_headers in production (Cloudflare Pages).
// COOP/COEP turn on cross-origin isolation (SharedArrayBuffer for multi-threaded Wasm).
const ISOLATION_HEADERS: Record<string, string> = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-site',
};

/** Send the isolation headers from the dev and preview servers, like production does. */
function isolation(): Plugin {
  const handler: Connect.NextHandleFunction = (_req, res, next) => {
    for (const [k, v] of Object.entries(ISOLATION_HEADERS)) res.setHeader(k, v);
    next();
  };
  return {
    name: 'mesh-studio:isolation-headers',
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}

export default defineConfig({
  // Served from the root of https://mesh.aashenaifi.com/
  base: '/',
  plugins: [isolation(), react(), tailwindcss()],
  server: { port: 5173 },
  preview: { port: 4173 },
  worker: { format: 'es' },
  // Pre-bundle lazily used deps so the dev server never reloads the page mid-session.
  optimizeDeps: { include: ['manifold-3d', 'jszip', 'three-mesh-bvh', 'three/addons/exporters/GLTFExporter.js', 'three/addons/loaders/SVGLoader.js', 'occt-import-js'] },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [{ name: 'three', test: /node_modules[\\/]three[\\/]/ }],
        },
      },
    },
  },
});
