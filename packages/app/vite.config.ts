/// <reference types="vite/client" />
import react from '@vitejs/plugin-react';
import { copyFileSync, existsSync } from 'fs';
import { defineConfig } from 'vite';
import packageJson from './package.json' assert { type: 'json' };
import { execSync } from 'child_process';

if (!existsSync('.env')) {
  copyFileSync('.env.defaults', '.env');
}

const gitHash = execSync('git rev-parse --short HEAD').toString().trim();
process.env.MEDPLUM_VERSION = packageJson.version + '-' + gitHash;

export default defineConfig({
  envPrefix: ['MEDPLUM_', 'GOOGLE_', 'RECAPTCHA_'],
  plugins: [react()],
  server: {
    port: 3000,
  },
  publicDir: 'static',
  build: {
    sourcemap: true,
  },
});
