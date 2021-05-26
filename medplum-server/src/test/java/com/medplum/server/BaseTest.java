package com.medplum.server;

import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

import jakarta.ws.rs.core.UriBuilder;

import org.glassfish.jersey.client.ClientConfig;
import org.glassfish.jersey.client.ClientProperties;
import org.glassfish.jersey.test.JerseyTest;
import org.junit.BeforeClass;
import org.mindrot.jbcrypt.BCrypt;

import com.medplum.fhir.r4.FhirClient;
import com.medplum.fhir.r4.types.Bundle;
import com.medplum.fhir.r4.types.ClientApplication;
import com.medplum.fhir.r4.types.HumanName;
import com.medplum.fhir.r4.types.OperationOutcome;
import com.medplum.fhir.r4.types.Patient;
import com.medplum.fhir.r4.types.User;
import com.medplum.server.fhir.r4.repo.jdbc.JdbcRepository;
import com.medplum.server.fhir.r4.search.SearchParser;
import com.medplum.server.security.SecurityUser;
import com.medplum.util.IdUtils;

public abstract class BaseTest extends JerseyTest {
    protected static App app;
    protected static User testUser;
    protected static Patient testPatient;
    protected static ClientApplication testClientApp;
    protected static String testAccessToken;

    @BeforeClass
    public static void setUpBaseTest() throws Exception {
        final Map<String, Object> config = new HashMap<>();
        config.put(ConfigSettings.BASE_URL, "/");
        config.put(ConfigSettings.JDBC_URL, "jdbc:h2:mem:test;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE");
        config.put(ConfigSettings.AUTH_ISSUER, "test-issuer");
        config.put(ConfigSettings.AUTH_AUDIENCE, "test-audience");
        config.put(ConfigSettings.AUTH_JWKS_URL, "https://www.example.com/.well-known/jwks.json");
        config.put(ConfigSettings.AUTH_AUTHORIZE_URL, "https://www.example.com/oauth/authorize");
        config.put(ConfigSettings.AUTH_TOKEN_URL, "https://www.example.com/oauth/token");
        config.put(ConfigSettings.AUTH_USER_INFO_URL, "https://www.example.com/oauth/userinfo");

        app = new App(config);

        try (final JdbcRepository repo = app.getRepo()) {
            final OperationOutcome patientSearchOutcome = repo.search(
                    SecurityUser.SYSTEM_USER,
                    SearchParser.parse("Patient?birthDate=1982-06-05"));

            if (patientSearchOutcome.isOk() && !patientSearchOutcome.resource(Bundle.class).entry().isEmpty()) {
                testPatient = patientSearchOutcome.resource(Bundle.class).entry().get(0).resource(Patient.class);
            } else {
                testPatient = repo.create(SecurityUser.SYSTEM_USER, Patient.create()
                        .name(Collections.singletonList(HumanName.create()
                                .given(Arrays.asList("Alice", "P"))
                                .family("Smith")
                                .build()))
                        .build())
                        .resource(Patient.class);
            }

            final OperationOutcome userSearchOutcome = repo.search(
                    SecurityUser.SYSTEM_USER,
                    SearchParser.parse("User?email=admin@example.com"));

            if (userSearchOutcome.isOk() && !userSearchOutcome.resource(Bundle.class).entry().isEmpty()) {
                testUser = userSearchOutcome.resource(Bundle.class).entry().get(0).resource(User.class);
            } else {
                testUser = repo.create(SecurityUser.SYSTEM_USER, User.create()
                        .email("admin@example.com")
                        .passwordHash(BCrypt.hashpw("admin", BCrypt.gensalt()))
                        .patient(testPatient.createReference())
                        .build())
                        .resource(User.class);
            }

            testClientApp = repo.create(SecurityUser.SYSTEM_USER, ClientApplication.create()
                    .secret(IdUtils.generateSecret())
                    .redirectUri("https://www.example.com/redirect")
                    .build())
                    .resource(ClientApplication.class);

            testAccessToken = app.getOAuth().generateAccessToken(
                    testClientApp,
                    testUser,
                    "openid user/*.*").getJws().getCompactSerialization();
        }
    }

    @Override
    protected App configure() {
        return app;
    }

    @Override
    protected void configureClient(final ClientConfig config) {
        config.property(ClientProperties.FOLLOW_REDIRECTS, false);
    }

    protected FhirClient fhir() {
        return FhirClient.builder()
                .baseUrl(UriBuilder.fromUri(getBaseUri()).path("/fhir/R4").build())
                .accessToken(testAccessToken)
                .client(client())
                .build();
    }

    protected JdbcRepository getRepo() {
        return app.getRepo();
    }
}
