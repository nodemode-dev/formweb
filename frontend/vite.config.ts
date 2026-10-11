import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: false,
    port: 5240,
    strictPort: true,
    proxy: { '/api': { target: 'http://127.0.0.1:8240', changeOrigin: true, ws: true }, '/published': 'http://127.0.0.1:8240', '/preview': 'http://127.0.0.1:8240', '/sites': 'http://127.0.0.1:8240' }
  },
  preview: { host: false, port: 5241, strictPort: true },
  build: { target: 'es2022' }
});
