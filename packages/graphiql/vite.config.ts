/// <reference types="vite/client" />
import react from '@vitejs/plugin-react';
import { copyFileSync, existsSync } from 'fs';
import { defineConfig } from 'vite';

if (!existsSync('.env')) {
  copyFileSync('.env.defaults', '.env');
}

export default defineConfig({
  envPrefix: ['MEDPLUM_', 'GOOGLE_', 'RECAPTCHA_'],
  plugins: [react()],
  server: {
    port: 8080,
  },
  build: {
    sourcemap: true,
  },
});
