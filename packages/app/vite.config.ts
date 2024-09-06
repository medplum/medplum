/// <reference types="vite/client" />
import react from '@vitejs/plugin-react';
import { execSync } from 'child_process';
import { copyFileSync, existsSync } from 'fs';
import path from 'path';
import { defineConfig } from 'vite';
import packageJson from './package.json' with { type: 'json' };

if (!existsSync('.env')) {
  copyFileSync('.env.defaults', '.env');
}

let gitHash;
try {
  gitHash = execSync('git rev-parse --short HEAD').toString().trim();
} catch (_err) {
  gitHash = 'unknown'; // Default value when not in a git repository
}

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
  resolve: {
    alias: {
      '@medplum/core': path.resolve(__dirname, '../core/src'),
      '@medplum/react': path.resolve(__dirname, '../react/src'),
      '@medplum/react-hooks': path.resolve(__dirname, '../react-hooks/src'),
    },
  },
});
