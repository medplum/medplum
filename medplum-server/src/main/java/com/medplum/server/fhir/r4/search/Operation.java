package com.medplum.server.fhir.r4.search;

public enum Operation {
    EQUALS,
    NOT_EQUALS,

    // Numbers
    GREATER_THAN,
    LESS_THAN,
    GREATER_THAN_OR_EQUALS,
    LESS_THAN_OR_EQUALS,

    // Dates
    STARTS_AFTER,
    ENDS_BEFORE,
    APPROXIMATELY,

    // String
    CONTAINS,
    EXACT,

    // Token
    TEXT,
    ABOVE,
    BELOW,
    IN,
    NOT_IN,
    OF_TYPE,
}
