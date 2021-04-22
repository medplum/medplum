package com.medplum.cdk;

import software.amazon.awscdk.core.Construct;
import software.amazon.awscdk.core.Stack;
import software.amazon.awscdk.core.StackProps;

public class MedplumCdkStack extends Stack {
    public MedplumCdkStack(final Construct scope, final String id) {
        this(scope, id, null);
    }

    public MedplumCdkStack(final Construct scope, final String id, final StackProps props) {
        super(scope, id, props);

        // The code that defines your stack goes here
    }
}
