---
title: Parsing Questionnaire Responses
keywords:
  - questionnaires
  - SDC
  - extract
  - bots
tags:
  - questionnaires
---

import ExampleCode from '!!raw-loader!@site/..//examples/src/questionnaires/structured-data-capture.ts';
import MedplumCodeBlock from '@site/src/components/MedplumCodeBlock';

# Parsing Questionnaire Responses

A [`QuestionnaireResponse`](/docs/api/fhir/resources/questionnaireresponse) captures what a patient or clinician submitted. Downstream systems – analytics, search, CDS, exchange – usually need that turned into concrete FHIR resources: [`Observation`](/docs/api/fhir/resources/observation), [`Condition`](/docs/api/fhir/resources/condition), orders, and similar. This applies across charting, intake, registration, prior authorization, and other workflows.

Medplum supports two parsing approaches. You can use both in the same application – different Questionnaires can use different methods depending on their complexity.

## Choosing an Approach

| | SDC annotations + [`$extract`][extract] | Subscription + [Bot][bot-guide] |
|---|---|---|
| How it works | Extraction rules live in the Questionnaire itself as FHIR extensions; `$extract` reads them and returns a Bundle | A Bot subscribes to `QuestionnaireResponse` creation; runs arbitrary TypeScript to write resources |
| Best for | Straightforward field-to-resource mappings; forms that change often | Scoring algorithms, conditional logic, multi-step workflows, external API calls |
| Change management | Edit the Questionnaire; no deployment needed | Redeploy Bot on logic changes; keep Bot and Questionnaire versions in sync |
| Limitations | Complex branching or external lookups get unwieldy | Requires Bot infrastructure; harder to inspect logic from the Questionnaire alone |

Pick `$extract` when the mapping is mostly one field → one resource field, and you want the logic to live beside the form definition.

Pick a Bot when you need to score a PHQ-9, write resources conditionally, call an external service, or otherwise do something that does not fit a declarative template.

You can also combine them: use `$extract` for simple demographic or intake data, and a Bot for the clinical scoring logic on the same submission.

For visit-level orchestration that launches forms and orders together, see [Visit Templates and the SOAP Approach](/docs/charting/visit-templates).

[sdc-ig]: https://build.fhir.org/ig/HL7/sdc/
[extract]: /docs/api/fhir/operations/extract
[batch]: /docs/fhir-datastore/fhir-batch-requests
[bot-guide]: /docs/bots/bot-for-questionnaire-response

## Approach 1: SDC Annotations + $extract

Annotate the `Questionnaire` with template resources and FHIRPath extraction rules. When a `QuestionnaireResponse` is submitted, call [`$extract`][extract]; Medplum reads the annotations and returns a [transaction Bundle][batch] of populated resources ready to upload.

### Annotating the Questionnaire

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

The value extension is placed on the field of the template resource into which a value should be placed. Since the
fields containing these values often have "primitive" data types (e.g. `string`), they do not have a straightforward place
to attach an extension. In these cases, a [FHIR primitive extension][fhir-primitive-ext] uses a special
underscore-prefixed version of the field to contain the extension(s):

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
          // Primitive extension on the `text` field contains the value extension
          "_text": {
            "extension": [
              {
                "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue",
                // Since name is required, this is safe
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
      "required": true
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

:::info[Value Extraction]

The template extraction extensions are expected to contain [FHIRPath][fhirpath] expressions that return the value(s) to
be inserted into the template. If no values are returned, the field is removed from the template; more than one result
is inserted as an array of values. Using functions like `first()` in the expression can help ensure the correct number
of values are returned and ensure the resulting resource is well-formed.

:::

[fhir-primitive-ext]: https://hl7.org/fhir/R4/json.html#primitive

#### Extraction Context

When the FHIRPath expression to extract a value is evaluated, the context on which
it evaluates will initially be either the entire `QuestionnaireResponse` resource or a specific
`QuestionnaireResponse.item`; the choice depends on whether the relevant `templateExtract` extension was placed at the
top level of the `Questionnaire` or on a specific `Questionnaire.item`.

Combined with the value extraction logic described above for empty or multiple results, this can potentially produce
resource JSON that is structurally invalid.

<details>
  <summary>Example: erroneous Questionnaire and invalid outputs</summary>

Consider the following erroneous questionnaire:

```json
// NOTE: This Questionnaire does not work as expected; it is intended to show incorrect usage
{
  "resourceType": "Questionnaire",
  "status": "unknown",
  "extension": [
    {
      "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtract",
      "extension": [{ "url": "template", "valueReference": { "reference": "#patientTemplate" } }]
    }
  ],
  "contained": [
    {
      "resourceType": "Patient",
      "id": "patientTemplate",
      "name": [
        {
          "use": "usual",
          "_text": {
            "extension": [
              // Nested value extension can produce zero, one, or many values
              {
                "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue",
                "valueString": "item.where(linkId = 'name').answer.value"
              }
            ]
          }
        }
      ]
    }
  ],
  "item": [
    {
      "linkId": "name",
      "type": "string",
      // QuestionnaireResponse can have zero, one, or many `name` items
      "repeats": true
    }
  ]
}
```

If a response to this questionnaire does not contain a `name` item, the resulting Patient would contain an extraneous empty `name`:

```json
{
  "resourceType": "Patient",
  // Valid but probably incorrect: `name` should be omitted entirely
  "name": [{ "use": "usual" }]
}
```

If multiple names are specified, the resource would have an invalid array for `Patient.name.text`:

```json
{
  "resourceType": "Patient",
  // Invalid: `text` must be a string, not an array
  "name": [{ "use": "usual", "text": ["John Doe", "John Q. Public"] }]
}
```

</details>

With optional or repeating response items, it is critical to use `templateExtractContext` extensions to ensure that
the resulting resource is well-formed. The context extension specifies a FHIRPath expression that is evaluated
similarly to the value extension. However, instead of directly inserting the resulting values into the template, the
context extension:

1. Creates a copy of the parent element for each resulting value, and
2. Evaluates all nested value and context extensions underneath on each individual result

This resolves the problems with the `Questionnaire` above by linking the `name` items in the response to the `Patient.name`
objects themselves, and extracting nested values from each one. A corrected example that handles optional and
repeating items is shown below.

#### Example

<details>
  <summary>Corrected Questionnaire using templateExtractContext</summary>

```json
{
  "resourceType": "Questionnaire",
  "status": "draft",
  // Extract extension at root of Questionnaire initiates extraction into specified template
  "extension": [
    {
      "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtract",
      "extension": [{ "url": "template", "valueReference": { "reference": "#patientTemplate" } }]
    }
  ],
  "contained": [
    {
      "resourceType": "Patient",
      "id": "patientTemplate",
      "name": [
        {
          // Context extension placed at top of the object to be inserted for each answer
          "extension": [
            {
              "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractContext",
              // Context expression linked to response items
              "valueString": "item.where(linkId = 'name')"
            }
          ],
          "_text": {
            // Nested value extensions are relative to parent context,
            // and are evaluated separately for each result item
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
                // Overrides the default if it returns a value
                "valueString": "item.where(linkId = 'use').answer.value.first().code"
              }
            ]
          }
        }
      ]
    }
  ],
  "item": [
    { "linkId": "name", "type": "string" },
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

</details>

The response to this questionnaire shown below yields the following `Patient` resource:

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
      "system": "phone",
      "use": "home", // Default value from template used when no result for item
      "value": "+1 555 555 5555"
    },
    {
      "system": "phone",
      "use": "work",
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

#### Gathering Additional Data

If data from additional resources is required to populate the templates, search queries can be executed as part of the
extraction process and their results stored in context to be operated on by later expressions. Queries are attached in
context extensions using the [`application/x-fhir-query` language][x-fhir-query] to describe the search request, with
the option to embed FHIRPath expressions as needed to construct the query string.

<details>
  <summary>Example: Questionnaire using x-fhir-query to look up a Medication</summary>

```json
{
  "resourceType": "Questionnaire",
  "status": "draft",
  "extension": [
    {
      "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtract",
      "extension": [{ "url": "template", "valueReference": { "reference": "#procedureTmpl" } }]
    }
  ],
  "contained": [
    {
      "resourceType": "Procedure",
      "id": "procedureTmpl",
      "extension": [
        {
          "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractContext",
          "valueExpression": {
            "language": "application/x-fhir-query",
            // Search string constructed using embedded FHIRPath expression in curly braces
            "expression": "Medication?_count=1&code={{ item.where(linkId='anesthetic').answer.value }}",
            // Search request is executed, with results Bundle placed into named context variable
            // See https://hl7.org/fhir/R4/bundle.html#searchset
            "name": "AnestheticBundle"
          }
        }
      ],
      "status": "in-progress",
      "code": {
        "coding": [
          {
            "system": "http://snomed.info/sct",
            "code": "708803008",
            "display": "Wedge resection of ingrowing toenail"
          }
        ]
      },
      "usedReference": [
        {
          "extension": [
            {
              "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractContext",
              // Extract resource from search results, if one exists
              "valueString": "%AnestheticBundle.entry.resource.first()"
            }
          ],
          "_reference": {
            "extension": [
              {
                "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtractValue",
                // Populate reference to existing resource on the server
                "valueString": "'Medication/' + id"
              }
            ]
          }
        }
      ]
    }
  ],
  "item": [
    {
      "linkId": "anesthetic",
      "type": "choice",
      "answerValueSet": "http://example.com/ValueSet/topical-anesthetic",
      // Coding required, with initial value populated as an example
      "required": true,
      "initial": [
        {
          "valueCoding": {
            "system": "http://www.nlm.nih.gov/research/umls/rxnorm",
            "code": "197877"
          }
        }
      ]
    }
  ]
}
```

</details>

[x-fhir-query]: https://hl7.org/fhir/fhir-xquery.html

### Extraction API

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

### Results Bundle

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

### Parsing Multiple Resources

Many questionnaires gather information that must be processed into multiple separate FHIR resources, generally by
grouping together questions that pertain to a particular resource. To simplify the process of extracting related items,
the `templateExtract` extension can be placed on the question or group corresponding to that template resource.

<details>
  <summary>Example: Questionnaire extracting Patient and Observation</summary>

```json
{
  "resourceType": "Questionnaire",
  "status": "draft",
  "contained": [
    {
      "resourceType": "Patient",
      "id": "patient",
      "name": [
        {
          "_text": {
            "extension": [
              // Since the `name` question is required but doesn't repeat,
              // its answer should always have exactly one value
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
                // set to the relevant QuestionnaireResponse.item
                "valueString": "answer.value"
              }
            ]
          }
        ]
      }
    }
  ],
  "item": [
    {
      "linkId": "name",
      "type": "string",
      "required": true,
      // Starting the extraction in the context of the relevant item simplifies extract rules
      "extension": [
        {
          "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtract",
          "extension": [{ "url": "template", "valueReference": { "reference": "#patient" } }]
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

</details>

#### Linking Extracted Resources

When the resources being extracted from the questionnaire response are related, such as the above `Patient` and
`Observation`, you may want to link the extracted resources together with a reference like `Observation.subject`.

To [link resources together][bundle-intern-refs] in the resulting `Bundle`, place one or more
[`extractAllocateId`][allocate-id] extensions at the root of the `Questionnaire` to pregenerate an internal
reference string that can be assigned to a template during extraction via the associated `templateExtract` extension
and then referenced in other resource templates.

1. Place one or more [`extractAllocateId`][allocate-id] extensions at the root of the `Questionnaire` to pregenerate
   necessary internal reference string(s) and assign them to a FHIRPath variable
2. Specify the FHIRPath variable in the `fullUrl` field of the relevant `templateExtract` extension to assign the ID
   to an extracted resource
3. Reference the variable in any `templateExtractValue` extensions where the link should be inserted

<details>
  <summary>Example: full Questionnaire, response, and extracted Bundle with cross-references</summary>

```json
{
  "resourceType": "Questionnaire",
  "status": "draft",
  "extension": [
    {
      "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-extractAllocateId",
      // (1) Allocate internal UUID reference for Patient resource
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
              // (3) Refer to the generated reference as a FHIRPath variable with %
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
      "required": true,
      "extension": [
        {
          "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-templateExtract",
          "extension": [
            { "url": "template", "valueReference": { "reference": "#patient" } },
            // (2) Assign the generated UUID to this generated resource
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
      // Pregenerated UUID assigned to Patient
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
        // Assigned UUID reference used in Observation
        "subject": { "reference": "urn:uuid:016f7fad-a7f6-4ea4-bae1-ed2e0ac49d2d" }
      }
    }
  ]
}
```

</details>

[bundle-intern-refs]: /docs/fhir-datastore/fhir-batch-requests#internal-references
[allocate-id]: https://build.fhir.org/ig/HL7/sdc/StructureDefinition-sdc-questionnaire-extractAllocateId.html

## Approach 2: Subscription + Bot

A [Medplum Bot](/docs/bots/) is a TypeScript function that runs server-side in response to a FHIR event. For questionnaire parsing, the typical wiring is:

1. Create a `Subscription` that fires on `QuestionnaireResponse` creation (or status change to `completed`).
2. The Bot receives the `QuestionnaireResponse` as its input.
3. The Bot reads answers by `linkId`, computes whatever it needs (scores, lookups, conditionals), and writes the resulting FHIR resources.

### When to Use a Bot

- Scoring instruments – PHQ-9, GAD-7, AUDIT-C, or any form where answers combine into a computed result.
- Conditional multi-resource writes – write different resources depending on which answers are present, or skip resources entirely based on logic.
- External integrations – call a lab system, EHR API, or notification service as part of processing.
- Complex cross-referencing – look up existing resources, merge data, or apply business rules that FHIRPath templates cannot express cleanly.

### Pattern

```typescript
import { BotEvent, MedplumClient } from '@medplum/core';
import { QuestionnaireResponse } from '@medplum/fhirtypes';

export async function handler(medplum: MedplumClient, event: BotEvent<QuestionnaireResponse>): Promise<void> {
  const response = event.input;

  // Helper to pull an answer by linkId
  const getAnswer = (linkId: string) =>
    response.item?.find((i) => i.linkId === linkId)?.answer?.[0];

  const score = computeScore(response); // your scoring logic

  await medplum.createResource({
    resourceType: 'Observation',
    status: 'final',
    code: { text: 'PHQ-9 score' },
    subject: response.subject,
    valueInteger: score,
  });
}
```

For a complete walkthrough – including Questionnaire authoring, Bot deployment, and Subscription wiring – see [Bot for QuestionnaireResponse][bot-guide].

### Mixing Approaches in One Application

Different Questionnaires in the same app can use different methods. A common split:

- Intake / registration forms – use `$extract`; mappings are simple and clinicians edit forms frequently.
- Clinical scoring instruments – use a Bot; the scoring algorithm is code, not a declarative template.
- Complex multi-step workflows – Bot, because you need conditional logic and possibly external calls.

## See Also

- [Bot for QuestionnaireResponse][bot-guide] – step-by-step tutorial for the Subscription + Bot pattern
- [`$extract` API reference][extract]
- [Visit Templates and the SOAP Approach](/docs/charting/visit-templates) – orchestrating forms and orders together
- [Intake Questionnaires](/docs/intake/intake-questionnaires) – SDC patterns in the intake workflow
- [FHIR Batch Requests][batch] – uploading the Bundle returned by `$extract`
