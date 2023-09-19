# Architecture Overview

## Glossary

Before we get started, let's define some terms.

In this guide, we will call each input system that contributes patient data a **source system.** The output of your deduplication pipeline will be called the **target system**.

Most pipelines make a copy of each patient record from the source system into the target system. We will call these copies **source records.** The final, combined patient record will be called the **master record**.

## Pipeline

While deduplication pipelines can take many forms, there are three primary operations in every pipeline:

1. [**Ingestion:**](/docs/fhir-datastore/patient-deduplication/ingestion) Copying data from source systems into the target system to create source records.
2. [**Matching:**](/docs/fhir-datastore/patient-deduplication/matching) For each patient record, find all other records that are potential matches.
3. [**Merging:**](/docs/fhir-datastore/patient-deduplication/merging) Merge all the information into a single record to serve as the source of truth.


## Key Decisions

There are many different ways to implement this pipeline, but there are a few key decisions that you will need to make when choosing an architecture:

- Whether you are building a batch vs. incremental deduplication pipeline
- Which matching rules to use
- How to merge matching patients into a single record

We'll discuss each of these in depth. The most important factors to consider when making these decisions are:

- **Prevalence of duplicates:** Making estimate of your duplication rate, both _within_ and _between_ source systems, will help you determine the complexity needed in your deduplication pipeline. Some applications have rare duplication rates (e.g. < 1%) while others have frequent duplicates (10-50%). Still others have very bi-modal duplication patterns (e.g 99% of records have 0 duplicates, 1% of records have 5+ duplicates).

- **Lifetime of source systems:** Some pipelines are built to ingest patient data from short-lived source systems, and target systems quickly replace them as the source of truth. For example, when migrating from legacy systems into Medplum. In contrast, some source systems are long lived or permanent, as when deduplicating patients from multiple healthcare providers or from Health Information Exchanges (HIEs).

- **Cost of false positives:** No deduplication system will be 100% perfect, and some patients records will be merged incorrectly. Certain architectural choices make it easier or harder to unmerge patient records once merged. The right choice for you will depend on your confidence threshold for performing a merge and on cost of an incorrect merge.

- **Downstream application:** The right deduplication architecture will ultimately depend on how the deduplicated data will be used. Target systems that serve web and mobile applications will have different priorities than that systems that serve as data aggregators. For example, some systems support patient login and a merge will show a whole new set of data to a user, merging for this use case should be distinct from merging for population health or insurance billing purposes.

In the next section, we will discuss the **Ingestion** stage of the deduplication pipeline.
