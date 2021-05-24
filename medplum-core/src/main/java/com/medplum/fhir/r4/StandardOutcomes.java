package com.medplum.fhir.r4;

import static com.medplum.util.IdUtils.*;

import java.util.Collections;
import java.util.List;

import jakarta.json.JsonObject;
import jakarta.ws.rs.core.Response.Status;

import com.medplum.fhir.r4.types.CodeableConcept;
import com.medplum.fhir.r4.types.OperationOutcome;
import com.medplum.fhir.r4.types.OperationOutcome.OperationOutcomeIssue;

public class StandardOutcomes {
    public static final String ALL_OK_ID = "allok";
    public static final String ALL_OK_MSG = "All OK";
    public static final String CREATED_ID = "created";
    public static final String CREATED_MSG = "Created";
    public static final String NOT_FOUND_ID = "notfound";
    public static final String NOT_FOUND_MSG = "Not Found";
    public static final String SEVERITY_FATAL = "fatal";
    public static final String SEVERITY_ERROR = "error";
    public static final String SEVERITY_WARNING = "warning";
    public static final String SEVERITY_INFO = "information";
    public static final String CODE_INFO = "information";
    public static final String CODE_INVALID = "invalid";
    public static final String CODE_SECURITY = "security";
    public static final String CODE_PROCESSING = "processing";
    public static final String CODE_EXCEPTION = "exception";

    StandardOutcomes() {
        throw new UnsupportedOperationException();
    }

    public static OperationOutcome ok() {
        return OperationOutcome.create()
                .id(ALL_OK_ID)
                .status(Status.OK.getStatusCode())
                .issue(Collections.singletonList(OperationOutcomeIssue.create()
                        .severity(SEVERITY_INFO)
                        .code(CODE_INFO)
                        .details(CodeableConcept.create().text(ALL_OK_MSG).build())
                        .build()))
                .build();
    }

    public static OperationOutcome ok(final JsonObject resource) {
        return OperationOutcome.create()
                .id(ALL_OK_ID)
                .status(Status.OK.getStatusCode())
                .issue(Collections.singletonList(OperationOutcomeIssue.create()
                        .severity(SEVERITY_INFO)
                        .code(CODE_INFO)
                        .details(CodeableConcept.create().text(ALL_OK_MSG).build())
                        .build()))
                .resource(resource)
                .build();
    }

    public static OperationOutcome created(final JsonObject resource) {
        return OperationOutcome.create()
                .id(CREATED_ID)
                .status(Status.CREATED.getStatusCode())
                .issue(Collections.singletonList(OperationOutcomeIssue.create()
                        .severity(SEVERITY_INFO)
                        .code(CODE_INFO)
                        .details(CodeableConcept.create().text(CREATED_MSG).build())
                        .build()))
                .resource(resource)
                .build();
    }

    public static OperationOutcome notFound() {
        return OperationOutcome.create()
                .id(NOT_FOUND_ID)
                .status(Status.NOT_FOUND.getStatusCode())
                .issue(Collections.singletonList(OperationOutcomeIssue.create()
                        .severity(SEVERITY_ERROR)
                        .code(CODE_INVALID)
                        .details(CodeableConcept.create().text(NOT_FOUND_MSG).build())
                        .build()))
                .build();
    }

    public static OperationOutcome invalid(final String details) {
        return OperationOutcome.create()
                .id(generateId())
                .status(Status.BAD_REQUEST.getStatusCode())
                .issue(Collections.singletonList(OperationOutcomeIssue.create()
                        .severity(SEVERITY_ERROR)
                        .code(CODE_INVALID)
                        .details(CodeableConcept.create().text(details).build())
                        .build()))
                .build();
    }

    public static OperationOutcome security(final String details) {
        return OperationOutcome.create()
                .id(generateId())
                .status(Status.UNAUTHORIZED.getStatusCode())
                .issue(Collections.singletonList(OperationOutcomeIssue.create()
                        .severity(SEVERITY_ERROR)
                        .code(CODE_SECURITY)
                        .details(CodeableConcept.create().text(details).build())
                        .build()))
                .build();
    }

    public static OperationOutcome error(final List<OperationOutcomeIssue> issue) {
        return OperationOutcome.create()
                .id(generateId())
                .status(Status.BAD_REQUEST.getStatusCode())
                .issue(issue)
                .build();
    }
}
