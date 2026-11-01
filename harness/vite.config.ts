import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// HARNESS_PORT and MOCK_PORT move the harness and the mock it proxies to off
// their defaults, when those are taken; HARNESS_BASE=/katalog/ mounts the
// console as the catalog, its list, instead of catalog management.
const port = Number(process.env.HARNESS_PORT) || 8794;
const mock = Number(process.env.MOCK_PORT) || 8793;
const base = process.env.HARNESS_BASE || '/katalog-manage/';

// The real console, mounted as catalog management (/katalog-manage/) or the
// catalog (HARNESS_BASE), with react-oidc-context swapped for a stub that
// signs an administrator in, and /api proxied to harness/mock-server.mjs.
// Only `npx vite --config` reads this: the build is the repo's own
// vite.config.ts.
export default defineConfig({
  root: resolve(__dirname, '..'),
  base,
  plugins: [react()],
  resolve: { alias: { 'react-oidc-context': resolve(__dirname, 'oidc-stub.tsx') } },
  server: { port, strictPort: true, proxy: { '/api': `http://localhost:${mock}` } },
});
