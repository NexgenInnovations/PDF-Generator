import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';

// form-render 2.x was built against antd 4/5 + rc-picker 3, which used sub-path imports
// (antd/es/*, antd/lib/*, rc-picker/es/generate/*) that no longer exist in antd 6 / rc-picker 4.
// Stub them so the build completes; the UI components that depend on them are not used by pdfme.
function stubBrokenSubPaths(): Plugin {
  const brokenPrefixes = ['antd/es/', 'antd/lib/', 'rc-picker/es/generate/'];
  return {
    name: 'stub-broken-sub-paths',
    resolveId(id) {
      if (brokenPrefixes.some((p) => id.startsWith(p))) {
        return '\0stub:' + id;
      }
    },
    load(id) {
      if (id.startsWith('\0stub:')) {
        return 'export default {}; export {};';
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), stubBrokenSubPaths()],
  server: {
    port: 5173,
    proxy: {
      '/templates': 'http://localhost:3001',
      '/filled-pdfs': 'http://localhost:3001',
      '/health': 'http://localhost:3001',
    },
  },
});
