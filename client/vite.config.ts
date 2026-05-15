import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import type { Plugin } from 'vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiProxyTarget = process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:3001';
const __dirname = dirname(fileURLToPath(import.meta.url));
const dayjsEsmEntry = resolve(__dirname, 'node_modules/dayjs/esm/index.js');

function resolveBareDayjs(): Plugin {
  return {
    name: 'resolve-bare-dayjs',
    resolveId(id) {
      if (
        id === 'dayjs' ||
        id === 'dayjs/dayjs.min' ||
        id === 'dayjs/dayjs.min.js' ||
        id.endsWith('/node_modules/dayjs/dayjs.min.js')
      ) {
        return dayjsEsmEntry;
      }
    },
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url?.startsWith('/node_modules/dayjs/dayjs.min.js')) {
          req.url = req.url.replace('/node_modules/dayjs/dayjs.min.js', '/node_modules/dayjs/esm/index.js');
        } else if (req.url?.startsWith('/node_modules/is-mobile/index.js')) {
          req.url = req.url.replace('/node_modules/is-mobile/index.js', '/src/shims/isMobile.ts');
        } else if (req.url?.startsWith('/node_modules/react-is/index.js')) {
          req.url = req.url.replace('/node_modules/react-is/index.js', '/src/shims/reactIs.ts');
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [tailwindcss(), resolveBareDayjs(), react()],
  resolve: {
    alias: {
      antd: resolve(__dirname, 'node_modules/antd'),
      '@pdfme/ui': resolve(__dirname, '../packages/ui/src/index.ts'),
      'dayjs/dayjs.min.js': dayjsEsmEntry,
      'dayjs/locale/zh-cn': resolve(__dirname, 'node_modules/dayjs/esm/locale/zh-cn.js'),
      'dayjs/plugin/advancedFormat': resolve(
        __dirname,
        'node_modules/dayjs/esm/plugin/advancedFormat/index.js'
      ),
      'dayjs/plugin/customParseFormat': resolve(
        __dirname,
        'node_modules/dayjs/esm/plugin/customParseFormat/index.js'
      ),
      'dayjs/plugin/localeData': resolve(
        __dirname,
        'node_modules/dayjs/esm/plugin/localeData/index.js'
      ),
      'dayjs/plugin/quarterOfYear': resolve(
        __dirname,
        'node_modules/dayjs/esm/plugin/quarterOfYear/index.js'
      ),
      'dayjs/plugin/weekOfYear': resolve(
        __dirname,
        'node_modules/dayjs/esm/plugin/weekOfYear/index.js'
      ),
      'dayjs/plugin/weekYear': resolve(__dirname, 'node_modules/dayjs/esm/plugin/weekYear/index.js'),
      'dayjs/plugin/weekday': resolve(__dirname, 'node_modules/dayjs/esm/plugin/weekday/index.js'),
      'form-render': resolve(__dirname, 'node_modules/form-render'),
      'is-mobile': resolve(__dirname, 'src/shims/isMobile.ts'),
      'is-mobile/index.js': resolve(__dirname, 'src/shims/isMobile.ts'),
      'lodash/debounce': resolve(__dirname, 'src/shims/lodashDebounce.ts'),
      'lodash/debounce.js': resolve(__dirname, 'src/shims/lodashDebounce.ts'),
      'lodash/isPlainObject': resolve(__dirname, 'src/shims/lodashIsPlainObject.ts'),
      'lodash/isPlainObject.js': resolve(__dirname, 'src/shims/lodashIsPlainObject.ts'),
      'lodash/throttle': resolve(__dirname, 'src/shims/lodashThrottle.ts'),
      'lodash/throttle.js': resolve(__dirname, 'src/shims/lodashThrottle.ts'),
      'rc-picker': resolve(__dirname, 'node_modules/rc-picker'),
      'react-is': resolve(__dirname, 'src/shims/reactIs.ts'),
      'react-is/index.js': resolve(__dirname, 'src/shims/reactIs.ts'),
      'use-sync-external-store/shim/with-selector': resolve(
        __dirname,
        'src/shims/useSyncExternalStoreWithSelector.ts'
      ),
      'use-sync-external-store/shim/with-selector.js': resolve(
        __dirname,
        'src/shims/useSyncExternalStoreWithSelector.ts'
      ),
    },
  },
  optimizeDeps: {
    exclude: ['@pdfme/ui', 'dayjs'],
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: apiProxyTarget,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
