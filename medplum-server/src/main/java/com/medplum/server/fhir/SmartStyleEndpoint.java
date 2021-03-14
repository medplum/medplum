package com.medplum.server.fhir;

import jakarta.annotation.security.PermitAll;
import jakarta.json.Json;
import jakarta.json.JsonObject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.Configuration;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;

/**
 * The SmartStyleEndpoint handles requests for SMART App Styling config.
 *
 * See:
 *  1) https://www.hl7.org/fhir/smart-app-launch/scopes-and-launch-context/index.html#styling
 *  2) https://www.hl7.org/fhir/smart-app-launch/scopes-and-launch-context/index.html#launch-context-arrives-with-your-access_token
 */
@Path("/fhir/R4/.well-known/smart-style")
@Produces(MediaType.APPLICATION_JSON)
@PermitAll
public class SmartStyleEndpoint {

    @Context
    private Configuration config;

    @GET
    public JsonObject getSmartConfiguration() {
        return Json.createObjectBuilder()
                .add("color_background", "#ffffff")
                .add("color_error", "#ff0000")
                .add("color_highlight", "#ffff00")
                .add("color_modal_backdrop", "#808080")
                .add("color_success", "#00aa00")
                .add("color_text", "#000000")
                .add("dim_border_radius", "4px")
                .add("dim_font_size", "13px")
                .add("dim_spacing_size", "20px")
                .add("font_family_body", "sans-serif")
                .add("font_family_heading", "sans-serif")
                .build();
    }
}
