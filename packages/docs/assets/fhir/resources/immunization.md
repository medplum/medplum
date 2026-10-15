Refer to the [US Core Immunizations profile](https://hl7.org/fhir/us/core/stu3.1.1/StructureDefinition-us-core-immunization.html).

## Usage

The [Immunization](/docs/api/fhir/resources/immunization) resource is intended to cover the recording of current and historical administration of vaccines to patients across all healthcare disciplines in all care settings and all regions. This includes immunization of both humans and animals but does not include the administration of non-vaccine agents, even those that may have or claim to have immunological effects. While the terms "immunization" and "vaccination" are not clinically identical, for the purposes of the FHIR resources, the terms are used synonymously.

Additionally, the [Immunization](/docs/api/fhir/resources/immunization) resource is expected to cover key concepts related to the creation, revision and querying of a patient's immunization history. This resource - through consultation with the Public Health work group - is believed to meet key use cases and information requirements as defined in the existing [HL7 v2](http://www.hl7.org/implement/standards/product_brief.cfm?product_id=185) immunization implementation guide, [HL7 v3](https://www.hl7.org/implement/standards/product_brief.cfm?product_id=186) POIZ domain and [Immunization](/docs/api/fhir/resources/immunization) Domain Analysis Model.

## Relationships

Administration of vaccines is intended to be handled using the **Immunization** resource. [MedicationAdministration](/docs/api/fhir/resources/medicationadministration) is intended for tracking the administration of non-vaccine medications. Some systems treat immunizations in the same way as any other medication administration. Such systems SHOULD use an immunization resource to represent these. If systems need to use a [MedicationAdministration](/docs/api/fhir/resources/medicationadministration) resource to capture vaccinations for workflow or other reasons, they SHOULD also expose an equivalent **Immunization** instance.

[Immunization](/docs/api/fhir/resources/immunization).reaction may be an indication of an allergy or intolerance. If this is deemed to be the case, a separate [AllergyIntolerance](/docs/api/fhir/resources/allergyintolerance) resource instance should be created to indicate it, as most systems will not query against past [Immunization](/docs/api/fhir/resources/immunization).reaction.
