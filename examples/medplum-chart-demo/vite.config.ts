import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import dns from 'dns';

dns.setDefaultResultOrder('verbatim');

// https://vitejs.dev/config/
export default defineConfig({
  envPrefix: ['MEDPLUM_', 'GOOGLE_'],
  plugins: [react()],
  server: {
    host: 'localhost',
    port: 3000,
  },
});
