package com.medplum.server.fhir.repo;

import jakarta.json.JsonObject;
import jakarta.json.JsonPatch;

import com.medplum.fhir.types.OperationOutcome;
import com.medplum.fhir.types.Reference;
import com.medplum.server.search.SearchRequest;
import com.medplum.server.security.SecurityUser;

public interface Repository {

    /**
     * Creates a new resource version from key value pairs.
     * Always creates a new resource with a new ID.
     * @param securityContext TODO
     * @param resourceType JsonObject type.
     * @param data Initializer data.
     * @return Operation outcome.
     */
    OperationOutcome create(SecurityUser user, String resourceType, JsonObject data);

    /**
     * Returns a resource by ID.
     * @param resourceType JsonObject type.
     * @param id JsonObject ID.
     * @return Operation outcome.
     */
    OperationOutcome read(SecurityUser user, String resourceType, String id);

    /**
     * Returns a resource by ID.
     * @param resourceType JsonObject type.
     * @param id JsonObject ID.
     * @return Operation outcome.
     */
    OperationOutcome readReference(SecurityUser user, Reference reference);

    /**
     * Returns a resource history.
     * @param resourceType JsonObject type.
     * @param id JsonObject ID.
     * @return Operation outcome.
     */
    OperationOutcome readHistory(SecurityUser user, String resourceType, String id);

    /**
     * Returns a resource by ID and version ID.
     * @param resourceType JsonObject type.
     * @param id JsonObject ID.
     * @param vid JsonObject version ID.
     * @return Operation outcome.
     */
    OperationOutcome readVersion(SecurityUser user, String resourceType, String id, String vid);

    /**
     * Updates a resource from key value pairs.
     * If the resource does not exist, it will be created.
     * @param resourceType JsonObject type.
     * @param id JsonObject ID.
     * @param data Updated data.
     * @return Operation outcome.
     */
    OperationOutcome update(SecurityUser user, String resourceType, String id, JsonObject data);

    /**
     * Deletes a resource by ID.
     * @param resourceType JsonObject type.
     * @param id JsonObject ID.
     * @return Operation outcome.
     */
    OperationOutcome delete(SecurityUser user, String resourceType, String id);

    /**
     * Searches for all resources that match the search criteria.
     * @param searchRequest Search criteria.
     * @return Operation outcome.
     */
    OperationOutcome search(SecurityUser user, SearchRequest searchRequest);

    /**
     * Creates records from a FHIR Bundle.
     * see: https://www.hl7.org/fhir/http.html#transaction
     * @param ctx Request context.
     * @param bundle
     * @return Operation outcome.
     */
    OperationOutcome createBatch(SecurityUser user, JsonObject bundle);

    /**
     * Processes a FHIR message bundle.
     * see: https://www.hl7.org/fhir/messaging.html
     * @param ctx Request context.
     * @param bundle
     * @return Operation outcome.
     */
    OperationOutcome processMessage(SecurityUser user, JsonObject bundle);

    /**
     * Updates a resource by patch edit operations.
     * @param ctx Request context.
     * @param resourceType JsonObject type.
     * @param id JsonObject ID.
     * @param patch
     * @return Operation outcome.
     */
    OperationOutcome patch(SecurityUser user, String resourceType, String id, JsonPatch patch);

    /**
     * Searches for all resources related to a patient ID.
     * @param ctx Request context.
     * @param patientId Patient ID.
     * @return Operation outcome.
     */
    OperationOutcome searchPatientEverything(SecurityUser user, String patientId);
}
