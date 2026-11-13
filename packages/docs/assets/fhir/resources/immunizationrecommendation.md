## Usage

The [ImmunizationRecommendation](/docs/api/fhir/resources/immunizationrecommendation) resource is intended to cover communication of a specified patient's immunization recommendations and status across all healthcare disciplines in all care settings and all regions. The set of customized (for the patient) recommendations is based on the comparison of the patient's immunization history with a set of published recommendations (protocols).

Additionally, the [ImmunizationRecommendation](/docs/api/fhir/resources/immunizationrecommendation) resource is expected to cover key concepts related to the querying of a patient's immunization recommendations and status. This resource - through consultation with the Public Health work group - is believed to meet key use cases and information requirements as defined in the existing [HL7 v3](https://www.hl7.org/implement/standards/product_brief.cfm?product_id=186) POIZ domain and [Immunization](/docs/api/fhir/resources/immunization) Domain Analysis Model.

## Relationships

This resource references the following resources:

- Patient
- Organization
- Immunization
- ImmunizationEvaluation
