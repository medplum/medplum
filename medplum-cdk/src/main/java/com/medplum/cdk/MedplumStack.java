package com.medplum.cdk;

import software.amazon.awscdk.core.Construct;
import software.amazon.awscdk.core.Stack;
import software.amazon.awscdk.core.StackProps;

public class MedplumStack extends Stack {
    public MedplumStack(final Construct scope, final String id) {
        this(scope, id, null);
    }

    public MedplumStack(final Construct scope, final String id, final StackProps props) {
        super(scope, id, props);

        new MedplumBackEnd(this, "BackEnd");
    }
}
