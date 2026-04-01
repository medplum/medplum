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

// Import from the bundled dist/ folder (created by esbuild)
// This avoids the ESM extensionless import issues since esbuild bundles everything
let initAppPromise = null;
let expressApp = null;

/**
 * Parse Upstash/Vercel KV Redis URL and set MEDPLUM_REDIS_* environment variables.
 * Vercel's Upstash integration provides REDIS_URL or KV_URL in the format:
 *   rediss://default:<password>@<host>:<port>
 *
 * Medplum expects individual MEDPLUM_REDIS_HOST, MEDPLUM_REDIS_PORT, MEDPLUM_REDIS_PASSWORD vars.
 */
function configureRedisFromUrl() {
  const redisUrl = process.env.REDIS_URL || process.env.KV_URL;
  if (!redisUrl) {
    return; // No URL provided, assume individual vars are set
  }

  try {
    const url = new URL(redisUrl);
    
    // Set individual MEDPLUM_REDIS_* vars if not already set
    process.env.MEDPLUM_REDIS_HOST ??= url.hostname;
    process.env.MEDPLUM_REDIS_PORT ??= url.port || '6379';
    process.env.MEDPLUM_REDIS_PASSWORD ??= decodeURIComponent(url.password);
    
    // Upstash requires TLS (rediss:// protocol)
    if (url.protocol === 'rediss:') {
      // Enable TLS for ioredis - we need to pass this as JSON config
      process.env.MEDPLUM_REDIS_TLS ??= JSON.stringify({ rejectUnauthorized: false });
    }
  } catch (e) {
    console.error('[Medplum] Failed to parse REDIS_URL:', e.message);
  }
}

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
    const { loadConfig } = await import('../dist/config/loader.js');

    // Parse Vercel's Upstash/KV Redis URL into MEDPLUM_REDIS_* env vars
    configureRedisFromUrl();

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
