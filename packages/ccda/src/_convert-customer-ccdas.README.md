# Practice Fusion CCDA → Medplum migration script — code review handoff

**Script:** `packages/ccda/src/_convert-customer-ccdas.ts` (untracked scratch, not for merge)
**Companion validator:** `packages/ccda/src/_validate-output.ts`
**Run:** `npx vite-node packages/ccda/src/_convert-customer-ccdas.ts --config packages/ccda/vite.config.ts`

## Purpose

Converts a folder of Practice Fusion CCDA XML exports (11 patients, "The Healing Hut" clinic) into
FHIR R4 batch bundles and optionally seeds them into a customer Medplum project. Built to be reused
for other clinics' Practice Fusion migrations via CLI flags. It wraps `@medplum/ccda`'s
`convertCcdaToFhir` — which had never been used in production — and works around a series of
converter bugs at the script level (converter itself deliberately untouched).

## CLI / config

- `--input <dir>` CCDA XML folder (default: `~/Desktop/freed/Healing Hut/CCDAs`)
- `--output <dir>` bundle output (default: `<input>/fhir-output`)
- `--tag <code>` batch tag code (default: slug of input's parent dir, e.g. `healing-hut`)
- `--org-id <uuid>` the project's existing Organization id; all org references point directly at it
  (default hardcoded: `f83ec96d-3dbc-406d-82f0-33b127c956fc`)
- `--seed` after generating, execute batch bundles as **async batches** (`Prefer: respond-async`,
  docs/fhir-datastore/processing-async-bundles): entries run in a background job and do not
  consume the per-user FHIR interaction quota — the first live run used synchronous
  `executeBatch` and 429'd after ~240 entries (~50k quota points/min exhausted). Jobs submitted
  sequentially (each completes before the next chunk), status polled every 2s, batch-response
  Bundle downloaded from the job's results Binary. Credentials: `SEED_BASE_URL` /
  `SEED_CLIENT_ID` / `SEED_CLIENT_SECRET` constants in the script, falling back to env
  `MEDPLUM_BASE_URL` / `MEDPLUM_CLIENT_ID` / `MEDPLUM_CLIENT_SECRET` (ClientApplication in
  target project). Per-entry failures reported; all writes idempotent so re-run is safe.
  After a fully successful seed, runs `Patient/$set-accounts` (accounts=[`Organization/<ORG_ID>`],
  propagate=true, async) on every imported patient so org-restricted access policies can see the
  imported compartment resources. **The ClientApplication membership must be a project admin** —
  `$set-accounts` is admin-only (server set-accounts.ts `isProjectAdmin` check). Diff-based and
  idempotent; Practitioners are not in the patient compartment and are not stamped.
- `ORG_ID_OVERRIDES` / `PRACTITIONER_ID_OVERRIDES` in-file maps for pinning specific resources.

## Outputs per input file

- `<name>.fhir.json` — pretty-printed review bundle (resources only)
- `<name>.batch*.json` — compact batch bundles, chunked ≤800KB (server default `maxJsonSize` 1mb),
  entries ordered per docs/migration/migration-sequence (practitioner creates → Patient → Condition
  → MedicationRequest → AllergyIntolerance → Encounter → Observation → ServiceRequest → CarePlan →
  Composition last), each entry carrying its `request` (conditional `PUT Type?identifier=
  urn:ccda-import-id|<deterministic-id>` upsert with no body id, or POST + ifNoneExist for NPI
  practitioners). A file's stale chunks from previous runs are deleted before writing (chunk
  count can change between runs and --seed executes every *.batch* file present).

## Pipeline (per file, after a global pre-scan)

0. **Global pre-scan** (`collectGlobalNpiNames`): regex over ALL source XMLs; majority-vote a
   canonical HumanName per NPI. Needed because PF stamps the supervising provider's NPI on
   staff-recorded entries ('Tabitha Lewallen' entries carry Dr. Dandy's NPI), so within one file
   the wrong name can win.
1. Parse XML → CCDA (`convertXmlToCcda`), print a section inventory (flags sections the converter
   silently drops: Notes, Payers, Reason for Referral — none had entries in this batch).
2. **Strip negated entries** (`stripNegatedEntries`): converter ignores `negationInd="true"`, which
   turns "No Known X" placeholders into fake positive resources (verified: fake Immunization +
   Procedure per file). Handles top-level acts/substanceAdministrations/procedures/observations AND
   the nested NKA pattern (act → entryRelationship[SUBJ] → negated observation).
3. **Extract Planned Acts** (templateId 2.16.840.1.113883.10.20.22.4.39) from Assessment and Plan
   sections (2.…22.2.9, unhandled by converter — would throw) → mapped to **ServiceRequest**
   (348 historical lab orders; status forced `completed` per customer decision, intent from
   moodCode, requester = NPI conditional reference, local lab compendium codes).
4. **Strict-mode probe**: run converter with `ignoreUnsupportedSections: false` to prove nothing
   else unknown remains; then convert leniently.
5. **Content fixes** on converter output:
   - AllergyIntolerance.category is hardcoded `['food']` by the converter (ccda-to-fhir.ts
     processAllergyIntoleranceAct) → re-derived from the source allergy-type code (drug → medication
     etc.); uncoded allergens (nullFlavor UNK) recover `code.text` from the narrative table row.
   - ICD-9/ICD-10 OIDs → canonical `http://hl7.org/fhir/sid/icd-*-cm` system URIs.
   - MedicationRequest: sig text + uncoded medication names recovered from the meds narrative table
     (source `doseQuantity` is nullFlavor NI; `medication[x]` is required 1..1 and 33 meds were
     missing it — converter emits a contentless CodeableConcept, see check in `fixMedications`);
     `requester` set from source author NPI. **Self-reported meds** (no `supply` entryRelationship
     = never went through e-prescribing) → `intent: plan` + `reportedBoolean: true` (22 across
     batch; validated against supplements/informal names vs. e-prescribed).
   - Observations: valueless `valueQuantity` stripped (35 PDF-attachment lab results).
   - Patient contact cleanup: phones normalized to bare 10 digits (source `+1(xxx)xxx-xxxx`);
     PF's duplicate all-caps home address consolidated (case/whitespace/line-split-insensitive,
     better-cased copy kept). ed-weaver and katrina-kitchen keep 2 addresses — theirs differ
     textually (`E RIDGE DR` vs `East Ridge Dr`; `DIVIDE CRK` vs `Divide Creek`), not just by case.
6. **postProcess** (the bulk of the logic):
   - Drop nameless junk Practitioners (authoring-device artifacts; ed-weaver had 562 from
     author-less lab observations); strip references to them; `Composition.author` retargeted to
     the custodian Organization when the device was sole author.
   - Dedup by identity key (Practitioner: NPI, else full name; Patient: first identifier;
     Organization: name), canonical-name copy wins (see step 0), identifiers merged.
   - **Deterministic ids**: SHA-256 of identity key or `file:type:index` → re-runs byte-identical,
     upserts idempotent, cross-file dedup (Kimberly Rainey in 7 files → 1 resource). Each id
     travels as an `urn:ccda-import-id` identifier on the resource; the batch entry is a
     conditional update on it and internal references are conditional references by the same
     identifier (server ids end up server-generated).
   - Drop content-empty resources (converter emits `{resourceType, id}` Organizations); strip refs.
   - **Organizations never created**: references pinned to `Organization/<ORG_ID>` (project org is
     NOT named "The Healing Hut", so name-based conditional refs were replaced by direct id).
     Only Composition.author/custodian reference the org (22 refs).
   - **NPI practitioners: create-if-missing**: emitted as `POST Practitioner` +
     `ifNoneExist: identifier=http://hl7.org/fhir/sid/us-npi|<npi>`; all references to them are
     conditional references by the same NPI. Server processes creates before updates within a batch
     (fhir-router/src/batch.ts bucket ordering) and the script also orders them first for
     multi-chunk files. 5 NPIs; Dr. Dandy (1780030916) already exists in the project → no-op.
     An NPI referenced (e.g. as MedicationRequest.requester) but never emitted as a Practitioner
     in that file gets a conditional create added (canonical name from the batch-wide vote), so
     first-run seeding works in any file order. No-NPI practitioners (2) created via the same
     conditional-update upsert as other resources. A no-NPI copy whose first+last name matches
     an NPI'd practitioner in the same document is treated as the same person.
   - Link-only PractitionerRoles inlined (referencing Encounter.participant repointed to the
     practitioner) and dropped — both link ends already exist in the project.
   - Valueless identifiers stripped (source `<id nullFlavor="UNK" root=NPI-OID/>` → 1,424 junk
     system-only identifiers). Empty arrays/objects scrubbed (invalid FHIR JSON — converter emits
     `referenceRange: []`, `timing: {}`).
   - Every resource tagged `urn:ccda-import|<tag>` + `urn:ccda-import:source|<file>` for
     identification/reversibility via `_tag` search.

## Key design decisions (with server-code grounding)

- **Batch, not transaction**: transactions need the `transaction-bundles` project feature flag and
  cap at 50 updates (`fhir-router/src/batch.ts` `maxUpdates` — transaction-only; batches have no
  update cap). Idempotent conditional updates + conditional creates give retry-safety instead of
  atomicity (matches docs/migration/migration-pipelines).
- **Conditional references** resolve server-side on every write (`replaceConditionalReferences`,
  server/src/fhir/references.ts:149, called from repo.ts updateResourceImpl); exactly-one-match or
  the entry 400s.
- **No update-as-create for normal users**: `PUT Type/<new-id>` 404s unless super admin
  (repo.ts `checkExistingResource` rethrows not-found unless `canSetId()` = `isSuperAdmin()`).
  Resources are therefore upserted via conditional update on their `urn:ccda-import-id`
  identifier — create-if-missing, update-if-present (`fhir-router/src/repo.ts conditionalUpdate`;
  in batches the entry body must not carry an id) — so re-runs still propagate content fixes.
- Source primary keys kept as identifiers; conditional refs; source-system traceability — per
  docs/migration/convert-to-fhir.

## Known limitations / accepted trade-offs

- No DiagnosticReport grouping — converter emits labs as flat Observations (panel structure lost).
- 326 lab codings carry local (Quest-style) codes without a `system` URI; display/text preserved.
- Direct org reference dangles silently if `--org-id` is wrong (no server-side existence check);
  conditional refs would have failed loudly. Verify the org id before seeding.
- If the project already contains these practitioners WITHOUT NPI identifiers, `ifNoneExist` can't
  see them → would create NPI'd siblings.
- No-NPI dedup key is exact given(s)+family — a middle-initial variant would split.
- PF stamps supervising NPI on staff entries → those references resolve to the NPI holder
  (displays retain the recorder's name).
- AsyncJob-based seeding has no server-side retry (worker `attempts: 1`); if a job dies the
  script reports the file as FAILED — re-run `--seed` (idempotent) to resubmit.
- Deterministic ids incorporate the source filename — renaming files between runs would re-create
  file-scoped resources (identity-keyed ones are safe).

## Verification already done (all passing)

- **Live test import (2026-08-18)**: full seed into a test project on api.medplum.com via async
  batches; data verified populated. (First attempt used synchronous executeBatch and hit FHIR
  quota 429s; second attempt hit the @medplum/core pollStatus GET-with-body bug — both fixed in
  the script as described above.)

- **R4 validation**: all 2,179 resources through `@medplum/core` `validateResource` with full R4
  structure definitions (same validation the server runs) — `_validate-output.ts`.
- **Determinism**: repeated runs byte-identical (shasum over all batch files).
- **Reference integrity**: JSON-walk — every conditional reference resolves to exactly one
  emitted resource within its patient's bundle set (NPI refs to a conditional create; pinned org
  id is the only literal reference, excluded by design). Batch bodies carry no ids.
- Batch-wide conditional-create/name-consistency checks (one canonical name per NPI).
- Expected import result: 11 Patients, 6 new Practitioners (+1 reused: Dandy), 29 Conditions,
  54 MedicationRequests (22 self-reported), 5 AllergyIntolerance, 224 Encounters, 1,467
  Observations, 348 ServiceRequests, 2 CarePlans, 11 Compositions; 0 Organizations.

## Suggested review focus

1. postProcess id-remapping/dedup correctness (canonical-copy adoption, idMap completeness,
   winner mutation) — the trickiest code.
2. Negation stripping scope — is dropping the whole entry ever wrong (e.g. negated reaction inside
   a real allergy)?
3. Narrative-recovery regexes (allergen/med-name/sig) — robustness against PF narrative variants.
4. The supply-relationship self-reported heuristic — false positive/negative risk.
5. Batch chunk ordering + conditional-create-before-reference guarantees across chunks.
6. Seed mode error handling (partial failure reporting, exit codes, retry story).
