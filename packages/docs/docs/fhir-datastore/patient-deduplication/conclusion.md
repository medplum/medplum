# Conclusion

While this guide might not be exhaustive, this guide serves as a starting point for building a production-ready deduplication workflow. While it requires some planning up front, reconciling patient data from multiple sources can create a powerful data asset to power your clinical workflows.

The merge techniques described here are general purpose, but can exist in two contexts (a) automatic merge, (b) manual merge or "human-in-the-loop." In both cases, audit reports are produced allowing visibility into why records were matched, why they were merged and who merged them.

You can also check out our [blog post](/blog/patient-deduplication) on the topic for more information.

## See Also

- Patient deduplication [reference implementation](https://github.com/medplum/medplum-demo-bots/tree/main/src/deduplication)
