# GraphQL vs REST APIs in Medplum

One of the most frequent questions we get from our users is whether they should use Medplum's [REST](http://hl7.org/fhir/R4/http.html) or [GraphQL](https://www.medplum.com/docs/graphql) APIs. Both have a FHIR specification, but they offer different tradeoffs for different use cases.

In this post, we'll discuss these tradeoffs and provide some guidance on how you can choose which API is right for you.

## GraphQL

GraphQL has [surged in popularity](https://devops.com/key-findings-from-the-2022-state-of-graphql-report/#:~:text=GraphQL%2C%20the%20open%20source%20query,the%20specific%20client%20at%20hand.) in recent years. You can try out FHIR graphql queries on your medplum project using our [graphiql sandbox](https://graphiql.medplum.com/).

In the context of FHIR, one of GraphQL's strongest features is the ability to quickly retrieve [multiple linked resources](/docs/graphql/basic-queries#resolving-nested-resources-with-the-resource-element). While the REST API allows similar functionality using the [`_include`](/docs/search/includes) and [`_revinclude`](/docs/search/includes) search parameters, GraphQL offers a more natural syntax for querying bundles of resources that reference each other.

```graphql
{
  Patient(id: "patient-id") {
    name {
      given
      family
    }
    address {
      line
      city
      state
      postalCode
    }
    # highlight-start
    # Get all DiagnosticReports related to this patient
    DiagnosticReportList(_reference: patient) {
      # highlight-end
      performer {
        reference
      }
      code {
        text
      }
      # highlight-start
      # Get all Observation resources
      # referenced by DiagnosticReport.result
      result {
        resource {
          ... on Observation {
            status
            code {
              text
            }
            valueQuantity {
              value
              unit
            }
          }
        }
      }
      # highlight-end
    }
  }
}
```

In addition, GraphQL also offers very fine grained control for developers to select the exact fields returned in a query, which can reduce your app's network traffic. Unlike the REST API, GraphQL lets you select specific fields, even in deeply nested elements, and provides additional filtering functionality through [FHIR Path list filters](/docs/graphql/basic-queries#filtering-lists-with-field-arguments). This is helpful in applications where bandwidth is at a premium, such as in mobile applications.

```graphql
{
  Patient(id: "patient-id") {
    name {
      given
      family
    }
    address {
      line
      city
      state
      postalCode
    }
    # highlight-start
    # Filter the `telecom` field to only contain phone numbers
    telecom(system: "phone") {
      value
    }
    # highlight-end
  }
}
```

As with [REST batch requests](http://hl7.org/fhir/R4/http.html#transaction), GraphQL queries and mutations support the retrieval and modification of multiple resources in a single query, respectively.

```graphql
{
  # Retrieve all Patients
  patients: PatientList(name: "Eve", address_city: "Philadelphia") {
    resourceType
    id
    name {
      family
      given
    }
    address {
      line
      city
      state
      postalCode
    }
  }
  # Retrieve all Medications
  medications: MedicationList {
    code {
      text
    }
  }
}
```

However, GraphQL does have _some_ limitations. The FHIR GraphQL specification is under active development, but some parts have not yet reached maturity. For instance, its search specification isn't as detailed as its REST counterpart, though the [`_filter`](http://hl7.org/fhir/R4/search.html) search parameter is available in both APIs. And FHIR GraphQL does not yet have a specification for `PATCH` operations, which limits its ability to make field-level updates to a resource.

Lastly, because shape of a GraphQL query's return value depends on the query itself, it's harder to use typescript type definitions from `@medplum/fhirtypes` to handle return values. Instead, users must defined custom types that match the shape of their query.

## REST

The FHIR REST API is the most common way to interact with FHIR-based systems on the market, and enjoys a broad base of support. While REST is an older technology, the FHIR REST API offers a few advantages.

First off, REST offers a relatively richer search specification out of the box, with support for [search modifiers](/docs/search/basic-search#search-modifiers), [iterated includes](/docs/search/includes#iterate-modifier), and [search result counts](/docs/search/paginated-search#getting-the-total-number-of-results-with-_total) .

Moreover, REST supports [HTTP `PATCH` operations](http://hl7.org/fhir/R4/http.html#patch), which allows clients to perform targeted, field-level resource updates. This capability is especially useful in high-concurrency environments, where many clients could be editing different parts of the same field.

```ts
// This call assigns the Task to the current user
// IF AND ONLY IF the the task has not been modified on the server
await medplum.patchResource('Task', task.id, [
  { op: 'test', path: '/meta/versionId', value: task.meta?.versionId },
  { op: 'replace', path: '/status', value: 'accepted' },
  { op: 'replace', path: '/owner', value: createReference(currentUser) },
]);
```

And while GraphQL mutations _do_ allow writing multiple resources at once, using FHIR [batch requests](http://hl7.org/fhir/R4/http.html#transaction) via the REST API offers more advanced batch writing functionality. The [`ifNoneExist`](http://hl7.org/fhir/R4/bundle-definitions.html#Bundle.entry.request.ifNoneExist) element can be used to perform a search before creating a resource to prevent duplicate resource creation. Additionally, you can create collection of linked resources that reference each other using the [`urn:uuid` syntax](http://hl7.org/fhir/R4/http.html#trules).

```ts
{
  resourceType: 'Bundle',
  type: 'batch',
  entry: [
    {
      // highlight-next-line
      fullUrl: 'urn:uuid:42316ff8-2714-4680-9980-f37a6d1a71bc',
      request: {
        method: 'POST',
        url: 'Practitioner',
        // highlight-next-line
        ifNoneExist: 'identifier=https://example.com|' + identifier,
      },
      resource: {
        resourceType: 'Practitioner',
        identifier: [{ system: 'https://example.com', value: identifier }],
      },
    },
    {
      request: { method: 'POST', url: 'ServiceRequest' },
      resource: {
        resourceType: 'ServiceRequest',
        status: 'active',
        intent: 'order',
        subject: createReference(patient),
        code: { coding: [{ system: 'http://loinc.org', code: '12345-6' }] },
        // highlight-next-line
        requester: { reference: 'urn:uuid:42316ff8-2714-4680-9980-f37a6d1a71bc' },
      },
    },
  ],
}
```

Lastly, there are additional APIs that are only available from REST, such as the [resource history API](http://hl7.org/fhir/R4/http.html#history), which returns a [Bundle](/docs/api/fhir/resources/bundle) of all historical versions of a resource.

However, while REST has more powerful write and search functionality, it has some limitations on reads. You can use the special [`_elements`](http://hl7.org/fhir/R4/search.html#elements) search parameter to limit which fields in a resource are returned, but this can only be used to filter top-level fields. You cannot specify filter out nested subfields of a complex element.

Additionally, when requesting linked resources using `_include` and `_revinclude` with a FHIR search, the REST API will return a flat `Bundle` of resources. You will have to implement some additional logic in your client to connect linked resources with their base resource, where as GraphQL nests linked resources _within_ their root resource.

## Which One Should I Choose?

So which should you choose? Your choice between REST and GraphQL will largely hinge on your specific use-case. Here are three potential paths to consider:

**Both (recommended):** For those not committed to a specific toolset, blending the best of both worlds is our recommended strategy. GraphQL is great for reading linked resources, and REST offers advanced write, batch, and history management functionality. Using the [Medplum Client](https://www.medplum.com/docs/sdk/core.medplumclient) makes it easy to shift between these two query modalities, and it's [what we used when building the Medplum App](https://github.com/medplum/medplum/blob/47d62035b20e4cda75beb5bc57e088583b388feb/packages/react/src/AppShell/HeaderSearchInput.tsx#L129-L198).

**REST API:** Using REST is our recommendation if your tasks involve complex searches or filters. Similarly, if you are performing queries that delve into resource history or necessitate targeted updates using PATCH, REST is the way to go. Lastly, REST is the de-facto standard when interacting with multiple FHIR systems.

**GraphQL Only:** This route may appeal to you if you have invested in building on top of GraphQL tooling such as [Apollo](https://www.apollographql.com/). Additionally, if your operations are predominantly read-heavy and bandwidth is at a premium, GraphQL can give you fine-grained control over what is sent over the network.

The decision between REST and GraphQL isn't black and white, and each API offers its own tradeoffs. Medplum aims to offer developers the widest set of options so that they can hone in on the optimal tool for their needs.
