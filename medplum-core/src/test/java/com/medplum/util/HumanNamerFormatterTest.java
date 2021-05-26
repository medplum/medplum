package com.medplum.util;

import static org.junit.jupiter.api.Assertions.*;

import java.util.Arrays;

import org.junit.Test;

import com.medplum.fhir.r4.types.HumanName;

public class HumanNamerFormatterTest {

    @Test
    public void testConstructor() {
        assertThrows(UnsupportedOperationException.class, HumanNameFormatter::new);
    }

    @Test
    public void testFormat() {
        assertEquals("", HumanNameFormatter.format(null));
        assertEquals("", HumanNameFormatter.format(HumanName.create().build()));
        assertEquals("fam", HumanNameFormatter.format(HumanName.create().family("fam").build()));
        assertEquals("a b c fam", HumanNameFormatter.format(HumanName.create().given(Arrays.asList("a", "b", "c")).family("fam").build()));
    }

    @Test
    public void testFormatGiven() {
        assertEquals("", HumanNameFormatter.formatGiven(null));
        assertEquals("", HumanNameFormatter.formatGiven(HumanName.create().build()));
        assertEquals("", HumanNameFormatter.formatGiven(HumanName.create().family("fam").build()));
        assertEquals("a b c", HumanNameFormatter.formatGiven(HumanName.create().given(Arrays.asList("a", "b", "c")).family("fam").build()));
    }

    @Test
    public void testFormatLastFirst() {
        assertEquals("", HumanNameFormatter.formatLastFirst(null));
        assertEquals("", HumanNameFormatter.formatLastFirst(HumanName.create().build()));
        assertEquals("fam", HumanNameFormatter.formatLastFirst(HumanName.create().family("fam").build()));
        assertEquals("fam a b c", HumanNameFormatter.formatLastFirst(HumanName.create().given(Arrays.asList("a", "b", "c")).family("fam").build()));
    }

    @Test
    public void testFormatAll() {
        assertEquals("", HumanNameFormatter.formatAll(null));
        assertEquals("", HumanNameFormatter.formatAll(HumanName.create().build()));
        assertEquals("fam", HumanNameFormatter.formatAll(HumanName.create().family("fam").build()));
        assertEquals("a b c fam", HumanNameFormatter.formatAll(HumanName.create().given(Arrays.asList("a", "b", "c")).family("fam").build()));

        assertEquals("pre giv fam suf", HumanNameFormatter.formatAll(HumanName.create()
                .prefix(Arrays.asList("pre"))
                .given(Arrays.asList("giv"))
                .family("fam")
                .suffix(Arrays.asList("suf"))
                .build()));

        assertEquals("pre giv fam suf [official]", HumanNameFormatter.formatAll(HumanName.create()
                .prefix(Arrays.asList("pre"))
                .given(Arrays.asList("giv"))
                .family("fam")
                .suffix(Arrays.asList("suf"))
                .use("official")
                .build()));
    }
}
