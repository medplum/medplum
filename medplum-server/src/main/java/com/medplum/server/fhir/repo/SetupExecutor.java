package com.medplum.server.fhir.repo;

import org.apache.commons.lang3.RandomStringUtils;

import com.medplum.fhir.StandardOperations;
import com.medplum.fhir.types.Bundle;
import com.medplum.fhir.types.ClientApplication;
import com.medplum.fhir.types.OperationOutcome;
import com.medplum.server.search.SearchRequest;
import com.medplum.server.security.SecurityUser;

public class SetupExecutor {
    private final Repository repo;

    public SetupExecutor(final Repository repo) {
        this.repo = repo;
    }

    public OperationOutcome setup() {
        // Check for existing client applications
        final OperationOutcome searchOutcome = repo.search(SecurityUser.SYSTEM_USER, SearchRequest.create(ClientApplication.RESOURCE_TYPE).build());
        if (!searchOutcome.isOk()) {
            return searchOutcome;
        }

        final Bundle existingBundle = searchOutcome.resource(Bundle.class);
        if (!existingBundle.entry().isEmpty()) {
            return StandardOperations.invalid("Already setup");
        }

        // Create a client application
        return repo.create(SecurityUser.SYSTEM_USER, ClientApplication.create()
                .secret(RandomStringUtils.randomAlphanumeric(64))
                .redirectUri("https://example.com/redirect")
                .build());
    }
}
