# CodeSystem $subsumes

The `$subsumes` operation tests whether one code is a parent (more general) or child (more specific) of another code within a hierarchical code system. This is crucial for clinical decision support, where you need to determine if a specific diagnosis or procedure falls under a broader category.

For example, you can use `$subsumes` to check if a patient's specific heart condition code is a subtype of "cardiac disease," enabling rule-based alerts and automated clinical workflows that respond to categories of conditions, rather than exhaustive lists of individual codes.

## Use Cases

- **Clinical Decision Support**: Trigger alerts when any code within a disease category is recorded (e.g., any cardiovascular condition)
- **Quality Measure Calculation**: Determine if a patient's diagnoses qualify for specific quality measures by checking category membership
- **Access Control**: Grant access to records based on condition categories rather than specific codes
- **Report Aggregation**: Group detailed codes into broader categories for population health reporting
- **Formulary Management**: Check if a prescribed medication falls within a therapeutic class

## Invoke the `$subsumes` operation

```
[baseUrl]/CodeSystem/$subsumes
[baseUrl]/CodeSystem/[id]/$subsumes
```

## Parameters

| Name      | Type     | Description                                               | Required        |
| --------- | -------- | --------------------------------------------------------- | --------------- |
| `system`  | `string` | The canonical URL of the code system the codes belong to. | No<sup>\*</sup> |
| `version` | `string` | The version of the code system to search.                 | No              |
| `codeA`   | `code`   | One of the codes to test.                                 | Yes             |
| `codeB`   | `code`   | The other code to test.                                   | Yes             |

<sup>\*</sup> If no `system` is specified, the operation must be invoked on a specific `CodeSystem` instance by ID.

## Output

The operation returns a `Parameters` resource containing the resolved information for the code.

| Parameter Name | Type   | Description                                                                | Required |
| -------------- | ------ | -------------------------------------------------------------------------- | -------- |
| `outcome`      | `code` | A code describing the relationship between `codeA` and `codeB` (see below) | Yes      |

The possible `outcome` values are:

| Outcome        | Description                                                   |
| -------------- | ------------------------------------------------------------- |
| `equivalent`   | The two codes are the same, or mean the same thing            |
| `subsumes`     | Code `A` is the more general parent of more specific code `B` |
| `subsumed-by`  | Code `A` is the more specific child of more general code `B`  |
| `not-subsumed` | Codes `A` and `B` are not directly related                    |

**Request**:

To check whether SNOMED code `364075005` (Heart rate) is a descendant code of `363787002` (Observable entity):

```http
GET https://api.medplum.com/fhir/R4/CodeSystem/$subsumes?system=http://snomed.info/sct&codeA=364075005&codeB=363787002
```

```bash
curl 'https://api.medplum.com/fhir/R4/CodeSystem/$subsumes' \
  --get \
  -H "Authorization: Bearer $MY_ACCESS_TOKEN" \
  -d 'system=http://snomed.info/sct' \
  -d 'codeA=364075005' \
  -d 'codeB=363787002'
```

**Response** (200 OK):

```js
{
  "resourceType": "Parameters",
  "parameter": [
    { "name": "outcome", "valueCode": "subsumed-by" }
  ]
}
```

## Related

- [CodeSystem $lookup](/docs/api/fhir/operations/codesystem-lookup) - Look up detailed information about codes
- [CodeSystem $validate-code](/docs/api/fhir/operations/codesystem-validate-code) - Validate a code exists in a code system
- [CodeSystem $import](/docs/api/fhir/operations/codesystem-import) - Import hierarchical code systems
- [Medplum Terminology Guide](/docs/terminology) - Overview of terminology services
- [FHIR CodeSystem $subsumes](https://hl7.org/fhir/R4/codesystem-operation-subsumes.html) - FHIR specification for $subsumes
