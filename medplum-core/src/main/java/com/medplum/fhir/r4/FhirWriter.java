package com.medplum.fhir.r4;

import java.io.OutputStream;
import java.lang.annotation.Annotation;
import java.lang.reflect.Type;

import jakarta.json.Json;
import jakarta.json.JsonWriter;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.MultivaluedMap;
import jakarta.ws.rs.ext.MessageBodyWriter;

import com.medplum.fhir.r4.types.FhirObject;

@Produces(FhirMediaType.APPLICATION_FHIR_JSON)
public class FhirWriter implements MessageBodyWriter<FhirObject> {

    @Override
    public boolean isWriteable(
            final Class<?> type,
            final Type genericType,
            final Annotation[] annotations,
            final MediaType mediaType) {

        return FhirObject.class.isAssignableFrom(type) && FhirMediaType.isCompatible(mediaType);
    }

    @Override
    public void writeTo(
            final FhirObject fhirObject,
            final Class<?> type,
            final Type genericType,
            final Annotation[] annotations,
            final MediaType mediaType,
            final MultivaluedMap<String, Object> httpHeaders,
            final OutputStream entityStream) {

        try (final JsonWriter writer = Json.createWriter(entityStream)) {
            writer.writeObject(fhirObject);
        }
    }
}
