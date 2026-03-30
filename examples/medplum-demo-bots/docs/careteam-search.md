# CareTeam Composite Search

FHIR R4 has `participant` and `participant-role` search params on CareTeam, but they match independently. Searching `participant=Practitioner/smith&participant-role=case-manager` returns any CareTeam where Smith is *some* participant and *someone* has the case-manager role — they don't have to be the same person.

There's no way to express "Smith is the case manager" in a single FHIR query. This bot handles that.

## How it works

The bot searches `Practitioner` by name, pulls all CareTeams that reference those practitioners, then filters in-memory — keeping a CareTeam only when the **same** `participant[]` entry has both the matching member and the matching role.

```
Practitioner?name:contains={name}
  → CareTeam?participant={refs}&status={status}
    → filter: same participant[] has member AND role
      → Patient?_id={unique patient ids}
```

The server-side search narrows the set. The in-memory filter applies the constraint FHIR can't express.

## Input

POST JSON to `Bot/{id}/$execute`:

- **`role`** (required) — role code, case-insensitive. e.g. `case-manager`, `physician`
- **`member-name`** (required) — practitioner name substring
- **`role-system`** (optional) — coding system URI to scope the role match, e.g. `http://snomed.info/sct`. Omit to match any system.
- **`status`** (optional, default `active`) — CareTeam status to filter on

## Output

Returns a FHIR searchset Bundle. Patients come back as `search.mode = "match"`, CareTeams as `search.mode = "include"`. `total` is the patient count. Bad input throws `OperationOutcomeError`.

## Examples

```bash
# patients where "smith" is a case manager
npx medplum post 'Bot/{bot-id}/$execute' \
  '{"role":"case-manager","member-name":"smith"}'

# scoped to SNOMED roles
npx medplum post 'Bot/{bot-id}/$execute' \
  '{"role":"case-manager","member-name":"smith","role-system":"http://snomed.info/sct"}'

# search proposed CareTeams instead of active
npx medplum post 'Bot/{bot-id}/$execute' \
  '{"role":"case-manager","member-name":"smith","status":"proposed"}'
```

## Sample data

A transaction Bundle at [`data/careteam-search-sample.json`](../data/careteam-search-sample.json) creates 3 Practitioners, 3 Patients, and 4 CareTeams with different participant/role combos. Load it with:

```bash
npx medplum post '' "$(cat data/careteam-search-sample.json)"
```

## Good to know

- Practitioner search caps at 100 results
- CareTeam and Patient fetches cap at 1000, no pagination beyond that
- Only resolves `Patient/` subjects, skips `Group/`
- Role match is on `code` (and optionally `system`), not `display`
- Every search phase logs to `console.log` for debugging in bot logs
