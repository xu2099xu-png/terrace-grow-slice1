import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

const apiPort = process.env.E2E_API_PORT || '3000';
const h5Port = Number(process.env.E2E_H5_PORT || '5173');
const apiTarget = process.env.VITE_API_PROXY_TARGET || `http://localhost:${apiPort}`;

const apiProxy = {
  '/api': {
    target: apiTarget,
    changeOrigin: true,
  },
};

export default defineConfig({
  plugins: [vue()],
  server: {
    port: h5Port,
    proxy: apiProxy,
  },
  preview: {
    port: h5Port,
    proxy: apiProxy,
  },
});
