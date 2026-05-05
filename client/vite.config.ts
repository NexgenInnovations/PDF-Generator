import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/templates': 'http://localhost:3001',
      '/filled-pdfs': 'http://localhost:3001',
      '/health': 'http://localhost:3001',
    },
  },
});
