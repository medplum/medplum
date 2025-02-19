import react from '@vitejs/plugin-react';
import { defineConfig, UserConfig } from 'vite';
import dns from 'dns';

dns.setDefaultResultOrder('verbatim');

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: 'localhost',
    port: 3000,
  },
} as UserConfig);
