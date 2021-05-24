package com.medplum.server;

import java.util.HashMap;

import jakarta.ws.rs.ProcessingException;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.HttpHeaders;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.Response.Status;
import jakarta.ws.rs.ext.ExceptionMapper;
import jakarta.ws.rs.ext.Provider;

import org.glassfish.jersey.server.mvc.Viewable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Provider
public class AppExceptionMapper implements ExceptionMapper<Exception> {
    private static final Logger LOG = LoggerFactory.getLogger(AppExceptionMapper.class);

    @Context
    private HttpHeaders headers;

    @Override
    public Response toResponse(final Exception ex) {
        if (ex instanceof WebApplicationException) {
            LOG.debug("Web app exception: {}", ex.getMessage(), ex);
        } else {
            LOG.error("Unhandled exception: {}", ex.getMessage(), ex);
        }

        final var acceptedTypes = headers.getAcceptableMediaTypes();
        if (acceptedTypes.contains(MediaType.TEXT_HTML_TYPE)) {
           return toHtmlResponse(ex);
        } else {
            return toSimpleResponse(ex);
        }
    }

    private Response toHtmlResponse(final Exception ex) {
        final int status;
        final String message;

        if (ex instanceof WebApplicationException) {
            status = ((WebApplicationException) ex).getResponse().getStatus();
            message = ex.getMessage();
        } else if (ex instanceof ProcessingException) {
            status = 400;
            message = ex.getMessage();
        } else {
            status = 500;
            message = "Error";
        }

        final var model = new HashMap<String, String>();
        model.put("message", message);

        return Response
                .status(status)
                .type(MediaType.TEXT_HTML)
                .entity(new Viewable("/error.mustache", model))
                .build();
    }

    private Response toSimpleResponse(final Exception ex) {
        if (ex instanceof WebApplicationException) {
            return ((WebApplicationException) ex).getResponse();
        } else if (ex instanceof ProcessingException) {
            return Response.status(Status.BAD_REQUEST).entity(ex.getMessage()).build();
        }
        return Response.status(Status.INTERNAL_SERVER_ERROR).build();
    }
}
