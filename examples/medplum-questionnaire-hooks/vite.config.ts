import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { medplumAliases } from '../../vitest.config';

export default defineConfig({
  resolve: {
    alias: medplumAliases,
  },
  plugins: [react()],
});
