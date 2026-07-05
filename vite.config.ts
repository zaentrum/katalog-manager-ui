import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Built ONCE with a `/__BASE__/` placeholder base. The container entrypoint
// (docker-entrypoint.d/40-katalog-base.sh) rewrites `/__BASE__/` to the real
// BASE_PATH at start, so ONE image works mounted at any URL path — `/katalog/`
// behind the demo's path-routing, or `/` for a standalone deploy.
export default defineConfig({
  base: '/__BASE__/',
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      // dev convenience: proxy the GraphQL + config to a running katalog-manager.
      '/api': { target: 'http://localhost:8080', changeOrigin: true },
    },
  },
  build: { outDir: 'dist', sourcemap: true },
});
