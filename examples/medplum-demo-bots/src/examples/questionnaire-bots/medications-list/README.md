# Medications List

This Questionnaire and companion Bot demonstrate how to create a workflow that enables Patients to [self-report](https://www.hl7.org/fhir/medicationstatement.html) which medications they are currently taking. In this example:

- We assume that the developer has embedded the [Questionnaire](https://www.medplum.com/docs/api/fhir/resources/questionnaire) seen [patient-medication-questionnaire.json](patient-medication-questionnaire.json) in a patient facing application.
- We the patient fills out the Questionnaire and generates a [QuestionnaireResponse](https://www.medplum.com/docs/api/fhir/resources/questionnaireresponse)
- The [QuestionnaireResponse](https://www.medplum.com/docs/api/fhir/resources/questionnaireresponse) triggers the [Bot](https://www.medplum.com/docs/bots), which processes it and to create one more more [MedicationStatement](https://www.medplum.com/docs/api/fhir/resources/medicationstatement) resources
- The [MedicationStatement](https://www.medplum.com/docs/api/fhir/resources/medicationstatement) resources are loaded into an application where the physician can review them. All MedicationStatements are tagged with the RxNorm code from the original questionnaire.

## Recommendations

We recommend that developers customize the form to include a more comprehensive list of medications, and may consider custom questionnaires for different patient populations.

In the application that displays the data to the physician, make sure to note that these medications are self-reported by the patient.
