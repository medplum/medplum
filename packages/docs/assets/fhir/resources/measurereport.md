## Usage

The [MeasureReport](/docs/api/fhir/resources/measurereport) resource represents the results of calculating a measure for a specific subject or group of subjects. The `$evaluate-measure` operation of the [Measure](/docs/api/fhir/resources/measure) resource is defined to return a [MeasureReport](/docs/api/fhir/resources/measurereport). The resource is capable of representing three different levels of report: individual, subject-list, and summary.

The resource draws requirements from the HL7 CDA R2 Implementation Guide: Quality Reporting Document Architecture - Category 1 (QRDA I) DSTU Release 3 (US Realm) and the HL7 Implementation Guide for CDA Release 2: Quality Reporting Document Architecture - Category III (QRDA III), DSTU Release 1 implementation guides.

For a detailed discussion of how to use the [Measure](/docs/api/fhir/resources/measure) and [MeasureReport](/docs/api/fhir/resources/measurereport) resources, refer to the [Quality Reporting](https://www.hl7.org/fhir/clinicalreasoning-quality-reporting.html) topic.

Note that this resource is a special case of the more general notion of a query evaluation result. However, because the general case requires the ability to represent arbitrary content, this resource uses a simple indicator structure to describe population sizes for each population type defined in the measure. The intent is to be able to represent the more general case as well, either by generalizing this resource, or by making this structure a profile of a more general resource, and we are actively seeking comments about what approaches might be taken to achieve that aim.

## Relationships

Although the [MeasureReport](/docs/api/fhir/resources/measurereport) is conceptually an [Observation](/docs/api/fhir/resources/observation), there is enough specific information required to support the quality reporting use case to warrant a separate resource.

The resource is differentiated from a general purpose query result because it communicates specific information related to quality measurement evaluation that would be difficult to convey generally without imposing some other structure on top of the general results.
