# Medplum Bot Layer

Medplum bots can run in [AWS Lambdas]().  When running in lambdas, bots can use [AWS Lambda Layers](https://docs.aws.amazon.com/lambda/latest/dg/configuration-layers.html) for pre-built dependencies and configuration.

This package defines the default AWS Lambda Layer.

For more details on how to build and use, refer to `/scripts/deploy-bot-layer.sh`.

## References

- [Deploy Node.js Lambda functions with .zip file archives](https://docs.aws.amazon.com/lambda/latest/dg/nodejs-package.html)
- [Creating and sharing Lambda layers](https://docs.aws.amazon.com/lambda/latest/dg/configuration-layers.html)
- [Using layers with your Lambda function](https://docs.aws.amazon.com/lambda/latest/dg/invocation-layers.html)
- [AWS CLI publish-layer-version](https://awscli.amazonaws.com/v2/documentation/api/latest/reference/lambda/publish-layer-version.html)
- [Lambda layers node_modules](https://stackoverflow.com/questions/53788753/lambda-layers-node-modules)
