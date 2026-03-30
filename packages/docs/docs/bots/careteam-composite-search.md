---
sidebar_position: 9
---

# CareTeam Composite Search

FHIR R4 has `participant` and `participant-role` search parameters on `CareTeam`, but they're independent. If you search for `participant=Practitioner/smith&participant-role=case-manager`, you get back any CareTeam where Smith is _some_ participant and _someone_ has the case-manager role. They don't have to be the same person.

There's no way to say "Smith must be the case manager" in a single FHIR query. This bot solves that with server-side narrowing followed by in-memory composite filtering.

## The Problem

Consider a CareTeam with two participants:

| Member         | Role         |
| -------------- | ------------ |
| Dr. Smith      | physician    |
| Jane Rodriguez | case-manager |

A FHIR search for `participant=Practitioner/smith&participant-role=case-manager` will match this CareTeam — even though Smith is the physician, not the case manager. The search params match independently across different `participant[]` entries.

This is a known limitation of FHIR R4 search on [BackboneElement](https://www.hl7.org/fhir/backboneelement.html) arrays. The spec doesn't support composite constraints across fields within the same array entry.

## How It Works

The bot uses a two-phase approach:

1. **Server-side narrowing** — Search `Practitioner` by name, then search `CareTeam` by those practitioner references and status. This reduces the working set using standard FHIR search.
2. **In-memory composite filter** — Iterate through the candidate CareTeams and keep only those where the **same** `participant[]` entry has both the matching `member` reference and the matching `role` code.

```
Practitioner?name:contains={name}
  → CareTeam?participant={refs}&status={status}
    → filter: same participant[] has member AND role
      → Patient?_id={unique patient ids}
```

This pattern — server-side narrow, client-side composite filter — works for any FHIR BackboneElement array where you need to match multiple fields on the same entry.

## Input

POST JSON to `Bot/{id}/$execute`:

| Parameter     | Required | Description                                                                 |
| ------------- | -------- | --------------------------------------------------------------------------- |
| `role`        | Yes      | Role code to match, case-insensitive (e.g. `case-manager`, `physician`)     |
| `member-name` | Yes      | Practitioner name substring                                                 |
| `role-system` | No       | Coding system URI to scope the role match (e.g. `http://snomed.info/sct`)   |
| `status`      | No       | CareTeam status filter, defaults to `active`                                |

## Output

The bot returns a FHIR `Bundle` with type `searchset`:

- **Patients** are returned with `search.mode = "match"`
- **CareTeams** are returned with `search.mode = "include"`
- `total` reflects the patient count only
- Missing required parameters throw an `OperationOutcomeError`

## Usage

```bash
# Find patients where "smith" is a case manager
npx medplum post 'Bot/{bot-id}/$execute' \
  '{"role":"case-manager","member-name":"smith"}'

# Same thing, scoped to SNOMED roles only
npx medplum post 'Bot/{bot-id}/$execute' \
  '{"role":"case-manager","member-name":"smith","role-system":"http://snomed.info/sct"}'

# Search proposed CareTeams instead of active
npx medplum post 'Bot/{bot-id}/$execute' \
  '{"role":"case-manager","member-name":"smith","status":"proposed"}'
```

## Sample Data

A FHIR transaction Bundle is included at [`examples/medplum-demo-bots/data/careteam-search-sample.json`](https://github.com/medplum/medplum/blob/main/examples/medplum-demo-bots/data/careteam-search-sample.json). Load it into your Medplum project to try the bot:

```bash
npx medplum post '' "$(cat data/careteam-search-sample.json)"
```

This creates 3 Practitioners, 3 Patients, and 4 CareTeams with different participant/role combinations.

## Beyond CareTeam

The same server-narrow + client-filter pattern applies anywhere FHIR search can't do a composite match on a BackboneElement array:

- `CareTeam.participant[]` — member + role _(this bot)_
- `Claim.item[]` — productOrService + quantity
- `Observation.component[]` — code + value
- `AllergyIntolerance.reaction[]` — substance + manifestation

## Limitations

- Practitioner search is capped at 100 results
- CareTeam and Patient fetches are capped at 1000 (no cursor-based pagination yet)
- Only resolves `Patient/` subjects — `Group/` references are skipped
- Role matching uses `code` (and optionally `system`), not `display`
