package com.medplum.generator;

import org.apache.commons.text.StringEscapeUtils;
import org.apache.commons.text.WordUtils;

public class JavadocGenerator {

    public static void generateJavadoc(final FileBuilder b, final String text) {
        b.append("/**");

        for (final String textLine : text.split("\n")) {
            for (final String javadocLine : WordUtils.wrap(textLine, 70).split("\n")) {
                b.append(" " + ("* " + StringEscapeUtils.escapeHtml4(javadocLine)).trim());
            }
        }

        b.append(" */");
    }
}
