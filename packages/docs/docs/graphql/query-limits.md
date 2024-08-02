---
sidebar_position: 4
---

# Query Limits

Because complex GraphQL queries may be computationally expensive, the query is analyzed before execution,
and may be rejected by the server if the query will be too expensive to perform all at once. The different checks
performed to validate the query are detailed below.

## Max Depth

The amount of processing and data included in the query response is related to the maximum depth of nested fields
within the query. Medplum server counts the _field depth_ of the query, that is the deepest nested field — crossing but
not explicitly counting fragment expansions. For example:

```gql
{
  # Top level is depth 0
  PatientList(name: "Alice") {
    # Fields like `name` and `link` have depth 1
    name {
      # `given` and `family` have depth 2
      given
      family
    }
    link {
      other {
        # `resource` has depth 3, but the inline fragment on Patient is not counted
        resource {
          ... on Patient {
            # Finally, `active` has depth 4
            active
          }
        }
      }
    }
  }
}
```

## Cost Estimate

The estimated cost of a GraphQL query is calculated based on the number of search operations performed and reference
links traversed, using the following general formula:

- Each search field (e.g. `PatientList(_count: 100) { ...ChildFields }`) is worth
  `8 (base search cost) + 100 (result count) * <complexity of ChildFields>`
- Each linked resource (e.g. `Reference.resource { ...ChildFields }`) is worth
  `1 (base reference cost) + 2 (branching factor) * <complexity of ChildFields>`

These costs are added together, and compared to a configurable server limit in order to determine if the query should be
executed against the database.

For example, consider the following query:

```gql
query ToDoList {
  # Since this search requests up to 100 results, it costs 308 = 8 + 100*3
  TaskList(_count: 100) {
    ...TaskInfo
  }
}

# This fragment costs 3 (due to a nested resource link)
fragment TaskInfo on Task {
  id
  for {
    # Crossing this resource link costs 3 = 1 + 2*1
    resource {
      ...TaskPatient
    }
  }
}

# This fragment costs 1 = 0 (its included base fragment) + 1 (resource link)
fragment TaskPatient on Patient {
  ...BasePatient
  managingOrganization {
    # Crossing this resource link costs 1 = 1 + 2*0
    resource {
      # Since this inline fragment contains only fields of this resource and doesn't perform any searches
      # or cross resource links, it has cost 0
      ... on Organization {
        name
      }
    }
  }
}

# Since this fragment contains only fields of this resource and doesn't perform any searches
# or cross resource links, it has cost 0
fragment BasePatient on Patient {
  name {
    given
    family
  }
  gender
  birthDate
}
```
