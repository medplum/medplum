/// <reference types="vite/client" />
import react from '@vitejs/plugin-react';
import { copyFileSync, existsSync } from 'fs';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

if (!existsSync('.env')) {
  copyFileSync('.env.defaults', '.env');
}

export default defineConfig({
  envPrefix: ['MEDPLUM_', 'GOOGLE_', 'RECAPTCHA_'],
  plugins: [
    react(),
    VitePWA({
      outDir: 'dist/assets',
      registerType: 'autoUpdate',
      injectRegister: null,
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'Medplum',
        short_name: 'Medplum',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#ffffff',
        icons: [
          {
            src: '/img/medplum-logo.svg',
            type: 'image/svg+xml',
            sizes: '512x512',
          },
          {
            src: '/img/medplum-logo-512x512.png',
            type: 'image/png',
            sizes: '512x512',
          },
          {
            src: '/img/medplum-logo-maskable.png',
            type: 'image/png',
            sizes: '512x512',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
  server: {
    port: 3000,
  },
  publicDir: 'static',
  build: {
    sourcemap: true,
  },
});
