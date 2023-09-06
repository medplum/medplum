# Patient Deduplication Architectures

Deduplicating patient records from multiple sources is a nuanced workflow. We've put together this this guide to go over the basics of merging patient records, and review some of the most important technical design considerations when building a patient deduplication pipeline. The pipeline described here is the basis of an [Enterprise Master Patient Index](https://en.wikipedia.org/wiki/Enterprise_master_patient_index) (EMPI).

We've organized the guide as follows:

- First, we review the high-level architecture of a patient deduplication pipeline
- Then we talk about how to represent duplicate patients in FHIR
- Next, we discuss the tradeoffs for building batch vs. incremental pipelines.
- Finally, we go into some detail on the specific rules that you can use to perform deduplication

While this guide might not be exhaustive, it serves as a starting point for building a production-ready deduplication workflow. While it requires some planning up front, reconciling patient data from multiple sources can create a powerful data asset to power your clinical workflows.

The merge techniques described here are general purpose, but can exist in two contexts (a) automatic merge, (b) manual merge or "human-in-the-loop." In both cases, audit reports are produced allowing visibility into why records were matched, why they were merged and who merged them.

You can also check out our [blog post](/blog/patient-deduplication) on the topic for more information.

## See Also

- Patient deduplication [reference implementation](https://github.com/medplum/medplum-demo-bots/tree/main/src/deduplication)
