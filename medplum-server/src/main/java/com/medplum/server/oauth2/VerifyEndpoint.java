package com.medplum.server.oauth2;

import java.net.URI;
import java.util.HashMap;
import java.util.Map;

import jakarta.annotation.security.PermitAll;
import jakarta.inject.Inject;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.FormParam;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.NotFoundException;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.Response.Status;

import org.glassfish.jersey.server.mvc.Viewable;
import org.mindrot.jbcrypt.BCrypt;

import com.medplum.fhir.types.OperationOutcome;
import com.medplum.fhir.types.PasswordChangeRequest;
import com.medplum.fhir.types.User;
import com.medplum.server.fhir.r4.repo.Repository;
import com.medplum.server.security.SecurityUser;

/**
 * The VerifyEndpoint class handles email verification for registration and password reset requests.
 *
 * This URL is distributed to users by email.
 */
@Path("/oauth2/verify/{id}")
@Produces(MediaType.TEXT_HTML)
@PermitAll
public class VerifyEndpoint {

    @Inject
    private Repository repo;

    @GET
    public Viewable verify(@PathParam("id") final String resetId) {
        final OperationOutcome readOutcome = repo.read(SecurityUser.SYSTEM_USER, PasswordChangeRequest.RESOURCE_TYPE, resetId);
        if (!readOutcome.isOk()) {
            throw new NotFoundException();
        }

        return buildPage(null);
    }

    @POST
    @Consumes(MediaType.APPLICATION_FORM_URLENCODED)
    public Response handleSubmit(
            @PathParam("id") final String resetId,
            @FormParam("newPassword") final String newPassword,
            @FormParam("confirmNewPassword") final String confirmNewPassword) {

        final OperationOutcome readOutcome = repo.read(SecurityUser.SYSTEM_USER, PasswordChangeRequest.RESOURCE_TYPE, resetId);
        if (!readOutcome.isOk()) {
            throw new NotFoundException();
        }

        if (newPassword == null || newPassword.isBlank()) {
            return buildPageResponse(Status.BAD_REQUEST, "Missing new password");
        }

        if (confirmNewPassword == null || confirmNewPassword.isBlank()) {
            return buildPageResponse(Status.BAD_REQUEST, "Missing confirm password");
        }

        if (!newPassword.equals(confirmNewPassword)) {
            return buildPageResponse(Status.BAD_REQUEST, "Passwords do not match");
        }

        if (newPassword.length() < 8) {
            return buildPageResponse(Status.BAD_REQUEST, "Password must be at least 8 characters");
        }

        // 1) Read the original password change request
        final PasswordChangeRequest pcr = readOutcome.resource(PasswordChangeRequest.class);

        // 2) Read the user
        final User user = repo.readReference(SecurityUser.SYSTEM_USER, pcr.user()).resource(User.class);

        // 3) Set the user's password
        repo.update(
                SecurityUser.SYSTEM_USER,
                user.id(),
                User.create(user)
                        .passwordHash(BCrypt.hashpw(newPassword, BCrypt.gensalt()))
                        .build());

        // 4) Invalidate the password change request

        // 5) Redirect
        return Response.status(Status.FOUND)
                .location(URI.create(pcr.redirectUri()))
                .build();
    }

    private Viewable buildPage(final String message) {
        final Map<String, String> model = new HashMap<>();
        model.put("message", message);
        return new Viewable("/verify.mustache", model);
    }

    private Response buildPageResponse(final Status status, final String message) {
        return Response.status(status)
                .type(MediaType.TEXT_HTML_TYPE)
                .entity(buildPage(message))
                .build();
    }
}
