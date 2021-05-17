package com.medplum.server.fhir.r4.search;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.Test;

public class SearchParserTest {

    @Test
    public void testParse() {
        final SearchRequest request = SearchParser.parse("Patient?_fields=id,meta.versionId,meta.lastUpdated,name,identifier&_sort=-meta.lastUpdated&identifier=foo");
        assertNotNull(request);
        assertEquals(1, request.getFilters().size());
    }

    @Test
    public void testNumberEquals() {
        final SearchRequest request = SearchParser.parse("RiskAssessment?probability=0.5");
        assertNotNull(request);
        assertEquals(1, request.getFilters().size());
        assertEquals("probability", request.getFilters().get(0).getSearchParam().code());
        assertEquals(Operation.EQUALS, request.getFilters().get(0).getOp());
        assertEquals("0.5", request.getFilters().get(0).getValue());
    }

    @Test
    public void testNumberNotEquals() {
        final SearchRequest request = SearchParser.parse("RiskAssessment?probability=ne0.5");
        assertNotNull(request);
        assertEquals(1, request.getFilters().size());
        assertEquals("probability", request.getFilters().get(0).getSearchParam().code());
        assertEquals(Operation.NOT_EQUALS, request.getFilters().get(0).getOp());
        assertEquals("0.5", request.getFilters().get(0).getValue());
    }

    @Test
    public void testNumberLessThan() {
        final SearchRequest request = SearchParser.parse("RiskAssessment?probability=lt0.5");
        assertNotNull(request);
        assertEquals(1, request.getFilters().size());
        assertEquals("probability", request.getFilters().get(0).getSearchParam().code());
        assertEquals(Operation.LESS_THAN, request.getFilters().get(0).getOp());
        assertEquals("0.5", request.getFilters().get(0).getValue());
    }

    @Test
    public void testNumberLessThanOrEquals() {
        final SearchRequest request = SearchParser.parse("RiskAssessment?probability=le0.5");
        assertNotNull(request);
        assertEquals(1, request.getFilters().size());
        assertEquals("probability", request.getFilters().get(0).getSearchParam().code());
        assertEquals(Operation.LESS_THAN_OR_EQUALS, request.getFilters().get(0).getOp());
        assertEquals("0.5", request.getFilters().get(0).getValue());
    }

    @Test
    public void testNumberGreaterThan() {
        final SearchRequest request = SearchParser.parse("RiskAssessment?probability=gt0.5");
        assertNotNull(request);
        assertEquals(1, request.getFilters().size());
        assertEquals("probability", request.getFilters().get(0).getSearchParam().code());
        assertEquals(Operation.GREATER_THAN, request.getFilters().get(0).getOp());
        assertEquals("0.5", request.getFilters().get(0).getValue());
    }

    @Test
    public void testNumberGreaterThanOrEquals() {
        final SearchRequest request = SearchParser.parse("RiskAssessment?probability=ge0.5");
        assertNotNull(request);
        assertEquals(1, request.getFilters().size());
        assertEquals("probability", request.getFilters().get(0).getSearchParam().code());
        assertEquals(Operation.GREATER_THAN_OR_EQUALS, request.getFilters().get(0).getOp());
        assertEquals("0.5", request.getFilters().get(0).getValue());
    }

    @Test
    public void testDateEquals() {
        final SearchRequest request = SearchParser.parse("Procedure?date=2020-01-01");
        assertNotNull(request);
        assertEquals(1, request.getFilters().size());
        assertEquals("date", request.getFilters().get(0).getSearchParam().code());
        assertEquals(Operation.EQUALS, request.getFilters().get(0).getOp());
        assertEquals("2020-01-01", request.getFilters().get(0).getValue());
    }

    @Test
    public void testDateNotEquals() {
        final SearchRequest request = SearchParser.parse("Procedure?date=ne2020-01-01");
        assertNotNull(request);
        assertEquals(1, request.getFilters().size());
        assertEquals("date", request.getFilters().get(0).getSearchParam().code());
        assertEquals(Operation.NOT_EQUALS, request.getFilters().get(0).getOp());
        assertEquals("2020-01-01", request.getFilters().get(0).getValue());
    }

    @Test
    public void testDateLessThan() {
        final SearchRequest request = SearchParser.parse("Procedure?date=lt2020-01-01");
        assertNotNull(request);
        assertEquals(1, request.getFilters().size());
        assertEquals("date", request.getFilters().get(0).getSearchParam().code());
        assertEquals(Operation.LESS_THAN, request.getFilters().get(0).getOp());
        assertEquals("2020-01-01", request.getFilters().get(0).getValue());
    }

    @Test
    public void testDateLessThanOrEquals() {
        final SearchRequest request = SearchParser.parse("Procedure?date=le2020-01-01");
        assertNotNull(request);
        assertEquals(1, request.getFilters().size());
        assertEquals("date", request.getFilters().get(0).getSearchParam().code());
        assertEquals(Operation.LESS_THAN_OR_EQUALS, request.getFilters().get(0).getOp());
        assertEquals("2020-01-01", request.getFilters().get(0).getValue());
    }

    @Test
    public void testDateGreaterThan() {
        final SearchRequest request = SearchParser.parse("Procedure?date=gt2020-01-01");
        assertNotNull(request);
        assertEquals(1, request.getFilters().size());
        assertEquals("date", request.getFilters().get(0).getSearchParam().code());
        assertEquals(Operation.GREATER_THAN, request.getFilters().get(0).getOp());
        assertEquals("2020-01-01", request.getFilters().get(0).getValue());
    }

    @Test
    public void testDateGreaterThanOrEquals() {
        final SearchRequest request = SearchParser.parse("Procedure?date=ge2020-01-01");
        assertNotNull(request);
        assertEquals(1, request.getFilters().size());
        assertEquals("date", request.getFilters().get(0).getSearchParam().code());
        assertEquals(Operation.GREATER_THAN_OR_EQUALS, request.getFilters().get(0).getOp());
        assertEquals("2020-01-01", request.getFilters().get(0).getValue());
    }

    @Test
    public void testDateStartsAfter() {
        final SearchRequest request = SearchParser.parse("Procedure?date=sa2020-01-01");
        assertNotNull(request);
        assertEquals(1, request.getFilters().size());
        assertEquals("date", request.getFilters().get(0).getSearchParam().code());
        assertEquals(Operation.STARTS_AFTER, request.getFilters().get(0).getOp());
        assertEquals("2020-01-01", request.getFilters().get(0).getValue());
    }

    @Test
    public void testDateEndsBefore() {
        final SearchRequest request = SearchParser.parse("Procedure?date=eb2020-01-01");
        assertNotNull(request);
        assertEquals(1, request.getFilters().size());
        assertEquals("date", request.getFilters().get(0).getSearchParam().code());
        assertEquals(Operation.ENDS_BEFORE, request.getFilters().get(0).getOp());
        assertEquals("2020-01-01", request.getFilters().get(0).getValue());
    }

    @Test
    public void testDateApproximately() {
        final SearchRequest request = SearchParser.parse("Procedure?date=ap2020-01-01");
        assertNotNull(request);
        assertEquals(1, request.getFilters().size());
        assertEquals("date", request.getFilters().get(0).getSearchParam().code());
        assertEquals(Operation.APPROXIMATELY, request.getFilters().get(0).getOp());
        assertEquals("2020-01-01", request.getFilters().get(0).getValue());
    }

    @Test
    public void testStringEquals() {
        final SearchRequest request = SearchParser.parse("Patient?given=eve");
        assertNotNull(request);
        assertEquals(1, request.getFilters().size());
        assertEquals("given", request.getFilters().get(0).getSearchParam().code());
        assertEquals(Operation.EQUALS, request.getFilters().get(0).getOp());
        assertEquals("eve", request.getFilters().get(0).getValue());
    }

    @Test
    public void testStringContains() {
        final SearchRequest request = SearchParser.parse("Patient?given:contains=eve");
        assertNotNull(request);
        assertEquals(1, request.getFilters().size());
        assertEquals("given", request.getFilters().get(0).getSearchParam().code());
        assertEquals(Operation.CONTAINS, request.getFilters().get(0).getOp());
        assertEquals("eve", request.getFilters().get(0).getValue());
    }

    @Test
    public void testStringExact() {
        final SearchRequest request = SearchParser.parse("Patient?given:exact=eve");
        assertNotNull(request);
        assertEquals(1, request.getFilters().size());
        assertEquals("given", request.getFilters().get(0).getSearchParam().code());
        assertEquals(Operation.EXACT, request.getFilters().get(0).getOp());
        assertEquals("eve", request.getFilters().get(0).getValue());
    }
}
