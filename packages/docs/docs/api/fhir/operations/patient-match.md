---
sidebar_position: 35
---

# Patient $match

The `$match` operation implements a [Master Patient Index (MPI)](https://en.wikipedia.org/wiki/Master_patient_index) matching algorithm. It accepts a (possibly partial) Patient resource and returns a Bundle of candidate matches ordered from most to least likely, each annotated with a confidence score and match-grade extension.

## Use Cases

- **Duplicate Prevention**: Check for existing patients before registering a new one to avoid creating duplicate records
- **Patient Reconciliation**: Match incoming patient demographics from an external system against records in your Medplum project
- **Identity Resolution**: Find a patient when only partial demographics are known (e.g., name and date of birth without an identifier)

## Invocation

```
POST [base]/Patient/$match
```

## Input Parameters

| Parameter | Cardinality | Type | Description |
|-----------|-------------|------|-------------|
| `resource` | 1..1 | `Patient` | The patient resource to match against (may be partial). Must include at least one of: `identifier`, `name`, `birthDate`, `telecom`, or `gender`. |
| `onlyCertainMatches` | 0..1 | `boolean` | If `true`, only returns results graded as `certain`. Defaults to `false`. |
| `count` | 0..1 | `integer` | Maximum number of results to return. Defaults to the server's default search count. |

## Output

Returns a `Bundle` of type `searchset`. Each entry contains a matched `Patient` resource with:

- `entry.search.score` — Normalized confidence score from `0` to `1`
- `entry.search.extension` — A `match-grade` extension indicating match quality

## Match Grades

Each result is annotated with the `match-grade` extension (`http://hl7.org/fhir/StructureDefinition/match-grade`):

| Grade | Score Range | Meaning |
|-------|-------------|---------|
| `certain` | ≥ 0.90 | High confidence match; likely the same patient |
| `probable` | 0.65 – 0.89 | Strong but not definitive match |
| `possible` | 0.40 – 0.64 | Partial match that warrants manual review |
| `certainly-not` | < 0.40 | Not a match; excluded from results |

## Scoring Algorithm

The operation uses a weighted demographic comparison across fields present on both the input patient and each candidate. Fields not present on either side do not affect the score.

| Field | Weight | Notes |
|-------|--------|-------|
| Identifier | 40% | Exact match on `value`; optionally also on `system` |
| Phone | 30% | Normalized to digits only (e.g., `(555) 867-5309` → `5558675309`) |
| Email | 30% | Normalized to lowercase |
| Family name | 20% | Exact match scores full weight; prefix/substring match scores 50% |
| Birth date | 20% | Exact ISO date string match |
| Given name | 15% | Any given name in common scores full weight |
| Gender | 5% | Exact string match |

The final score is normalized by the total weight of fields compared. Only fields present on **both** the input patient and the candidate contribute to the score.

## Candidate Search Strategies

Before scoring, the operation gathers candidates by running FHIR searches for:

1. **Identifier** — searches `Patient?identifier=<system>|<value>` for each identifier on the input
2. **Birth date** — searches `Patient?birthdate=<date>` if `birthDate` is present
3. **Telecom** — searches `Patient?telecom=<value>` for each phone or email on the input

Candidates from all strategies are deduplicated by patient ID before scoring.

## Example

### Request

```http
POST /fhir/R4/Patient/$match
Content-Type: application/fhir+json

{
  "resourceType": "Parameters",
  "parameter": [
    {
      "name": "resource",
      "resource": {
        "resourceType": "Patient",
        "name": [{ "family": "Smith", "given": ["John"] }],
        "birthDate": "1970-03-15",
        "telecom": [{ "system": "phone", "value": "555-867-5309" }]
      }
    },
    {
      "name": "onlyCertainMatches",
      "valueBoolean": false
    }
  ]
}
```

### Response

```json
{
  "resourceType": "Bundle",
  "type": "searchset",
  "total": 2,
  "entry": [
    {
      "resource": {
        "resourceType": "Patient",
        "id": "patient-abc",
        "name": [{ "family": "Smith", "given": ["John"] }],
        "birthDate": "1970-03-15",
        "telecom": [{ "system": "phone", "value": "5558675309" }]
      },
      "search": {
        "mode": "match",
        "score": 1.0,
        "extension": [
          {
            "url": "http://hl7.org/fhir/StructureDefinition/match-grade",
            "valueCode": "certain"
          }
        ]
      }
    },
    {
      "resource": {
        "resourceType": "Patient",
        "id": "patient-xyz",
        "name": [{ "family": "Smith", "given": ["Jon"] }],
        "birthDate": "1970-03-15"
      },
      "search": {
        "mode": "match",
        "score": 0.57,
        "extension": [
          {
            "url": "http://hl7.org/fhir/StructureDefinition/match-grade",
            "valueCode": "possible"
          }
        ]
      }
    }
  ]
}
```

## Error Responses

| Status Code | Description |
|-------------|-------------|
| `400 Bad Request` | `resource` parameter is missing or is not a Patient |
| `400 Bad Request` | Input Patient has no matchable fields (identifier, name, birthDate, telecom, or gender) |
| `403 Forbidden` | Insufficient permissions to search Patient resources |

## Related Documentation

- [HL7 FHIR Patient $match operation](https://hl7.org/fhir/R4/patient-operation-match.html)
- [Patient $everything](./patient-everything)
- [Patient $summary](./patient-summary)
