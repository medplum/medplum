# Ingestion

## Batch vs. Incremental Pipelines

Your deduplication pipeline can be implemented in either _batch_ or _incremental_ versions. These are not mutually exclusive options, and many organizations will end up building both.

The Medplum team recommends starting with a batch pipeline. If your source systems are short-lived or changing infrequently, a batch pipeline may be sufficient. Regardless, even if you end up building incremental pipelines, batch pipelines are typically easier to get started with as you iterate on your [matching](/docs/fhir-datastore/patient-deduplication/matching) and [merge](/docs/fhir-datastore/patient-deduplication/merging) rules.

### Batch Pipelines

Batch pipelines run as offline jobs that consider all records at once to produce sets of patient matches. Most implementations schedule these pipelines to run on a regularly scheduled interval. As this is an N<sup>2</sup> problem, they are primarily constrained by memory rather than latency.

Typically, these pipelines compute matches in a data warehouse or a compute engine, but can also can also be computed in a [Medplum Bot](/docs/bots) with sufficient memory. A typical workflow is:

1. Export patient data from Medplum into the appropriate data warehouse or compute engine (e.g. [Spark](https://spark.apache.org/)). Note that even large patient datasets should be able to fit into local memory (1M patients < 10GB), so distributed computation is not strictly required. See our [analytics guide](/docs/analytics) for more info.
2. Use [matching rules](/docs/fhir-datastore/patient-deduplication/matching) to detect matched pairs of records. Because this is an N<sup>2</sup> operation, we recommend using some form of exact matching rules to reduce the cardinality of the problem, before applying "fuzzy matching."
3. Use [merging rules](/docs/fhir-datastore/patient-deduplication/merging) to combine matched pairs into sets and _create_ the master record.
4. Use the Medplum API to update the `Patient.active` and `Patient.link` elements for all records.

### Incremental Pipelines

Each invocation of an incremental pipeline considers a single record and finds all matches. Typically, these pipelines are run per-source-record at the time of creation or update. As these pipelines are typically used to manage high-frequency, event-driven updates, latency is more of a concern than memory.

Incremental pipelines can often be implemented using [Medplum Bots](/docs/bots), and a typical workflow is:

1. Set up a Bot to listen for updates to patient records.
2. Use [matching rules](/docs/fhir-datastore/patient-deduplication/matching) to detect matching records. Because incremental pipelines only consider matches for a single record, we are less memory constrained and can apply more "fuzzy matching" rules.

- Use [merging rules](/docs/fhir-datastore/patient-deduplication/merging) to _update_ the master patient record.

- Update the `Patient.active` and `Patient.link` elements for all relevant records.

Check out [this blog post](/blog/patient-deduplication) for more details on event-driven pipelines. The medplum-demo-bots repo also contains an [example](https://github.com/medplum/medplum-demo-bots/blob/main/src/examples/patient-deduplication.ts) of an incremental deduplication bot.

The next section will discuss **matching** potential duplicate records.
