import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Removes crossorigin from <script>/<link> tags in the built HTML so that
// Electron can load them from file:// without triggering CORS failures.
function removeCrossorigin() {
  return {
    name: 'remove-crossorigin',
    transformIndexHtml(html: string) {
      return html.replace(/ crossorigin(?:="[^"]*")?/g, '');
    },
  };
}

export default defineConfig({
  plugins: [react(), removeCrossorigin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@eat-and-meet/types': path.resolve(__dirname, '../../packages/types/src/index.ts'),
      '@eat-and-meet/config': path.resolve(__dirname, '../../packages/config/src/index.ts'),
    },
  },
  base: './',
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          ui: ['framer-motion', 'lucide-react'],
          query: ['@tanstack/react-query', 'axios'],
          charts: ['recharts'],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:3001', ws: true },
    },
  },
});
