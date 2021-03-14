package com.medplum.generator;

public class FileBuilder {
    private final StringBuilder b;
    private String prefix;

    public FileBuilder() {
        b = new StringBuilder();
        prefix = "";
    }

    public String getPrefix() {
        return prefix;
    }

    public void setPrefix(final String prefix) {
        this.prefix = prefix;
    }

    public void newLine() {
        b.append("\n");
    }

    public void append(final String line) {
        b.append(prefix);
        b.append(line);
        b.append("\n");
    }

    @Override
    public String toString() {
        return b.toString().replaceAll("\n\n\n", "\n\n");
    }
}
