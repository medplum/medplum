---
sidebar_position: 3
---

# GraphQL

The FHIR GraphQL API allows you to query and retrieve FHIR resources using GraphQL syntax, enabling precise data fetching with a single request. Unlike traditional REST endpoints that return fixed resource structures, GraphQL lets clients specify exactly which fields and related resources they need, reducing over-fetching and minimizing network round trips.

**Use Cases:**

- **Efficient data loading**: Fetch a patient along with their conditions, medications, and recent encounters in a single query instead of multiple REST calls
- **Mobile and web applications**: Minimize bandwidth usage by requesting only the fields needed for specific UI components
- **Complex data relationships**: Navigate FHIR references and retrieve nested resources (e.g., Patient → Encounters → Practitioners) in one request
- **API exploration**: Use GraphQL introspection to discover available FHIR resources and their fields programmatically

Medplum provides a GraphQL API based on the [FHIR GraphQL](https://hl7.org/fhir/graphql.html) draft specification.

Check out our [FHIR GraphQL Guide](/docs/graphql) for an in depth explanation of how to leverage the FHIR GraphQL API.

## Related

- [Medplum FHIR GraphQL Guide](/docs/graphql) - Comprehensive guide to using GraphQL with Medplum
- [GraphQL Queries](/docs/graphql/mutations) - GraphQL mutations and write operations
- [FHIR Search](/docs/search) - Alternative REST-based search capabilities
- [FHIR GraphQL Specification](https://hl7.org/fhir/graphql.html) - Official FHIR GraphQL draft specification
- [GraphQL Foundation](https://graphql.org/learn/) - GraphQL language documentation
