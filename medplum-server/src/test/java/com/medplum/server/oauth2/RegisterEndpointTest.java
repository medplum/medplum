package com.medplum.server.oauth2;

import static org.junit.jupiter.api.Assertions.*;

import jakarta.ws.rs.client.Entity;
import jakarta.ws.rs.core.Form;

import org.junit.Test;

import com.medplum.server.BaseTest;

public class RegisterEndpointTest extends BaseTest {

    @Test
    public void testGetRegisterPage() {
        final var r = target("/oauth2/register").request().get();
        assertEquals(200, r.getStatus());
        assertEquals("text/html;charset=UTF-8", r.getMediaType().toString());
    }

    @Test
    public void testNullRedirectUri() {
        final var r = client().target("/oauth2/register")
                .request()
                .post(Entity.form(new Form()
                        .param("email", "admin@example.com")));

        assertEquals(400, r.getStatus());
        assertEquals("text/html;charset=UTF-8", r.getMediaType().toString());
    }

    @Test
    public void testBlankRedirectUri() {
        final var r = client().target("/oauth2/register?redirect_uri=")
                .request()
                .post(Entity.form(new Form()
                        .param("email", "admin@example.com")));

        assertEquals(400, r.getStatus());
        assertEquals("text/html;charset=UTF-8", r.getMediaType().toString());
    }

    @Test
    public void testNullEmail() {
        final var r = client().target("/oauth2/register?redirect_uri=x")
                .request()
                .post(Entity.form(new Form()));

        assertEquals(400, r.getStatus());
        assertEquals("text/html;charset=UTF-8", r.getMediaType().toString());
    }

    @Test
    public void testBlankEmail() {
        final var r = client().target("/oauth2/register?redirect_uri=x")
                .request()
                .post(Entity.form(new Form()
                        .param("email", "")));

        assertEquals(400, r.getStatus());
        assertEquals("text/html;charset=UTF-8", r.getMediaType().toString());
    }

    @Test
    public void testAlreadyRegistered() {
        final var r = client().target("/oauth2/register?redirect_uri=x")
                .request()
                .post(Entity.form(new Form()
                        .param("email", "admin@example.com")));

        assertEquals(400, r.getStatus());
        assertEquals("text/html;charset=UTF-8", r.getMediaType().toString());
    }

    @Test
    public void testRegisterSuccess() {
        final var r = client().target("/oauth2/register?redirect_uri=x")
                .request()
                .post(Entity.form(new Form()
                        .param("email", "new-user-1@example.com")));

        assertEquals(200, r.getStatus());
        assertEquals("text/html;charset=UTF-8", r.getMediaType().toString());
    }
}
