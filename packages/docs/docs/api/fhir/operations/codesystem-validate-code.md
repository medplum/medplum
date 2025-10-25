# CodeSystem Validate Code

Validates whether a specified code is part of the given `CodeSystem`.

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
