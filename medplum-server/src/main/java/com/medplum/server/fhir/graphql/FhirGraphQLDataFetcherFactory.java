package com.medplum.server.fhir.graphql;

import graphql.schema.DataFetcher;
import graphql.schema.DataFetcherFactory;
import graphql.schema.DataFetcherFactoryEnvironment;

public class FhirGraphQLDataFetcherFactory<T> implements DataFetcherFactory<T> {

    @Override
    public DataFetcher<T> get(final DataFetcherFactoryEnvironment environment) {
        return new FhirGraphQLDataFetcher<>();
    }
}
