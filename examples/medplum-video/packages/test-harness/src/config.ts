// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * Runtime configuration for the test harness.
 *
 * Resolution order (first non-empty wins):
 *   1. window.__MEDPLUM_VIDEO_CONFIG__   – injected by /config.js in Docker/prod
 *   2. import.meta.env.VITE_*            – baked in by Vite at build time (dev)
 *
 * This indirection lets us publish a single Docker image and configure it
 * at container startup via ECS task env vars instead of rebuilding per env.
 */

export interface RuntimeConfig {
  /** Full Medplum server URL (trailing slash). */
  readonly medplumBaseUrl: string;
  /** Client credentials for patient auto-auth. */
  readonly medplumClientId: string;
  readonly medplumClientSecret: string;
  /** Deployed bot IDs on the target Medplum project. */
  readonly generateTokenBotId: string;
  readonly admitPatientBotId: string;
  readonly startAdHocVisitBotId: string;
  /** Optional seed values – populate the Patient/Practitioner dropdowns on first load. */
  readonly defaultPatientId?: string;
  readonly defaultPractitionerId?: string;
  /** Human-readable environment label shown in the header ("dev", "staging", etc.). */
  readonly environmentLabel?: string;
}

type MaybeConfig = Partial<Record<keyof RuntimeConfig, string>>;

function readRuntimeConfig(): MaybeConfig {
  const win = globalThis as unknown as { __MEDPLUM_VIDEO_CONFIG__?: MaybeConfig };
  return win.__MEDPLUM_VIDEO_CONFIG__ ?? {};
}

function env(key: string): string | undefined {
  const value = (import.meta.env as Record<string, string | undefined>)[key];
  return value && value.length > 0 ? value : undefined;
}

function pick(runtimeKey: keyof RuntimeConfig, envKey: string, fallback = ''): string {
  const runtime = readRuntimeConfig()[runtimeKey];
  if (runtime && runtime.length > 0) {
    return runtime;
  }
  return env(envKey) ?? fallback;
}

/**
 * Resolve the effective runtime config.  Cached per module load – the window
 * object is only read once on startup so mutations are ignored.
 */
export const config: RuntimeConfig = {
  medplumBaseUrl: pick('medplumBaseUrl', 'VITE_MEDPLUM_BASE_URL', 'http://localhost:8103/'),
  medplumClientId: pick('medplumClientId', 'VITE_MEDPLUM_CLIENT_ID'),
  medplumClientSecret: pick('medplumClientSecret', 'VITE_MEDPLUM_CLIENT_SECRET'),
  generateTokenBotId: pick('generateTokenBotId', 'VITE_GENERATE_TOKEN_BOT_ID'),
  admitPatientBotId: pick('admitPatientBotId', 'VITE_ADMIT_PATIENT_BOT_ID'),
  startAdHocVisitBotId: pick('startAdHocVisitBotId', 'VITE_START_ADHOC_VISIT_BOT_ID'),
  defaultPatientId: pick('defaultPatientId', 'VITE_TEST_PATIENT_ID') || undefined,
  defaultPractitionerId: pick('defaultPractitionerId', 'VITE_TEST_PRACTITIONER_ID') || undefined,
  environmentLabel: pick('environmentLabel', 'VITE_ENVIRONMENT_LABEL') || undefined,
};

/**
 * Resolve the effective Medplum base URL at runtime.
 *
 * If we're pointed at localhost but the page is being served from a remote
 * host (e.g. a phone on the LAN hitting the Vite dev server), fall through
 * to the Vite proxy at /medplum-api/.  Otherwise use the configured URL
 * as-is – required for hosted deployments pointing at https://api.*
 */
export function resolveMedplumBaseUrl(): string {
  const baseUrl = config.medplumBaseUrl;
  if (typeof globalThis.location === 'undefined') {
    return baseUrl;
  }

  const isLocalhostUrl = /^https?:\/\/(localhost|127\.0\.0\.1)/i.test(baseUrl);
  const servedFromLocalhost =
    globalThis.location.hostname === 'localhost' || globalThis.location.hostname === '127.0.0.1';

  if (isLocalhostUrl && !servedFromLocalhost) {
    return `${globalThis.location.protocol}//${globalThis.location.host}/medplum-api/`;
  }
  return baseUrl;
}
