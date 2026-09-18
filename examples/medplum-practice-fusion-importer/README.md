# Medplum Practice Fusion CCDA Importer

A Node.js script that converts a folder of **Practice Fusion** CCDA XML exports into FHIR R4 batch
bundles and optionally seeds them into a Medplum project. It wraps `@medplum/ccda`'s
`convertCcdaToFhir` and works around a number of converter limitations at the script level, so the
output is clean, deduplicated, deterministic, and safe to re-run.

This was built for a real clinic migration and is shared as a worked example of the
[migration guides](https://www.medplum.com/docs/migration): pre-processing a vendor CCDA export,
post-processing converter output, idempotent batch upserts with conditional references, and async
batch seeding. Adapt the fixes and heuristics to your own source data — several are specific to how
Practice Fusion structures its exports.

## Usage

```bash
npm install
cp .env.defaults .env
# edit .env with your ClientApplication credentials (only needed for --seed)

# Convert a folder of CCDA XML files to batch bundles (writes to <input>/fhir-output)
npm run convert -- --input /path/to/ccdas --org-id <organization-uuid>

# Validate every generated resource against the FHIR R4 structure definitions
npm run validate -- --output /path/to/ccdas/fhir-output

# Convert and then seed the bundles into the target project
npm run convert -- --input /path/to/ccdas --org-id <organization-uuid> --seed
```

## CLI / config

- `--input <dir>` CCDA XML folder (required)
- `--output <dir>` bundle output (default: `<input>/fhir-output`)
- `--tag <code>` batch tag code (default: slug of input's parent dir, e.g. `example-clinic`)
- `--org-id <uuid>` the project's existing Organization id; all org references point directly at it
  (no default; without it, org references fall back to name-based conditional references and the
  `$set-accounts` step is skipped)
- `--seed` after generating, execute batch bundles as **async batches** (`Prefer: respond-async`,
  see [Processing Async Bundles](https://www.medplum.com/docs/fhir-datastore/processing-async-bundles)):
  entries run in a background job and do not consume the per-user FHIR interaction quota — a
  synchronous `executeBatch` of the same data 429'd after ~240 entries. Jobs are submitted
  sequentially (each completes before the next chunk), status polled every 2s, and the
  batch-response Bundle downloaded from the job's results Binary. Credentials come from
  `MEDPLUM_BASE_URL` / `MEDPLUM_CLIENT_ID` / `MEDPLUM_CLIENT_SECRET` (a ClientApplication in the
  target project; see `.env.defaults`). Per-entry failures are reported; all writes are idempotent
  so re-running is safe.
  After a fully successful seed, runs `Patient/$set-accounts` (accounts=[`Organization/<ORG_ID>`],
  propagate=true, async) on every imported patient so org-restricted access policies can see the
  imported compartment resources. **The ClientApplication membership must be a project admin** —
  `$set-accounts` is admin-only. Diff-based and idempotent; Practitioners are not in the patient
  compartment and are not stamped.
- `ORG_ID_OVERRIDES` / `PRACTITIONER_ID_OVERRIDES` in-file maps for pinning specific resources.

## Outputs per input file

- `<name>.fhir.json` — pretty-printed review bundle (resources only)
- `<name>.batch*.json` — compact batch bundles, chunked ≤800KB (server default `maxJsonSize` 1mb),
  entries ordered per docs/migration/migration-sequence (practitioner creates → Patient → Condition
  → MedicationRequest → AllergyIntolerance → Encounter → Observation → ServiceRequest → CarePlan →
  Composition last), each entry carrying its `request` (conditional `PUT Type?identifier=
urn:ccda-import-id|<deterministic-id>` upsert with no body id, or POST + ifNoneExist for NPI
  practitioners). A file's stale chunks from previous runs are deleted before writing (chunk
  count can change between runs and --seed executes every _.batch_ file present).

## Pipeline (per file, after a global pre-scan)

0. **Global pre-scan** (`collectGlobalNpiNames`): regex over ALL source XMLs; majority-vote a
   canonical HumanName per NPI. Needed because PF stamps the supervising provider's NPI on
   staff-recorded entries (a nurse's entries carry the supervising physician's NPI), so within one file
   the wrong name can win.
1. Parse XML → CCDA (`convertXmlToCcda`), print a section inventory (flags sections the converter
   silently drops: Notes, Payers, Reason for Referral — none had entries in this batch).
2. **Strip negated entries** (`stripNegatedEntries`): converter ignores `negationInd="true"`, which
   turns "No Known X" placeholders into fake positive resources (verified: fake Immunization +
   Procedure per file). Handles top-level acts/substanceAdministrations/procedures/observations AND
   the nested NKA pattern (act → entryRelationship[SUBJ] → negated observation).
3. **Extract Planned Acts** (templateId 2.16.840.1.113883.10.20.22.4.39) from Assessment and Plan
   sections (2.…22.2.9, unhandled by converter — would throw) → mapped to **ServiceRequest**
   (348 historical lab orders; status forced `completed` since these are historical orders, intent from
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
     better-cased copy kept). Two patients keep 2 addresses — theirs differ textually
     (e.g. `E MAIN ST` vs `East Main St`), not just by case.
6. **postProcess** (the bulk of the logic):
   - Drop nameless junk Practitioners (authoring-device artifacts; one patient had 562 from
     author-less lab observations); strip references to them; `Composition.author` retargeted to
     the custodian Organization when the device was sole author.
   - Dedup by identity key (Practitioner: NPI, else full name; Patient: first identifier;
     Organization: name), canonical-name copy wins (see step 0), identifiers merged.
   - **Deterministic ids**: SHA-256 of identity key or `file:type:index` → re-runs byte-identical,
     upserts idempotent, cross-file dedup (one practitioner in 7 files → 1 resource). Each id
     travels as an `urn:ccda-import-id` identifier on the resource; the batch entry is a
     conditional update on it and internal references are conditional references by the same
     identifier (server ids end up server-generated).
   - Drop content-empty resources (converter emits `{resourceType, id}` Organizations); strip refs.
   - **Organizations never created**: references pinned to `Organization/<ORG_ID>` (the project org's
     name did not match the CCDA's clinic name, so name-based conditional refs were replaced by direct id).
     Only Composition.author/custodian reference the org (22 refs).
   - **NPI practitioners: create-if-missing**: emitted as `POST Practitioner` +
     `ifNoneExist: identifier=http://hl7.org/fhir/sid/us-npi|<npi>`; all references to them are
     conditional references by the same NPI. Server processes creates before updates within a batch
     (fhir-router/src/batch.ts bucket ordering) and the script also orders them first for
     multi-chunk files. 5 NPIs; the supervising physician already exists in the project → no-op.
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

## Verification

Checks performed on the original migration dataset (11 patients, one clinic):

- **Live import**: full seed into a test project via async batches; data verified populated.

- **R4 validation**: all 2,179 resources through `@medplum/core` `validateResource` with full R4
  structure definitions (same validation the server runs) — `npm run validate`.
- **Determinism**: repeated runs byte-identical (shasum over all batch files).
- **Reference integrity**: JSON-walk — every conditional reference resolves to exactly one
  emitted resource within its patient's bundle set (NPI refs to a conditional create; pinned org
  id is the only literal reference, excluded by design). Batch bodies carry no ids.
- Batch-wide conditional-create/name-consistency checks (one canonical name per NPI).
- Expected import result: 11 Patients, 6 new Practitioners (+1 reused), 29 Conditions,
  54 MedicationRequests (22 self-reported), 5 AllergyIntolerance, 224 Encounters, 1,467
  Observations, 348 ServiceRequests, 2 CarePlans, 11 Compositions; 0 Organizations.
