// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Plugin } from 'vite';
import { loadEnv } from 'vite';

/**
 * Dev-only server seam for the Lyfe onboarding flow.
 *
 * The onboarding UI needs to search DrChrono and kick off an import. Neither can
 * happen in the browser: the DrChrono token must never reach client JS, and
 * DrChrono sends no CORS headers for a localhost origin.
 *
 * The production home for this is a Medplum Bot, which runs server-side and
 * reads its credentials from Project secrets. That is blocked right now because
 * `Project.features` on the self-hosted server does not include `bots`, and
 * turning it on requires super-admin. Until it does, these routes stand in so the
 * UI can be built and exercised against real DrChrono data.
 *
 * The swap is contained: `src/services/onboarding.ts` is the only caller, and
 * only its two fetch calls change when the Bot exists.
 *
 * This plugin is registered by vite.config.ts and runs ONLY under `vite dev`.
 * It is never part of a production build.
 * @returns The Vite plugin.
 */
/** The fields of a DrChrono appointment the bulk preview actually reads. */
interface DrChronoAppointment {
  patient?: number;
  status?: string;
  scheduled_time?: string;
}

export function lyfeOnboardingDevApi(): Plugin {
  // Vite exposes .env to client code through import.meta.env, but never loads it
  // into process.env for plugin/server code — so the token has to be read
  // explicitly. The empty prefix loads every key, not just MEDPLUM_/GOOGLE_.
  let env: Record<string, string> = {};

  return {
    name: 'lyfe-onboarding-dev-api',
    apply: 'serve',
    configResolved(config) {
      env = loadEnv(config.mode, config.envDir || process.cwd(), '');
    },
    configureServer(server) {
      // Bulk import preview: every distinct patient with an appointment in a date
      // range. Mirrors the Lyfe onboarding flow, where a clinic imports "everyone
      // on Tuesday's schedule" rather than searching one name at a time.
      server.middlewares.use('/__lyfe/drchrono/appointments', async (req, res) => {
        const send = (status: number, body: unknown): void => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(body));
        };

        try {
          const url = new URL(req.url ?? '', 'http://localhost');
          const start = url.searchParams.get('start');
          const end = url.searchParams.get('end') || start;
          if (!start || !end) {
            send(400, { error: 'start (and optionally end) are required' });
            return;
          }

          const token = env.DRCHRONO_ACCESS_TOKEN;
          const apiUrl = env.DRCHRONO_API_URL || 'https://app.drchrono.com/api';
          if (!token) {
            send(500, { error: 'DRCHRONO_ACCESS_TOKEN is not set in .env' });
            return;
          }

          // Appointments that never happened should not pull a chart in.
          const SKIP_STATUSES = new Set(['Cancelled', 'Rescheduled', 'No Show']);

          // DrChrono rejects a date_range longer than 190 days unless the whole
          // range is already past, so walk it in 180-day windows regardless.
          const DAY_MS = 86400000;
          const CHUNK_DAYS = 180;
          const iso = (d: Date): string => d.toISOString().slice(0, 10);
          const startDate = new Date(`${start}T00:00:00Z`);
          const endDate = new Date(`${end}T00:00:00Z`);

          const byPatient = new Map<number, { appointments: number; lastSeen?: string }>();
          let scanned = 0;

          for (let from = startDate; from <= endDate; from = new Date(from.getTime() + CHUNK_DAYS * DAY_MS)) {
            const to = new Date(Math.min(from.getTime() + (CHUNK_DAYS - 1) * DAY_MS, endDate.getTime()));
            let next: string | null = `${apiUrl}/appointments?date_range=${iso(from)}/${iso(to)}&verbose=true`;

            while (next) {
              const r: Response = await fetch(next, { headers: { Authorization: `Bearer ${token}` } });
              if (!r.ok) {
                send(r.status, { error: `DrChrono appointments ${r.status}: ${(await r.text()).slice(0, 200)}` });
                return;
              }
              const body = (await r.json()) as { results?: DrChronoAppointment[]; next?: string | null };
              for (const appt of body.results ?? []) {
                scanned++;
                if (SKIP_STATUSES.has(appt.status ?? '')) {
                  continue;
                }
                const pid = appt.patient;
                if (typeof pid !== 'number') {
                  continue;
                }
                const entry = byPatient.get(pid) ?? { appointments: 0 };
                entry.appointments++;
                entry.lastSeen = appt.scheduled_time ?? entry.lastSeen;
                byPatient.set(pid, entry);
              }
              next = body.next ?? null;
            }
          }

          // Names are not on the appointment payload, so resolve them in parallel.
          const ids = [...byPatient.keys()];
          const patients = await Promise.all(
            ids.map(async (id) => {
              const r = await fetch(`${apiUrl}/patients/${id}`, { headers: { Authorization: `Bearer ${token}` } });
              const p = r.ok ? ((await r.json()) as Record<string, unknown>) : {};
              return {
                id,
                firstName: p.first_name,
                lastName: p.last_name,
                dateOfBirth: p.date_of_birth,
                gender: p.gender,
                chartId: p.chart_id,
                email: p.email,
                cellPhone: p.cell_phone,
                appointments: byPatient.get(id)?.appointments ?? 0,
              };
            })
          );

          send(200, { scannedAppointments: scanned, results: patients });
        } catch (err) {
          send(500, { error: err instanceof Error ? err.message : String(err) });
        }
      });

      server.middlewares.use('/__lyfe/drchrono/search', async (req, res) => {
        const send = (status: number, body: unknown): void => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(body));
        };

        try {
          const url = new URL(req.url ?? '', 'http://localhost');
          const query = (url.searchParams.get('q') ?? '').trim();
          if (query.length < 2) {
            send(200, { results: [] });
            return;
          }

          const token = env.DRCHRONO_ACCESS_TOKEN;
          const apiUrl = env.DRCHRONO_API_URL || 'https://app.drchrono.com/api';
          if (!token) {
            send(500, { error: 'DRCHRONO_ACCESS_TOKEN is not set in .env' });
            return;
          }

          // DrChrono has no free-text patient search, so fan out across the
          // fields a receptionist would actually type and merge by patient id.
          const params = ['last_name', 'first_name', 'chart_id'];
          const merged = new Map<number, Record<string, unknown>>();

          for (const field of params) {
            const r = await fetch(`${apiUrl}/patients?${field}=${encodeURIComponent(query)}`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (!r.ok) {
              continue;
            }
            const body = (await r.json()) as { results?: Record<string, unknown>[] };
            for (const p of body.results ?? []) {
              merged.set(p.id as number, p);
            }
          }

          send(200, {
            results: [...merged.values()].map((p) => ({
              id: p.id,
              firstName: p.first_name,
              lastName: p.last_name,
              dateOfBirth: p.date_of_birth,
              gender: p.gender,
              chartId: p.chart_id,
              email: p.email,
              cellPhone: p.cell_phone,
            })),
          });
        } catch (err) {
          send(500, { error: err instanceof Error ? err.message : String(err) });
        }
      });
    },
  };
}
