// import ExampleCode from '!!raw-loader!@site/..//examples/src/questionnaires/structured-data-capture.ts';
import MedplumCodeBlock from '@site/src/components/MedplumCodeBlock';

# Structured Data Capture

After receiving a questionnaire response, many use cases require the response to be transformed into structured data,
i.e. other FHIR resources such as `Patient` or `Observation`. Medplum provides an implementation of the draft
[Structured Data Capture IG v4][sdc-ig], which can automatically parse responses to a specially-annotated Questionnaire
into any FHIR resource(s) necessary. After adding template resources and special extensions with rules for populating them
to the `Questionnaire`, associated `QuestionnaireResponse` resources can be sent to the [`$extract` API][extract]. The API
returns a [transaction Bundle][batch] containing the parsed resources, which can then be uploaded to the server.

[sdc-ig]: https://build.fhir.org/ig/HL7/sdc/
[extract]: https://build.fhir.org/ig/HL7/sdc/OperationDefinition-QuestionnaireResponse-extract.html
[batch]: /docs/fhir-datastore/fhir-batch-requests

## Annotating the Questionnaire

Medplum implements [template-based extraction][extract-template], which requires the Questionnaire resource to contain
template resources and the rules for populating the templates from a QuestionnaireResponse. The template resources
(e.g. `Observation` or other resource types) are placed in `Questionnaire.contained` and given and internal reference
`id`; a corresponding [`templateExtract` extension][extract-ext] on the `Questionnaire` or one of its descendant items
initiates extraction into that resource.

```json
{
  "resourceType": "Questionnaire",
  "status": "draft",
  "contained": [
    {
      "resourceType": "Patient",
      "id": "patientTemplate"
      // ...
    }
  ],
  "extension": [
    {
      "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtract",
      "extension": [{ "url": "template", "valueReference": { "reference": "#patientTemplate" } }]
    }
  ]
  //...
}
```

The location of the `templateExtract` extension determines the initial context for the extraction: if placed at the root
of the `Questionnaire`, the entire `QuestionnaireResponse` will be in scope for FHIRPath rules to extract data from. If
placed on a specific item, only the corresponding item from the `QuestionnaireResponse` will be in scope, simplifying
the extraction rules for that response item if it can be extracted in isolation.

Within the template resources, [`templateExtractValue`][value-ext] and [`templateExtractContext`][context-ext]
extensions work together to defined the rules for extracting data from the `QuestionnaireResponse` into the template.

The value extension is placed on the field of the template resource into which a value should be placed:

```json
{
  "resourceType": "Questionnaire",
  "status": "draft",
  "contained": [
    {
      "resourceType": "Patient",
      "id": "patientTemplate",
      "name": [
        {
          // Since name is required, this is safe
          "_text": {
            "extension": [
              {
                "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue",
                "valueString": "item.where(linkId = 'name').answer.value.first()"
              }
            ]
          }
        }
      ]
    }
  ],
  "extension": [
    {
      "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtract",
      "extension": [{ "url": "template", "valueReference": { "reference": "#patientTemplate" } }]
    }
  ],
  "item": [
    {
      "linkId": "name",
      "type": "string",
      "required": true,
      "text": "fullName"
    }
  ]
}
```

A corresponding `QuestionnaireResponse` shows how the data will be parsed:

```json
{
  "resourceType": "QuestionnaireResponse",
  "status": "completed",
  "item": [
    {
      "linkId": "name",
      "answer": [{ "valueString": "John Jacob Jingleheimer-Schmidt" }]
    }
  ]
}
```

:::info Value Extraction

The template extraction extensions are expected to contain [FHIRPath][fhirpath] expressions that return the value(s) to
be inserted into the template. If no values are returned, the field is removed from the template; more than one result
is inserted as an array of values. Using functions like `first()` in the expression can help ensure the correct number
of values are returned and ensure the resulting resource is well-formed.

:::

When handling optional or repeating response items, it is critical to use `templateExtractContext` extensions to ensure that
the resulting resource is valid. For example, consider a slightly more complex scenario:

```json
{
  "resourceType": "Questionnaire",
  "status": "draft",
  "contained": [
    {
      "resourceType": "Patient",
      "id": "patientTemplate",
      "name": [
        {
          // Context extension placed at top of the object to be inserted for each result
          "extension": [
            {
              "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractContext",
              "valueString": "item.where(linkId = 'name')"
            }
          ],
          "_text": {
            // Nested value extensions are relative to parent context,
            // and are evaluated separately for each result value
            "extension": [
              {
                "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue",
                "valueString": "answer.value.first()"
              }
            ]
          }
        }
      ],
      "telecom": [
        {
          "extension": [
            {
              "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractContext",
              "valueString": "item.where(linkId = 'phone')"
            }
          ],
          "system": "phone",
          "_value": {
            "extension": [
              {
                "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue",
                "valueString": "item.where(linkId = 'number').answer.value.first()"
              }
            ]
          },
          "use": "home", // Default value for field specified
          "_use": {
            "extension": [
              {
                "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue",
                "valueString": "item.where(linkId = 'use').answer.value.first().code"
              }
            ]
          }
        }
      ]
    }
  ],
  "extension": [
    {
      "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtract",
      "extension": [{ "url": "template", "valueReference": { "reference": "#patientTemplate" } }]
    }
  ],
  "item": [
    { "linkId": "name", "type": "string", "text": "fullName" },
    {
      "linkId": "phone",
      "type": "group",
      "repeats": true,
      "required": true,
      "item": [
        { "linkId": "number", "type": "string", "required": true },
        { "linkId": "use", "type": "choice", "answerValueSet": "http://hl7.org/fhir/ValueSet/contact-point-use" }
      ]
    }
  ]
}
```

The response shown below yields the following `Patient` resource:

```json
{
  "resourceType": "QuestionnaireResponse",
  "status": "completed",
  "item": [
    {
      "linkId": "phone",
      "item": [{ "linkId": "number", "answer": [{ "valueString": "+1 555 555 5555" }] }]
    },
    {
      "linkId": "phone",
      "item": [
        { "linkId": "number", "answer": [{ "valueString": "+1 800 555 5555" }] },
        { "linkId": "use", "answer": [{ "valueCoding": { "code": "work" } }] }
      ]
    }
  ]
}
```

```json
{
  "resourceType": "Patient",
  // No values for name provided in the response,
  // so the field is omitted entirely
  "telecom": [
    {
      "system": "phone",
      "use": "home", // Default value from template used when no result for item
      "value": "+1 555 555 5555"
    },
    {
      "system": "phone",
      "use": "work",
      "value": "+1 800 555 5555"
    }
  ]
}
```

[extract-template]: https://build.fhir.org/ig/HL7/sdc/extraction.html#template-extract
[extract-ext]: https://build.fhir.org/ig/HL7/sdc/StructureDefinition-sdc-questionnaire-templateExtract.html
[value-ext]: https://build.fhir.org/ig/HL7/sdc/StructureDefinition-sdc-questionnaire-templateExtractValue.html
[context-ext]: https://build.fhir.org/ig/HL7/sdc/StructureDefinition-sdc-questionnaire-templateExtractContext.html
[fhirpath]: https://hl7.org/fhir/fhirpath.html
