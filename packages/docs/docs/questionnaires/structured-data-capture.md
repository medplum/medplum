import ExampleCode from '!!raw-loader!@site/..//examples/src/questionnaires/structured-data-capture.ts';
import MedplumCodeBlock from '@site/src/components/MedplumCodeBlock';

# Structured Data Capture

After receiving a questionnaire response, many use cases require the response to be transformed into structured data,
i.e. other FHIR resources such as `Patient` or `Observation`. Medplum provides an implementation of the draft
[Structured Data Capture IG v4][sdc-ig], which can automatically parse responses to a specially-annotated Questionnaire
into any FHIR resource(s) necessary.

After adding template resources and special extensions with rules for populating them to the `Questionnaire`, associated
`QuestionnaireResponse` resources can be sent to the [`$extract` API][extract]. The API returns a [transaction Bundle][batch]
containing the parsed resources, which can then be uploaded to the server.

[sdc-ig]: https://build.fhir.org/ig/HL7/sdc/
[extract]: /docs/api/fhir/operations/extract
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
the resulting resource is valid. As an example, consider the slightly more complex scenario below.

### Example

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
          "use": "home", // Default value for field specified
          "_use": {
            "extension": [
              {
                "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue",
                "valueString": "item.where(linkId = 'use').answer.value.first().code"
              }
            ]
          },
          "system": "phone",
          "_value": {
            "extension": [
              {
                "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue",
                "valueString": "item.where(linkId = 'number').answer.value.first()"
              }
            ]
          }
        }
      ]
    }
  ],
  // Extract extension at root of Questionnaire initiates extraction into specified template
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
        { "linkId": "number", "answer": [{ "valueString": "+1 800 123 4567" }] },
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
      "use": "home", // Default value from template used when no result for item
      "system": "phone",
      "value": "+1 555 555 5555"
    },
    {
      "use": "work",
      "system": "phone",
      "value": "+1 800 123 4567"
    }
  ]
}
```

[extract-template]: https://build.fhir.org/ig/HL7/sdc/extraction.html#template-extract
[extract-ext]: https://build.fhir.org/ig/HL7/sdc/StructureDefinition-sdc-questionnaire-templateExtract.html
[value-ext]: https://build.fhir.org/ig/HL7/sdc/StructureDefinition-sdc-questionnaire-templateExtractValue.html
[context-ext]: https://build.fhir.org/ig/HL7/sdc/StructureDefinition-sdc-questionnaire-templateExtractContext.html
[fhirpath]: https://hl7.org/fhir/fhirpath.html

## Extraction API

When responses to the annotated Questionnaire are received, they can be passed to the [`$extract` API][extract] to be
parsed into resources.

<MedplumCodeBlock language="ts" selectBlocks="get">
  {ExampleCode}
</MedplumCodeBlock>

Alternatively, the questionnaire and response can be passed in directly, in case they are not stored on the Medplum
server:

<MedplumCodeBlock language="ts" selectBlocks="post">
  {ExampleCode}
</MedplumCodeBlock>

[extract]: /docs/api/fhir/operations/extract

## Results Bundle

The resources populated with values parsed from the `QuestionnaireResponse` are returned from the `$extract` operation
in a transaction [`Bundle`][bundle]:

```json
{
  "resourceType": "Bundle",
  "type": "transaction",
  "entry": [
    {
      "fullUrl": "urn:uuid:4a51e8bd-0170-412d-a78c-0ca2fb174dca",
      "request": { "method": "POST", "url": "Patient" },
      "resource": {
        "resourceType": "Patient",
        "name": { "text": "John Doe" },
        "telecom": [{ "use": "home", "system": "phone", "value": "+1 555 555 5555" }]
      }
    }
  ]
}
```

This can be uploaded via the [Batch API][batch] to save the generated resources to the Medplum server.

[bundle]: /docs/api/fhir/resources/bundle

## Parsing Multiple Resources

Many questionnaires gather information that must be processed into multiple separate FHIR resources, often ones that
link together via references. To [link the resources together][bundle-intern-refs] in the results `Bundle`, place one
or more [`extractAllocateId`][allocate-id] extensions at the root of the `Questionnaire` to pregenerate an internal
reference string that can be assigned to a template during extraction via the associated `templateExtract` extension
and then referenced in other resource templates.

```json
{
  "resourceType": "Questionnaire",
  "status": "draft",
  "extension": [
    {
      "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-extractAllocateId",
      // Allocate internal UUID reference for Patient resource
      "valueString": "patientRef"
    }
  ],
  "contained": [
    {
      "resourceType": "Patient",
      // NOTE: This ID refers to the template itself,
      // not the generated ID for intra-Bundle linking
      "id": "patient",
      "name": [
        {
          "_text": {
            "extension": [
              {
                "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue",
                "valueString": "answer.value.first()"
              }
            ]
          }
        }
      ]
    },
    {
      "resourceType": "Observation",
      "id": "star-sign",
      "status": "final",
      "code": { "text": "Astrological sign" },
      "valueCodeableConcept": {
        "coding": [
          {
            "extension": [
              {
                "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue",
                // Simplified expressions because the extraction context is
                // the relevant QuestionnaireResponse.item
                "valueString": "answer.value"
              }
            ]
          }
        ]
      },
      "subject": {
        "_reference": {
          "extension": [
            {
              "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue",
              // Refer to the generated reference as a FHIRPath variable with %
              "valueString": "%patientRef"
            }
          ]
        }
      }
    }
  ],
  "item": [
    {
      "linkId": "name",
      "type": "string",
      "text": "Full Name",
      "required": true,
      // Starting the extraction in the context of the relevant item simplifies extract rules
      "extension": [
        {
          "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtract",
          "extension": [
            { "url": "template", "valueReference": { "reference": "#patient" } },
            // Assign the generated UUID to this generated resource
            { "url": "fullUrl", "valueString": "%patientRef" }
          ]
        }
      ]
    },
    {
      "linkId": "star-sign",
      "type": "choice",
      "required": true,
      "answerValueSet": "http://example.com/ValueSet/astrological-signs",
      // Separate extraction context for Observation resource
      "extension": [
        {
          "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtract",
          "extension": [{ "url": "template", "valueReference": { "reference": "#star-sign" } }]
        }
      ]
    }
  ]
}
```

A single response to the questionnaire will extract a Bundle containing two resources:

```json
{
  "resourceType": "QuestionnaireResponse",
  "status": "completed",
  "item": [
    { "linkId": "name", "answer": [{ "valueString": "Frodo Baggins" }] },
    {
      "linkId": "star-sign",
      "answer": [
        {
          "valueCoding": {
            "system": "http://example.com/CodeSystem/western-zodiac",
            "code": "libra"
          }
        }
      ]
    }
  ]
}
```

```json
{
  "resourceType": "Bundle",
  "type": "transaction",
  "entry": [
    {
      // UUID assigned to Patient
      "fullUrl": "urn:uuid:016f7fad-a7f6-4ea4-bae1-ed2e0ac49d2d",
      "request": { "method": "POST", "url": "Patient" },
      "resource": {
        "resourceType": "Patient",
        "name": [{ "text": "Frodo Baggins" }]
      }
    },
    {
      "fullUrl": "urn:uuid:6aa46a76-a1e4-4285-b872-19d040bea8c9",
      "request": { "method": "POST", "url": "Observation" },
      "resource": {
        "resourceType": "Observation",
        "status": "final",
        "code": { "text": "Astrological sign" },
        "valueCodeableConcept": {
          "coding": [
            {
              "system": "http://example.com/CodeSystem/western-zodiac",
              "code": "libra"
            }
          ]
        },
        // Reference used in Observation
        "subject": { "reference": "urn:uuid:016f7fad-a7f6-4ea4-bae1-ed2e0ac49d2d" }
      }
    }
  ]
}
```

[bundle-intern-refs]: /docs/fhir-datastore/fhir-batch-requests#internal-references
[allocate-id]: https://build.fhir.org/ig/HL7/sdc/StructureDefinition-sdc-questionnaire-extractAllocateId.html
