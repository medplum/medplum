package com.medplum.server.fhir.r4.graphql;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Map.Entry;

import jakarta.json.JsonArray;
import jakarta.json.JsonNumber;
import jakarta.json.JsonObject;
import jakarta.json.JsonString;
import jakarta.json.JsonValue;

import com.medplum.fhir.r4.types.Bundle;
import com.medplum.fhir.r4.types.Bundle.BundleEntry;
import com.medplum.fhir.r4.types.OperationOutcome;
import com.medplum.server.fhir.r4.repo.Repository;
import com.medplum.server.fhir.r4.search.SearchRequest;
import com.medplum.server.fhir.r4.search.SearchParser;
import com.medplum.server.security.SecurityUser;

import graphql.language.Argument;
import graphql.language.Field;
import graphql.language.StringValue;
import graphql.language.Value;
import graphql.schema.DataFetcher;
import graphql.schema.DataFetchingEnvironment;
import graphql.schema.PropertyDataFetcherHelper;

public class FhirGraphQLDataFetcher<T> implements DataFetcher<T> {

    @SuppressWarnings("unchecked")
    @Override
    public T get(final DataFetchingEnvironment environment) throws Exception {
        final FhirGraphQLContext context = environment.getContext();
        final Field field = environment.getField();
        final Object source = environment.getSource();

        if (source == null) {
            // TODO: Confirm that source==null is the correct criteria
            // Environment also has a fieldDefinition, which could provide more conclusive details
            return (T) getResource(context, field);
        }

        return (T) PropertyDataFetcherHelper.getPropertyValue(
                field.getName(),
                source,
                environment.getFieldType(),
                environment);
    }

    private Object getResource(final FhirGraphQLContext context, final Field field) {
        final Repository repo = context.getRepo();
        final SecurityUser user = context.getUser();
        final SearchRequest searchRequest = convertFieldToSearchRequest(field);
        final OperationOutcome outcome = repo.search(user, searchRequest);
        final Bundle bundle = outcome.resource(Bundle.class);

        if (field.getName().endsWith("List")) {
            final List<Map<String, Object>> result = new ArrayList<>();
            for (final BundleEntry entry : bundle.entry()) {
                result.add(convertJsonObject(entry.resource()));
            }
            return result;
        }

        if (!bundle.entry().isEmpty()) {
            return convertJsonObject(bundle.entry().get(0).resource());
        }

        return null;
    }

    private SearchRequest convertFieldToSearchRequest(final Field field) {
        final String fieldName = field.getName();
        final String resourceType = fieldName.endsWith("List") ? fieldName.substring(0, fieldName.length() - 4) : fieldName;
        final List<Argument> arguments = field.getArguments();
        final SearchParser parser = new SearchParser(resourceType);

        for (final Argument arg : arguments) {
            final String key = arg.getName();
            final Value<?> value = arg.getValue();
            final String valueStr;
            if (value instanceof StringValue) {
                valueStr = ((StringValue) value).getValue();
            } else {
                valueStr = value.toString();
            }
            parser.parseKeyValue(key, valueStr);
        }

        return parser.build();
    }

    private Object convertJsonValue(final JsonValue jsonValue) {
        switch(jsonValue.getValueType()) {
        case ARRAY:
            return convertJsonArray((JsonArray) jsonValue);
        case FALSE:
            return Boolean.FALSE;
        case NULL:
            return null;
        case NUMBER:
            return ((JsonNumber) jsonValue).doubleValue();
        case OBJECT:
            return convertJsonObject((JsonObject) jsonValue);
        case STRING:
            return ((JsonString) jsonValue).getString();
        case TRUE:
            return Boolean.TRUE;
        default:
            throw new RuntimeException("Unhandled JsonValue type: " + jsonValue.getValueType());
        }
    }

    private List<Object> convertJsonArray(final JsonArray jsonArray) {
        final List<Object> result = new ArrayList<>();
        for (final JsonValue element : jsonArray) {
            result.add(convertJsonValue(element));
        }
        return Collections.unmodifiableList(result);
    }

    private Map<String, Object> convertJsonObject(final JsonObject jsonObject) {
        final Map<String, Object> result = new HashMap<>();
        for (final Entry<String, JsonValue> entry : jsonObject.entrySet()) {
            result.put(entry.getKey(), convertJsonValue(entry.getValue()));
        }
        return Collections.unmodifiableMap(result);
    }
}
