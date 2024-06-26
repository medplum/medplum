---
id: migration-sequence
toc_max_heading_level: 3
sidebar_position: 2
---

# Sequencing Your Migration

[resources]: /docs/fhir-basics#storing-data-resources
[references]: /docs/fhir-basics#linking-data-references

When migrating data to Medplum, it's crucial to maintain the integrity and relationships between different data types. FHIR splits data across multiple [Resources][resources] that contain [References][references] to each other.

To simplify the migration process, Medplum recommends migrating data elements roughly in order of the FHIR dependency graph. Here's the recommended order for migrating data:


| Order | Data Element                        | FHIR Resource                                                                                                                                                             | Notes                                                                          |
| ----- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 1     | Provider Demographics & Credentials | [`Practitioner`](/docs/api/fhir/resources/practitioner), [`PractitionerRole`](/docs/api/fhir/resources/practitionerrole)                                                  | Migrate clinician information to link them to migrated clinical events         |
| 2     | Shared Organizations                | [`Organization`](/docs/api/fhir/resources/organization)                                                                                                                   | Used in multi-practice settings to represent each practice                     |
| 3     | Patient Demographics                | [`Patient`](/docs/api/fhir/resources/patient)                                                                                                                             | Foundational patient record that will be referenced by all other clinical data |
| 4     | Problem List, Medication List       | [`Condition`](/docs/api/fhir/resources/condition), [`MedicationRequest`](/docs/api/fhir/resources/medicationrequest)                                                      | Provides clinicians current medical "snapshot" of the patient's health         |
| 5     | Encounter History, Vitals, Labs     | [`Encounter`](/docs/api/fhir/resources/encounter), [`Observation`](/docs/api/fhir/resources/observation), [`DiagnosticReport`](/docs/api/fhir/resources/diagnosticreport) | Provides clinicians with longitudinal health of the patient                    |

This order ensures that foundational data (['Patient'](/docs/api/fhir/resources/patient) records) are in place before migrating related clinical data. It also attempts to deliver immediate clinical value by providing a patient snapshot, while backfilling longitudinal health data over time.

In the next guide, we'll discuss how to **convert your existing data to FHIR.**
