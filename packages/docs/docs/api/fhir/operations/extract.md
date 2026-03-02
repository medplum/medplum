# QuestionnaireResponse $extract

The `$extract` operation transforms completed questionnaire responses into structured FHIR resources. This bridges the gap between form-based data collection and your clinical data model-automatically converting patient intake forms, assessments, or surveys into Observations, Conditions, Procedures, and other FHIR resources.

This is a key component of the [Structured Data Capture][data-capture] workflow, allowing you to design forms that both collect information from users and populate your FHIR database without custom mapping code.

## Use Cases

- **Patient Intake**: Convert registration forms into Patient, Coverage, and RelatedPerson resources
- **Clinical Assessments**: Transform PHQ-9, GAD-7, or other assessment questionnaires into Observation resources with proper coding
- **History Collection**: Extract past medical history responses into Condition resources
- **Prior Authorization**: Generate CoverageEligbilityRequest and supporting documentation from PA request forms
- **Research Data Collection**: Convert study questionnaires into Observation resources for analysis

[template-extract]: https://build.fhir.org/ig/HL7/sdc/extraction.html#template-extract
[sdc-ig]: https://build.fhir.org/ig/HL7/sdc/
[data-capture]: /docs/questionnaires/structured-data-capture

## Invoke the `$extract` operation

```
[baseUrl]/QuestionnaireResponse/$extract
[baseUrl]/QuestionnaireResponse/[id]/$extract
```

## Parameters

| Name                     | Type                    | Description                                       | Required       |
| ------------------------ | ----------------------- | ------------------------------------------------- | -------------- |
| `questionnaire-response` | `QuestionnaireResponse` | The response to parse                             | No<sup>1</sup> |
| `questionnaire`          | `Questionnaire`         | The Questionnaire to use for parsing the response | No<sup>2</sup> |

<sup>1</sup> If not called on a specific `QuestionnaireResponse` by ID, the response must be specified via the `questionnaire-response` parameter.

<sup>2</sup> If `QuestionnaireResponse.questionnaire` is not specified in the resource, it must be passed in via the `questionnaire` parameter; otherwise it can be used to override the Questionnaire used for parsing.

## Output

The operation returns a `Bundle` resource containing the resources populated from templates in the Questionnaire, derived from values in the QuestionnaireResponse.

**Request**:

Given a `QuestionnaireResponse` with an associated `Questionnaire`, e.g.`

```json
{
  "resourceType": "QuestionnaireResponse",
  "id": "1c503f4e-a08c-4b7d-8ebd-bfc67b0ab761",
  "status": "completed",
  "questionnaire": "Questionnaire/f80e508b-9aaa-41e3-aa8e-0e4817c86b44"
  // ...
}
```

```http
GET https://api.medplum.com/fhir/R4/QuestionnaireResponse/1c503f4e-a08c-4b7d-8ebd-bfc67b0ab761/$extract
```

```bash
curl 'https://api.medplum.com/fhir/R4/QuestionnaireResponse/1c503f4e-a08c-4b7d-8ebd-bfc67b0ab761/$extract' \
  -H "Authorization: Bearer $MY_ACCESS_TOKEN"
```

**Response** (200 OK):

```json
{
  "resourceType": "Bundle",
  "type": "transaction",
  "entry": [
    // Populated template resources
  ]
}
```

## Related

- [Structured Data Capture Guide](/docs/questionnaires/structured-data-capture) - Complete guide to SDC workflows
- [FHIR Questionnaire Resource](https://hl7.org/fhir/R4/questionnaire.html) - FHIR specification for Questionnaire
- [FHIR QuestionnaireResponse Resource](https://hl7.org/fhir/R4/questionnaireresponse.html) - FHIR specification for QuestionnaireResponse
- [HL7 SDC Implementation Guide](https://build.fhir.org/ig/HL7/sdc/) - Official Structured Data Capture IG
- [Medplum Questionnaires Guide](/docs/questionnaires) - Building and using questionnaires in Medplum
