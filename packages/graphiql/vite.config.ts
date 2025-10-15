// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
/// <reference types="vite/client" />
import react from '@vitejs/plugin-react';
import { copyFileSync, existsSync } from 'fs';
import path from 'path';
import { defineConfig } from 'vite';
// The docs recommend the `vite-plugin-monaco-editor` package, but its exports aren't cleanly
// compatible with ESM. See https://github.com/vdesjs/vite-plugin-monaco-editor/issues/21
import monacoEditorEsmPlugin from 'vite-plugin-monaco-editor-esm';

if (!existsSync(path.join(__dirname, '.env'))) {
  copyFileSync(path.join(__dirname, '.env.defaults'), path.join(__dirname, '.env'));
}

export default defineConfig({
  envPrefix: ['MEDPLUM_', 'GOOGLE_', 'RECAPTCHA_'],
  plugins: [
    react(),
    monacoEditorEsmPlugin({
      languageWorkers: ['editorWorkerService', 'json'],
      customWorkers: [
        {
          label: 'graphql',
          entry: 'monaco-graphql/esm/graphql.worker.js',
        },
      ],
    }),
  ],
  server: {
    port: 8080,
  },
  build: {
    sourcemap: true,
  },
});
