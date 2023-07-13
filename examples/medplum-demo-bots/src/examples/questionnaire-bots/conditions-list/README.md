# Conditions or Problems List

This Questionnaire and companion Bot demonstrate how to capture a "Problems List" or conditions a patient has using a questionnaire.

- We assume that the developer has embedded the [Questionnaire](https://www.medplum.com/docs/api/fhir/resources/questionnaire) seen [conditions-list-questionnaire.json](conditions-list-questionnaire.json) in a Practitioner facing application.
- The Practitioner fills out the Questionnaire and generates a [QuestionnaireResponse](https://www.medplum.com/docs/api/fhir/resources/questionnaireresponse)
- Generation of the [QuestionnaireResponse](https://www.medplum.com/docs/api/fhir/resources/questionnaireresponse) triggers the [Bot](https://www.medplum.com/docs/bots), which processes it and to create one more more [Condition](https://www.medplum.com/docs/api/fhir/resources/condition) resources
- The [Condition](https://www.medplum.com/docs/api/fhir/resources/condition) resources are loaded into an application where the physician can see them. All Conditions are tagged with the SNOMED code from the original questionnaire.
- The [Condition](https://www.medplum.com/docs/api/fhir/resources/condition) resources are linked to an [Encounter](https://www.medplum.com/docs/api/fhir/resources/encounter) resource which serves to document during which visit this document was noted.

## Recommendations

We recommend that developers customize the form to include a more comprehensive list of medical conditions that are tailored to the population being evaluated.
