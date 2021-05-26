package com.medplum.util;

import static java.util.Collections.*;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.Test;

import com.medplum.fhir.r4.types.HumanName;

public class HumanNameComparatorTest {

    @Test
    public void testComparator() {
        final var homer = HumanName.create().given(singletonList("Homer")).family("Simpson").build();
        final var bart = HumanName.create().given(singletonList("Bart")).family("Simpson").build();

        assertEquals(0, HumanNameComparator.INSTANCE.compare(homer, homer));
        assertEquals(0, HumanNameComparator.INSTANCE.compare(bart, bart));
        assertEquals(-6, HumanNameComparator.INSTANCE.compare(bart, homer));
        assertEquals(6, HumanNameComparator.INSTANCE.compare(homer, bart));
    }
}
