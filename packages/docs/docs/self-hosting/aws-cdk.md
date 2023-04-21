---
sidebar_position: 9
tags: [self-host]
---

# Install and Upgrade Cluster

Medplum offers our CDK as a standalone [npm package](https://www.npmjs.com/package/@medplum/cdk), allowing infrastructure teams or build tools to use it independent of the source code. This guide will walk through creating your configuration file so that the CDK can set up your environment automatically.

## CDK Config File Basics

A CDK Config file, is a file that represents all of the [config settings](/docs/self-hosting/config-settings) required for that environment. Give it a name that represents all of the configurations for that environment. For example `mymedplum.staging.config.json` might have entries like the following.

```json
{
  "apiPort": 5000,
  "name": "staging",
  "region": "us-east-1",
  "accountNumber": "647991932601",
  "stackName": "MedplumStagingStack",
  "domainName": "staging.mymedplum.com",
  "apiDomainName": "api.staging.mymedplum.com",
  "appDomainName": "app.staging.mymedplum.com",
  "storageDomainName": "storage.staging.mymedplum.com",
  "storageBucketName": "mymedplum-staging-storage",
  "maxAzs": 2,
  "rdsInstances": 1,
  "rdsInstanceType": "t4g.medium",
  "desiredServerCount": 1,
  "serverMemory": 512,
  "serverCpu": 256,
  "serverImage": "hostname/medplum-server:staging",
  ...
}
```

This is just an example, you'll need to fill out all of the config settings required for that environment. You'll want one `json` file per environment. A common configuration is to have a staging and production environment.

Settings include a public key, the corresponding private key will need to be added to the server configuration settings, you can find [instructions here](https://github.com/medplum/medplum/tree/main/packages/cdk#storage).

## Sample Code

The following [repository](https://github.com/medplum/medplum-cdk-config-template) shows sample install scripts and runs through the instructions for installing on AWS.

## Resources

- List of [configuration settings](/docs/self-hosting/config-settings)
- Sample [CDK configuration repository](https://github.com/medplum/medplum-cdk-config-template)
