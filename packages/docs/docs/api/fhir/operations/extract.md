# QuestionnaireResponse Extract

Extracts data from a questionnaire response into templated resources. It implements the
[template-based extraction][template-extract] flow from the draft [Structured Data Capture v4 IG][sdc-ig].
See [Structured Data Capture][data-capture] for more information.

```
[baseUrl]/QuestionnaireResponse/$extract
[baseUrl]/QuestionnaireResponse/[id]/$extract
```

[template-extract]: https://build.fhir.org/ig/HL7/sdc/extraction.html#template-extract
[sdc-ig]: https://build.fhir.org/ig/HL7/sdc/
[data-capture]: /docs/questionnaires/structured-data-capture

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
