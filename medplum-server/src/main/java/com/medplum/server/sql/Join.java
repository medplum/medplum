package com.medplum.server.sql;

import java.util.Objects;

public class Join {
    private final Column left;
    private final Column right;

    public Join(final Column left, final Column right) {
        this.left = Objects.requireNonNull(left);
        this.right = Objects.requireNonNull(right);
    }

    public Column getLeft() {
        return left;
    }

    public Column getRight() {
        return right;
    }
}
