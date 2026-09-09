---
toc_max_heading_level: 3
sidebar_position: 7
---

# Testing and Accepting Migrated Data

Use this guide after [validating and reconciling migrated data](/docs/migration/validation-and-reconciliation). It covers whole-chart review, files, production access and workflows, dress rehearsals, exceptions, and final readiness.

## Review Complete Patient Charts

Field-level checks do not expose every cross-resource error. Review complete charts using three complementary sample types:

1. **Repeatable:** Keep stable records in every rehearsal to expose regressions.
2. **Random:** Use a recorded seed to reduce selection bias.
3. **Risk-based:** Include complex and high-impact charts, unusual source variants, many documents, identifier conflicts, and records near extraction boundaries.

There is no universal safe sample percentage. Choose the sample after extraction counts are known, based on source variability, mapping complexity, clinical risk, defect history, and the consequence of an undetected error. Expand review when defects cluster or mappings change.

Record the selection method, seed or source keys, reviewer, findings, and outcome.

## Validate Documents and Binary Content

Metadata alone does not prove that a migrated document is usable.

For representative and risk-based samples:

- Retrieve and open each referenced file.
- Verify content type, title, size, and hash where available.
- Confirm multi-page and large documents are complete.
- Confirm the patient, encounter, and authoring context.
- Test access with intended and unauthorized roles.
- Verify that `Binary.securityContext` supports the intended access model.

Use `createBinary`, `createMedia`, or `createAttachment` patterns and reference stored content with a `Binary/{id}` URL. Do not place large base64 payloads in `Attachment.data`. See [Binary Data](/docs/fhir-datastore/binary-data).

## Test Production Behavior

Reconciliation often uses elevated migration credentials. It does not prove that production users can use the data.

Test representative production roles and policies:

- Authorized and unauthorized reads, searches, writes, and document downloads
- Patient and organization compartment behavior
- Identifier, patient, encounter, practitioner, date, status, and code searches
- Pagination and required chained or included searches
- Reports and analytics against approved source baselines
- Downstream Subscriptions, Bots, interfaces, and exports
- End-to-end clinical and operational workflows

Ensure historical loading does not trigger unintended notifications or duplicate external actions. If integrations are suppressed during import, test the explicit replay or reconstruction process.

## Rehearse Performance and Recovery

When data volume, performance, or a fixed cutover window creates material risk, run a production-scale dress rehearsal against representative data and infrastructure. Measure:

- Extraction, transformation, upload, and reconciliation duration
- Resource mix, batch size, bounded concurrency, and async completion time
- Error, held-for-review, and retry rates
- Search, report, and document performance after loading
- Storage growth
- Stop, resume, checkpoint, and targeted-repair behavior
- Final change synchronization and rollback duration

Use the same credential type and equivalent permissions, but use environment-specific credentials and secrets. Mirror the planned feature flags, scripts, manifests, and commands. Test transient throttling, repeatable data failures, worker interruption, and a failed cutover gate.

## Review Exceptions and Obtain Sign-off

Review the [validation exception record](/docs/migration/validation-and-reconciliation#manage-validation-exceptions). Confirm that each open issue has an owner, impact assessment, due date, and tested outcome. Require an explicit approver and supporting evidence for every accepted exception.

## Readiness Checks

These checks summarize readiness. Record owners, evidence, results, exceptions, timestamps, and approvals in your project's operational system.

<details>
  <summary>Review the complete readiness checklist</summary>

### Scope and execution

- [ ] Scope, exclusions, mappings, and thresholds are approved.
- [ ] Every in-scope source unit has a stable key, and each target has an identifier, valid UUID, or manifest crosswalk.
- [ ] Writes are safe to repeat, and restart and recovery behavior has been tested.
- [ ] Every Bundle and asynchronous job has a retained identifier.
- [ ] Every final response entry has been inspected and recorded.
- [ ] No records remain unexplained or indefinitely pending.

### Data correctness

- [ ] Source outcomes and target counts reconcile by required cohort.
- [ ] Missing, unexpected, and duplicate identifiers meet approved thresholds.
- [ ] Every expected reference resolves to the correct target.
- [ ] Structural profile validation passes.
- [ ] Terminology, quantities, dates, statuses, negation, and chronology pass semantic checks.
- [ ] Repeatable, random, and risk-based chart samples pass review.
- [ ] Documents open and authorized and unauthorized access tests pass.

### Production readiness

- [ ] Required access policies, searches, reports, integrations, and workflows pass.
- [ ] A production-scale rehearsal completed within the available window when required by volume or cutover risk.
- [ ] Final synchronization, cutover, and rollback durations are confirmed.
- [ ] Monitoring and support ownership are assigned.
- [ ] Every exception has an owner and approved outcome.
- [ ] Technical, security, operational, and clinical sign-off is complete as applicable.
- [ ] A named decision-maker has recorded the go or no-go decision.

</details>

:::caution[Do not proceed]

Do not proceed with unexplained records, wrong-patient references, inaccessible clinical documents, clinically significant mapping defects, or unowned high-severity exceptions.

:::

Once readiness is confirmed, use [Phased Adoption and Cutover](/docs/migration/adoption-strategy) to move reads and writes safely.
