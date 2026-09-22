---
sidebar_position: 30
---

# Binary $scan

Checks the contents of a Binary for malware using
[Amazon GuardDuty Malware Protection for S3](https://docs.aws.amazon.com/guardduty/latest/ug/gdu-malware-protection-s3.html).

When Malware Protection is enabled, GuardDuty scans every new upload on its own. Objects stored before protection was
turned on are never scanned, and neither are objects whose scan failed. `$scan` returns the existing result when there
is one, and otherwise asks GuardDuty for an on-demand scan.

Scans run asynchronously. If a call returns `SCAN_REQUESTED`, call `$scan` again later to get the result. GuardDuty
bills every on-demand scan, so `$scan` does not re-scan a Binary that already has a final result.

## Invocation

```
POST [base]/Binary/[id]/$scan
```

Any user with read access to the Binary can call this operation.

## Output

The operation returns an `OperationOutcome` with a single issue. `issue.details.coding` uses the system
`https://medplum.com/fhir/CodeSystem/malware-scan-status`.

| Code               | Severity      | Issue code      | Meaning                                                                                                                |
| ------------------ | ------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `NO_THREATS_FOUND` | `information` | `informational` | The scan finished and found no threats                                                                                 |
| `THREATS_FOUND`    | `error`       | `security`      | The scan finished and found a potential threat                                                                         |
| `UNSUPPORTED`      | `warning`     | `not-supported` | GuardDuty cannot scan this object, for example a password-protected archive or an oversized file                       |
| `SCAN_REQUESTED`   | `information` | `informational` | A scan was submitted. This is returned when there is no result yet, or the last result was `FAILED` or `ACCESS_DENIED` |

## Example

### Request

```http
POST /fhir/R4/Binary/[id]/$scan
```

### Response

```json
{
  "resourceType": "OperationOutcome",
  "issue": [
    {
      "severity": "information",
      "code": "informational",
      "details": {
        "coding": [{ "system": "https://medplum.com/fhir/CodeSystem/malware-scan-status", "code": "NO_THREATS_FOUND" }],
        "text": "No threats found"
      }
    }
  ]
}
```

## Requirements

- Binary storage must be S3 (`binaryStorage: "s3:<bucket>"`).
- The storage bucket needs a GuardDuty Malware Protection plan with tagging enabled. Setting the
  `guardDutyMalwareProtectionEnabled` infra config option creates one, and also grants the server
  `s3:GetObjectTagging` and `guardduty:SendObjectMalwareScan`.
- SSE-C encryption (`sseCustomerKey`) is not supported, because GuardDuty cannot read SSE-C objects.
