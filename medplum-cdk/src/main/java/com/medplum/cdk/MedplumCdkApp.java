package com.medplum.cdk;

import software.amazon.awscdk.core.App;

public class MedplumCdkApp {
    public static void main(final String[] args) {
        final App app = new App();

        new MedplumCdkStack(app, "MedplumCdkStack");

        app.synth();
    }
}
