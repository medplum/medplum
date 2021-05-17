package com.medplum.server.fhir.r4.search;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.Test;

public class SearchRequestParserTest {

    @Test
    public void testParse() {
        final SearchRequest request = SearchRequestParser.parse("Patient?_fields=id,meta.versionId,meta.lastUpdated,name,identifier&_sort=-meta.lastUpdated&identifier=foo");
        assertNotNull(request);
        assertEquals(1, request.getFilters().size());
    }
}
