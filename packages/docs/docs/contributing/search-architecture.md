---
sidebar_position: 205
---

# Search Architecture

:::caution

This page documents internal Medplum implementation details, and refers to point-in-time code snapshots that may be
different from the current application code, and are subject to change at any time without prior notice.

:::

## Resource Table Schema

In addition to `id` and `content` columns containing the resource's UUID and raw JSON, each FHIR resource type table in the Medplum DB (e.g. `"Observation"`) contains columns corresponding to the search parameters for that resource type (e.g. `"Observation".subject`). The data types of these columns are mapped from the search parameter type:

| FHIR SearchParameter type | Postgres data type                           |
| ------------------------- | -------------------------------------------- |
| `number`                  | `double precision`                           |
| `date`                    | `date`/`timestamp with time zone`            |
| `string`                  | `text`<sup>\*</sup>                          |
| `token`                   | `text`<sup>\*</sup>/`boolean`                |
| `reference`               | `text`                                       |
| `composite`               | - (unsupported)                              |
| `quantity`                | `double precision`                           |
| `uri`                     | `text`                                       |
| `special`                 | - (e.g. `id uuid` and `compartments uuid[]`) |

<sup>\*</sup> Some parameters are handled by special lookup tables due to complex matching semantics, see below

Many of these columns can contain multiple values of the same type in an array, e.g. `text[]`.

## Parsing Search Queries

FHIR search queries use the `application/x-fhir-query` MIME type, and generally follow the format `ResourceType?param1=value1&param2=value2`, e.g. `Observation?status=final&subject:missing=true`. These [query strings are parsed][parse-query] into our own internal representation using helper functions in `@medplum/core` to facilitate common handling of search between the server and client-side applications. The resulting [`SearchRequest`][search-req] object contains all information necessary to process the search operation:

```ts
interface SearchRequest {
  readonly resourceType: string;
  filters?: {
    code: string;
    operator: Operator;
    value: string;
  }[];
  sortRules?: {
    code: string;
    descending?: boolean;
  }[];
  offset?: number;
  count?: number;
  fields?: string[];
  name?: string;
  total?: 'none' | 'estimate' | 'accurate';
  include?: IncludeTarget[];
  revInclude?: IncludeTarget[];
  summary?: 'true' | 'text' | 'data';
}
```

Each search parameter from the query string corresponds to an element in `SearchRequest.filters`, and the example query above (`Observation?status=final&subject:missing=true`) would be parsed as:

```ts
{
  resourceType: 'Observation',
  filters: [
    {
      code: 'status',
	  operator: Operator.EQUALS,
	  value: 'final',
    },
    {
      code: 'subject',
      operator: Operator.MISSING,
      value: 'true',
    }
  ]
}
```

The [`Operator`][operator] enum represents a union over FHIR search [modifiers][search-modifiers] and [prefixes][search-prefixes]; combined, these define all logical search relations between parameter and value. Currently, there is zero overlap between parameters that use prefixes and those that allow modifiers; however, if this ever changes, modifications to this abstraction will be required.

[parse-query]: https://github.com/medplum/medplum/blob/6ecbcf8fdc209dbf799ebe9df7d726217424f1f3/packages/core/src/search/search.ts#L172
[search-req]: https://github.com/medplum/medplum/blob/6ecbcf8fdc209dbf799ebe9df7d726217424f1f3/packages/core/src/search/search.ts#L7
[operator]: https://github.com/medplum/medplum/blob/6ecbcf8fdc209dbf799ebe9df7d726217424f1f3/packages/core/src/search/search.ts#L39
[search-modifiers]: http://hl7.org/fhir/R4/valueset-search-modifier-code.html
[search-prefixes]: http://hl7.org/fhir/R4/search.html#prefix

## SQL Builder

Medplum's core search logic translates FHIR search requests into a composable set of SQL expressions, from which the DB query is built. The [`SqlBuilder`][sql-builder] class provides basic functionality for constructing the SQL string, but most code uses it only indirectly through classes representing logical parts of the SQL expression, e.g. a [`Condition`][sql-condition]. Queries constructed this way are modular and flexible, allowing the server to easily manipulate the query without resorting to tricky string manipulation.

The main search parameter processing logic takes places in [`buildSearchFilterExpression()`][build-search-filter-expr], which performs:

1. Checking if the search parameter is a special one that needs specific handling (e.g. [`_filter`][filter-param])
2. Identifying whether a lookup table is in use for the search parameter and constructing the JOIN
   - The `:identifier` modifier is handled as a special case, using the token lookup table
3. Constructing the correct SQL `WHERE` expression for the search parameter based on its type and modifiers

[sql-builder]: https://github.com/medplum/medplum/blob/6ecbcf8fdc209dbf799ebe9df7d726217424f1f3/packages/server/src/fhir/sql.ts#L213
[sql-condition]: https://github.com/medplum/medplum/blob/6ecbcf8fdc209dbf799ebe9df7d726217424f1f3/packages/server/src/fhir/sql.ts#L49
[build-search-filter-expr]: https://github.com/medplum/medplum/blob/6ecbcf8fdc209dbf799ebe9df7d726217424f1f3/packages/server/src/fhir/search.ts#L494
[filter-param]: http://hl7.org/fhir/R4/search_filter.html

### Lookup Tables

Some search parameters require specific matching logic, and a separate lookup table to map parameter values to resources with acceptable performance. These lookup tables are modeled in subclasses of [`LookupTable`][lookup-table], and define custom logic for adding JOIN statements and conditions against the lookup tables to the SQL query. Each lookup table contains a `resourceId` column used for joining to the main resource tables, alongside other column used for matching. Some lookup tables are global across all resource types, where others are resource type-specific. For example, the schema of the [`HumanName`][human-name-lookup] lookup table is given below:

| Column     | Type       | Nullable |
| ---------- | ---------- | -------- |
| id         | `uuid`     | not null |
| resourceId | `uuid`     | not null |
| index      | `integer`  | not null |
| content    | `text`     | not null |
| name       | `text`     |          |
| given      | `text`     |          |
| family     | `text`     |          |
| name_tsv   | `tsvector` |          |
| given_tsv  | `tsvector` |          |
| family_tsv | `tsvector` |          |

[lookup-table]: https://github.com/medplum/medplum/blob/6ecbcf8fdc209dbf799ebe9df7d726217424f1f3/packages/server/src/fhir/lookups/lookuptable.ts
[human-name-lookup]: https://github.com/medplum/medplum/blob/ecbfcbb0860e95ef3e7ea3ddc4508b9a18e55ca1/packages/server/src/fhir/lookups/humanname.ts

### Examples

#### Find Patient by ID (special search parameter for all resource types)

```
Patient?_id=c5a1e9bc-b627-4520-8a1c-cb6907a6e6c4
```

```sql
-- Only retrieve necessary data from the associated DB table
SELECT "Patient"."id", "Patient"."content" FROM "Patient"
-- `deleted=false` filter added to all queries by default
WHERE ("Patient"."deleted"=false AND "Patient"."id"='c5a1e9bc-b627-4520-8a1c-cb6907a6e6c4')
```

#### Array column and boolean filters

```
Organization?_profile=http://hl7.org/fhir/us/core/StructureDefinition/us-core-organization
	&active=true
```

```sql
SELECT "Organization"."id", "Organization"."content" FROM "Organization"
WHERE ("Organization"."deleted"=false AND (
  -- && operator checks for overlap between arrays
  ("Organization"."_profile" IS NOT NULL AND "Organization"."_profile" && ARRAY[
    'http://hl7.org/fhir/us/core/StructureDefinition/us-core-organization'
  ]::TEXT[])
  -- Multiple search parameters are ANDed together in the SQL query
  AND "Organization"."active"=true
))
```

#### Multiple values for single search parameter

```
Observation?_profile=
  http://hl7.org/fhir/us/core/StructureDefinition/us-core-observation-lab,http://hl7.org/fhir/us/core/StructureDefinition/us-core-observation-social-history
```

```sql
SELECT "Observation"."id", "Observation"."content" FROM "Observation"
WHERE ("Observation"."deleted"=false AND (
  -- && matches if arrays have any element in common
  "Observation"."_profile" IS NOT NULL AND "Observation"."_profile" && ARRAY[
    'http://hl7.org/fhir/us/core/StructureDefinition/us-core-observation-lab',
    'http://hl7.org/fhir/us/core/StructureDefinition/us-core-observation-social-history'
  ]::TEXT[]
))
```

#### String matching in array column

```
Organization?name=GeneCo
```

```sql
SELECT "Organization"."id", "Organization"."content" FROM "Organization"
WHERE ("Organization"."deleted"=false AND
  -- Subquery on array column is nearly (±5%) as performant as &&,
  -- provided that subquery is cheap
  EXISTS(SELECT 1 FROM unnest("name") AS "name"
    -- Strings use case-insensitive prefix matching
    WHERE LOWER("name") LIKE 'geneco%'
    LIMIT 1
  )
)
```

#### Name lookup table

```
Practitioner?name=Dub
```

```sql
SELECT "Practitioner"."id", "Practitioner"."content" FROM "Practitioner"
  -- LEFT JOIN enables selecting matches or not
  -- JOINed tables are assigned numbered aliases
  LEFT JOIN "HumanName" AS "T1" ON (
    "Practitioner"."id"="T1"."resourceId" AND
    -- Matching criteria are inserted into the JOIN ON
    -- tsv column is computed when resource is inserted into DB
    "T1"."name_tsv" @@ to_tsquery('simple','Dub:*')
  )
WHERE ("Practitioner"."deleted"=false AND
  -- Find rows that match the code
  "T1"."resourceId" IS NOT NULL
-- GROUP BY is required with JOIN
) GROUP BY "Practitioner"."id"
```

#### Token lookup table with modifier

```
DiagnosticReport?code:not=http://loinc.org|69737-5
```

```sql
SELECT "DiagnosticReport"."id", "DiagnosticReport"."content" FROM "DiagnosticReport"
  LEFT JOIN "DiagnosticReport_Token" AS "T1" ON (
    "DiagnosticReport"."id"="T1"."resourceId" AND
    -- Tokens are stored essentially as (searchParam, system, code) tuples
    "T1"."code"='code' AND (
      "T1"."system"='http://loinc.org' AND
      "T1"."value"='69737-5'
    )
  )
WHERE ("DiagnosticReport"."deleted"=false AND
  -- Negate the search and find rows that do NOT match
  "T1"."resourceId" IS NULL
) GROUP BY "DiagnosticReport"."id"
```

## Permissions and Access Control

Search results must obey the same permissions and access model as the rest of the server, so any resources the user does not have access to must not appear in the search results. Maintaining accurate paging through the results set requires that we do not filter anything out of the rows returned by the database: all security filters must [apply directly to the DB SQL query][add-project-filter]. These filters come in two kinds: one restricting the user to their own Project, and others related to associated AccessPolicy restrictions.

The Project filter is added for all users other than Super Admins, and takes the form:

```sql
-- Restrict to the Project compartment by its ID
compartments && ARRAY['4410089e-6a88-4cc8-9cb6-3592ee18191c']
```

AccessPolicy restrictions are specified using `application/x-fhir-query` expressions (e.g. `Observation?subject=Patient/c9d98310-d47d-4265-a377-4ec9317ceee6`), which are [parsed into SQL expressions][access-sql] the same way as the main search query being performed. Resources matching these criteria are allowed to be shown to the user with that AccessPolicy. These filter expressions are added to the SQL query, [wrapped in a `Disjunction`][access-disjunct] so any matching policy will grant access.

[add-project-filter]: https://github.com/medplum/medplum/blob/6ecbcf8fdc209dbf799ebe9df7d726217424f1f3/packages/server/src/fhir/search.ts#L121
[access-sql]: https://github.com/medplum/medplum/blob/6ecbcf8fdc209dbf799ebe9df7d726217424f1f3/packages/server/src/fhir/repo.ts#L1006-L1012
[access-disjunct]: https://github.com/medplum/medplum/blob/6ecbcf8fdc209dbf799ebe9df7d726217424f1f3/packages/server/src/fhir/repo.ts#L1021

## Search Indexing

Search parameter values are [extracted from resources via FHIRPath expressions][search-value-extract] defined for each parameter. Most search parameter expressions are simple paths or variations thereof, but some parameters make use of more complex expressions to derive the search value: e.g. `Patient?deceased` (`Patient.deceased.exists() and Patient.deceased != false`). The results of evaluating the expression on the resource is [indexed into the database transactionally][db-index-tx] with the resource content, including any associated lookup tables.

[search-value-extract]: https://github.com/medplum/medplum/blob/6ecbcf8fdc209dbf799ebe9df7d726217424f1f3/packages/server/src/fhir/repo.ts#L1116
[db-index-tx]: https://github.com/medplum/medplum/blob/6ecbcf8fdc209dbf799ebe9df7d726217424f1f3/packages/server/src/fhir/repo.ts#L615-L619

## Appendix A: FHIR Search Concerns

FHIR aims to provide a very broad and powerful search API, which places a significant burden on implementers to handle many different cases and cross-cutting concerns. A high-level summary of the entire scope of these concerns is given below:

- **Context**: resource type, compartment, or system-level (with list of types or for all types)
- **Parameter type**: number, date, string, token, reference, composite, quantity, uri, special
- **Operators**
  - **Modifiers**: e.g. exact, missing, contains, identifier
  - **Prefixes**: eq, ne, gt, lt, ge, le, sa, eb, ap
- **Chaining**: JOIN and filter on linked table columns, e.g. `Observation?subject.name=Fred&_has:DiagnosticReport:result:status=partial`
- **Value collection**: Single value, comma-separated (OR), repeated parameter (AND)
  - FHIR search queries are logically in [CNF][cnf]
  - Parameters are ANDed together, and multiple values in one parameter are ORed
- **Composite parameters**: used to incorporate [DNF][dnf] filters e.g. (paramA=x AND paramB=y) OR (paramA=u AND paramB=v)
- **Sorting**: by search parameter, in forward or reverse order
- **Pagination**: `_count` and `_offset` params, plus adding [paging links][page-links] to the response
- **Included resources**: `_include` and `_revinclude` params, include linked resources in the search response
- **Subsetting**: `_summary` and `_elements` params, return only subsets of each resource for performance

[cnf]: https://en.wikipedia.org/wiki/Conjunctive_normal_form
[dnf]: https://en.wikipedia.org/wiki/Disjunctive_normal_form
[paging-links]: http://hl7.org/fhir/http.html#paging
