// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * Vercel Serverless Function entry point.
 * Imports the pre-built esbuild bundle from dist/.
 */
import express from 'express';
import { initApp } from '../dist/app.js';
import { loadConfig } from '../dist/loader.js';

let appPromise = null;

async function getApp() {
  if (!appPromise) {
    appPromise = (async () => {
      const app = express();
      const config = await loadConfig();
      await initApp(app, config);
      return app;
    })();
  }
  return appPromise;
}

export default async function handler(req, res) {
  const app = await getApp();
  return new Promise((resolve) => {
    app(req, res, () => {
      resolve();
    });
  });
}
