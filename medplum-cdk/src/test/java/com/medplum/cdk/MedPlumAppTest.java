package com.medplum.cdk;

import static org.junit.jupiter.api.Assertions.*;

import java.io.IOException;

import org.junit.jupiter.api.Test;

import software.amazon.awscdk.core.App;
import software.amazon.awscdk.core.Environment;
import software.amazon.awscdk.core.StackProps;

public class MedPlumAppTest {

    @Test
    public void testStack() throws IOException {
        final var app = new App();
        final var stack = new MedPlumStack(app, "test", StackProps.builder()
                .env(Environment.builder()
                        .region("us-east-1")
                        .account("647991932601")
                        .build())
                .build());

        final var template = app.synth().getStackArtifact(stack.getArtifactId()).getTemplate();
        assertNotNull(template);
    }
}
