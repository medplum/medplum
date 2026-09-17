---
toc_max_heading_level: 3
sidebar_position: 0
---

# Migrating to Medplum

Consider the following common scenario:

- You have an existing digital healthcare platform running active operations
- You decided to adopt a standards based architecture, such as Medplum
- You want to migrate operations without service interruption or degradation

Migrating non-FHIR data into Medplum requires engineering work, but the hardest problems are usually decisions about meaning, ownership, and cutover rather than converting file formats. We have seen migrations go most smoothly when teams make those decisions explicitly and test them against representative data. This series of guides walks through that process.

:::tip[Planning this migration?]

The [Data Migration Decision Guide](/docs/decision-guides/data-migration) can help you inventory sources, define ownership, choose a cutover strategy, and agree on acceptance criteria.

:::

The implementation guides cover:

1. [Plan your migration](/docs/migration/migration-planning)
2. [Sequence your migration](/docs/migration/migration-sequence)
3. [Govern data mappings](/docs/migration/mapping-governance)
4. [Convert your data to FHIR](/docs/migration/convert-to-fhir)
5. [Build data pipelines](/docs/migration/migration-pipelines)
6. [Validate and reconcile migrated data](/docs/migration/validation-and-reconciliation)
7. [Test and accept migrated data](/docs/migration/testing-and-acceptance)
8. [Adopt Medplum and retire the legacy system](/docs/migration/adoption-strategy)

Start with **Planning your migration** after the discovery decisions and success criteria are documented.
