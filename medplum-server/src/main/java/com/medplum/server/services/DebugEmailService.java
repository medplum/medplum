package com.medplum.server.services;

import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.medplum.fhir.r4.StandardOutcomes;
import com.medplum.fhir.r4.types.OperationOutcome;

public class DebugEmailService implements EmailService {
    private static final Logger LOG = LoggerFactory.getLogger(DebugEmailService.class);

    @Override
    public OperationOutcome sendEmail(final List<String> to, final List<String> cc, final String subject, final String body) {
        LOG.debug("Send email:");
        LOG.debug("  To: {}", to);
        LOG.debug("  Cc: {}", cc);
        LOG.debug("  Subject: {}", subject);
        LOG.debug("  Body: {}", body);
        return StandardOutcomes.ok();
    }
}
