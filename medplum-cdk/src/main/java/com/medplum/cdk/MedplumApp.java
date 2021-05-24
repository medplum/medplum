package com.medplum.cdk;

import software.amazon.awscdk.core.App;
import software.amazon.awscdk.core.Environment;
import software.amazon.awscdk.core.StackProps;
import software.amazon.awscdk.cxapi.CloudAssembly;

public class MedplumApp {

    public static void main(final String[] args) {
        synth("MedplumStack");
    }

    public static CloudAssembly synth(final String id) {
        final var app = new App();

        new MedplumStack(app, id, StackProps.builder()
                .env(Environment.builder()
                        .region("us-east-1")
                        .account("647991932601")
                        .build())
                .build());

        return app.synth();
    }
}
