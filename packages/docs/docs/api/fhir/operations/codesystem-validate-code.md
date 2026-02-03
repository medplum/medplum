# CodeSystem $validate-code

Validating codes at the point of entry is necessary to prevent data quality issues that can cascade through analytics, clinical decision support, and interoperability workflows. Invalid codes can cause workflow failures, incorrect reports, and missed clinical alerts - all of which degrade clinical experiences.

The `$validate-code` operation checks whether a code exists within a specific code system and returns its display text if found. This is fundamental for data quality-ensuring that clinical data uses valid, recognized codes before storing or processing it.

## Use Cases

- **Form and Input Validation**: Verify user-entered codes or confirm selected codes from autocomplete/typeahead are valid before saving clinical data
- **Interface Validation**: Check incoming codes from external systems (labs, pharmacies, EHRs) before processing
- **Data Quality Checks**: Audit existing data to identify invalid or deprecated codes
- **Migration Validation**: Ensure codes are valid when importing data from legacy systems

## Invoke the `$validate-code` operation

```
[baseUrl]/CodeSystem/$validate-code
[baseUrl]/CodeSystem/[id]/$validate-code
```

## Parameters

| Name      | Type     | Description                                               | Required              |
| --------- | -------- | --------------------------------------------------------- | --------------------- |
| `url`     | `uri`    | The canonical URL of the `CodeSystem` to validate against | No<sup>\*</sup>       |
| `version` | `string` | The version of the code system to search.                 | No                    |
| `code`    | `string` | The code to look up.                                      | No<sup>&#x2020;</sup> |
| `coding`  | `Coding` | Look up via full Coding.                                  | No<sup>&#x2020;</sup> |

<sup>\*</sup> If no `url` is provided, the operation must be invoked on a specific `ValueSet` instance.

<sup>&#x2020;</sup> One of `code` or `coding` must be provided.

## Output

The operation returns a `Parameters` resource containing the validation result.

| Name      | Type      | Description                                              | Required |
| --------- | --------- | -------------------------------------------------------- | -------- |
| `result`  | `boolean` | Whether or not the coding is from the given `CodeSystem` | Yes      |
| `display` | `string`  | The display text of the included code                    | No       |

## Examples

**Request**:

```bash
curl 'https://api.medplum.com/fhir/R4/CodeSystem/$validate-code' \
  --get \
  -H "Authorization: Bearer $MY_ACCESS_TOKEN" \
  -d 'url=http://snomed.info/sct' \
  -d 'code=255604002'
```

**Response**: (200 OK)

```js
{
  "resourceType": "Parameters",
  "parameter": [
    { "name": "result", "valueBoolean": true },
    { "name": "display", "valueString": "Mild (qualifier value)" }
  ]
}
```

## Related

- [ValueSet $validate-code](/docs/api/fhir/operations/valueset-validate-code) - Validate codes against value sets
- [CodeSystem $lookup](/docs/api/fhir/operations/codesystem-lookup) - Get detailed information about a code
- [CodeSystem $subsumes](/docs/api/fhir/operations/codesystem-subsumes) - Check hierarchical relationships
- [Medplum Terminology Guide](/docs/terminology) - Overview of terminology services
- [FHIR CodeSystem $validate-code](https://hl7.org/fhir/R4/codesystem-operation-validate-code.html) - FHIR specification
