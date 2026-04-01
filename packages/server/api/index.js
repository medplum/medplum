// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * Vercel Serverless Function Entry Point
 *
 * This file serves as the entry point for deploying Medplum Server on Vercel.
 * It imports from the pre-bundled esbuild output in dist/ to avoid ESM module
 * resolution issues that occur when running tsc-compiled output in Node.js ESM mode.
 *
 * The traditional deployment (node dist/index.js) remains unchanged.
 *
 * Configuration:
 * Set environment variables with MEDPLUM_ prefix (e.g., MEDPLUM_BASE_URL, MEDPLUM_DATABASE_HOST).
 * The server uses the built-in "env" config loader which reads all MEDPLUM_* env vars.
 *
 * Required environment variables:
 * - MEDPLUM_BASE_URL: The base URL of your deployment (e.g., https://api.example.com/)
 * - MEDPLUM_DATABASE_HOST: PostgreSQL host
 * - MEDPLUM_DATABASE_USERNAME: PostgreSQL username
 * - MEDPLUM_DATABASE_PASSWORD: PostgreSQL password
 * - MEDPLUM_REDIS_HOST: Redis host
 * - MEDPLUM_SIGNING_KEY: RSA private key for JWT signing (PEM format)
 *
 * See src/config/types.ts for all available configuration options.
 */

import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readdirSync } from 'fs';

// Debug: Log directory structure
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
console.log('[v0] api/index.js location:', __filename);
console.log('[v0] __dirname:', __dirname);
console.log('[v0] Parent directory contents:', readdirSync(join(__dirname, '..')));
console.log('[v0] dist exists:', existsSync(join(__dirname, '..', 'dist')));
if (existsSync(join(__dirname, '..', 'dist'))) {
  console.log('[v0] dist contents:', readdirSync(join(__dirname, '..', 'dist')));
}

// Import from the bundled dist/ folder (created by esbuild)
// This avoids the ESM extensionless import issues since esbuild bundles everything
let initAppPromise = null;
let expressApp = null;

/**
 * Lazy initialization of the Express app.
 * Caches the app instance for warm Vercel function invocations.
 */
async function getApp() {
  if (expressApp) {
    return expressApp;
  }

  if (initAppPromise) {
    return initAppPromise;
  }

  initAppPromise = (async () => {
    // Dynamic import from the bundled dist/ folder
    const { initApp } = await import('../dist/app.js');
    const { loadConfig } = await import('../dist/loader.js');

    // Load config using the built-in env config loader
    // This reads all MEDPLUM_* environment variables and applies defaults
    // You can also combine sources: "env" or "file:config.json,env" for file + env overlay
    const configSource = process.env.MEDPLUM_CONFIG_SOURCE || 'env';

    // Override heartbeat settings for serverless (doesn't work well with cold starts)
    process.env.MEDPLUM_HEARTBEAT_ENABLED ??= 'false';

    const config = await loadConfig(configSource);

    expressApp = express();
    await initApp(expressApp, config);
    return expressApp;
  })();

  return initAppPromise;
}

/**
 * Vercel Serverless Function Handler
 * Delegates all requests to the Express app
 */
export default async function handler(req, res) {
  try {
    const app = await getApp();
    app(req, res);
  } catch (error) {
    console.error('Medplum Server initialization error:', error);
    res.status(500).json({
      error: 'Server initialization failed',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
}
