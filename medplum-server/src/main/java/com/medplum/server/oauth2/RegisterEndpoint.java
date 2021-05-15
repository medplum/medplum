package com.medplum.server.oauth2;

import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

import jakarta.annotation.security.PermitAll;
import jakarta.inject.Inject;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.FormParam;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.Response.Status;

import org.glassfish.jersey.server.mvc.Viewable;

import com.medplum.fhir.types.Bundle;
import com.medplum.fhir.types.OperationOutcome;
import com.medplum.fhir.types.PasswordChangeRequest;
import com.medplum.fhir.types.Patient;
import com.medplum.fhir.types.User;
import com.medplum.server.fhir.r4.repo.Repository;
import com.medplum.server.security.OAuthService;
import com.medplum.server.security.SecurityUser;
import com.medplum.server.services.EmailService;

/**
 * The RegisterEndpoint class handles the form for new users to register an account.
 */
@Path("/oauth2/register")
@Produces(MediaType.TEXT_HTML)
@PermitAll
public class RegisterEndpoint {

    @Inject
    private Repository repo;

    @Inject
    private EmailService emailService;

    @Inject
    private OAuthService oauth;

    @QueryParam("redirect_uri")
    private String redirectUri;

    @GET
    public Viewable getRegisterPage() {
        return buildPage(null);
    }

    @POST
    @Consumes(MediaType.APPLICATION_FORM_URLENCODED)
    public Response handleSubmit(@FormParam("email") final String email) {
        final OperationOutcome existingOutcome = oauth.getUserByEmail(email);
        if (existingOutcome.isOk()) {
            final Bundle existingBundle = existingOutcome.resource(Bundle.class);
            if (!existingBundle.entry().isEmpty()) {
                return buildPageResponse(Status.BAD_REQUEST, "The email address \"" + email + "\" is already registered.");
            }
        }

        // 1) Create an empty patient
        final OperationOutcome patientOutcome = repo.create(
                SecurityUser.SYSTEM_USER,
                Patient.create().build());

        if (!patientOutcome.isOk()) {
            return buildPageResponse(Status.BAD_REQUEST, patientOutcome.issue().get(0).details().text());
        }

        final Patient patient = patientOutcome.resource(Patient.class);

        // 2) Create the user
        final OperationOutcome userOutcome = repo.create(
                SecurityUser.SYSTEM_USER,
                User.create()
                        .email(email)
                        .patient(patient.createReference())
                        .passwordHash("") // empty password = user cannot sign in
                        .build());

        if (!userOutcome.isOk()) {
            return buildPageResponse(Status.BAD_REQUEST, userOutcome.issue().get(0).details().text());
        }

        final User user = userOutcome.resource(User.class);

        // 3) Create a password change request
        final OperationOutcome pcrOutcome = repo.create(
                SecurityUser.SYSTEM_USER,
                PasswordChangeRequest.create()
                        .user(user.createReference())
                        .redirectUri(redirectUri)
                        .build());

        if (!pcrOutcome.isOk()) {
            return buildPageResponse(Status.BAD_REQUEST, pcrOutcome.issue().get(0).details().text());
        }

        final PasswordChangeRequest pcr = pcrOutcome.resource(PasswordChangeRequest.class);

        // 4) Email the user with next step instructions
        final StringBuilder body = new StringBuilder();
        body.append("Welcome to Medplum!\n");
        body.append("\n");
        body.append("Click this link to confirm your email address:\n");
        body.append("\n");
        body.append("http://localhost:5000/oauth2/verify/" + pcr.id() + "\n");
        body.append("\n");
        body.append("Thank you.  Please contact support@medplum.com if you have any questions.\n");
        body.append("\n");

        emailService.sendEmail(Collections.singletonList(email), Collections.emptyList(), "Confirm email", body.toString());

        return Response.ok()
                .type(MediaType.TEXT_HTML)
                .entity(buildPage("We sent an email to \"" + email + "\" with instructions."))
                .build();
    }

    private Viewable buildPage(final String message) {
        final Map<String, String> model = new HashMap<>();
        model.put("message", message);
        return new Viewable("/register.mustache", model);
    }

    private Response buildPageResponse(final Status status, final String message) {
        return Response.status(status)
                .type(MediaType.TEXT_HTML_TYPE)
                .entity(buildPage(message))
                .build();
    }
}
