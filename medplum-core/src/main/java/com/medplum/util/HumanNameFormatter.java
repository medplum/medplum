package com.medplum.util;

import com.medplum.fhir.r4.types.HumanName;

public class HumanNameFormatter {

    HumanNameFormatter() {
        throw new UnsupportedOperationException();
    }

    public static String format(final HumanName name) {
        if (name == null) {
            return "";
        }

        final var b = new StringBuilder();

        final var given = name.given();
        if (given != null) {
            given.forEach(s -> b.append(s).append(' '));
        }

        final var family = name.family();
        if (family != null) {
            b.append(family);
        }

        return b.toString().trim();
    }

    public static String formatGiven(final HumanName name) {
        if (name == null) {
            return "";
        }

        final var b = new StringBuilder();

        final var given = name.given();
        if (given != null) {
            given.forEach(s -> b.append(s).append(' '));
        }

        return b.toString().trim();
    }

    public static String formatLastFirst(final HumanName name) {
        if (name == null) {
            return "";
        }

        final var b = new StringBuilder();

        final var family = name.family();
        if (family != null) {
            b.append(family).append(' ');
        }

        final var given = name.given();
        if (given != null) {
            given.forEach(s -> b.append(s).append(' '));
        }

        return b.toString().trim();
    }

    public static String formatAll(final HumanName name) {
        if (name == null) {
            return "";
        }

        final var b = new StringBuilder();

        final var prefix = name.prefix();
        if (prefix != null) {
            prefix.forEach(s -> b.append(s).append(' '));
        }

        final var given = name.given();
        if (given != null) {
            given.forEach(s -> b.append(s).append(' '));
        }

        final var family = name.family();
        if (family != null) {
            b.append(family);
        }

        final var suffix = name.suffix();
        if (suffix != null) {
            suffix.forEach(s -> b.append(' ').append(s));
        }

        final var use = name.use();
        if (use != null) {
            b.append(" [").append(use).append(']');
        }

        return b.toString().trim();
    }
}
