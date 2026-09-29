// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * The onboarding flow's data access, kept in one place deliberately.
 *
 * DrChrono cannot be called from the browser — the token would ship in client JS
 * and DrChrono sends no CORS headers for a localhost origin. Today these calls
 * go to a dev-only Vite middleware (`dev/lyfe-onboarding-dev-api.ts`).
 *
 * The production implementation is a Medplum Bot invoked with
 * `medplum.executeBot(botId, { action, ... })`. That is blocked until
 * `Project.features` on the self-hosted server includes `bots`, which needs
 * super-admin. When it lands, only the two fetch calls below change — the UI
 * already speaks in these types and knows nothing about the transport.
 */

export interface DrChronoPatientSummary {
  readonly id: number;
  readonly firstName?: string;
  readonly lastName?: string;
  readonly dateOfBirth?: string;
  readonly gender?: string;
  readonly chartId?: string;
  readonly email?: string;
  readonly cellPhone?: string;
}

const DEV_API = '/__lyfe/drchrono';

/**
 * Search DrChrono for candidates to import. DrChrono has no free-text patient
 * endpoint, so the server fans the term out across last name, first name and
 * chart id and merges the results.
 * @param query - The text typed by the user; fewer than two characters returns nothing.
 * @param signal - Abort signal so a superseded keystroke cancels its in-flight request.
 * @returns The matching DrChrono patients.
 */
export async function searchDrChronoPatients(query: string, signal?: AbortSignal): Promise<DrChronoPatientSummary[]> {
  const res = await fetch(`${DEV_API}/search?q=${encodeURIComponent(query)}`, { signal });
  const body = (await res.json()) as { results?: DrChronoPatientSummary[]; error?: string };
  if (!res.ok) {
    throw new Error(body.error ?? `Search failed (${res.status})`);
  }
  return body.results ?? [];
}

/**
 * Display name for a DrChrono record, falling back to the chart id.
 * @param patient - The DrChrono patient summary to label.
 * @returns A human-readable name, falling back to chart id then patient id.
 */
export function formatDrChronoName(patient: DrChronoPatientSummary): string {
  const name = [patient.firstName, patient.lastName].filter(Boolean).join(' ').trim();
  return name || patient.chartId || `Patient ${patient.id}`;
}

export interface BulkImportCandidate extends DrChronoPatientSummary {
  /** How many appointments this patient had in the selected window. */
  readonly appointments: number;
}

export interface BulkImportPreview {
  /** Appointments examined, before cancelled/rescheduled/no-show were dropped. */
  readonly scannedAppointments: number;
  readonly candidates: BulkImportCandidate[];
}

/**
 * Every distinct patient with an appointment in a date range.
 *
 * This is the "import everyone on Tuesday's schedule" flow. Cancelled,
 * rescheduled and no-show appointments are excluded server-side, since those
 * never produced a visit worth pulling a chart for.
 * @param start - First appointment date, as YYYY-MM-DD.
 * @param end - Last appointment date; defaults to `start` when omitted.
 * @param signal - Abort signal so a superseded preview cancels its request.
 * @returns The candidates and how many appointments were scanned.
 */
export async function previewBulkImport(
  start: string,
  end: string | undefined,
  signal?: AbortSignal
): Promise<BulkImportPreview> {
  const params = new URLSearchParams({ start });
  if (end) {
    params.set('end', end);
  }
  const res = await fetch(`${DEV_API}/appointments?${params.toString()}`, { signal });
  const body = (await res.json()) as {
    scannedAppointments?: number;
    results?: BulkImportCandidate[];
    error?: string;
  };
  if (!res.ok) {
    throw new Error(body.error ?? `Preview failed (${res.status})`);
  }
  return {
    scannedAppointments: body.scannedAppointments ?? 0,
    candidates: body.results ?? [],
  };
}

/** Identifier system DrChrono patients are stamped with when imported. */
export const DRCHRONO_IDENTIFIER_SYSTEM = 'https://drchrono.com/patients';
