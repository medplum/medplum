package com.medplum.server.fhir.r4.search;

import java.net.URI;
import java.util.Objects;

import com.medplum.fhir.r4.types.SearchParameter;

/**
 * Parses a FHIR search query.
 * See: https://www.hl7.org/fhir/search.html
 */
public class SearchRequestParser {
    private final String resourceType;
    private final SearchRequest.Builder builder;

    public static SearchRequest parse(final String uri) {
        return parse(URI.create(uri));
    }

    public static SearchRequest parse(final URI uri) {
        if (uri == null) {
            throw new NullPointerException("URI is null");
        }

        final String path = uri.getPath();
        if (path == null || path.isBlank()) {
            throw new IllegalArgumentException("Path is missing");
        }

        final String[] pathComponents = path.split("/");
        final String resourceType = pathComponents[pathComponents.length - 1];
        if (resourceType == null || resourceType.isBlank()) {
            throw new IllegalArgumentException("Resource type is missing");
        }

        final SearchRequestParser parser = new SearchRequestParser(resourceType);

        final String query = uri.getQuery();
        if (query != null && !query.isBlank()) {
            for (final String pair : query.split("&")) {
                final int equalsIndex = pair.indexOf('=');
                if (equalsIndex < 0) {
                    parser.parseKeyValue(pair, "");
                } else {
                    parser.parseKeyValue(pair.substring(0, equalsIndex), pair.substring(equalsIndex + 1));
                }
            }
        }

        return parser.build();
    }

    public SearchRequestParser(final String resourceType) {
        this.resourceType = Objects.requireNonNull(resourceType);
        this.builder = SearchRequest.create(resourceType);
    }

    public void parseKeyValue(final String key, final String value) {
        switch (key) {
        case "_id":
        case "id":
            builder.filter(new Filter(SearchParameters.getParameter("Resource", "_id"), Operation.EQUALS, value));
            break;

        case "_sort":
            parseSortRule(value);
            break;

        case "_page":
            builder.page(Integer.parseInt(value));
            break;

        case "_count":
            builder.count(Integer.parseInt(value));
            break;

        default:
            final SearchParameter param = SearchParameters.getParameter(resourceType, key);
            if (param != null) {
                parseParameter(param, value);
            }
        }
    }

    private void parseSortRule(final String value) {
        for (final String field : value.split(",")) {
            final String code;
            boolean descending = false;
            if (field.startsWith("-")) {
                code = field.substring(1);
                descending = true;
            } else {
                code = field;
            }
            builder.sortRule(new SortRule(code, descending));
        }
    }

    private void parseParameter(final SearchParameter searchParam, final String value) {
        switch (searchParam.type()) {
        case "number":
            parseNumber(searchParam, value);
            break;
        case "date":
            parseDate(searchParam, value);
            break;
        case "string":
            parseString(searchParam, value);
            break;
        case "token":
            parseToken(searchParam, value);
            break;
        case "reference":
            parseReference(searchParam, value);
            break;
        case "composite":
            parseComposite(searchParam, value);
            break;
        case "quantity":
            parseQuantity(searchParam, value);
            break;
        case "uri":
            parseUri(searchParam, value);
            break;
        case "special":
            parseSpecial(searchParam, value);
            break;
        }
    }

    private void parseNumber(final SearchParameter param, final String value) {
        Operation op = Operation.EQUALS;
        String num = value;

        if (value.startsWith("eq")) {
            op = Operation.EQUALS;
            num = value.substring(2);

        } else if (value.startsWith("ne")) {
            op = Operation.NOT_EQUALS;
            num = value.substring(2);
        }

        builder.filter(new Filter(param, op, num));
    }

    private void parseDate(final SearchParameter param, final String value) {

    }

    private void parseString(final SearchParameter param, final String value) {
        Operation op = Operation.EQUALS;
        String str = value;

        if (value.startsWith("eq")) {
            op = Operation.EQUALS;
            str = value.substring(2);

        } else if (value.startsWith("ne")) {
            op = Operation.NOT_EQUALS;
            str = value.substring(2);
        }

        builder.filter(new Filter(param, op, str));

    }

    private void parseToken(final SearchParameter param, final String value) {
        builder.filter(new Filter(param, Operation.EQUALS, value));
    }

    private void parseReference(final SearchParameter param, final String value) {

    }

    private void parseComposite(final SearchParameter param, final String value) {

    }

    private void parseQuantity(final SearchParameter param, final String value) {

    }

    private void parseUri(final SearchParameter param, final String value) {

    }

    private void parseSpecial(final SearchParameter param, final String value) {

    }

    public SearchRequest build() {
        return builder.build();
    }
}
