package com.medplum.server.search;

import java.net.URI;
import java.util.List;

import jakarta.ws.rs.core.UriBuilder;

public class SearchRequest {
    public static final int MAX_PAGE_SIZE = 1000;
    private final String resourceType;
    private final List<Filter> filters;
    private final List<SortRule> sortRules;
    private final int page;
    private final int count;

    public SearchRequest(final String resourceType, final List<Filter> filters, final List<SortRule> sortRules, final int page, final int count) {
        this.resourceType = resourceType;
        this.filters = filters;
        this.sortRules = sortRules;
        this.page = page;
        this.count = count;
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
}
