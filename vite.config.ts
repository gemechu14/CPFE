import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), tailwindcss()],
    resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
    server: {
      port: 5173,
      // In dev, /api is proxied to the backend so the browser never hits CORS.
      proxy: env.VITE_API_PROXY_TARGET
        ? {
            '/api': { target: env.VITE_API_PROXY_TARGET, changeOrigin: true },
            '/uploads': { target: env.VITE_API_PROXY_TARGET, changeOrigin: true },
          }
        : undefined,
    },
  };
});
