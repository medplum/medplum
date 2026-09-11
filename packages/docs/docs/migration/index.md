---
toc_max_heading_level: 3
sidebar_position: 0
---

# Migrating to Medplum

Consider the following common scenario:

- You have an existing digital healthcare platform running active operations
- You decided to adopt a standards based architecture, such as Medplum
- You want to migrate operations without service interruption or degradation

While there is some engineering work required to migrate non-FHIR data into Medplum, there are well-known best-practices to manage this process. This series of guides outlines the process of migrating data from an existing platform into Medplum.

:::tip[Planning this migration?]

Use the [Data Migration Decision Guide](/docs/decision-guides/data-migration) to inventory sources, define ownership, choose a cutover strategy, and agree on acceptance criteria.

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
