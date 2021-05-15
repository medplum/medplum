package com.medplum.server.fhir.r4.search;

import java.net.URI;
import java.util.ArrayList;
import java.util.List;

import jakarta.ws.rs.core.UriBuilder;

import com.medplum.fhir.types.SearchParameter;

public class SearchRequest {
    public static final int MAX_PAGE_SIZE = 1000;
    private final String resourceType;
    private final List<Filter> filters;
    private final List<SortRule> sortRules;
    private final int page;
    private final int count;

    public static Builder create(final String resourceType) {
        return new Builder(resourceType);
    }

    private SearchRequest(final Builder builder) {
        this.resourceType = builder.resourceType;
        this.filters = builder.filters;
        this.sortRules = builder.sortRules;
        this.page = builder.page;
        this.count = builder.count;
    }

    public String getResourceType() {
        return resourceType;
    }

    public List<Filter> getFilters() {
        return filters;
    }

    public List<SortRule> getSortRules() {
        return sortRules;
    }

    public int getPage() {
        return page;
    }

    public int getCount() {
        return count;
    }

    public URI toUri() {
        final UriBuilder b = UriBuilder.fromPath("/fhir/R4/").path(resourceType);

        return b.build();
    }

    @Override
    public String toString() {
        final StringBuilder b = new StringBuilder();
        b.append("SearchRequest {\n");
        b.append("  resourceType=" + resourceType + ",\n");

        if (filters == null || filters.isEmpty()) {
            b.append("  filters=[],\n");
        } else {
            b.append("  filters=[\n");
            for (final Filter filter : filters) {
                b.append("    ");
                b.append(filter);
                b.append(",\n");
            }
            b.append("  ],\n");
        }

        if (sortRules == null || sortRules.isEmpty()) {
            b.append("  sortRules=[],\n");
        } else {
            b.append("  sortRules=[\n");
            for (final SortRule sortRule : sortRules) {
                b.append("    ");
                b.append(sortRule);
                b.append(",\n");
            }
            b.append("  ],\n");
        }

        b.append("  page=" + page + ",\n");
        b.append("  count=" + count + ",\n");
        b.append("}");
        return b.toString();
    }

    public static class Builder {
        private final String resourceType;
        private List<Filter> filters;
        private List<SortRule> sortRules;
        private int page;
        private int count;

        private Builder(final String resourceType) {
            this.resourceType = resourceType;
            this.filters = new ArrayList<>();
            this.sortRules = new ArrayList<>();
            this.page = 0;
            this.count = 10;
        }

        public Builder filters(final List<Filter> filters) {
            this.filters = filters;
            return this;
        }

        public Builder filter(final Filter filter) {
            this.filters.add(filter);
            return this;
        }

        public Builder filter(final String paramName, final Operation op, final String value) {
            final SearchParameter param = SearchParameters.getParameter(resourceType, paramName);
            if (param == null) {
                throw new IllegalArgumentException("Unrecognized search parameter");
            }
            this.filters.add(new Filter(param, op, value));
            return this;
        }

        public Builder sortRules(final List<SortRule> sortRules) {
            this.sortRules = sortRules;
            return this;
        }

        public Builder sortRule(final SortRule sortRule) {
            this.sortRules.add(sortRule);
            return this;
        }

        public Builder page(final int page) {
            this.page = page;
            return this;
        }

        public Builder count(final int count) {
            this.count = count;
            return this;
        }

        public SearchRequest build() {
            return new SearchRequest(this);
        }
    }
}
