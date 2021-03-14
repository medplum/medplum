package com.medplum.server.search;

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
}
