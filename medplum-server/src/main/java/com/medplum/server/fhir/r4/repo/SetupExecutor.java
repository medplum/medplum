package com.medplum.server.fhir.r4.repo;

import static java.util.Collections.*;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

import org.apache.commons.lang3.RandomStringUtils;
import org.mindrot.jbcrypt.BCrypt;

import com.medplum.fhir.r4.StandardOutcomes;
import com.medplum.fhir.r4.types.Bundle;
import com.medplum.fhir.r4.types.Bundle.BundleEntry;
import com.medplum.fhir.r4.types.ClientApplication;
import com.medplum.fhir.r4.types.FhirResource;
import com.medplum.fhir.r4.types.HumanName;
import com.medplum.fhir.r4.types.OperationOutcome;
import com.medplum.fhir.r4.types.Organization;
import com.medplum.fhir.r4.types.Practitioner;
import com.medplum.fhir.r4.types.StructureDefinition;
import com.medplum.fhir.r4.types.User;
import com.medplum.server.fhir.r4.search.SearchRequest;
import com.medplum.server.fhir.r4.search.SearchParser;
import com.medplum.server.security.SecurityUser;
import com.medplum.util.JsonUtils;

public class SetupExecutor {
    private final Repository repo;
    private final List<FhirResource> created;

    public SetupExecutor(final Repository repo) {
        this.repo = repo;
        this.created = new ArrayList<>();
    }

    public OperationOutcome setup() {
        createStructureDefinitions();
        createOrganization();
        createUser();
        createClientApplication();

        if (created.isEmpty()) {
            return StandardOutcomes.invalid("Already setup");
        }

        return StandardOutcomes.ok(Bundle.create().entry(created.stream()
                .map(r -> BundleEntry.create().resource(r).build())
                .collect(Collectors.toList()))
                .build());
    }

    private void createStructureDefinitions() {
        final Bundle bundle = repo.search(
                SecurityUser.SYSTEM_USER,
                SearchRequest.create(StructureDefinition.RESOURCE_TYPE).build()).resource(Bundle.class);

        if (!bundle.entry().isEmpty()) {
            return;
        }

        final Bundle structureDefinitions = new Bundle(JsonUtils.readJsonResourceFile("fhir/r4/profiles-resources.json"));

        for (final BundleEntry entry : structureDefinitions.entry()) {
            final FhirResource resource = entry.resource();
            if (resource.resourceType().equals(StructureDefinition.RESOURCE_TYPE)) {
                final OperationOutcome outcome = repo.create(SecurityUser.SYSTEM_USER, resource);
                if (!outcome.isOk()) {
                    System.out.println(outcome);
                } else {
                    created.add(outcome.resource(StructureDefinition.class));
                }
            }
        }
    }

    private void createOrganization() {
        final Bundle bundle = repo.search(
                SecurityUser.SYSTEM_USER,
                SearchParser.parse("Organization?name=Medplum")).resource(Bundle.class);

        if (!bundle.entry().isEmpty()) {
            return;
        }

        final Organization organization = repo.create(SecurityUser.SYSTEM_USER, Organization.create()
                .name("Medplum")
                .build())
                .resource(Organization.class);

        created.add(organization);
    }

    private void createUser() {
        final Bundle bundle = repo.search(
                SecurityUser.SYSTEM_USER,
                SearchRequest.create(User.RESOURCE_TYPE).build()).resource(Bundle.class);

        if (!bundle.entry().isEmpty()) {
            return;
        }

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

        created.add(practitioner);
        created.add(user);
    }

    private void createClientApplication() {
        final Bundle bundle = repo.search(
                SecurityUser.SYSTEM_USER,
                SearchRequest.create(ClientApplication.RESOURCE_TYPE).build()).resource(Bundle.class);

        if (!bundle.entry().isEmpty()) {
            return;
        }

        final ClientApplication clientApplication = repo.create(SecurityUser.SYSTEM_USER, ClientApplication.create()
                .secret(RandomStringUtils.randomAlphanumeric(64))
                .redirectUri("https://example.com/redirect")
                .build())
                .resource(ClientApplication.class);

        created.add(clientApplication);
    }
}
