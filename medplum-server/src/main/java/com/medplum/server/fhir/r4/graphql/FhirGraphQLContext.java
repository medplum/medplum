package com.medplum.server.fhir.r4.graphql;

import com.medplum.server.fhir.r4.repo.Repository;
import com.medplum.server.security.SecurityUser;

public class FhirGraphQLContext {
    private final Repository repo;
    private final SecurityUser user;

    public FhirGraphQLContext(final Repository repo, final SecurityUser user) {
        this.repo = repo;
        this.user = user;
    }

    public Repository getRepo() {
        return repo;
    }

    public SecurityUser getUser() {
        return user;
    }
}
