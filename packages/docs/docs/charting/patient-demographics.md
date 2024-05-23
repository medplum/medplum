---
sidebar_position: 1
---

# Patient Demographics

Capturing Patient Demographics is a core function of an Electronic Health Record system. Requirements for EHR demographic capture are described in the [ONC (a)(5) criteria](https://www.healthit.gov/test-method/demographics).

Demographic data can be input via multiple methods, for example via **application user interface (UI)**, synchronized via **integration** or written via **API**.

The [USCDI](/docs/fhir-datastore/understanding-uscdi-dataclasses) V2 data standard outlines specific technical requirements, you can see the [profile on HL7.org](https://hl7.org/fhir/us/core/stu3.1.1/StructureDefinition-us-core-patient.html).

## Advanced Requirements

While some demographic data is straightforward to capture, some data require careful handling. The following is a summary of the requirements for complex data capture with guidance on ensuring correctness.

## User Interface

Medplum provides React components for [Patient demographics](https://storybook.medplum.com/?path=/story/medplum-resourceform--us-core-patient) that fulfill demographic data collection requirements and can be embedded in your application to fulfill the requirements.

## Capturing Aliases

The specification supports capturing aliases, and correct usage is beneficial for record keeping. The following `name` field on the FHIR [Patient](/docs/api/fhir/resources/patient) resource shows an example of how to represent maiden names, as an example.

```json
"name": [
    {
      "given": [
        "Marge",
        "Jacqueline"
      ],
      "family": "Simpson",
      "period": {
        "start": "1980-01-01T00:00:00Z"
      },
      "use": "official"
    },
    {
      "given": [
        "Marge",
        "Jacqueline"
      ],
      "family": "née Bouvier",
      "period": {
        "end": "1980-01-01T00:00:00Z"
      },
      "use": "old"
    }
  ]
```

## Demographic Data

Health record systems must manage common demographic data. It is important not to supply your own codes, but instead use the provided ValueSets as they relate to demographics. **Correct use of value sets is crucial for correct reporting and interoperability.** The following table shows references for common demographic value sets. Medplum supports these Value sets in our UI components, or you can build [ValueSets](https://storybook.medplum.com/?path=/story/medplum-valuesetautocomplete--basic) into your own applications.

| Category  | Name                            | URL                                                               |
| --------- | ------------------------------- | ----------------------------------------------------------------- |
| Gender    | Administrative Gender Value Set | https://hl7.org/fhir/R4/valueset-administrative-gender.html       |
| Race      | US Core Race Extension          | http://hl7.org/fhir/us/core/StructureDefinition/us-core-race      |
| Ethnicity | US Core ethnicity Extension     | http://hl7.org/fhir/us/core/StructureDefinition/us-core-ethnicity |
| Birth Sex | Birth sex Extension             | http://hl7.org/fhir/us/core/StructureDefinition/us-core-birthsex  |

## Lifecycle

Managing and merging duplicate patient records should be part of all implementations, and is covered in detail [Patient Deduplication Architectures](/docs/fhir-datastore/patient-deduplication).

EHRs require capturing cause of death for patients. It is recommended to record death event as `Patient.deceased` with the time of death. For cause of death, it is recommended to represent as an [Observation](/docs/api/fhir/resources/observation) with an ICD-10 or other appropriate ontology.

## Common Identifiers

Common identifiers, such as Driver's License numbers or Social Security numbers should be captured on the `Patient` resource using [name spaced identifiers](/docs/fhir-basics#naming-data-identifiers). These are useful when querying data from a Health Information Exchange (HIE) or HIE Onramp.

The [integration](/docs/integration) section has details on querying the exchanges.

## Related Reading

- [ONC (a)(5)](https://www.healthit.gov/test-method/demographics) official description and guide.
- [Sample data](/docs/tutorials/importing-sample-data) see sample demographic data in accordance with USCDI.
- [US Core Patient Profile](https://hl7.org/fhir/us/core/stu3.1.1/StructureDefinition-us-core-patient.html)
- [US Core Patient](https://storybook.medplum.com/?path=/story/medplum-resourceform--us-core-patient) react component on Storybook
- [ONC Certification for Medplum](/docs/compliance/onc)
- [(a)(5) User Testing Video](https://youtu.be/NcxFl-GJ9Mc) on Youtube

:::caution

ONC (a)(5) certification is under development.

:::
