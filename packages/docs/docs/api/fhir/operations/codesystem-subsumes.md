# CodeSystem Subsumes

Tests for a linear relationship between two codes in a given `CodeSystem`, where one code is a direct parent or indirect
ancestor of the other.

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
