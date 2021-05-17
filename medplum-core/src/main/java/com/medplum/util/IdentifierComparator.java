package com.medplum.util;

import java.util.Comparator;

import com.medplum.fhir.r4.types.Identifier;

public class IdentifierComparator implements Comparator<Identifier> {
    public static final IdentifierComparator INSTANCE = new IdentifierComparator();

    private IdentifierComparator() {
        // Private constructor for singleton
    }

    @Override
    public int compare(final Identifier id1, final Identifier id2) {
        final int systemCompare = id1.system().compareTo(id2.system());
        if (systemCompare != 0) {
            return systemCompare;
        }

        return id1.value().compareTo(id2.value());
    }
}
