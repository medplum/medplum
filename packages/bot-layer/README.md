# Medplum Bot Layer

Medplum bots can run in [AWS Lambdas](https://aws.amazon.com/lambda/). When running in lambdas, bots can use [AWS Lambda Layers](https://docs.aws.amazon.com/lambda/latest/dg/configuration-layers.html) for pre-built dependencies and configuration.

This package defines the packages in the default AWS Lambda Layer.

Current packages:

- [`@medplum/core`](https://www.npmjs.com/package/@medplum/core)
- [`form-data`](https://www.npmjs.com/package/form-data)
- [`node-fetch`](https://www.npmjs.com/package/node-fetch)
- [`pdfmake`](https://www.npmjs.com/package/pdfmake)
- [`ssh2`](https://www.npmjs.com/package/ssh2)
- [`ssh2-sftp-client`](https://www.npmjs.com/package/ssh2-sftp-client)

## Usage

To use the Medplum Bot Layer in your own Bot packages, add `@medplum/bot-layer` as a dependency:

```bash
npm i @medplum/bot-layer
```

## Deployment

For more details on how to build and use, refer to `/scripts/deploy-bot-layer.sh`.

## References

- [Deploy Node.js Lambda functions with .zip file archives](https://docs.aws.amazon.com/lambda/latest/dg/nodejs-package.html)
- [Creating and sharing Lambda layers](https://docs.aws.amazon.com/lambda/latest/dg/configuration-layers.html)
- [Using layers with your Lambda function](https://docs.aws.amazon.com/lambda/latest/dg/invocation-layers.html)
- [AWS CLI publish-layer-version](https://awscli.amazonaws.com/v2/documentation/api/latest/reference/lambda/publish-layer-version.html)
- [Lambda layers node_modules](https://stackoverflow.com/questions/53788753/lambda-layers-node-modules)
