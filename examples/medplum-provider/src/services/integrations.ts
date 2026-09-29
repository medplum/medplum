// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * The integrations settings page's data access, kept in one place deliberately.
 *
 * Neither DrChrono nor the Lyfe Data Network (ZUS) can be called from the
 * browser: the credentials would ship in client JS, and neither vendor sends
 * CORS headers for this origin. Every call below therefore goes to a Medplum
 * Bot, found by identifier rather than by a hard-coded id so the same build
 * works against any project.
 *
 * Credentials travel one way. The bot stores them in a Project secret and never
 * echoes them back, so `IntegrationStatus` carries only the *names* of the
 * secrets that are populated (`configuredSecrets`) and never a value. The UI has
 * nothing to leak because it is never told anything to leak.
 */
import type { MedplumClient } from '@medplum/core';
import { normalizeErrorString } from '@medplum/core';

/** Identifier the integrations bot is deployed under. */
const BOT_IDENTIFIER_SYSTEM = 'https://lyfe.health/bots';
const BOT_IDENTIFIER_VALUE = 'lyfe-integrations';
const BOT_SEARCH_IDENTIFIER = `${BOT_IDENTIFIER_SYSTEM}|${BOT_IDENTIFIER_VALUE}`;

/** The integrations a clinic can configure from this page. */
export type IntegrationId = 'drchrono' | 'zus';

/** Render order for the page, and the set the fallback snapshot covers. */
export const INTEGRATION_IDS: readonly IntegrationId[] = ['drchrono', 'zus'];

/** Connection state as reported by the backend. */
export type IntegrationConnectionStatus = 'connected' | 'not-connected' | 'error';

export interface IntegrationStatus {
  readonly id: IntegrationId;
  readonly status: IntegrationConnectionStatus;
  /** Human-readable detail, shown verbatim; populated mainly for `error`. */
  readonly message?: string;
  /** ISO timestamp of the last successful check, when the backend tracks one. */
  readonly lastCheckedAt?: string;
  /**
   * Non-secret settings, safe to display: API URL, and for ZUS the builder id,
   * package id, practitioner NPI and practice name.
   */
  readonly config: Readonly<Record<string, string>>;
  /**
   * Names of the secret fields the backend currently holds a value for. Values
   * are deliberately absent — this is only ever enough to render "configured".
   */
  readonly configuredSecrets: readonly string[];
}

export interface IntegrationsSnapshot {
  readonly integrations: readonly IntegrationStatus[];
  /** False when the bot is not deployed or did not answer; the page degrades on this. */
  readonly backendAvailable: boolean;
  /** Why the backend is unavailable, when it is. */
  readonly backendMessage?: string;
}

export interface SaveIntegrationCredentialsInput {
  readonly id: IntegrationId;
  /** Non-secret settings to persist. */
  readonly config?: Readonly<Record<string, string>>;
  /** Write-only values. Omit a key to leave the stored secret untouched. */
  readonly secrets?: Readonly<Record<string, string>>;
}

export interface IntegrationActionResult {
  readonly ok: boolean;
  readonly message: string;
  /** The refreshed status, when the backend returned one. */
  readonly status?: IntegrationStatus;
}

/**
 * Raised when the integrations bot is missing or did not answer. Distinct from a
 * plain `Error` so the page can show "backend not yet deployed" rather than a
 * generic failure.
 */
export class IntegrationsBackendUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IntegrationsBackendUnavailableError';
  }
}

/**
 * The status shown before the backend has ever answered: everything unconfigured.
 * @param id - The integration to describe.
 * @returns A neutral, empty status for that integration.
 */
function emptyStatus(id: IntegrationId): IntegrationStatus {
  return { id, status: 'not-connected', config: {}, configuredSecrets: [] };
}

/**
 * Coerce whatever the bot returned for one integration into `IntegrationStatus`.
 *
 * The bot is built by a separate workstream, so nothing here trusts its shape:
 * unknown fields are dropped and missing ones fall back to the empty status.
 * @param id - The integration this record describes.
 * @param raw - The untrusted record from the bot response.
 * @returns A validated status for that integration.
 */
function parseStatus(id: IntegrationId, raw: unknown): IntegrationStatus {
  if (!raw || typeof raw !== 'object') {
    return emptyStatus(id);
  }
  const record = raw as Record<string, unknown>;
  const status = record.status;
  const config: Record<string, string> = {};
  if (record.config && typeof record.config === 'object') {
    for (const [key, value] of Object.entries(record.config as Record<string, unknown>)) {
      if (typeof value === 'string' && value !== '') {
        config[key] = value;
      }
    }
  }
  const configuredSecrets = Array.isArray(record.configuredSecrets)
    ? record.configuredSecrets.filter((name): name is string => typeof name === 'string')
    : [];

  return {
    id,
    status: status === 'connected' || status === 'error' ? status : 'not-connected',
    message: typeof record.message === 'string' ? record.message : undefined,
    lastCheckedAt: typeof record.lastCheckedAt === 'string' ? record.lastCheckedAt : undefined,
    config,
    configuredSecrets,
  };
}

/**
 * Pull one integration's record out of a bot response, accepting either an
 * `integrations` array or a map keyed by integration id.
 * @param id - The integration to look for.
 * @param body - The untrusted bot response body.
 * @returns The matching record, or undefined when the response has none.
 */
function pickStatusRecord(id: IntegrationId, body: Record<string, unknown>): unknown {
  const list = body.integrations;
  if (Array.isArray(list)) {
    return list.find((entry) => (entry as Record<string, unknown> | null)?.id === id);
  }
  if (list && typeof list === 'object') {
    return (list as Record<string, unknown>)[id];
  }
  return undefined;
}

/**
 * Find the integrations bot and run it.
 *
 * TODO(seam): the bot's request and response contract is owned by the bot
 * workstream. This module sends `{ action, integration, config, secrets }` and
 * reads back `{ integrations, ok, message }`. If the deployed bot settles on
 * different names, adapt them here — nothing outside this file knows the shape.
 * @param medplum - The Medplum client.
 * @param payload - The request body for the bot.
 * @returns The bot's response body as an untrusted record.
 */
async function executeIntegrationsBot(
  medplum: MedplumClient,
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  let botId: string | undefined;
  try {
    const bot = await medplum.searchOne('Bot', { identifier: BOT_SEARCH_IDENTIFIER });
    botId = bot?.id;
  } catch (err: unknown) {
    throw new IntegrationsBackendUnavailableError(normalizeErrorString(err));
  }

  if (!botId) {
    throw new IntegrationsBackendUnavailableError(`No Bot found with identifier ${BOT_SEARCH_IDENTIFIER}.`);
  }

  let response: unknown;
  try {
    response = await medplum.executeBot(botId, payload, 'application/json');
  } catch (err: unknown) {
    throw new IntegrationsBackendUnavailableError(normalizeErrorString(err));
  }

  return response && typeof response === 'object' ? (response as Record<string, unknown>) : {};
}

/**
 * Read the connection status and non-secret configuration of every integration.
 *
 * Never rejects: a missing or failing bot comes back as a snapshot with
 * `backendAvailable: false` and empty statuses, so the page renders the
 * "backend not yet deployed" state instead of an error boundary.
 * @param medplum - The Medplum client.
 * @returns A snapshot of all integrations plus whether the backend answered.
 */
export async function getIntegrationStatus(medplum: MedplumClient): Promise<IntegrationsSnapshot> {
  try {
    const body = await executeIntegrationsBot(medplum, { action: 'getStatus' });
    return {
      integrations: INTEGRATION_IDS.map((id) => parseStatus(id, pickStatusRecord(id, body))),
      backendAvailable: true,
    };
  } catch (err: unknown) {
    return {
      integrations: INTEGRATION_IDS.map(emptyStatus),
      backendAvailable: false,
      backendMessage: normalizeErrorString(err),
    };
  }
}

/**
 * Persist one integration's settings. Secrets are sent, never read back: the
 * backend stores them and subsequent reads report only that they are populated.
 * @param medplum - The Medplum client.
 * @param input - The integration to update, with its non-secret config and any secrets being set.
 * @returns Whether the save succeeded, a message to show, and the refreshed status when given.
 * @throws IntegrationsBackendUnavailableError When the bot is not deployed or did not answer.
 */
export async function saveIntegrationCredentials(
  medplum: MedplumClient,
  input: SaveIntegrationCredentialsInput
): Promise<IntegrationActionResult> {
  const body = await executeIntegrationsBot(medplum, {
    action: 'saveCredentials',
    integration: input.id,
    config: input.config ?? {},
    secrets: input.secrets ?? {},
  });

  const record = pickStatusRecord(input.id, body);
  return {
    ok: body.ok !== false,
    message: typeof body.message === 'string' ? body.message : 'Settings saved.',
    status: record ? parseStatus(input.id, record) : undefined,
  };
}

/**
 * Ask the backend to make a live call against one integration's credentials.
 * @param medplum - The Medplum client.
 * @param id - The integration to test.
 * @returns Whether the connection succeeded, with the backend's message and refreshed status.
 * @throws IntegrationsBackendUnavailableError When the bot is not deployed or did not answer.
 */
export async function testIntegration(medplum: MedplumClient, id: IntegrationId): Promise<IntegrationActionResult> {
  const body = await executeIntegrationsBot(medplum, { action: 'testConnection', integration: id });

  const record = pickStatusRecord(id, body);
  const ok = body.ok !== false;
  const fallbackMessage = ok ? 'Connection succeeded.' : 'Connection failed.';
  return {
    ok,
    message: typeof body.message === 'string' ? body.message : fallbackMessage,
    status: record ? parseStatus(id, record) : undefined,
  };
}
