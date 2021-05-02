package com.medplum.server.fhir.repo;

import static java.util.Collections.*;

import java.util.Arrays;

import org.apache.commons.lang3.RandomStringUtils;
import org.mindrot.jbcrypt.BCrypt;

import com.medplum.fhir.StandardOutcomes;
import com.medplum.fhir.types.Bundle;
import com.medplum.fhir.types.Bundle.BundleEntry;
import com.medplum.fhir.types.ClientApplication;
import com.medplum.fhir.types.HumanName;
import com.medplum.fhir.types.OperationOutcome;
import com.medplum.fhir.types.Organization;
import com.medplum.fhir.types.Practitioner;
import com.medplum.fhir.types.User;
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
            return StandardOutcomes.invalid("Already setup");
        }

        final Organization organization = repo.create(SecurityUser.SYSTEM_USER, Organization.create()
                .name("Medplum")
                .build())
                .resource(Organization.class);

        final Practitioner practitioner = repo.create(SecurityUser.SYSTEM_USER, Practitioner.create()
                .name(singletonList(HumanName.create()
                        .given(singletonList("Admin"))
                        .family("User")
                        .build()))
                .build())
                .resource(Practitioner.class);

        final User user = repo.create(SecurityUser.SYSTEM_USER, User.create()
                .email("admin@medplum.com")
                .passwordHash(BCrypt.hashpw("admin", BCrypt.gensalt()))
                .practitioner(practitioner.createReference())
                .build())
                .resource(User.class);

        final ClientApplication clientApplication = repo.create(SecurityUser.SYSTEM_USER, ClientApplication.create()
                .secret(RandomStringUtils.randomAlphanumeric(64))
                .redirectUri("https://example.com/redirect")
                .build())
                .resource(ClientApplication.class);

        return StandardOutcomes.ok(Bundle.create().entry(Arrays.asList(
                BundleEntry.create().resource(organization).build(),
                BundleEntry.create().resource(practitioner).build(),
                BundleEntry.create().resource(user).build(),
                BundleEntry.create().resource(clientApplication).build()))
                .build());
    }
}
