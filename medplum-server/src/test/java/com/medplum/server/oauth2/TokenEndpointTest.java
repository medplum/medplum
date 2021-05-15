package com.medplum.server.oauth2;

import static org.junit.jupiter.api.Assertions.*;

import static com.medplum.util.IdUtils.*;

import java.net.URI;
import java.util.Arrays;
import java.util.Map;
import java.util.stream.Collectors;

import jakarta.json.JsonObject;
import jakarta.ws.rs.client.Entity;
import jakarta.ws.rs.core.Form;
import jakarta.ws.rs.core.HttpHeaders;
import jakarta.ws.rs.core.Response;

import org.junit.Test;

import com.medplum.fhir.r4.FhirMediaType;
import com.medplum.fhir.r4.types.Patient;
import com.medplum.server.BaseTest;
import com.medplum.server.Utils;

public class TokenEndpointTest extends BaseTest {

    @Test
    public void testMissingGrantType() {
        final String code = "code";

        final Response response = target("/oauth2/token")
                .request()
                .header(HttpHeaders.AUTHORIZATION, Utils.buildAuthHeader(testClientApp.id(), testClientApp.secret()))
                .post(Entity.form(new Form()
                        .param("code", code)));
        assertEquals(400, response.getStatus());
    }

    @Test
    public void testBlankGrantType() {
        final String code = "code";

        final Response response = target("/oauth2/token")
                .request()
                .header(HttpHeaders.AUTHORIZATION, Utils.buildAuthHeader(testClientApp.id(), testClientApp.secret()))
                .post(Entity.form(new Form()
                        .param("grant_type", "")
                        .param("code", code)));
        assertEquals(400, response.getStatus());
    }

    @Test
    public void testInvalidGrantType() {
        final String code = "code";

        final Response response = target("/oauth2/token")
                .request()
                .header(HttpHeaders.AUTHORIZATION, Utils.buildAuthHeader(testClientApp.id(), testClientApp.secret()))
                .post(Entity.form(new Form()
                        .param("grant_type", "foo")
                        .param("code", code)));
        assertEquals(400, response.getStatus());
    }

    @Test
    public void testMissingCode() {
        final Response response = target("/oauth2/token")
                .request()
                .header(HttpHeaders.AUTHORIZATION, Utils.buildAuthHeader(testClientApp.id(), testClientApp.secret()))
                .post(Entity.form(new Form()
                        .param("grant_type", "authorization_code")));
        assertEquals(400, response.getStatus());
    }

    @Test
    public void testBlankCode() {
        final Response response = target("/oauth2/token")
                .request()
                .header(HttpHeaders.AUTHORIZATION, Utils.buildAuthHeader(testClientApp.id(), testClientApp.secret()))
                .post(Entity.form(new Form()
                        .param("grant_type", "authorization_code")
                        .param("code", "")));
        assertEquals(400, response.getStatus());
    }

    @Test
    public void testInvalidCode() {
        final Response response = target("/oauth2/token")
                .request()
                .header(HttpHeaders.AUTHORIZATION, Utils.buildAuthHeader(testClientApp.id(), testClientApp.secret()))
                .post(Entity.form(new Form()
                        .param("grant_type", "authorization_code")
                        .param("code", "foo")));
        assertEquals(400, response.getStatus());
    }

    @Test
    public void testAuthorizationCodeSuccess() {
        final String state = generateId();

        // 1) Authorize
        final Response r1 = target("/oauth2/authorize")
                .queryParam("response_type", "code")
                .queryParam("client_id", testClientApp.id())
                .queryParam("redirect_uri", "https://www.example.com/redirect")
                .queryParam("state", state)
                .queryParam("scope", "openid offline_access")
                .request()
                .get();
        assertEquals(302, r1.getStatus());

        // 2) Login
        final URI loginLocation = r1.getLocation();
        assertNotNull(loginLocation);
        assertTrue(loginLocation.toString().contains("/oauth2/login"));

        final Response r2 = client().target(loginLocation)
                .request()
                .post(Entity.form(new Form()
                        .param("email", "admin@example.com")
                        .param("password", "admin")));
        assertEquals(302, r2.getStatus());

        // 3) Choose role
        final URI rolesLocation = r2.getLocation();
        assertNotNull(rolesLocation);
        assertTrue(rolesLocation.toString().contains("/oauth2/role"));

        final Response r3 = client().target(rolesLocation)
                .request()
                .post(Entity.form(new Form()
                        .param("role", testPatient.createReference().reference())));
        assertEquals(302, r3.getStatus());

        // 4) Choose scopes
        final URI scopesLocation = r3.getLocation();
        assertNotNull(scopesLocation);
        assertTrue(scopesLocation.toString().contains("/oauth2/scope"));

        final Response r4 = client().target(scopesLocation)
                .request()
                .post(Entity.form(new Form()
                        .param("openid", "on")
                        .param("offline_access", "on")));
        assertEquals(302, r4.getStatus());

        // 5) Redirect
        final URI tokenLocation = r4.getLocation();
        assertNotNull(tokenLocation);

        final Map<String, String> params = Arrays.stream(tokenLocation.getQuery().split("&"))
                .map(s -> s.split("=", 2))
                .collect(Collectors.toMap(a -> a[0], a -> a[1]));

        final String code = params.get("code");
        assertNotNull(code);
        assertEquals(state, params.get("state"));

        final Response r5 = target("/oauth2/token")
                .request()
                .header(HttpHeaders.AUTHORIZATION, Utils.buildAuthHeader(testClientApp.id(), testClientApp.secret()))
                .post(Entity.form(new Form()
                        .param("grant_type", "authorization_code")
                        .param("code", code)));
        assertEquals(200, r5.getStatus());

        final JsonObject result = r5.readEntity(JsonObject.class);
        assertNotNull(result);
        assertEquals("Bearer", result.getString("token_type"));
        assertEquals("openid offline_access", result.getString("scope"));
        assertTrue(result.containsKey("access_token"));
        assertTrue(result.containsKey("refresh_token"));
        assertTrue(result.containsKey("id_token"));

        // 6) Verify with normal read operaiton
        final Response r6 = target("/fhir/R4/Patient/" + testPatient.id())
                .request()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + result.getString("access_token"))
                .get();
        assertEquals(200, r6.getStatus());

        final JsonObject sanityCheck = r6.readEntity(JsonObject.class);
        assertNotNull(sanityCheck);
    }

    @Test
    public void testInvalidRefreshToken() {
        // Make sure there's at least one refresh token in the db
        final String state = generateId();

        final Response r1 = target("/oauth2/authorize")
                .queryParam("response_type", "code")
                .queryParam("client_id", testClientApp.id())
                .queryParam("redirect_uri", "https://www.example.com/redirect")
                .queryParam("state", state)
                .queryParam("scope", "openid")
                .request()
                .get();
        assertEquals(302, r1.getStatus());

        // Now try to use an invalid refresh token
        final Response r2 = target("/oauth2/token")
                .request()
                .header(HttpHeaders.AUTHORIZATION, Utils.buildAuthHeader(testClientApp.id(), testClientApp.secret()))
                .post(Entity.form(new Form()
                        .param("grant_type", "refresh_token")
                        .param("refresh_token", "INVALID_REFRESH_TOKEN")));
        assertEquals(400, r2.getStatus());
    }

    @Test
    public void testClientCredentialsFlow() {
        // Try to auth as a client application using the client credentials flow
        final Response r1 = target("/oauth2/token")
                .request()
                .post(Entity.form(new Form()
                        .param("grant_type", "client_credentials")
                        .param("client_id", testClientApp.id())
                        .param("client_secret", testClientApp.secret())));
        assertEquals(200, r1.getStatus());

        final JsonObject tokenResult = r1.readEntity(JsonObject.class);
        assertNotNull(tokenResult);
        assertTrue(tokenResult.containsKey("access_token"));

        // Try to create a patient using the credentials
        final Response r2 = target("/fhir/R4/Patient")
                .request()
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + tokenResult.getString("access_token"))
                .post(Entity.entity(Patient.create().build(), FhirMediaType.APPLICATION_FHIR_JSON));
        assertEquals(201, r2.getStatus());
    }
}
