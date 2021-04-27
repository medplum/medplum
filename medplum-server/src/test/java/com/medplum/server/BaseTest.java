package com.medplum.server;

import java.net.URI;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

import jakarta.ws.rs.core.UriBuilder;

import org.apache.commons.lang3.RandomStringUtils;
import org.glassfish.jersey.client.ClientConfig;
import org.glassfish.jersey.client.ClientProperties;
import org.glassfish.jersey.test.JerseyTest;
import org.junit.BeforeClass;
import org.mindrot.jbcrypt.BCrypt;

import com.medplum.fhir.FhirClient;
import com.medplum.fhir.types.Bundle;
import com.medplum.fhir.types.ClientApplication;
import com.medplum.fhir.types.HumanName;
import com.medplum.fhir.types.OperationOutcome;
import com.medplum.fhir.types.Patient;
import com.medplum.fhir.types.User;
import com.medplum.server.fhir.repo.JdbcRepository;
import com.medplum.server.search.SearchRequestParser;
import com.medplum.server.security.SecurityUser;

public abstract class BaseTest extends JerseyTest {
    protected static App app;
    protected static User testUser;
    protected static Patient testPatient;
    protected static ClientApplication testClientApp;
    protected static String testAccessToken;

    @BeforeClass
    public static void setUpBaseTest() throws Exception {
        final Map<String, Object> config = new HashMap<>();
        config.put(ConfigSettings.BASE_URL, "");
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
                    SearchRequestParser.parse(Patient.RESOURCE_TYPE, Patient.PROPERTY_BIRTH_DATE, "1982-06-05"));

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
                    SearchRequestParser.parse(User.RESOURCE_TYPE, User.PROPERTY_EMAIL, "admin@example.com"));

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
                    .secret(RandomStringUtils.randomAlphanumeric(64))
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
        config.register(FhirObjectReader.class);
    }

    protected FhirClient fhir() {
        final URI uri = UriBuilder.fromUri(getBaseUri()).path("/fhir/R4").build();
        return new FhirClient(uri, testAccessToken, client());
    }

    protected JdbcRepository getRepo() {
        return app.getRepo();
    }
}
