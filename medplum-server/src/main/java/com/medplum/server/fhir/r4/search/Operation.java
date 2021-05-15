package com.medplum.server.fhir.r4.search;

public enum Operation {
    EQUALS,
    NOT_EQUALS,
    GREATER_THAN,
    LESS_THAN,
    GREATER_THAN_OR_EQUALS,
    LESS_THAN_OR_EQUALS,
    STARTS_AFTER,
    ENDS_BEFORE,
    APPROXIMATELY,
}
