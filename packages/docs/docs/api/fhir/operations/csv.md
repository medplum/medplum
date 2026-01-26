---
sidebar_position: 24
---

# Resource $csv

The `$csv` operation exports FHIR resources as a CSV (Comma-Separated Values) file, which is useful for exporting data for analysis in spreadsheet applications, reporting tools, or data pipelines.

## Use Cases

- **Reporting**: Generate reports for administrative or clinical purposes
- **Data Analysis**: Export data for analysis in Excel, Google Sheets, or BI tools
- **Data Migration**: Export data for import into other systems
- **Auditing**: Create snapshots of data for audit purposes

## Invoke the `$csv` operation

```
[base]/[resourceType]/$csv?_fields=[field1,field2,...]&[search parameters]
```

For example, to export Patient data:

```bash
curl 'https://api.medplum.com/fhir/R4/Patient/$csv?_fields=name,birthDate,gender,address' \
  -H "Authorization: Bearer MY_ACCESS_TOKEN" \
  -o patients.csv
```

## Parameters

| Name       | Type     | Description                                                | Required |
| ---------- | -------- | ---------------------------------------------------------- | -------- |
| `_fields`  | `string` | Comma-separated list of fields/search parameters to export | Yes      |
| *any*      | `string` | Any valid search parameters for the resource type          | No       |

### Fields Parameter

The `_fields` parameter accepts:
- **Search parameter names** - These are resolved to their FHIRPath expressions
- **FHIRPath expressions** - Direct FHIRPath expressions for custom field extraction

### Example Field Configurations

```
_fields=name,birthDate,gender
_fields=identifier,name,telecom,address
_fields=Patient.name.family,Patient.name.given
```

## Output

The operation returns a CSV file with:
- UTF-8 encoding with BOM (Byte Order Marker) for Excel compatibility
- Header row with column names
- One row per resource
- Automatic formatting for complex FHIR types

### Supported Data Type Formatting

| FHIR Type         | CSV Output                                |
| ----------------- | ----------------------------------------- |
| `HumanName`       | Formatted full name                       |
| `Address`         | Formatted address string                  |
| `ContactPoint`    | The `value` field (phone, email, etc.)    |
| `Reference`       | The `display` field                       |
| `CodeableConcept` | Display text or first coding display/code |
| `string`          | Direct value                              |
| `number`          | Direct value                              |
| `boolean`         | "true" or "false"                         |

## Examples

### Export All Patients

```bash
curl 'https://api.medplum.com/fhir/R4/Patient/$csv?_fields=name,birthDate,gender,address' \
  -H "Authorization: Bearer MY_ACCESS_TOKEN" \
  -o all-patients.csv
```

### Export Filtered Results

Export only active patients:

```bash
curl 'https://api.medplum.com/fhir/R4/Patient/$csv?_fields=name,birthDate,gender&active=true' \
  -H "Authorization: Bearer MY_ACCESS_TOKEN" \
  -o active-patients.csv
```

### Export Observations

Export vital signs observations:

```bash
curl 'https://api.medplum.com/fhir/R4/Observation/$csv?_fields=code,value-quantity,effective-date-time,subject&category=vital-signs' \
  -H "Authorization: Bearer MY_ACCESS_TOKEN" \
  -o vitals.csv
```

### Export with Custom FHIRPath

```bash
curl 'https://api.medplum.com/fhir/R4/Patient/$csv?_fields=name.family,name.given,telecom.where(system=%27phone%27).value' \
  -H "Authorization: Bearer MY_ACCESS_TOKEN" \
  -o patients-custom.csv
```

## Response Headers

```
Content-Type: text/csv
Content-Disposition: attachment; filename=export.csv
```

## Limitations

- Maximum 1000 resources per export
- For larger exports, use the [Bulk FHIR](/docs/api/fhir/operations/bulk-fhir) operations
- Only the first value is exported for multi-valued fields

## Error Responses

### Missing Fields Parameter

```json
{
  "resourceType": "OperationOutcome",
  "issue": [
    {
      "severity": "error",
      "code": "invalid",
      "details": {
        "text": "Missing _fields parameter"
      }
    }
  ]
}
```

### Invalid Resource Type

```json
{
  "resourceType": "OperationOutcome",
  "issue": [
    {
      "severity": "error",
      "code": "invalid",
      "details": {
        "text": "Unsupported resource type"
      }
    }
  ]
}
```

## Security

The operation includes CSV injection protection by escaping potentially dangerous characters (`=`, `+`, `-`, `@`) at the start of cell values.

## Related Documentation

- [Bulk FHIR Export](/docs/api/fhir/operations/bulk-fhir) - For large-scale data exports
- [Search](/docs/search) - FHIR search parameters
