# Multi-lingual Support

FHIR provides a standard mechanism for attaching translations to any string field in a resource: the
[`translation` extension](http://hl7.org/fhir/StructureDefinition/translation). This lets you store the primary
text of a field in one language while embedding translations for other languages directly inside the same resource,
keeping all language variants together and avoiding the need to maintain separate per-language copies of your data.

## How the Extension Works

In FHIR JSON, every string primitive can have a "shadow" element — a sibling property prefixed with `_` — that
carries extensions and metadata about that value. The `translation` extension is placed on this shadow element:

```js
{
  // The primary (default) value of the field
  "text": "What is your name?",

  // Shadow element carrying translations for the same field
  "_text": {
    "extension": [
      {
        "url": "http://hl7.org/fhir/StructureDefinition/translation",
        "extension": [
          { "url": "lang", "valueCode": "es" },
          { "url": "content", "valueString": "¿Cómo se llama?" }
        ]
      },
      {
        "url": "http://hl7.org/fhir/StructureDefinition/translation",
        "extension": [
          { "url": "lang", "valueCode": "fr" },
          { "url": "content", "valueString": "Quel est votre nom ?" }
        ]
      }
    ]
  }
}
```

Each repetition of the `translation` extension represents one translation, with two required sub-extensions:

| Sub-extension | Type | Description |
|---|---|---|
| `lang` | `code` | BCP-47 language tag (e.g. `es`, `fr`, `zh-CN`, `pt-BR`) |
| `content` | `string` | The translated text in the target language |

The extension can appear on **any string or markdown primitive** in any FHIR resource.

## Common Use Cases

### Multilingual Questionnaires

Patient-facing intake forms are one of the most common places to use the translation extension. Embedding all
language variants in a single [`Questionnaire`](/docs/api/fhir/resources/questionnaire) resource keeps the form
definition self-contained and ensures each question's translations stay synchronized with the primary text.

```js
{
  "resourceType": "Questionnaire",
  "status": "active",
  "title": "Patient Intake",
  "_title": {
    "extension": [
      {
        "url": "http://hl7.org/fhir/StructureDefinition/translation",
        "extension": [
          { "url": "lang", "valueCode": "es" },
          { "url": "content", "valueString": "Registro de paciente" }
        ]
      }
    ]
  },
  "item": [
    {
      "linkId": "preferred-language",
      "type": "choice",
      "text": "What is your preferred language?",
      "_text": {
        "extension": [
          {
            "url": "http://hl7.org/fhir/StructureDefinition/translation",
            "extension": [
              { "url": "lang", "valueCode": "es" },
              { "url": "content", "valueString": "¿Cuál es su idioma preferido?" }
            ]
          },
          {
            "url": "http://hl7.org/fhir/StructureDefinition/translation",
            "extension": [
              { "url": "lang", "valueCode": "zh-CN" },
              { "url": "content", "valueString": "您的首选语言是什么？" }
            ]
          }
        ]
      }
    }
  ]
}
```

### Translating Coding Display Strings

The `display` field of a [`Coding`](/docs/api/fhir/datatypes/coding) can carry translations the same way. This is
useful when your application renders coded values directly from a resource and needs to show the correct language to
the end user:

```js
{
  "resourceType": "Condition",
  "subject": { "reference": "Patient/example" },
  "code": {
    "coding": [
      {
        "system": "http://snomed.info/sct",
        "code": "44054006",
        "display": "Diabetes mellitus type 2",
        "_display": {
          "extension": [
            {
              "url": "http://hl7.org/fhir/StructureDefinition/translation",
              "extension": [
                { "url": "lang", "valueCode": "es" },
                { "url": "content", "valueString": "Diabetes mellitus tipo 2" }
              ]
            },
            {
              "url": "http://hl7.org/fhir/StructureDefinition/translation",
              "extension": [
                { "url": "lang", "valueCode": "fr" },
                { "url": "content", "valueString": "Diabète sucré de type 2" }
              ]
            }
          ]
        }
      }
    ],
    "text": "Diabetes mellitus type 2"
  },
  "clinicalStatus": {
    "coding": [
      {
        "system": "http://terminology.hl7.org/CodeSystem/condition-clinical",
        "code": "active"
      }
    ]
  }
}
```

### Clinical Notes and Narrative Text

Free-text fields like `Annotation.text` (used in `Condition.note`, `MedicationRequest.note`, etc.) and
`Narrative.div` also support the pattern. Notes are commonly authored in the clinician's language and then
translated for patient-facing portals:

```js
{
  "resourceType": "Condition",
  "subject": { "reference": "Patient/example" },
  "note": [
    {
      "text": "Patient reports symptoms began three weeks ago.",
      "_text": {
        "extension": [
          {
            "url": "http://hl7.org/fhir/StructureDefinition/translation",
            "extension": [
              { "url": "lang", "valueCode": "es" },
              {
                "url": "content",
                "valueString": "El paciente reporta que los síntomas comenzaron hace tres semanas."
              }
            ]
          }
        ]
      }
    }
  ]
}
```

## Reading Translations in Your Application

### Extracting a Translation for a Known Language

To display a translated value, walk the shadow element's extensions and find the `translation` entry whose `lang`
matches the desired locale:

```ts
import { Extension } from '@medplum/fhirtypes';

/**
 * Returns the translation of a primitive string field for the given BCP-47 language tag,
 * falling back to the primary value if no translation is found.
 *
 * @param primaryValue - The primary (default) string value of the field.
 * @param shadowElement - The `_fieldName` shadow element from the FHIR resource.
 * @param lang - BCP-47 language tag to look up (e.g. 'es', 'fr', 'zh-CN').
 */
function getTranslation(
  primaryValue: string | undefined,
  shadowElement: { extension?: Extension[] } | undefined,
  lang: string
): string | undefined {
  const translations = shadowElement?.extension?.filter(
    (ext) => ext.url === 'http://hl7.org/fhir/StructureDefinition/translation'
  );

  for (const t of translations ?? []) {
    const langExt = t.extension?.find((e) => e.url === 'lang');
    const contentExt = t.extension?.find((e) => e.url === 'content');
    if (langExt?.valueCode === lang && contentExt?.valueString) {
      return contentExt.valueString;
    }
  }

  return primaryValue;
}
```

**Usage example** — rendering a Questionnaire item in the user's language:

```ts
const item = questionnaire.item?.[0];
const userLang = 'es';

const label = getTranslation(item?.text, item?._text, userLang);
// → "¿Cómo se llama?" (falls back to "What is your name?" if no Spanish translation exists)
```

### Matching with BCP-47 Language Tags

Language tags follow [BCP 47](https://www.rfc-editor.org/rfc/rfc5646) conventions. When matching, prefer an exact
match first, then fall back to the base language if a region-specific variant is not found
(e.g. try `pt-BR` first, then `pt`):

```ts
function getBestTranslation(
  primaryValue: string | undefined,
  shadowElement: { extension?: Extension[] } | undefined,
  lang: string
): string | undefined {
  // Try exact match first (e.g. 'pt-BR')
  const exact = getTranslation(primaryValue, shadowElement, lang);
  if (exact !== primaryValue) return exact;

  // Fall back to base language tag (e.g. 'pt')
  const baseLang = lang.split('-')[0];
  if (baseLang !== lang) {
    return getTranslation(primaryValue, shadowElement, baseLang);
  }

  return primaryValue;
}
```

## Storing the Patient's Preferred Language

Record a patient's preferred language on the [`Patient`](/docs/api/fhir/resources/patient) resource using the
`communication` field. This is the standard FHIR way to track which language to use when communicating with a
patient, and your application can use it to select the right translation at render time:

```js
{
  "resourceType": "Patient",
  "name": [{ "given": ["Maria"], "family": "Garcia" }],
  "communication": [
    {
      "language": {
        "coding": [
          {
            "system": "urn:ietf:bcp:47",
            "code": "es",
            "display": "Spanish"
          }
        ]
      },
      "preferred": true
    }
  ]
}
```

## Relationship to CodeSystem Designations

The `translation` extension and [`CodeSystem.designation`](/docs/terminology/medplum-terminology-services#internationalizing-codings)
serve different purposes and are complementary:

| Mechanism | Where it lives | Best for |
|---|---|---|
| `translation` extension | On individual resource fields (via `_fieldName`) | Translating free text, notes, questionnaire items, narrative, and `Coding.display` in a specific resource |
| `CodeSystem.designation` + `ValueSet/$expand` | In the terminology server | Translating standardized code display names across the system; powering language-aware code searches |

For coded values, prefer managing translations centrally in `CodeSystem` designations so they are automatically
available anywhere that code is used. Use the `translation` extension for free-text fields and for overriding or
supplementing a code's display in the context of a specific resource.

## Example App

The [medplum-multilingual-demo](https://github.com/medplum/medplum/tree/main/examples/medplum-multilingual-demo)
example app demonstrates all of the patterns on this page in a working React application:

- A multilingual [`Questionnaire`](/docs/api/fhir/resources/questionnaire) with translated item text, submitted as a
  [`QuestionnaireResponse`](/docs/api/fhir/resources/questionnaireresponse) that records the language used
- [`Condition`](/docs/api/fhir/resources/condition) resources with translated `Coding.display` strings
- Reading [`Patient.communication`](/docs/api/fhir/resources/patient) to automatically select the patient's preferred language

## Further Reading

- [FHIR Translation Extension specification](http://hl7.org/fhir/StructureDefinition/translation)
- [FHIR Internationalizing FHIR guidance](https://www.hl7.org/fhir/r4/languages.html)
- [Medplum Terminology Services — Internationalizing Codings](/docs/terminology/medplum-terminology-services#internationalizing-codings)
- [Questionnaire resource reference](/docs/api/fhir/resources/questionnaire)
- [Patient resource reference](/docs/api/fhir/resources/patient)
