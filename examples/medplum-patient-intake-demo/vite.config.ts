import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import dns from 'dns';
import { existsSync, copyFileSync } from 'fs';
import path from 'path';

dns.setDefaultResultOrder('verbatim');

if (!existsSync(path.join(__dirname, '.env'))) {
  copyFileSync(path.join(__dirname, '.env.defaults'), path.join(__dirname, '.env'));
}

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
