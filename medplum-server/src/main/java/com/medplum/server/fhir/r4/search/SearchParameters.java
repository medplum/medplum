package com.medplum.server.fhir.r4.search;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import com.medplum.fhir.r4.types.Bundle;
import com.medplum.fhir.r4.types.Bundle.BundleEntry;
import com.medplum.fhir.r4.types.SearchParameter;
import com.medplum.util.JsonUtils;

/**
 * The SearchParameterMapping class defines a URL search parameter.
 * The "code" refers to the query string parameter name.
 * The "path" refers to the FHIR resource path.
 * These values are built at startup time based on "search-parameters.json".
 * The "search-parameters.json" file is part of the official FHIR specification.
 */
public class SearchParameters {
    private static final Map<String, Map<String, SearchParameter>> mappings;

    static {
        mappings = buildMappings();
    }

    public static List<SearchParameter> getParameters(final String resourceType) {
        final Map<String, SearchParameter> inner = mappings.get(resourceType);
        return inner == null ? Collections.emptyList() : new ArrayList<>(inner.values());
    }

    public static SearchParameter getParameter(final String resourceType, final String code) {
        final Map<String, SearchParameter> innerMap = mappings.get(resourceType);
        return innerMap == null ? null : innerMap.get(code);
    }

    private static Map<String, Map<String, SearchParameter>> buildMappings() {
        final Bundle searchParams = new Bundle(JsonUtils.readJsonResourceFile("search-parameters.json"));
        final Map<String, Map<String, SearchParameter>> table = new HashMap<>();

        for (final BundleEntry entry : searchParams.entry()) {
            final SearchParameter searchParam = entry.resource(SearchParameter.class);
            if (searchParam.expression() == null) {
                // Ignore special case search parameters
                // "text" = "Search on the narrative of the resource"
                // "content" = "Search on the entire content of the resource"
                // "query" = "A custom search profile that describes a specific defined query operation"
                continue;
            }

            final String code = searchParam.code();
            final String[] expressions = searchParam.expression().split("\\|");

            for (int i = 0; i < expressions.length; i++) {
                expressions[i] = expressions[i].trim();
            }

            for (final String resourceType : searchParam.base()) {
                final String expression = getExpressionForResourceType(resourceType, expressions);
                if (expression == null) {
                    // TODO:  Special compound cases
                    continue;
                }

                table.computeIfAbsent(resourceType, r -> new HashMap<>()).put(code, searchParam);
            }
        }

        // TODO: Inner tables should also be unmodifiable
        return Collections.unmodifiableMap(table);
    }

    private static String getExpressionForResourceType(final String resourceType, final String[] expressions) {
        for (final String expression : expressions) {
            if (expression.startsWith(resourceType + ".") || expression.startsWith("(" + resourceType + ".") && expression.endsWith(")")) {
                return cleanExpression(resourceType, expression);
            }
        }
        return null;
    }

    private static String cleanExpression(final String resourceType, final String expression) {
        String str = expression;

        if (str.startsWith("(") && str.endsWith(")")) {
            str = str.substring(1, str.length() - 1);
        }

        if (str.startsWith(resourceType + ".")) {
            str = str.substring(resourceType.length() + 1);
        }

        final int whereIndex = str.indexOf(".where(");
        if (whereIndex >= 0) {
            // TODO: Need to preserve this information
            // For example, consider "Account.subject.where(resolve() is Patient)"
            // We keep "subject", but we also need "Patient" to be able to construct the FHIR reference object
            str = str.substring(0, whereIndex);
        }

        return str;
    }
}
