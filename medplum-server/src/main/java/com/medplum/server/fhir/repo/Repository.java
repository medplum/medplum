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
     * @param user The user performing the operation.
     * @param data Initializer data.
     * @return Operation outcome.
     */
    OperationOutcome create(SecurityUser user, JsonObject data);

    /**
     * Returns a resource by ID.
     * @param user The user performing the operation.
     * @param resourceType The FHIR resource type.
     * @param id The FHIR resource ID.
     * @return Operation outcome.
     */
    OperationOutcome read(SecurityUser user, String resourceType, String id);

    /**
     * Returns a resource by ID.
     * @param user The user performing the operation.
     * @param reference A FHIR reference object.
     * @return Operation outcome.
     */
    OperationOutcome readReference(SecurityUser user, Reference reference);

    /**
     * Returns a resource history.
     * @param user The user performing the operation.
     * @param resourceType The FHIR resource type.
     * @param id The FHIR resource ID.
     * @return Operation outcome.
     */
    OperationOutcome readHistory(SecurityUser user, String resourceType, String id);

    /**
     * Returns a resource by ID and version ID.
     * @param user The user performing the operation.
     * @param resourceType The FHIR resource type.
     * @param id The FHIR resource ID.
     * @param vid The FHIR resource version ID.
     * @return Operation outcome.
     */
    OperationOutcome readVersion(SecurityUser user, String resourceType, String id, String vid);

    /**
     * Updates a resource from key value pairs.
     * If the resource does not exist, it will be created.
     * @param user The user performing the operation.
     * @param id The FHIR resource ID.
     * @param data Updated data.
     * @return Operation outcome.
     */
    OperationOutcome update(SecurityUser user, String id, JsonObject data);

    /**
     * Deletes a resource by ID.
     * @param user The user performing the operation.
     * @param resourceType The FHIR resource type.
     * @param id The FHIR resource ID.
     * @return Operation outcome.
     */
    OperationOutcome delete(SecurityUser user, String resourceType, String id);

    /**
     * Searches for all resources that match the search criteria.
     * @param user The user performing the operation.
     * @param searchRequest Search criteria.
     * @return Operation outcome.
     */
    OperationOutcome search(SecurityUser user, SearchRequest searchRequest);

    /**
     * Creates records from a FHIR Bundle.
     * see: https://www.hl7.org/fhir/http.html#transaction
     * @param user The user performing the operation.
     * @param bundle The FHIR bundle data.
     * @return Operation outcome.
     */
    OperationOutcome createBatch(SecurityUser user, JsonObject bundle);

    /**
     * Processes a FHIR message bundle.
     * see: https://www.hl7.org/fhir/messaging.html
     * @param user The user performing the operation.
     * @param bundle The FHIR bundle data.
     * @return Operation outcome.
     */
    OperationOutcome processMessage(SecurityUser user, JsonObject bundle);

    /**
     * Updates a resource by patch edit operations.
     * @param user The user performing the operation.
     * @param resourceType The FHIR resource type.
     * @param id The FHIR resource ID.
     * @param patch The JSON patch data.
     * @return Operation outcome.
     */
    OperationOutcome patch(SecurityUser user, String resourceType, String id, JsonPatch patch);

    /**
     * Searches for all resources related to a patient ID.
     * @param user The user performing the operation.
     * @param patientId Patient ID.
     * @return Operation outcome.
     */
    OperationOutcome searchPatientEverything(SecurityUser user, String patientId);
}
