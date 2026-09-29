// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { BotEvent, MedplumClient } from '@medplum/core';

/**
 * Read-only DrChrono lookups for the Lyfe onboarding flow.
 *
 * This runs server-side because the DrChrono token must never reach client JS,
 * and DrChrono sends no CORS headers for a browser origin. It deliberately only
 * reads: nothing here writes to Medplum or to DrChrono, so it is safe to call
 * on every keystroke.
 *
 * Credentials come from Medplum project secrets, not environment variables —
 * bots have no process env of their own.
 */

interface SearchInput {
  action: 'search';
  query: string;
}

interface PreviewInput {
  action: 'preview';
  start: string;
  end?: string;
}

type Input = SearchInput | PreviewInput;

interface PatientSummary {
  id: number;
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  gender?: string;
  chartId?: string;
  email?: string;
  cellPhone?: string;
  appointments?: number;
}

interface DrChronoPatient {
  id: number;
  first_name?: string;
  last_name?: string;
  date_of_birth?: string;
  gender?: string;
  chart_id?: string;
  email?: string;
  cell_phone?: string;
}

interface DrChronoAppointment {
  patient?: number;
  status?: string;
}

/** Appointments that never happened should not pull a chart in. */
const SKIP_STATUSES = new Set(['Cancelled', 'Rescheduled', 'No Show']);

/** DrChrono rejects a date_range over 190 days unless the whole range is past. */
const CHUNK_DAYS = 180;
const DAY_MS = 86400000;

/**
 * Entry point.
 * @param medplum - The Medplum client, unused: this bot only reads DrChrono.
 * @param event - Carries the action and its arguments, plus project secrets.
 * @returns Matching patients, shaped for the onboarding UI.
 */
export async function handler(medplum: MedplumClient, event: BotEvent<Input>): Promise<unknown> {
  const token = event.secrets['DRCHRONO_ACCESS_TOKEN']?.valueString;
  const apiUrl = event.secrets['DRCHRONO_API_URL']?.valueString ?? 'https://app.drchrono.com/api';
  if (!token) {
    throw new Error('DRCHRONO_ACCESS_TOKEN is not set in project secrets');
  }

  const get = async (path: string): Promise<Response> =>
    fetch(path.startsWith('http') ? path : `${apiUrl}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

  const input = event.input;

  if (input.action === 'search') {
    return { results: await searchPatients(get, input.query) };
  }

  if (input.action === 'preview') {
    return previewAppointments(get, input.start, input.end ?? input.start);
  }

  throw new Error(`Unknown action: ${JSON.stringify((input as { action?: string }).action)}`);
}

/**
 * DrChrono has no free-text patient endpoint, so fan the term across the fields
 * a receptionist would type and merge by patient id.
 * @param get - Authenticated fetch helper.
 * @param query - The search text.
 * @returns Distinct matching patients.
 */
async function searchPatients(get: (path: string) => Promise<Response>, query: string): Promise<PatientSummary[]> {
  const trimmed = (query ?? '').trim();
  if (trimmed.length < 2) {
    return [];
  }

  const merged = new Map<number, DrChronoPatient>();
  for (const field of ['last_name', 'first_name', 'chart_id']) {
    const res = await get(`/patients?${field}=${encodeURIComponent(trimmed)}`);
    if (!res.ok) {
      continue;
    }
    const body = (await res.json()) as { results?: DrChronoPatient[] };
    for (const p of body.results ?? []) {
      merged.set(p.id, p);
    }
  }
  return [...merged.values()].map(toSummary);
}

/**
 * Every distinct patient with a real appointment in a date range.
 * @param get - Authenticated fetch helper.
 * @param start - First appointment date, YYYY-MM-DD.
 * @param end - Last appointment date, YYYY-MM-DD.
 * @returns The candidates and how many appointments were examined.
 */
async function previewAppointments(
  get: (path: string) => Promise<Response>,
  start: string,
  end: string
): Promise<{ scannedAppointments: number; results: PatientSummary[] }> {
  const iso = (d: Date): string => d.toISOString().slice(0, 10);
  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);

  const counts = new Map<number, number>();
  let scanned = 0;

  for (let from = startDate; from <= endDate; from = new Date(from.getTime() + CHUNK_DAYS * DAY_MS)) {
    const to = new Date(Math.min(from.getTime() + (CHUNK_DAYS - 1) * DAY_MS, endDate.getTime()));
    let next: string | null = `/appointments?date_range=${iso(from)}/${iso(to)}&verbose=true`;

    while (next) {
      const res: Response = await get(next);
      if (!res.ok) {
        throw new Error(`DrChrono appointments ${res.status}: ${(await res.text()).slice(0, 200)}`);
      }
      const body = (await res.json()) as { results?: DrChronoAppointment[]; next?: string | null };
      for (const appt of body.results ?? []) {
        scanned++;
        if (SKIP_STATUSES.has(appt.status ?? '') || typeof appt.patient !== 'number') {
          continue;
        }
        counts.set(appt.patient, (counts.get(appt.patient) ?? 0) + 1);
      }
      next = body.next ?? null;
    }
  }

  // Names are not on the appointment payload, so resolve them in parallel.
  const results = await Promise.all(
    [...counts.keys()].map(async (id) => {
      const res = await get(`/patients/${id}`);
      const p = res.ok ? ((await res.json()) as DrChronoPatient) : ({ id } as DrChronoPatient);
      return { ...toSummary(p), appointments: counts.get(id) ?? 0 };
    })
  );

  return { scannedAppointments: scanned, results };
}

/**
 * Map DrChrono's snake_case payload onto the shape the UI consumes.
 * @param p - A DrChrono patient record.
 * @returns The UI-facing summary.
 */
function toSummary(p: DrChronoPatient): PatientSummary {
  return {
    id: p.id,
    firstName: p.first_name,
    lastName: p.last_name,
    dateOfBirth: p.date_of_birth,
    gender: p.gender,
    chartId: p.chart_id,
    email: p.email,
    cellPhone: p.cell_phone,
  };
}
