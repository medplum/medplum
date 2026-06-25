---
sidebar_position: 35
---

# Patient $match

The `$match` operation implements [Master Patient Index (MPI)](https://en.wikipedia.org/wiki/Master_patient_index) patient matching. It accepts a (possibly partial) Patient resource, searches your project for candidates, and returns a `Bundle` of matches — each annotated with a score and match grade.

Medplum's matching is based on the **CMS Patient Matching framework**, an evidence-based model that defines a fixed set of identity-attribute combinations strong enough to identify a patient. Rather than an ad-hoc weighted heuristic, matching is grounded in these approved combinations, with consistent normalization and conservative, constrained fuzzy matching.

:::note CMS guidelines are in draft
The CMS Patient Matching framework is a draft proposal and is **subject to change as the guidelines evolve**. The criteria table and behavior described here reflect the current draft and may be updated in future releases.
:::

## Use Cases

- **Duplicate Prevention**: Check for existing patients before registering a new one to avoid creating duplicate records.
- **Patient Reconciliation**: Match incoming demographics from an external system against records in your Medplum project.
- **Identity Resolution / Discovery**: Find candidate patients when only partial demographics are known (human-reviewed search).
- **Record Disclosure**: Determine whether incoming demographics unambiguously identify exactly one patient before returning their record (machine-to-machine exchange).

## Invocation

```
POST [base]/Patient/$match
```

## Input Parameters

| Parameter            | Cardinality | Type      | Description                                                                                                                   |
| -------------------- | ----------- | --------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `resource`           | 1..1        | `Patient` | The patient to match against (may be partial). Must include at least one of: `identifier`, `name`, `birthDate`, or `telecom`. |
| `onlyCertainMatches` | 0..1        | `boolean` | Selects the matching mode. See [Matching Modes](#matching-modes). Defaults to `false`.                                        |
| `count`              | 0..1        | `integer` | Maximum number of results (discovery mode only). Defaults to the server's default search count.                               |

## Matching Modes

The same candidate-gathering and field-comparison pipeline runs in both modes; `onlyCertainMatches` changes the release rules.

### Discovery (`onlyCertainMatches: false`, default)

Returns a ranked, graded list from the gathered candidate set for human review or triage. Approved CMS combination matches are ranked first with score `1.0`; other candidates receive a lightweight FHIR `$match` discovery score below `1.0`. Results are ordered from most to least likely and limited by `count`.

### Disclosure (`onlyCertainMatches: true`)

Applies a **uniqueness gate**: the operation returns a patient **only if exactly one** candidate is a `certain` match (i.e. satisfies an approved CMS combination). If no candidate qualifies, if **two or more** distinct candidates qualify (an ambiguous result), or if candidate search is truncated such that uniqueness cannot be proven, the bundle is empty. This is the conservative behavior appropriate for releasing records in cross-organization exchange, where a wrong-patient disclosure is a critical error.

## Output

Returns a `Bundle` of type `searchset`. Each entry contains a matched `Patient` with a `search` element:

- `entry.search.score` — A score from `0` to `1`. See [Scoring](#scoring).
- `entry.search.extension` — A [`match-grade`](https://hl7.org/fhir/R4/extension-match-grade.html) extension, plus Medplum CMS extensions when an approved combination is satisfied:

| Extension URL                                                        | Value    | Meaning                                                                           |
| -------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------- |
| `http://hl7.org/fhir/StructureDefinition/match-grade`                | `code`   | The match grade (see below).                                                      |
| `https://medplum.com/fhir/StructureDefinition/cms-match-combination` | `string` | The CMS combination ID that was satisfied (e.g. `"02"`).                          |
| `https://medplum.com/fhir/StructureDefinition/cms-match-type`        | `code`   | `exact` or `fuzzy` — whether the satisfied CMS combination used fuzzy comparison. |

## Match Grades

The `match-grade` separates strict CMS combination matches from lower-confidence discovery candidates:

| Grade           | Meaning                                                                       |
| --------------- | ----------------------------------------------------------------------------- |
| `certain`       | An approved CMS combination is fully satisfied.                               |
| `probable`      | A non-CMS discovery candidate with a score greater than or equal to 0.65.     |
| `possible`      | A non-CMS discovery candidate with a score greater than or equal to 0.20.     |
| `certainly-not` | A candidate is explicitly blocked, such as by a generational-suffix conflict. |

Candidates below the `possible` threshold, and candidates blocked by a generational-suffix conflict, are excluded from results.

## Scoring

The `search.score` is intentionally **not** a probability — it is a simple, explainable ranking value:

- **`1.0`** when an approved CMS combination is satisfied (`certain`).
- In discovery mode only, otherwise **`min(x / 11, 0.9)`**, where `x` is the weighted count of the 11 identity factors that agree: an **exact** field counts as `1`, a **fuzzy** field as `0.5`. The `0.9` ceiling keeps any non-approved field set strictly below a real CMS match.

This non-CMS score is Medplum's FHIR `$match` discovery ranking aid; it is not part of the CMS Table 2 release rule. Within a single query the denominator is constant, so candidates sort correctly by score; grade carries the human-facing classification.

## Identity Factors

Eleven factors are used (gender is **not** a matching factor):

First Name · Last Name · Date of Birth · Street Line · Phone Number · Email Address · SSN (last 4) · ITIN (last 4) · MBI · Legal ID · Namespace-bound Unique Identifier

Identifier factors are matched by their `system` (issuing-authority namespace) and value, using the FHIR token convention `system|value`. An identifier with a system outside the CMS-specific namespaces is treated as a **namespace-bound unique identifier** (for example EMPI, FHIR Patient Identifier, CSP UUID, or project MRN).

## Approved CMS Matching Combinations

A candidate is a `certain` match when its agreeing factors form one of these approved combinations and it is the unique such candidate. Fields marked with `*` may be satisfied by a fuzzy comparison; **at most one** field per match may be fuzzy.

| ID  | Field Combination                                |
| --- | ------------------------------------------------ |
| 01  | First Name\* + Last Name\* + DOB + Street Line\* |
| 02  | First Name + Last Name\* + DOB + Phone           |
| 03  | First Name\* + Last Name\* + DOB + Email         |
| 04  | First Name\* + Last Name + DOB + SSN (last 4)    |
| 05  | First Name + Last Name\* + DOB + SSN (last 4)    |
| 06  | First Name\* + Last Name + DOB + ITIN (last 4)   |
| 07  | First Name + Last Name\* + DOB + ITIN (last 4)   |
| 08  | First Name + DOB + MBI                           |
| 09  | First Name + DOB + Legal ID                      |
| 10  | Last Name\* + DOB + Legal ID                     |
| 11  | First Name + DOB + Phone                         |
| 12  | First Name + DOB + Email                         |
| 13  | Last Name + Phone + SSN (last 4)                 |
| 14  | Last Name + Phone + ITIN (last 4)                |
| 15  | Last Name\* + Email + SSN (last 4)               |
| 16  | Last Name\* + Email + ITIN (last 4)              |
| 17  | First Name + Phone + SSN (last 4)                |
| 18  | First Name + Phone + ITIN (last 4)               |
| 19  | First Name + Email + SSN (last 4)                |
| 20  | First Name + Email + ITIN (last 4)               |
| 21  | Phone + MBI                                      |
| 22  | Phone + Legal ID                                 |
| 23  | Email + MBI                                      |
| 24  | Email + Legal ID                                 |
| 25  | Legal ID + MBI                                   |
| 26  | Namespace-bound Unique Identifier                |

## Normalization

Every field represents the set of **all known values** (current and historical — e.g. maiden/previous names, all addresses, all phone numbers), and matching compares against all of them. Before comparison, values are normalized:

- **Strings** are matched case-insensitively, with whitespace and punctuation removed and diacritics folded (e.g. `José` → `jose`).
- **Phone numbers** are normalized by stripping punctuation and whitespace. U.S. `+1` / leading-`1` eleven-digit numbers are normalized to the same ten digits as domestic notation. Other country codes are left as digits without additional international parsing. Phone numbers match regardless of type (home/cell/work).
- **Email** is lowercased and trimmed. Punctuation is preserved, so `john.smith@example.com` and `johnsmith@example.com` remain distinct.
- **Date of birth** must be a full `YYYY-MM-DD` date; partial dates are not imputed and are ignored for matching.
- **SSN / ITIN** use only the last 4 folded alphanumeric characters.
- A **generational-suffix conflict** (both records have a suffix and they disagree after folding, e.g. `Jr` vs `Sr`) blocks the match.

Matching is intentionally limited to these mechanical, deterministic normalizations. Medplum ships **no** opinionated nickname equivalence table (`Bob`↔`Robert`) or placeholder/test-value suppression table, so behavior is transparent and reproducible.

### Fuzzy Matching

Fuzzy matching is constrained: it applies only to **First Name, Last Name, and Street Line**, only where a combination permits it (`*` above), only to values at least **5 characters** long, and tolerates a **Damerau–Levenshtein distance of 1** (one insertion, deletion, substitution, or adjacent transposition). At most one field per match may be fuzzy. Phonetic matching (e.g. Soundex) is not used.

## Candidate Search

Before scoring, candidates are gathered with selective FHIR searches anchored on the query's exact identifiers, telecom, and name + birthdate:

- `Patient?identifier=<system>|<value>` for each identifier
- `Patient?telecom=<value>` for each phone or email
- `Patient?birthdate=<date>&family=<family>` and `Patient?birthdate=<date>&given=<given>` when a birth date is present

Results are deduplicated by patient ID, then compared and scored in memory. Discovery mode ranks the gathered candidate set; it is intended for review and is not an exhaustive population scan. In disclosure mode, if a search hits its result cap (uniqueness cannot be proven), the match is suppressed.

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
    { "name": "onlyCertainMatches", "valueBoolean": false }
  ]
}
```

### Response

```json
{
  "resourceType": "Bundle",
  "type": "searchset",
  "total": 1,
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
          },
          {
            "url": "https://medplum.com/fhir/StructureDefinition/cms-match-combination",
            "valueString": "02"
          },
          {
            "url": "https://medplum.com/fhir/StructureDefinition/cms-match-type",
            "valueCode": "exact"
          }
        ]
      }
    }
  ]
}
```

Here First Name + Last Name + DOB + Phone match after U.S. phone normalization, satisfying combination `02` — a `certain` match with score `1.0`. In disclosure mode (`onlyCertainMatches: true`) this same single unique match would be returned; if a second patient also satisfied a combination, the bundle would instead be empty.

## Error Responses

| Status Code       | Description                                                                     |
| ----------------- | ------------------------------------------------------------------------------- |
| `400 Bad Request` | `resource` parameter is missing or is not a Patient                             |
| `400 Bad Request` | Input Patient has no matchable fields (identifier, name, birthDate, or telecom) |
| `403 Forbidden`   | Insufficient permissions to search Patient resources                            |

## Related Documentation

- [HL7 FHIR Patient $match operation](https://hl7.org/fhir/R4/patient-operation-match.html)
- [Patient $everything](./patient-everything)
- [Patient $summary](./patient-summary)
