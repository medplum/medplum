# Medplum GraphiQL

This is the code for [https://graphiql.medplum.com](https://graphiql.medplum.com)

## Schema

The FHIR GraphQL schema is approximately 40 MB of compact JSON. It is large, and computationally expensive. The Medplum production servers disable GraphQL schema queries to reduce the risk of service interruption.

However, GraphiQL needs the schema for helpful functionality such as tooltips and autocomplete.

To use GraphiQL on localhost, you need a copy of the schema "introspection query" response in the `public/schema` directory.

The easy way is to simply copy the publicly hosted schema:

```bash
mkdir -p public/schema
cd public/schema
wget https://graphiql.medplum.com/schema/schema-v1.json
```

The harder way is to regenerate the schema from the current GraphQL model.

1. Make sure your Medplum user account has access to GraphQL schema/introspection queries
2. Disable the `operationName === 'IntrospectionQuery'` guard in `src/index.tsx`
3. Start the GraphiQL dev server
4. Open the GraphiQL app in your web browser
5. Use your web browser "Network" tools to find the introspection query
6. Save the output of that request as "schema-x.json"
7. Update `src/index.tsx` with the new schema filename
8. Re-enable the `operationName === 'IntrospectionQuery'` guard in `src/index.tsx`

TODO: Automate these steps
