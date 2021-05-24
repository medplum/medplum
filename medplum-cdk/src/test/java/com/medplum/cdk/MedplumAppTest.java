package com.medplum.cdk;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

import software.amazon.awscdk.core.App;
import software.amazon.awscdk.core.Environment;
import software.amazon.awscdk.core.StackProps;

public class MedplumAppTest {

    @Test
    public void testStack() {
        final var app = new App();
        final var stack = new MedplumStack(app, "test", StackProps.builder()
                .env(Environment.builder()
                        .region("us-east-1")
                        .account("647991932601")
                        .build())
                .build());

        final var template = app.synth().getStackArtifact(stack.getArtifactId()).getTemplate();
        assertNotNull(template);
    }
}
