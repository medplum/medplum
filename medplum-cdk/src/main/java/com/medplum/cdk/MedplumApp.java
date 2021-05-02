package com.medplum.cdk;

import software.amazon.awscdk.core.App;
import software.amazon.awscdk.core.Environment;
import software.amazon.awscdk.core.StackProps;

public class MedplumApp {
    public static void main(final String[] args) {
        final App app = new App();

        new MedplumStack(app, "MedplumStack", StackProps.builder()
                .env(Environment.builder()
                        .region("us-east-1")
                        .account("647991932601")
                        .build())
                .build());

        app.synth();
    }
}
