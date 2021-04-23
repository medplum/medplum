package com.medplum.server.search;

import java.util.ArrayList;
import java.util.List;
import java.util.Map.Entry;

import jakarta.ws.rs.core.MultivaluedMap;

import com.medplum.fhir.types.SearchParameter;

/**
 * Parses a FHIR search query.
 * See: https://www.hl7.org/fhir/search.html
 */
public class SearchRequestParser {
    private final String resourceType;
    private final List<Filter> filters;
    private final List<SortRule> sortRules;
    private int page;
    private int count;

    public static SearchRequest parse(final String resourceType, final MultivaluedMap<String, String> params) {
        final SearchRequestParser parser = new SearchRequestParser(resourceType);
        for (final Entry<String, List<String>> entry : params.entrySet()) {
            final String key = entry.getKey();
            for (final String value : entry.getValue()) {
                parser.parseKeyValue(key, value);
            }
        }
        return parser.build();
    }

    public static SearchRequest parse(final String resourceType, final String key, final String value) {
        final SearchRequestParser parser = new SearchRequestParser(resourceType);
        parser.parseKeyValue(key, value);
        return parser.build();
    }

    private SearchRequestParser(final String resourceType) {
        this.resourceType = resourceType;
        this.filters = new ArrayList<>();
        this.sortRules = new ArrayList<>();
        this.page = 0;
        this.count = 10;
    }

    private void parseKeyValue(final String key, final String value) {
        switch (key) {
        case "_id":
        case "id":
            filters.add(new Filter(SearchParameters.getParameter("Resource", "_id"), Operation.EQUALS, value));
            break;

        case "_sort":
            parseSortRule(value);
            break;

        case "_page":
            page = Integer.parseInt(value);
            break;

        case "_count":
            count = Integer.parseInt(value);
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
            sortRules.add(new SortRule(code, descending));
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

        filters.add(new Filter(param, op, num));
    }

    private void parseDate(final SearchParameter param, final String value) {

    }

    private void parseString(final SearchParameter param, final String value) {
        Operation op = Operation.EQUALS;
        String num = value;

        if (value.startsWith("eq")) {
            op = Operation.EQUALS;
            num = value.substring(2);

        } else if (value.startsWith("ne")) {
            op = Operation.NOT_EQUALS;
            num = value.substring(2);
        }

        filters.add(new Filter(param, op, num));

    }

    private void parseToken(final SearchParameter param, final String value) {
        filters.add(new Filter(param, Operation.EQUALS, value));
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

    private SearchRequest build() {
        return new SearchRequest(resourceType, filters, sortRules, page, count);
    }
}
