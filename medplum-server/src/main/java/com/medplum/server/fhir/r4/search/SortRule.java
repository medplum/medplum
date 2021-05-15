package com.medplum.server.fhir.r4.search;

public class SortRule {
    private final String code;
    private final boolean descending;

    public SortRule(final String code, final boolean descending) {
        this.code = code;
        this.descending = descending;
    }

    public String getCode() {
        return code;
    }

    public boolean isDescending() {
        return descending;
    }

    @Override
    public String toString() {
        return "SortRule { code=" + code + ", descending=" + descending + " }";
    }
}
