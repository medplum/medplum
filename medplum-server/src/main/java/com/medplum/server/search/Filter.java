package com.medplum.server.search;

import com.medplum.fhir.types.SearchParameter;

public class Filter {
    private final SearchParameter searchParam;
    private final Operation op;
    private final String value;

    public Filter(final SearchParameter searchParam, final Operation op, final String value) {
        this.searchParam = searchParam;
        this.op = op;
        this.value = value;
    }

    public SearchParameter getSearchParam() {
        return searchParam;
    }

    public Operation getOp() {
        return op;
    }

    public String getValue() {
        return value;
    }
}
