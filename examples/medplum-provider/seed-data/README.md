# Scheduling demo — local setup & seed data

Seed data and setup notes for the three scheduling screens on this branch
(`everett/scheduling-demo`): Find & Book, Calendar & Availability, and
Configuration. Originally developed running entirely against a local
Medplum server (no hosted project). This README predates the Calendar &
Availability and Configuration screens — see the planning history for
their own design notes if you have access to it.

## One-time local infra setup

Docker wasn't available on this machine, so Postgres 16 + Redis were
installed via Homebrew instead of `docker-compose`:

```bash
brew install postgresql@16 redis
brew services start postgresql@16
brew services start redis
psql -d postgres -c "CREATE ROLE medplum LOGIN PASSWORD 'medplum' SUPERUSER;"
createdb -O medplum medplum
redis-cli config set requirepass medplum   # matches packages/server/medplum.config.json
```

`packages/server/medplum-local-demo.config.json` (untracked, local-only)
sets `recaptchaSecretKey: ""` so `/auth/newuser` works without a real
reCAPTCHA token in local dev.

## Start the server

```bash
cd packages/server
npx tsx src/index.ts file:medplum.config.json,file:medplum-local-demo.config.json
```

First boot runs ~110 schema migrations and seeds the base project — takes
about a minute. Health check: `curl http://localhost:8103/healthcheck`.

## Register a demo project (one time)

```bash
curl -X POST http://localhost:8103/auth/newuser -H 'Content-Type: application/json' \
  -d '{"firstName":"Everett","lastName":"Demo","email":"everett@scheduling-demo.local","password":"medplum123"}'
# -> {"login": "<login-id>"}
curl -X POST http://localhost:8103/auth/newproject -H 'Content-Type: application/json' \
  -d '{"login":"<login-id>","projectName":"Scheduling Demo"}'
```

## Seed the demo data

Idempotent — safe to re-run any time. Practice timezone is
America/Los_Angeles (PST/PDT).

```bash
cd examples/medplum-provider   # so @medplum/core resolves via the workspace
MEDPLUM_BASE_URL=http://localhost:8103/ \
MEDPLUM_EMAIL=everett@scheduling-demo.local \
MEDPLUM_PASSWORD=medplum123 \
  npx tsx seed-data/seed.ts
```

Creates **two visit types** on the same shared providers/rooms (realistic —
providers do both):
- **Cystoscopy (Urology Procedure)** — Practitioner + Room + Device, 30 min,
  10/10 min buffer.
- **Urology Consult (Follow-up)** — Practitioner + Room only, no Device,
  20 min, 5/5 min buffer. Exercises a visit type with a different resource
  shape and different scheduling parameters.

Plus: 2 Practitioners, 1 facility + 2 room Locations, 1 Device, 5 Patients
(2 with a seeded "preferred provider" note).

**Occupancy** is dense and deterministic — a real busy urology clinic, not
"everyone always free": for each of the 5 actors (2 providers, 2 rooms, 1
device) over the next 10 business days **starting tomorrow** (`minDaysOut:
1` — not 2; occupancy needs to be visible immediately, not just once you
page the date range forward), each 8am-5pm day is split into six 90-minute
quarters, and a deterministic hash of (actor, day, quarter) decides whether
that quarter is booked (~50-70% depending on the actor — Dr. Chen busier
than Dr. Reyes, so the load-balancing half of the Recommended heuristic has
real signal). "Deterministic" matters here, not just "random": re-running
the seed script must produce the *exact same* occupancy every time, or it
wouldn't stay idempotent. This produces ~180
bookings. On top of that, 3 **holds** (Slot only, no Appointment/patient —
distinct from a real booking): Dr. Chen out of office for a full day, Room
A blocked for maintenance one morning, the Device down for calibration one
afternoon.

## UI: month calendar

A small month calendar sits next to the criteria panel — highlights days
with at least one available combo (computed from the already-fetched slot
results, no separate query), click a day to narrow the search to just that
day, "View whole month" to expand back out. It doesn't replace the date
range inputs; it's driven by them — typing a far-future start date jumps
the calendar there, and the calendar's own prev/next arrows update the date
range inputs in turn. One source of truth for what's actually searched.

## Run the app

```bash
cd examples/medplum-provider
npx vite   # http://localhost:3001
```

Log in with the demo user above (make sure `examples/medplum-provider/.env`
has `MEDPLUM_BASE_URL=http://localhost:8103/` — it defaults to production
`api.medplum.com` otherwise, which causes "user not found"). Open **Find &
Book** in the nav, pick a visit type.

## Verification scripts (already run, all passing)

- `verify.mjs` — end-to-end: pool resolution, combo `$find` (including the
  Device actor), busy-combo exclusion, `$book`, re-search exclusion,
  Encounter creation with Location+Device participants present.
- `verify-concurrency.mjs` — two simultaneous `$book` calls for the same
  slot; confirms exactly one succeeds and the other gets a clean
  "not available" error.
- `verify-consult.mjs` — confirms the Consult visit type's `$find` returns
  its own 20-min duration and a 2-actor (no Device) participant list.
- `verify-density.mjs` — sanity-checks the dense occupancy model: runs
  `$find` across all 4 provider×room combos for both visit types and prints
  how many proposed times each combo has (some combos should come back
  empty, others should have real availability — not all-empty, not
  all-wide-open).

```bash
cd examples/medplum-provider
node seed-data/verify.mjs
node seed-data/verify-concurrency.mjs
node seed-data/verify-consult.mjs
node seed-data/verify-density.mjs
```

## Known simplifications / open items

- No browser automation tool was available in this environment, so the UI
  was verified via TypeScript compilation, Vite's on-demand module
  transform (catches syntax/JSX errors), and the full existing test suite
  (1227 tests) — not a live click-through. Worth a manual pass in a
  browser before any stakeholder walkthrough.
- **Stale note:** the "Recommended combo" heuristic and preferred-provider
  scoring described above were removed in a later round of Find & Book
  (the criteria panel's "Patient (optional)" field and the seeded
  `preferredProviderRef` patient extension are still present in `seed.ts`
  but are now inert/unused — see the Calendar & Availability implementation
  notes if this surfaces again).
- Recaptcha is disabled only via the local override config; do not carry
  `medplum-local-demo.config.json` into any shared/hosted environment.
- `patch-servicetype.ts` is a one-off migration for a pre-existing seeded
  DB: back-fills `serviceType` onto already-created Appointments that
  predate `seed.ts` setting it (needed for Calendar's reschedule handoff to
  resolve the right visit type). Not needed on a fresh DB — `seed.ts` sets
  `serviceType` on creation there.
