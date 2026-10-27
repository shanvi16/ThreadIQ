import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The browser talks to the two backend services directly (CORS is configured on them),
// using VITE_CATALOG_API_URL / VITE_INSIGHTS_API_URL. No dev proxy is used.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true, host: true },
  preview: { port: 5173, host: true },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          data: ['@tanstack/react-query', 'react-hook-form', 'zod', '@hookform/resolvers'],
        },
      },
    },
  },
});
