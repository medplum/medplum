---
toc_max_heading_level: 3
sidebar_position: 1
---

# Planning Your Migration

Successful migrations start by defining the source data, target model, operational constraints, and acceptance criteria before writing pipeline code.

:::tip[Planning this migration?]

Use the [Data Migration Decision Guide](/docs/decision-guides/data-migration) to structure the discovery conversation and record each decision.

:::

## Planning outputs

Complete these artifacts before finalizing the migration design:

- A [source-system inventory](#source-and-domain-inventory) with owners, access methods, formats, volume estimates, and known data-quality issues
- Explicit inclusion and exclusion rules for each data domain
- Data-retention and legacy-access requirements
- An [authority matrix](#authority-and-coexistence-matrix) that assigns one write owner per domain during each phase
- Stable identifier and patient-matching rules
- A reviewed [mapping register](/docs/migration/mapping-governance#mapping-register-example), including terminology and unsupported-field decisions
- Measurable [acceptance criteria and readiness checks](/docs/migration/testing-and-acceptance#readiness-checks), owners, and rollback triggers
- A cutover timeline based on measured throughput and an agreed downtime tolerance

Do not estimate migration scope from the total size of a legacy database alone. Define the business rules for what qualifies, implement the extraction queries, and run those queries against representative source data. Use the resulting resource mix and file volume to size the pipeline, dress rehearsals, and validation samples.

## Source and Domain Inventory

For each source system, record:

- Business and technical owner
- Access method, format, schema version, and snapshot or change-capture method
- Measured record and file volume, change rate, and known data-quality issues
- Stable source identifiers and local variations
- Access constraints and retention requirements

For each data domain, record:

- Source entities and the query or rule that defines the eligible population
- Inclusion, exclusion, and history boundaries
- Target resource types and reference dependencies
- Unsupported-data and legacy-access decisions
- Mapping and acceptance owners

## Authority and Coexistence Matrix

For each domain and migration phase, decide:

- Which system serves reads and which accepts authoritative writes
- Whether data also flows to another system, in which direction, and with what expected delay
- How the final processed source change is recorded
- Which paths could bypass the authoritative system
- How conflicts and failed writes are detected, assigned, and repaired
- Which evidence pauses the phase, permits rollback, or allows the next phase to begin
- How writes made after cutover are preserved if rollback is required

## Choose a Cutover Pattern

| Strategy      | Operational risk                          | Temporary synchronization      | Best fit                                                           |
| :------------ | :---------------------------------------- | :----------------------------- | :----------------------------------------------------------------- |
| Big bang      | Highest blast radius                      | Lowest                         | Small or low-change source with a tested cutover window            |
| Phased        | Limited to each cohort                    | Moderate to high               | Active operations that can move by domain, site, tenant, or cohort |
| Parallel      | Lower rollback risk, higher conflict risk | Highest                        | A defined comparison period with explicit write authority          |
| Backfill only | Source remains authoritative              | Ongoing deltas may be required | Medplum needs history without replacing the source workflow        |

See [Phased Adoption and Cutover](/docs/migration/adoption-strategy) for implementation phases and cutover controls.

Next, determine the [sequence for migrating your data](/docs/migration/migration-sequence).
