package com.medplum.util;

import java.util.Comparator;

import com.medplum.fhir.r4.types.HumanName;

public class HumanNameComparator implements Comparator<HumanName> {
    public static final HumanNameComparator INSTANCE = new HumanNameComparator();

    private HumanNameComparator() {
        // Private constructor for singleton
    }

    @Override
    public int compare(final HumanName name1, final HumanName name2) {
        return HumanNameFormatter.formatLastFirst(name1).compareTo(HumanNameFormatter.formatLastFirst(name2));
    }
}
