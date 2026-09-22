---
sidebar_position: 30
---

# Binary $scan

Checks the contents of a Binary for malware using
[Amazon GuardDuty Malware Protection for S3](https://docs.aws.amazon.com/guardduty/latest/ug/gdu-malware-protection-s3.html).

`$scan` returns the Binary's scan result if it has one. Otherwise it asks GuardDuty for an on-demand scan. The operation
doesn't rely on GuardDuty scanning uploads automatically, and works with automatic scanning turned off.

Scans run asynchronously. While `$scan` returns `SCAN_REQUESTED`, call it again later to get the result. GuardDuty bills
every on-demand scan, so `$scan` avoids sending repeat scans:

- A Binary with a final result (`NO_THREATS_FOUND`, `THREATS_FOUND` or `UNSUPPORTED`) is never scanned again.
- When `$scan` sends a scan, it tags the S3 object `MedplumMalwareScanRequested` with the request time. Until a result
  arrives, later calls report the scan as in progress instead of sending another one. If no result arrives within an
  hour, the next call sends a new scan. Two calls made at the same moment can still both send a scan.
- A `FAILED` or `ACCESS_DENIED` result is retried on the next call.

## Invocation

```
POST [base]/Binary/[id]/$scan
```

Any user with read access to the Binary can call this operation.

## Output

The operation returns an `OperationOutcome` with a single issue. `issue.details.coding` uses the system
`https://medplum.com/fhir/CodeSystem/malware-scan-status`.

| Code               | Severity      | Issue code      | Meaning                                                                                          |
| ------------------ | ------------- | --------------- | ------------------------------------------------------------------------------------------------ |
| `NO_THREATS_FOUND` | `information` | `informational` | The scan finished and found no threats                                                           |
| `THREATS_FOUND`    | `error`       | `security`      | The scan finished and found a potential threat                                                   |
| `UNSUPPORTED`      | `warning`     | `not-supported` | GuardDuty cannot scan this object, for example a password-protected archive or an oversized file |
| `SCAN_REQUESTED`   | `information` | `informational` | A scan was sent or is in progress. Call `$scan` again later for the result                       |

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
- The storage bucket needs a GuardDuty Malware Protection plan with tagging enabled. The
  `guardDutyMalwareProtectionEnabled` infra config option creates one. It also grants the server
  `s3:GetObjectTagging`, `s3:PutObjectTagging` and `guardduty:SendObjectMalwareScan`.
- To turn off automatic scanning of new uploads, also set `guardDutyMalwareProtectionOnDemandOnly`. GuardDuty has no
  on-demand-only mode, so this limits automatic scanning to the `guardduty-on-demand-only/` prefix, which Medplum never
  writes to. On-demand scans ignore the prefix.
- SSE-C encryption (`sseCustomerKey`) is not supported, because GuardDuty cannot read SSE-C objects.

:::note

With Malware Protection enabled, CloudFront only serves Binaries tagged `NO_THREATS_FOUND`. With automatic scanning
turned off, a new upload is not served until `$scan` reports `NO_THREATS_FOUND`.

:::
