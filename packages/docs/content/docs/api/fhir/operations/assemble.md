---
id: assemble
title: Questionnaire $assemble
---

The `$assemble` operation turns a modular Questionnaire into a single, complete Questionnaire. Each item that imports another Questionnaire with the [`subQuestionnaire`][sub-questionnaire] extension is replaced by the items of the imported Questionnaire, so the result can be rendered and answered like any other form.

This follows the [SDC Modular Forms][modular] approach, which lets you author reusable sections such as demographics, contact details, or screening questions once and import them into many forms.

## Use Cases

- **Shared Sections**: Reuse the same demographics or insurance section across intake forms
- **Repeated Sections**: Import one contact module twice, as a home and a work contact, with distinct linkIds
- **Versioned Content**: Pin each form to a specific version of its modules so published forms do not change when a module is updated

[sub-questionnaire]: https://build.fhir.org/ig/HL7/sdc/StructureDefinition-sdc-questionnaire-subQuestionnaire.html
[modular]: https://build.fhir.org/ig/HL7/sdc/modular.html

## Invoke the `$assemble` operation

```
[baseUrl]/Questionnaire/$assemble
[baseUrl]/Questionnaire/[id]/$assemble
```

## Parameters

| Name            | Type            | Description                   | Required       |
| --------------- | --------------- | ----------------------------- | -------------- |
| `questionnaire` | `Questionnaire` | The Questionnaire to assemble | No<sup>1</sup> |

<sup>1</sup> If not called on a specific `Questionnaire` by ID, the Questionnaire must be specified via the `questionnaire` parameter, or sent directly as the request body.

## Importing a Questionnaire

An import is a `display` item with a `subQuestionnaire` extension whose value is the canonical URL of the Questionnaire to import. Include the version (`url|version`) to pin a specific version; an unversioned URL is only accepted when exactly one Questionnaire matches it.

```json
{
  "linkId": "name-import",
  "type": "display",
  "extension": [
    {
      "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-subQuestionnaire",
      "valueCanonical": "https://example.com/Questionnaire/name|1"
    }
  ]
}
```

Imported Questionnaires can import other Questionnaires. A Questionnaire that imports itself, directly or indirectly, is rejected.

### Prefixing linkIds

To import the same Questionnaire more than once, declare a `linkIdPrefix` variable on the group that contains the import. The prefix is added to each imported item's `linkId`, including items from nested imports, and to `enableWhen` conditions that refer to imported items.

```json
{
  "linkId": "home",
  "type": "group",
  "extension": [
    {
      "url": "http://hl7.org/fhir/StructureDefinition/variable",
      "valueExpression": { "name": "linkIdPrefix", "language": "text/fhirpath", "expression": "'home.'" }
    }
  ],
  "item": [
    {
      "linkId": "phone-import",
      "type": "display",
      "extension": [
        {
          "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-subQuestionnaire",
          "valueCanonical": "https://example.com/Questionnaire/phone|1"
        }
      ]
    }
  ]
}
```

## Output

The operation returns the assembled `Questionnaire`. It does not persist the result or modify the source Questionnaire. The assembled Questionnaire:

- Has no `id`, so it can be saved as a new resource
- Keeps the source `url`, with `-assembled` appended to its `version`
- Includes an [`assembledFrom`](https://build.fhir.org/ig/HL7/sdc/StructureDefinition-sdc-questionnaire-assembledFrom.html) extension pointing to the source `url|version`, when the source has a `url`
- Drops the `assemble-expectation` extension, since it no longer needs assembly

The operation fails with a `400 Bad Request` and an `OperationOutcome` describing the problem if:

- An imported Questionnaire cannot be found, or an unversioned URL matches more than one version
- A Questionnaire imports itself, directly or indirectly
- The assembled Questionnaire has duplicate linkIds, for example a Questionnaire imported twice without a `linkIdPrefix`
- An import item has `enableWhen`; put the condition on a group that contains the import instead
- A `linkIdPrefix` is not a FHIRPath expression that evaluates to a string
- An imported Questionnaire has contained resources, or root-level variables, launch contexts, or libraries, which its items may depend on but which are not carried over

**Request**:

```http
GET https://api.medplum.com/fhir/R4/Questionnaire/f80e508b-9aaa-41e3-aa8e-0e4817c86b44/$assemble
```

```bash
curl 'https://api.medplum.com/fhir/R4/Questionnaire/f80e508b-9aaa-41e3-aa8e-0e4817c86b44/$assemble' \
  -H "Authorization: Bearer $MY_ACCESS_TOKEN"
```

**Response** (200 OK):

```json
{
  "resourceType": "Questionnaire",
  "status": "active",
  "url": "https://example.com/Questionnaire/intake",
  "version": "1-assembled",
  "extension": [
    {
      "url": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-assembledFrom",
      "valueCanonical": "https://example.com/Questionnaire/intake|1"
    }
  ],
  "item": [
    { "linkId": "reason", "type": "string", "text": "Reason for visit" },
    { "linkId": "given", "type": "string", "text": "Given name" },
    { "linkId": "family", "type": "string", "text": "Family name" }
  ]
}
```

## Limitations

- `item.definition` references are not expanded
- FHIRPath expressions that refer to linkIds, such as `enableWhenExpression` or `calculatedExpression`, are not updated when a `linkIdPrefix` is applied
- `linkIdPrefix` must be a string literal, such as `'home.'`

## Related

- [Modular Questionnaires](/docs/questionnaires/modular-questionnaires) - Composing questionnaires from reusable parts
- [QuestionnaireResponse $extract](/docs/api/fhir/operations/extract) - Extract resources from a completed response
- [FHIR Questionnaire Resource](https://hl7.org/fhir/R4/questionnaire.html) - FHIR specification for Questionnaire
- [SDC Modular Forms](https://build.fhir.org/ig/HL7/sdc/modular.html) - SDC guidance for modular questionnaires
- [Medplum Questionnaires Guide](/docs/questionnaires) - Building and using questionnaires in Medplum
