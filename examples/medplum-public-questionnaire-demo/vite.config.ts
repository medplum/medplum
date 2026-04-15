// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import react from '@vitejs/plugin-react';
import dns from 'dns';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin, PreviewServer, ViteDevServer } from 'vite';
import { defineConfig } from 'vite';
import {
  medplumBaseUrl,
  medplumClientId,
  medplumClientSecret,
  medplumSubmitBotId,
} from './config';

dns.setDefaultResultOrder('verbatim');

function readRequestBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

type TokenError = { ok: false; statusCode: number; error: string; message: string };
type TokenOk = { ok: true; accessToken: string; baseUrl: string };
type TokenResult = TokenOk | TokenError;

function resolveMedplumBaseUrl(): string {
  return (process.env.MEDPLUM_BASE_URL || medplumBaseUrl).replace(/\/$/, '');
}

function resolveClientId(): string {
  return (process.env.MEDPLUM_CLIENT_ID || medplumClientId).trim();
}

function resolveClientSecret(): string {
  return (process.env.MEDPLUM_CLIENT_SECRET || medplumClientSecret).trim();
}

function resolveSubmitBotId(): string {
  return (process.env.MEDPLUM_SUBMIT_BOT_ID || medplumSubmitBotId).trim();
}

async function fetchMedplumClientCredentialsAccessToken(): Promise<TokenResult> {
  const baseUrl = resolveMedplumBaseUrl();
  const clientId = resolveClientId();
  const clientSecret = resolveClientSecret();

  if (!clientId || !clientSecret) {
    return {
      ok: false,
      statusCode: 503,
      error: 'not_configured',
      message:
        'Set MEDPLUM_CLIENT_ID and MEDPLUM_CLIENT_SECRET in a .env file (see .env.example), or set medplumClientId and medplumClientSecret in config.ts.',
    };
  }

  const body = new URLSearchParams();
  body.set('grant_type', 'client_credentials');
  body.set('client_id', clientId);
  body.set('client_secret', clientSecret);

  const tokenResponse = await fetch(`${baseUrl}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const json = (await tokenResponse.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!tokenResponse.ok || !json.access_token) {
    return {
      ok: false,
      statusCode: tokenResponse.status >= 400 ? tokenResponse.status : 502,
      error: json.error || 'token_error',
      message: json.error_description || tokenResponse.statusText,
    };
  }

  return { ok: true, accessToken: json.access_token, baseUrl };
}

/**
 * Best-effort message from Medplum error bodies (often OperationOutcome).
 * @param bodyText - Raw response body text.
 * @param statusText - HTTP status text fallback.
 * @returns Human-readable error message.
 */
function medplumExecuteFailureMessage(bodyText: string, statusText: string): string {
  const trimmed = bodyText.trim();
  if (!trimmed) {
    return statusText || 'Request failed';
  }
  try {
    const parsed = JSON.parse(trimmed) as {
      resourceType?: string;
      issue?: { diagnostics?: string; details?: { text?: string } }[];
      message?: string;
    };
    if (typeof parsed.message === 'string' && parsed.message) {
      return parsed.message;
    }
    if (parsed.resourceType === 'OperationOutcome' && Array.isArray(parsed.issue)) {
      const first = parsed.issue[0];
      const text = first?.diagnostics || first?.details?.text;
      if (typeof text === 'string' && text) {
        return text;
      }
    }
  } catch {
    return trimmed;
  }
  return trimmed;
}

type BotExecuteResult =
  | { ok: true; status: number; text: string; contentType: string }
  | { ok: false; statusCode: number; message: string };

async function medplumExecuteBot(
  botId: string,
  executeBody: Record<string, unknown>
): Promise<BotExecuteResult> {
  const tokenResult = await fetchMedplumClientCredentialsAccessToken();
  if (!tokenResult.ok) {
    return { ok: false, statusCode: tokenResult.statusCode, message: tokenResult.message };
  }

  const executeUrl = `${tokenResult.baseUrl}/fhir/R4/Bot/${encodeURIComponent(botId)}/$execute`;
  const executeResponse = await fetch(executeUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokenResult.accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/fhir+json, application/json;q=0.9',
    },
    body: JSON.stringify(executeBody),
  });

  const executeText = await executeResponse.text();
  const contentType = executeResponse.headers.get('content-type') ?? '';

  if (!executeResponse.ok) {
    const message = medplumExecuteFailureMessage(executeText, executeResponse.statusText);
    return { ok: false, statusCode: executeResponse.status, message };
  }

  return { ok: true, status: executeResponse.status, text: executeText, contentType };
}

function forwardBotSuccess(res: ServerResponse, result: { status: number; text: string; contentType: string }): void {
  res.statusCode = result.status;
  const ct = result.contentType.toLowerCase();
  const medplumBodyIsJson = ct.includes('application/json') || ct.includes('fhir+json');
  if (medplumBodyIsJson) {
    res.setHeader('Content-Type', 'application/json');
    res.end(result.text || '{}');
  } else {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end(result.text);
  }
}

function createMedplumApiMiddleware() {
  return async (req: IncomingMessage, res: ServerResponse, next: () => void): Promise<void> => {
    const pathname = req.url?.split('?')[0];

    if (pathname !== '/api/medplum-questionnaire' && pathname !== '/api/medplum-submit') {
      next();
      return;
    }

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'method_not_allowed' }));
      return;
    }

    res.setHeader('Content-Type', 'application/json');

    const botId = resolveSubmitBotId();
    if (!botId) {
      res.statusCode = 503;
      res.end(
        JSON.stringify({
          error: 'not_configured',
          message:
            'Set MEDPLUM_SUBMIT_BOT_ID in .env or medplumSubmitBotId in config.ts (Bot id, server-side only). See README.',
        })
      );
      return;
    }

    const rawBody = await readRequestBody(req).catch(() => '');
    let payload: unknown;
    try {
      payload = rawBody ? JSON.parse(rawBody) : undefined;
    } catch {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'invalid_json', message: 'Request body must be JSON' }));
      return;
    }

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'invalid_body', message: 'Expected a JSON object' }));
      return;
    }

    const record = payload as Record<string, unknown>;

    if (typeof record.token !== 'string') {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'invalid_body', message: 'Field "token" must be a string' }));
      return;
    }

    if (pathname === '/api/medplum-questionnaire') {
      const exec = await medplumExecuteBot(botId, { token: record.token, action: 'questionnaire' });
      if (!exec.ok) {
        res.statusCode = exec.statusCode;
        res.end(JSON.stringify({ error: 'medplum_execute_failed', message: exec.message }));
        return;
      }
      forwardBotSuccess(res, exec);
      return;
    }

    // POST /api/medplum-submit
    const response = record.response;
    if (!response || typeof response !== 'object' || Array.isArray(response)) {
      res.statusCode = 400;
      res.end(
        JSON.stringify({
          error: 'invalid_body',
          message: 'Field "response" must be an object',
        })
      );
      return;
    }
    const responseObj = response as Record<string, unknown>;
    const looksLikeQr =
      responseObj.resourceType === 'QuestionnaireResponse' ||
      responseObj.item !== undefined ||
      responseObj.questionnaire !== undefined;
    if (!looksLikeQr) {
      res.statusCode = 400;
      res.end(
        JSON.stringify({
          error: 'invalid_body',
          message:
            'Field "response" must look like a QuestionnaireResponse (resourceType, item, or questionnaire)',
        })
      );
      return;
    }
    if (responseObj.resourceType !== 'QuestionnaireResponse') {
      responseObj.resourceType = 'QuestionnaireResponse';
    }

    const exec = await medplumExecuteBot(botId, { token: record.token, response: responseObj });
    if (!exec.ok) {
      res.statusCode = exec.statusCode;
      res.end(JSON.stringify({ error: 'medplum_execute_failed', message: exec.message }));
      return;
    }
    forwardBotSuccess(res, exec);
  };
}

function medplumPublicQuestionnaireApiPlugin(): Plugin {
  const middleware = createMedplumApiMiddleware();
  return {
    name: 'medplum-public-questionnaire-api',
    configureServer(devServer: ViteDevServer): void {
      devServer.middlewares.use(middleware);
    },
    configurePreviewServer(previewServer: PreviewServer): void {
      previewServer.middlewares.use(middleware);
    },
  };
}

export default defineConfig({
  cacheDir: '.vite',
  plugins: [react(), medplumPublicQuestionnaireApiPlugin()],
  server: {
    host: 'localhost',
    port: 3010,
  },
  preview: {
    host: 'localhost',
    port: 3010,
  },
});
