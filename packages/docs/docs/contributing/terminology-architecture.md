---
sidebar_position: 206
---

# Terminology Architecture

:::caution

This page documents internal Medplum implementation details, and refers to point-in-time code snapshots that may be
different from the current application code, and are subject to change at any time without prior notice.

:::

## Table Schema

Medplum uses a handful of dedicated tables to store terminology data. The foundation of these is `Coding`, which stores
individual codes related to `CodeSystem` resources by their ID:

**Coding**

| Column  | Type     | Nullable | Notes                |
| ------- | -------- | -------- | -------------------- |
| id      | `bigint` | not null | Primary key          |
| system  | `uuid`   | not null | Refers to CodeSystem |
| code    | `text`   | not null |                      |
| display | `text`   |          |                      |

The `Coding` table has a unique index on `(system, code)` — there can only be one row for a given code per CodeSystem.

Codings can also have properties, which define additional metadata about the codes. These are defined in the
`CodeSystem_Property` table, and then referenced in `Coding_Property` alongside the property values:

**CodeSystem_Property**

| Column      | Type     | Nullable | Notes                                                             |
| ----------- | -------- | -------- | ----------------------------------------------------------------- |
| id          | `bigint` | not null | Primary key                                                       |
| system      | `uuid`   | not null | Refers to CodeSystem                                              |
| code        | `text`   | not null | Name of the property                                              |
| type        | `text`   | not null | Type of value the property takes                                  |
| uri         | `text`   |          | URI describing any special roles the property has (e.g. `parent`) |
| description | `text`   |          |                                                                   |

The `CodeSystem_Property` table has a unique index on `(system, code)` — there can only be a single property for a given
code per CodeSystem.

**Coding_Property**

| Column   | Type     | Nullable | Notes                         |
| -------- | -------- | -------- | ----------------------------- |
| coding   | `bigint` | not null | Refers to Coding              |
| property | `bigint` | not null | Refers to CodeSystem_Property |
| target   | `bigint` |          | Refers to Coding              |
| value    | `text`   |          |                               |

There is a covering unique index on `Coding_Property`; each row must be fully unique. It is valid for a Coding to have
multiple values for a given property.

## Terminology Operations

FHIR specifies a suite of Operation endpoints to interact with terminology information, which Medplum implements on top
of the tables described above.

### `CodeSystem/$validate-code`

Validating whether a CodeSystem contains any of a set of codes is a simple query:

```sql
-- Get CodeSystem by URL
SELECT id, content FROM "CodeSystem" WHERE url = ?;

-- Check whether codes exist
SELECT id, code, display FROM "Coding" WHERE code IN (?, ?) AND system = ?;
```

### `CodeSystem/$lookup`

Looking up a given code in a CodeSystem is similar to the `$validate-code` operation above, but also looks up any
properties of the given code:

```sql
-- Get CodeSystem by URL
SELECT id, content FROM "CodeSystem" WHERE url = ?;

-- Look up code and attached properties
SELECT
  "Coding".display,
  property.code,
  property.type,
  property.description,
  property.value
FROM "Coding"
  LEFT JOIN "Coding_Property" AS cp ON "Coding".id = cp.coding
  LEFT JOIN "CodeSystem_Property" AS property ON cp.property = property.id
WHERE "Coding".code = ? AND "Coding".system = ?;
```
