package com.medplum.server.fhir.r4.graphql;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.Test;

import graphql.schema.GraphQLOutputType;
import graphql.schema.GraphQLSchema;

public class FhirGraphQLSchemaTest {

    @Test
    public void testRootSchema() {
        final GraphQLSchema schema = FhirGraphQLSchema.getRootSchema();
        assertNotNull(schema);
    }

    @Test
    public void testPatient() {
        final GraphQLOutputType patientType = FhirGraphQLSchema.getGraphQLType("Patient");
        assertNotNull(patientType);
    }

    @Test
    public void testPatientSchema() {
        final GraphQLSchema schema = FhirGraphQLSchema.getResourceTypeSchema("Patient");
        assertNotNull(schema);
    }
}
