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

| Parameter            | Cardinality | Type      | Description                                                                                                                             |
| -------------------- | ----------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `resource`           | 1..1        | `Patient` | The patient to match against (may be partial). Must include at least one of: `identifier`, `name`, `birthDate`, `telecom`, or `gender`. |
| `onlyCertainMatches` | 0..1        | `boolean` | Selects the matching mode. See [Matching Modes](#matching-modes). Defaults to `false`.                                                  |
| `count`              | 0..1        | `integer` | Maximum number of results (discovery mode only). Defaults to the server's default search count.                                         |

## Matching Modes

The same matching pipeline runs in both modes; `onlyCertainMatches` only changes how results are returned.

### Discovery (`onlyCertainMatches: false`, default)

Returns a ranked, graded list of candidate patients — including partial and ambiguous matches — for human review or triage. Results are ordered from most to least likely and limited by `count`.

### Disclosure (`onlyCertainMatches: true`)

Applies a **uniqueness gate**: the operation returns a patient **only if exactly one** candidate is a `certain` match (i.e. satisfies an approved CMS combination). If no candidate qualifies, or if **two or more** distinct candidates qualify (an ambiguous result), the bundle is empty. This is the conservative behavior appropriate for releasing records in cross-organization exchange, where a wrong-patient disclosure is a critical error.

## Output

Returns a `Bundle` of type `searchset`. Each entry contains a matched `Patient` with a `search` element:

- `entry.search.score` — A score from `0` to `1`. See [Scoring](#scoring).
- `entry.search.extension` — A [`match-grade`](https://hl7.org/fhir/R4/extension-match-grade.html) extension, plus Medplum CMS extensions when an approved combination is satisfied:

| Extension URL                                                        | Value    | Meaning                                                                   |
| -------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------- |
| `http://hl7.org/fhir/StructureDefinition/match-grade`                | `code`   | The match grade (see below).                                              |
| `https://medplum.com/fhir/StructureDefinition/cms-match-combination` | `string` | The CMS combination ID that was satisfied (e.g. `"02"`).                  |
| `https://medplum.com/fhir/StructureDefinition/cms-match-type`        | `code`   | `exact` or `fuzzy` — whether any field was satisfied by fuzzy comparison. |

## Match Grades

The `match-grade` is classified by how close the candidate is to an approved combination — **not** by score thresholds:

| Grade           | Meaning                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------- |
| `certain`       | An approved CMS combination is fully satisfied.                                             |
| `probable`      | Within one field of a multi-field combination (e.g. matched everything but a phone number). |
| `possible`      | Some identity factors agree, but well short of a combination.                               |
| `certainly-not` | No usable agreement, or a generational-suffix conflict. Excluded from results.              |

## Scoring

The `search.score` is intentionally **not** a probability — it is a simple, explainable ranking value:

- **`1.0`** when an approved CMS combination is satisfied (`certain`).
- Otherwise **`min(x / 12, 0.9)`**, where `x` is the weighted count of the 12 identity factors that agree: an **exact** field counts as `1`, a **fuzzy** field as `0.5`. The `0.9` ceiling keeps any non-approved field set strictly below a real CMS match.

Within a single query the denominator is constant, so candidates sort correctly by score; grade carries the human-facing classification.

## Identity Factors

Twelve factors are used (gender is **not** a matching factor):

First Name · Last Name · Date of Birth · Street Line · Phone Number · Email Address · SSN (last 4) · ITIN (last 4) · MBI · Legal ID · CSP UUID · EMPI / FHIR Patient Identifier

Identifier factors are matched by their `system` (issuing-authority namespace) and value. A namespaced identifier with no recognized system is treated as an **EMPI / FHIR Patient Identifier** (so matching by a project MRN works out of the box).

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
| 26  | CSP UUID                                         |
| 27  | EMPI / FHIR Patient Identifier                   |

## Normalization

Every field represents the set of **all known values** (current and historical — e.g. maiden/previous names, all addresses, all phone numbers), and matching compares against all of them. Before comparison, values are normalized:

- **Strings** are matched case-insensitively, with whitespace and punctuation removed and diacritics folded (e.g. `José` → `jose`).
- **Phone numbers** are normalized toward E.164 and matched regardless of type (home/cell/work).
- **Email** is lowercased and trimmed.
- **Date of birth** must be a full `YYYY-MM-DD` date; partial dates are not imputed and are ignored for matching.
- **SSN / ITIN** use only the last 4 digits.
- A **generational-suffix conflict** (both records have a suffix and they disagree after folding, e.g. `Jr` vs `Sr`) blocks the match.

Matching is intentionally limited to these mechanical, deterministic normalizations. Medplum ships **no** opinionated reference data — nickname equivalences (`Bob`↔`Robert`), suffix expansions (`Jr`↔`Junior`), or placeholder/test-value lists — so behavior is fully transparent and reproducible.

### Fuzzy Matching

Fuzzy matching is constrained: it applies only to **First Name, Last Name, and Street Line**, only where a combination permits it (`*` above), only to values at least **5 characters** long, and tolerates a **Damerau–Levenshtein distance of 1** (one insertion, deletion, substitution, or adjacent transposition). At most one field per match may be fuzzy. Phonetic matching (e.g. Soundex) is not used.

## Candidate Search

Before scoring, candidates are gathered with selective FHIR searches anchored on the query's exact identifiers, telecom, and name + birthdate:

- `Patient?identifier=<system>|<value>` for each identifier
- `Patient?telecom=<value>` for each phone or email
- `Patient?birthdate=<date>&family=<family>` and `Patient?birthdate=<date>&given=<given>` when a birth date is present

Results are deduplicated by patient ID, then scored in memory. In disclosure mode, if a search hits its result cap (uniqueness cannot be proven), the match is suppressed.

## Example

### Request (discovery mode)

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
        "name": [{ "family": "Smith", "given": ["Robert"] }],
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
        "name": [{ "family": "Smith", "given": ["Robert"] }],
        "birthDate": "1970-03-15",
        "telecom": [{ "system": "phone", "value": "+15558675309" }]
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

Here First Name + Last Name + DOB + Phone match (the phone is compared in normalized E.164 form), satisfying combination `02` — a `certain` match with score `1.0`. In disclosure mode (`onlyCertainMatches: true`) this same single unique match would be returned; if a second patient also satisfied a combination, the bundle would instead be empty.

## Error Responses

| Status Code       | Description                                                                             |
| ----------------- | --------------------------------------------------------------------------------------- |
| `400 Bad Request` | `resource` parameter is missing or is not a Patient                                     |
| `400 Bad Request` | Input Patient has no matchable fields (identifier, name, birthDate, telecom, or gender) |
| `403 Forbidden`   | Insufficient permissions to search Patient resources                                    |

## Related Documentation

- [HL7 FHIR Patient $match operation](https://hl7.org/fhir/R4/patient-operation-match.html)
- [Patient $everything](./patient-everything)
- [Patient $summary](./patient-summary)
