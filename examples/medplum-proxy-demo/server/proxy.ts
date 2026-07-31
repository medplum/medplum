// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { config as loadEnv } from 'dotenv';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { copyFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const envPath = path.join(__dirname, '.env');
if (!existsSync(envPath)) {
  copyFileSync(path.join(__dirname, '.env.defaults'), envPath);
}
loadEnv({ path: envPath });

/**
 * Request headers that are safe to copy from the browser through to Medplum.
 * `Authorization` is deliberately excluded -- the proxy always injects its own M2M token,
 * so nothing the browser sends can ever reach Medplum as credentials.
 */
const FORWARDED_REQUEST_HEADERS = ['content-type', 'accept', 'x-medplum', 'prefer', 'if-match', 'if-none-match'];

/** Response headers that are safe to copy back from Medplum to the browser. */
const FORWARDED_RESPONSE_HEADERS = ['content-type', 'etag', 'location', 'content-location'];

interface ProxyConfig {
  port: number;
  allowedOrigin: string;
  medplumBaseUrl: string;
  clientId: string;
  clientSecret: string;
}

function getConfig(): ProxyConfig {
  const clientId = process.env.MEDPLUM_CLIENT_ID;
  const clientSecret = process.env.MEDPLUM_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      'Missing MEDPLUM_CLIENT_ID or MEDPLUM_CLIENT_SECRET. Copy server/.env.defaults to server/.env and fill in ' +
        'the M2M ClientApplication credentials. See README.md for setup instructions.'
    );
  }

  const medplumBaseUrl = process.env.MEDPLUM_BASE_URL ?? 'http://localhost:8103/';

  return {
    port: Number(process.env.PROXY_PORT ?? 8104),
    allowedOrigin: process.env.ALLOWED_ORIGIN ?? 'http://localhost:3000',
    medplumBaseUrl: medplumBaseUrl.endsWith('/') ? medplumBaseUrl : medplumBaseUrl + '/',
    clientId,
    clientSecret,
  };
}

/**
 * Caches the M2M access token in memory and refreshes it on demand.
 * There is no session, no cookie, and no per-user token -- every browser request
 * is proxied using this same server-held credential.
 */
class M2MTokenCache {
  private accessToken: string | undefined;
  private expiresAt = 0;
  private pendingFetch: Promise<string> | undefined;

  constructor(
    private readonly medplumBaseUrl: string,
    private readonly clientId: string,
    private readonly clientSecret: string
  ) {}

  async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.expiresAt) {
      return this.accessToken;
    }
    if (!this.pendingFetch) {
      this.pendingFetch = this.fetchAccessToken().finally(() => {
        this.pendingFetch = undefined;
      });
    }
    return this.pendingFetch;
  }

  /** Forces a refresh on the next call, used to recover from an unexpected 401 from Medplum. */
  invalidate(): void {
    this.accessToken = undefined;
    this.expiresAt = 0;
  }

  private async fetchAccessToken(): Promise<string> {
    const tokenUrl = new URL('oauth2/token', this.medplumBaseUrl).toString();
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.clientId,
      client_secret: this.clientSecret,
    });

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.ok) {
      throw new Error(`Failed to obtain M2M access token (${response.status}): ${await response.text()}`);
    }

    const json = (await response.json()) as { access_token: string; expires_in: number };
    this.accessToken = json.access_token;
    // Refresh a bit early so an in-flight request never races an expiring token.
    this.expiresAt = Date.now() + (json.expires_in - 30) * 1000;
    return this.accessToken;
  }
}

function buildCorsMiddleware(allowedOrigin: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', FORWARDED_REQUEST_HEADERS.join(', '));
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  };
}

function buildProxyMiddleware(config: ProxyConfig, tokens: M2MTokenCache) {
  return async (req: Request, res: Response): Promise<void> => {
    // This demo has no concept of an individual signed-in user -- every request is forwarded
    // using the same shared M2M credential (see the "Authorization" header set below). A real
    // deployment of this pattern would authenticate/authorize the *caller* right here, before
    // any request reaches Medplum: verify the app's own session cookie or JWT, check that this
    // user/tenant is allowed to perform this request, apply per-user rate limiting, etc. That
    // layer is entirely separate from -- and sits in front of -- the Medplum M2M credential
    // below, which only proves the *proxy itself* is a trusted client of Medplum.
    const targetUrl = new URL(req.originalUrl.replace(/^\//, ''), config.medplumBaseUrl).toString();
    const hasBody = !['GET', 'HEAD'].includes(req.method) && Buffer.isBuffer(req.body) && req.body.length > 0;

    for (let attempt = 0; attempt < 2; attempt++) {
      const accessToken = await tokens.getAccessToken();
      const headers = new Headers();
      for (const name of FORWARDED_REQUEST_HEADERS) {
        const value = req.headers[name];
        if (typeof value === 'string') {
          headers.set(name, value);
        }
      }
      // This is the entire point of the proxy: the browser never has a token, so this line is the
      // only place a Medplum credential is ever attached to the request.
      headers.set('Authorization', `Bearer ${accessToken}`);

      const upstream = await fetch(targetUrl, {
        method: req.method,
        headers,
        body: hasBody ? (req.body as Buffer) : undefined,
        // Manual redirects so the `Location` header (used for Binary/attachment downloads) is
        // passed straight through to the browser instead of being followed by the proxy.
        redirect: 'manual',
      });

      if (upstream.status === 401 && attempt === 0) {
        tokens.invalidate();
        continue;
      }

      res.status(upstream.status);
      for (const name of FORWARDED_RESPONSE_HEADERS) {
        const value = upstream.headers.get(name);
        if (value) {
          res.setHeader(name, value);
        }
      }
      res.send(Buffer.from(await upstream.arrayBuffer()));
      return;
    }
  };
}

function main(): void {
  const config = getConfig();
  const tokens = new M2MTokenCache(config.medplumBaseUrl, config.clientId, config.clientSecret);

  const app = express();
  app.use(buildCorsMiddleware(config.allowedOrigin));
  app.use(express.raw({ type: () => true, limit: '20mb' }));
  app.use(buildProxyMiddleware(config, tokens));

  app.listen(config.port, () => {
    console.log(`Proxy listening on http://localhost:${config.port}`);
    console.log(`Forwarding to ${config.medplumBaseUrl} with M2M client ${config.clientId}`);
    console.log(`Allowed browser origin: ${config.allowedOrigin}`);
  });
}

main();
