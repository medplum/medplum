---
sidebar_position: 3
---

# GraphQL

Medplum provides a GraphQL API based on the [FHIR GraphQL](https://hl7.org/fhir/graphql.html) draft specification.

## Testing with GraphiQL

Medplum provides an instance of [GraphiQL](https://github.com/graphql/graphiql), the reference implementation graphical IDE for GraphQL queries:

> <https://graphiql.medplum.com>

You can log in with your Medplum credentials, and run these example queries in the GraphiQL IDE.

## Invoking GraphQL

The standard end points for GraphQL are as defined on the `$graphql` operation:

```
[base]/$graphql
```

For example:

```bash
curl 'https://api.medplum.com/fhir/R4/$graphql' \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer MY_ACCESS_TOKEN" \
  -d '{"query":"{ Patient(id: \"123\") { name { given family }  }}"}'
```

The [MedplumClient](/docs/sdk/classes/MedplumClient) TypeScript class provides a `graphql` convenience method:

```ts
const result = await medplum.graphql(`{
  Patient(id: "123") {
    name {
      given
      family
    }
  }
}`);
```

## Searching

The Medplum GraphQL API supports two search methods:

1. Read by ID
2. Search by FHIR search parameters

Example of reading a patient by ID:

```graphql
{
  Patient(id: "123") {
    name {
      given
      family
    }
  }
}
```

To search, append the word "List" to the FHIR resource type. For example, to search for Patient resources use "PatientList", or to search for Observation resources use "ObservationList".

Example of searching for patients by name:

```graphql
{
  PatientList(name: "alice") {
    id
    identifier
    name {
      given
      family
    }
  }
}
```

## Field Selection

The Medplum GraphQL API fully implements [FHIR GraphQL Field Selection](https://hl7.org/fhir/graphql.html#fields):

Retrieve Patient fields:

```graphql
{
  Patient(id: "123") {
    identifier {
      system
      value
    }
    name {
      given
      family
    }
    address {
      line
      city
      state
    }
  }
}
```

Retrieve Observation values:

```graphql
{
  ObservationList(code: "xyz") {
    valueQuantity {
      value
      unit
    }
  }
}
```

## Resource References

The Medplum GraphQL API fully implements [FHIR GraphQL Resource References](https://hl7.org/fhir/graphql.html#references). On any `Reference` object, use the `resource` property to follow the reference pointer.

For example:

```graphql
{
  ObservationList {
    id
    subject {
      reference
      resource {
        ... on Patient {
          name {
            given
            family
          }
          birthDate
        }
      }
    }
    code {
      coding {
        system
        code
      }
    }
  }
}
```

## Reverse References

The Medplum GraphQL API fully implements [FHIR GraphQL Resource References](Reverse References). Within a resource, you can perform a reverse search using the special `_reference` parameter.

For example:

```graphql
{
  Patient(id: "123") {
    name {
      given
      family
    }
    ConditionList(_reference: patient) {
      code {
        coding {
          code
        }
      }
    }
  }
}
```
