// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
/**
 * Per-tenant EHR credential management.
 *
 * Actions, as posted by the Integrations settings screen:
 *   getStatus        connection state for every integration, never a secret
 *   saveCredentials  store DrChrono/ZUS credentials for the caller's own clinic
 *   testConnection   prove the stored credentials actually authenticate upstream
 *
 * Every action answers with the same envelope:
 *   { ok, message?, integrations: [{ id, status, message?, lastCheckedAt?,
 *                                    config, configuredSecrets }] }
 * `configuredSecrets` is a list of NAMES. No path in this file puts a decrypted
 * secret into a response.
 *
 * THE ORGANIZATION IS NEVER TAKEN FROM THE INPUT
 * ----------------------------------------------
 * Every action resolves the clinic from `event.requester` -- the profile on the
 * caller's own ProjectMembership, set by the server, not by the client -- and
 * reads the `organization` access parameter off that membership. A caller who
 * sends an `organizationId` is rejected outright rather than ignored, so a UI
 * that believes it can choose a tenant fails loudly in development instead of
 * appearing to work.
 *
 * Accepting a client-supplied organization here would be a straight IDOR: any
 * authenticated clinic user could write credentials into, or read connection
 * state out of, a competitor's tenant.
 *
 * AND AMBIGUITY IS AN ERROR, NOT A COIN FLIP
 * ------------------------------------------
 * A membership carrying two different organizations, or a profile with two
 * memberships in different organizations, is refused. The Lyfe DrChrono factory
 * (`createDrChronoServiceForUser`) learned this the hard way: it ordered by
 * `updatedAt` and took the first row, so a user in two clinics silently got
 * whichever clinic's credentials had been saved most recently. That is not a bug
 * this design can have, because there is no "pick one" branch to have it in.
 *
 * This bot runs with its own ProjectMembership, which is what lets it touch
 * `Basic` at all: "Lyfe Clinic Access Policy" is an allow-list and does not list
 * `Basic`, so no clinic user can read a credential record by any route.
 */
import type { BotEvent, MedplumClient } from '@medplum/core';
import type { Basic, Organization, ProjectMembership, Reference } from '@medplum/fhirtypes';
import type { Buffer } from 'node:buffer';
import type { IntegrationKey } from './shared/credentials';
import {
  ENCRYPTION_KEY_SECRET_NAME,
  INTEGRATION_KEYS,
  deriveEncryptionKey,
  getCredentialValues,
  parseIntegrationKey,
  readCredentialRecord,
  writeCredentialRecord,
} from './shared/credentials';

/** Access parameter name on the clinic access policy. */
const ORGANIZATION_PARAMETER = 'organization';

/** Fallback DrChrono API base, matching lyfe-provider-ui's DRCHRONO_API. */
const DRCHRONO_API_URL = 'https://app.drchrono.com/api';

/** Fallback ZUS API base. */
const ZUS_API_URL = 'https://api.zusapi.com/fhir';

/** Fallback ZUS token endpoint. */
const ZUS_AUTH_URL = 'https://auth.zusapi.com/oauth/token';

/** What the settings screen renders per integration row. */
interface IntegrationView {
  /** `drchrono` or `zus`. */
  id: IntegrationKey;
  /** Traffic light for the row. */
  status: 'connected' | 'not-connected' | 'error';
  /** One line of explanation for the row. */
  message?: string;
  /** ISO timestamp of the last `testConnection`. */
  lastCheckedAt?: string;
  /** Non-secret configuration, echoed back verbatim. */
  config: Record<string, string>;
  /** Names of the secrets on file. Never values. */
  configuredSecrets: string[];
}

/** The envelope every action returns. */
interface BotResponse {
  /** False when the action itself failed. */
  ok: boolean;
  /** Explanation of the action's outcome. */
  message?: string;
  /** One row per integration, always all of them. */
  integrations: IntegrationView[];
}

interface Input {
  action?: string;
  integration?: string;
  config?: Record<string, string>;
  secrets?: Record<string, string>;
  clear?: string[];
}

/** The per-call tenant context, resolved once in `dispatch`. */
interface TenantContext {
  /** Bot-scoped Medplum client. */
  medplum: MedplumClient;
  /** The caller's organization. */
  organization: Reference<Organization>;
  /** The AES key from project secrets. */
  key: Buffer;
}

/**
 * Entry point.
 * @param medplum - Bot-scoped Medplum client, running as the bot's membership.
 * @param event - Carries the action, the requester, and the project secrets.
 * @returns The action's result. Never contains a secret value.
 */
export async function handler(medplum: MedplumClient, event: BotEvent<Input>): Promise<BotResponse> {
  try {
    return await dispatch(medplum, event);
  } catch (err) {
    // A refusal is an ordinary outcome here -- an unscoped user, an ambiguous
    // membership, an unknown field -- and the settings screen has to be able to
    // say why. Surface it as a message rather than an opaque 400.
    return { ok: false, message: err instanceof Error ? err.message : String(err), integrations: [] };
  }
}

/**
 * Validate the request, resolve the tenant, then run the action.
 * @param medplum - Bot-scoped Medplum client.
 * @param event - The bot event.
 * @returns The action's result.
 */
async function dispatch(medplum: MedplumClient, event: BotEvent<Input>): Promise<BotResponse> {
  const input = (event.input ?? {}) as Input & { organizationId?: unknown; organization?: unknown };

  // Fail loudly rather than silently ignoring it: a caller that sends this
  // believes it is choosing the tenant, and quietly doing something else is how
  // an IDOR survives code review.
  if (input.organizationId !== undefined || input.organization !== undefined) {
    throw new Error("organizationId is not accepted: the organization comes from the caller's ProjectMembership");
  }

  const key = deriveEncryptionKey({ material: event.secrets[ENCRYPTION_KEY_SECRET_NAME]?.valueString ?? '' });
  const organization = await resolveCallerOrganization({ medplum, requester: event.requester });
  const context: TenantContext = { medplum, organization, key };

  switch (input.action) {
    // The short spellings are accepted too, so a curl one-liner and the
    // settings screen drive exactly the same code.
    case 'getStatus':
    case 'status':
      return { ok: true, integrations: await viewAll(context) };

    case 'saveCredentials':
    case 'save': {
      const integration = parseIntegrationKey({ value: input.integration });
      await writeCredentialRecord({
        medplum: context.medplum,
        organization: context.organization,
        key: context.key,
        integration,
        config: input.config,
        secrets: input.secrets,
        clear: input.clear,
      });
      return { ok: true, message: `Saved ${integration} credentials`, integrations: await viewAll(context) };
    }

    case 'testConnection':
    case 'test': {
      const integration = parseIntegrationKey({ value: input.integration });
      const result = await runConnectionTest({ context, integration });
      return { ok: result.ok, message: result.detail, integrations: await viewAll(context) };
    }

    default:
      throw new Error(
        `Unknown action ${JSON.stringify(input.action)}. Expected getStatus, saveCredentials or testConnection.`
      );
  }
}

/**
 * Resolve the caller's clinic from their own ProjectMembership.
 *
 * Reads every membership for the profile and every `organization` access
 * parameter on each, then insists the result is exactly one organization.
 * @param props - The lookup inputs.
 * @param props.medplum - Bot-scoped Medplum client.
 * @param props.requester - `event.requester`, set by the server from the caller's membership.
 * @returns A reference to the caller's organization.
 */
async function resolveCallerOrganization(props: {
  medplum: MedplumClient;
  requester: BotEvent['requester'];
}): Promise<Reference<Organization>> {
  const profile = props.requester?.reference;
  if (!profile) {
    throw new Error('No requester on this execution: the caller could not be identified');
  }

  const memberships = (await props.medplum.searchResources(
    'ProjectMembership',
    `profile=${encodeURIComponent(profile)}&_count=50`
  )) as ProjectMembership[];

  const references = new Set<string>();
  for (const membership of memberships) {
    for (const access of membership.access ?? []) {
      for (const parameter of access.parameter ?? []) {
        const reference = parameter.valueReference?.reference;
        if (parameter.name === ORGANIZATION_PARAMETER && reference?.startsWith('Organization/')) {
          references.add(reference);
        }
      }
    }
  }

  if (references.size === 0) {
    throw new Error(
      `${profile} is not scoped to an organization. ` +
        'Assign the clinic access policy with an "organization" parameter on their ProjectMembership.'
    );
  }
  if (references.size > 1) {
    throw new Error(
      `${profile} is scoped to ${references.size} organizations (${[...references].join(', ')}). ` +
        'Refusing to guess which clinic this call is for.'
    );
  }

  return { reference: [...references][0] };
}

/**
 * Build the settings-screen row for every integration.
 * @param context - The tenant context.
 * @returns One row per integration, in a stable order.
 */
async function viewAll(context: TenantContext): Promise<IntegrationView[]> {
  const views: IntegrationView[] = [];
  for (const integration of INTEGRATION_KEYS) {
    const record = await readCredentialRecord({
      medplum: context.medplum,
      organization: context.organization,
      integration,
    });
    views.push(toView({ record, integration, key: context.key }));
  }
  return views;
}

/**
 * Describe one credential record without revealing any secret.
 * @param props - What to describe.
 * @param props.record - The stored record, if any.
 * @param props.integration - Which integration this row is for.
 * @param props.key - The AES key, used only to tell readable from unreadable.
 * @returns The row.
 */
function toView(props: { record: Basic | undefined; integration: IntegrationKey; key: Buffer }): IntegrationView {
  if (!props.record) {
    return { id: props.integration, status: 'not-connected', config: {}, configuredSecrets: [] };
  }

  const values = getCredentialValues({ record: props.record, key: props.key });
  const configuredSecrets = [...Object.keys(values.secrets), ...values.unreadableSecrets].sort((a, b) =>
    a.localeCompare(b)
  );
  const state = values.state;
  const lastCheckedAt = state.lastTestedAt;

  if (values.unreadableSecrets.length > 0) {
    // Deliberately distinct from "not connected". Ciphertext that will not
    // decrypt means the key changed, not that the clinic never connected -- and
    // an operator told the latter will cheerfully overwrite recoverable data.
    return {
      id: props.integration,
      status: 'error',
      message:
        `Stored secret(s) ${values.unreadableSecrets.join(', ')} could not be decrypted. ` +
        `${ENCRYPTION_KEY_SECRET_NAME} has changed since they were saved; re-enter them.`,
      lastCheckedAt,
      config: values.config,
      configuredSecrets,
    };
  }

  if (state.lastTestResult === 'ok') {
    return {
      id: props.integration,
      status: 'connected',
      message: state.lastTestDetail,
      lastCheckedAt,
      config: values.config,
      configuredSecrets,
    };
  }

  return {
    id: props.integration,
    status: state.lastTestResult === 'failed' ? 'error' : 'not-connected',
    message: state.lastTestDetail ?? 'Credentials saved, not yet tested',
    lastCheckedAt,
    config: values.config,
    configuredSecrets,
  };
}

/** Outcome of an upstream authentication attempt. */
interface TestResult {
  /** True when the upstream system accepted the stored credentials. */
  ok: boolean;
  /** Short machine-ish reason, e.g. `http-401` or `missing-credentials`. */
  reason: string;
  /** Human-readable detail. Never contains a secret. */
  detail: string;
}

/**
 * Authenticate against the upstream system with the stored credentials.
 *
 * The outcome is written back onto the record as state, so `getStatus` can
 * answer "is this clinic connected?" without calling DrChrono or ZUS again.
 * @param props - The test inputs.
 * @param props.context - The tenant context.
 * @param props.integration - Which integration to test.
 * @returns The outcome.
 */
async function runConnectionTest(props: { context: TenantContext; integration: IntegrationKey }): Promise<TestResult> {
  const { context, integration } = props;
  const record = await readCredentialRecord({
    medplum: context.medplum,
    organization: context.organization,
    integration,
  });

  if (!record) {
    return { ok: false, reason: 'not-configured', detail: `No ${integration} credentials saved for this clinic` };
  }

  const values = getCredentialValues({ record, key: context.key });
  let result: TestResult;
  if (values.unreadableSecrets.length > 0) {
    result = {
      ok: false,
      reason: 'undecryptable-secret',
      detail: `Stored secret(s) ${values.unreadableSecrets.join(', ')} could not be decrypted`,
    };
  } else if (integration === 'drchrono') {
    result = await testDrChrono({ config: values.config, secrets: values.secrets });
  } else {
    result = await testZus({ config: values.config, secrets: values.secrets });
  }

  await writeCredentialRecord({
    medplum: context.medplum,
    organization: context.organization,
    key: context.key,
    integration,
    state: {
      lastTestedAt: new Date().toISOString(),
      lastTestResult: result.ok ? 'ok' : 'failed',
      lastTestDetail: result.detail,
    },
  });

  return result;
}

/**
 * Call DrChrono with the stored token.
 *
 * `/users/current` is the cheapest authenticated read DrChrono offers and has no
 * side effects, which matters because an operator getting a connection working
 * will press Test repeatedly.
 * @param props - The decrypted credential set.
 * @param props.config - Non-secret configuration.
 * @param props.secrets - Decrypted secrets.
 * @returns The outcome.
 */
async function testDrChrono(props: {
  config: Record<string, string>;
  secrets: Record<string, string>;
}): Promise<TestResult> {
  const apiUrl = (props.config.apiUrl ?? DRCHRONO_API_URL).replace(/\/$/, '');
  const accessToken = props.secrets.accessToken;
  if (!accessToken) {
    return {
      ok: false,
      reason: 'missing-credentials',
      detail: props.secrets.refreshToken
        ? 'A DrChrono refreshToken is stored but no accessToken: complete the OAuth exchange first'
        : 'No DrChrono accessToken stored',
    };
  }

  const res = await fetch(`${apiUrl}/users/current`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (res.ok) {
    const body = (await res.json()) as { id?: number; username?: string; doctor?: number };
    return {
      ok: true,
      reason: 'ok',
      detail: `Authenticated as DrChrono user ${body.username ?? body.id ?? 'unknown'} (doctor ${body.doctor ?? 'n/a'})`,
    };
  }

  // Deliberately no automatic refresh_token exchange here. DrChrono rotates the
  // refresh token on every use, so a "test" that silently spent it would
  // invalidate the copy the operator is still holding in their setup notes, and
  // turn a diagnostic into a destructive action. Refreshing belongs on the sync
  // path, which persists the new pair.
  return {
    ok: false,
    reason: `http-${res.status}`,
    detail: `DrChrono /users/current returned ${res.status}: ${(await res.text()).slice(0, 200)}`,
  };
}

/**
 * Exchange the stored ZUS client credentials for a token.
 * @param props - The decrypted credential set.
 * @param props.config - Non-secret configuration.
 * @param props.secrets - Decrypted secrets.
 * @returns The outcome.
 */
async function testZus(props: {
  config: Record<string, string>;
  secrets: Record<string, string>;
}): Promise<TestResult> {
  const apiUrl = (props.config.apiUrl ?? ZUS_API_URL).replace(/\/$/, '');

  if (props.config.authMode === 'access_token') {
    const accessToken = props.secrets.accessToken;
    if (!accessToken) {
      return { ok: false, reason: 'missing-credentials', detail: 'authMode is access_token but no accessToken stored' };
    }
    const res = await fetch(`${apiUrl}/Patient?_count=1`, { headers: { Authorization: `Bearer ${accessToken}` } });
    return res.ok
      ? { ok: true, reason: 'ok', detail: 'ZUS accepted the stored access token' }
      : {
          ok: false,
          reason: `http-${res.status}`,
          detail: `ZUS returned ${res.status}: ${(await res.text()).slice(0, 200)}`,
        };
  }

  const clientId = props.secrets.clientId;
  const clientSecret = props.secrets.clientSecret;
  if (!clientId || !clientSecret) {
    return { ok: false, reason: 'missing-credentials', detail: 'ZUS clientId and clientSecret are both required' };
  }

  // lyfe-provider-ui stores authUrl inconsistently: sometimes the bare host,
  // sometimes with /oauth/token already appended. Accept either rather than
  // producing .../oauth/token/oauth/token.
  const base = (props.config.authUrl ?? ZUS_AUTH_URL).replace(/\/$/, '');
  const tokenUrl = base.endsWith('/oauth/token') ? base : `${base}/oauth/token`;

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      // The OAuth audience is the API base without the FHIR path.
      audience: apiUrl.replace(/\/fhir$/, ''),
      grant_type: 'client_credentials',
    }),
  });

  if (!res.ok) {
    return {
      ok: false,
      reason: `http-${res.status}`,
      detail: `ZUS token endpoint returned ${res.status}: ${(await res.text()).slice(0, 200)}`,
    };
  }

  const body = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) {
    return { ok: false, reason: 'no-token', detail: 'ZUS token endpoint returned 200 with no access_token' };
  }
  return { ok: true, reason: 'ok', detail: `ZUS issued a token valid for ${body.expires_in ?? 'unknown'}s` };
}
