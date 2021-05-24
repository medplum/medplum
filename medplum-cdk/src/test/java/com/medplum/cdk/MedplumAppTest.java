package com.medplum.cdk;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

class MedplumAppTest {

    @Test
    void testStack() {
        final var template = MedplumApp.synth("test").getStackArtifact("test").getTemplate();
        assertNotNull(template);
    }
}
