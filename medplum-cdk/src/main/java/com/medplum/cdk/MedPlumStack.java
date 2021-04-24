package com.medplum.cdk;

import software.amazon.awscdk.core.Construct;
import software.amazon.awscdk.core.Stack;
import software.amazon.awscdk.core.StackProps;

public class MedPlumStack extends Stack {
    public MedPlumStack(final Construct scope, final String id) {
        this(scope, id, null);
    }

    public MedPlumStack(final Construct scope, final String id, final StackProps props) {
        super(scope, id, props);

        new MedPlumBackEnd(this, "BackEnd");
    }
}
