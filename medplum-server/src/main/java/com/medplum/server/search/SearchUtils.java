package com.medplum.server.search;

import java.util.Objects;

import jakarta.json.JsonObject;
import jakarta.json.JsonString;
import jakarta.json.JsonValue;
import jakarta.json.JsonValue.ValueType;

import com.medplum.fhir.FhirPath;
import com.medplum.fhir.types.FhirResource;
import com.medplum.fhir.types.SearchParameter;

public class SearchUtils {

    public static String evalAsString(final String expression, final JsonObject obj) {
        final JsonValue value = new FhirPath(expression).evalFirst(obj);
        if (value == null || value.getValueType() == ValueType.NULL) {
            return null;
        }

        switch (value.getValueType()) {
        case STRING:
            return ((JsonString) value).getString();

        default:
            return value.toString();
        }
    }

    public static boolean matches(final SearchRequest searchRequest, final FhirResource resource) {
        if (searchRequest == null) {
            throw new IllegalArgumentException("Search request is null");
        }

        if (resource == null) {
            throw new IllegalArgumentException("Resource is null");
        }

        if (!Objects.equals(searchRequest.getResourceType(), resource.resourceType())) {
            return false;
        }

        if (searchRequest.getFilters() != null) {
            for (final Filter filter : searchRequest.getFilters()) {
                final SearchParameter param = filter.getSearchParam();
                final String expected = filter.getValue();
                final String actual = SearchUtils.evalAsString(param.expression(), resource);
                if (!Objects.equals(expected, actual)) {
                    return false;
                }
            }
        }

        return true;
    }
}
