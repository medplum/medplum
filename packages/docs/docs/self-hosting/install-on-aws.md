---
sidebar_position: 3
---

# Install on AWS

This guide will perform a complete production-ready installation in your AWS environment using [AWS CDK](https://aws.amazon.com/cdk/).

:::caution

This is a complex multi step process, and requires high proficiency with AWS, Node.js, and command line tools.

Medplum strives to make this as easy as possible, but despite our best efforts, it is still challenging.

If you have any questions, please [contact us](mailto:hello@medplum.com) or [join our Discord](https://discord.gg/medplum).

:::

:::tip

If you are new to AWS CDK, we strongly recommend reading [Getting started with the AWS CDK](https://docs.aws.amazon.com/cdk/v2/guide/getting_started.html).

:::

At a high level, the process of installing Medplum on AWS includes:

1. Prerequisites
   1. Setting up IAM permissions
   2. Setting up an SES account
   3. Configuring your domain
2. Creating a config repo
   1. Setting up CDK
   2. Setting up Medplum CDK
   3. Running the Medplum init tool
3. Deploying the CDK stack
   1. Bootstrapping
   2. Synth
   3. Deploy
4. Deploying the Medplum app
   1. Building the Medplum app with your config
   2. Deploying the Medplum app to AWS

The resulting AWS configuration will look like the following:

![Medplum AWS Architecture](./medplum-aws-architecture.png)

<p>
Use this video guide as you follow the instructions:
<iframe width="560" height="315" src="https://www.youtube.com/embed/_YCYbgb63Y0?si=AiOK7QkAor-FJBxt" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>
</p>

## Prerequisites

### AWS CLI Setup

It is recommended to setup the AWS Command Line Interface (AWS CLI) by following [these instructions](https://aws.amazon.com/cli/).

### AWS Credentials Setup

AWS CLI and credentials are required by `medplum aws init` automate certain tasks, such as creating public key pairs.

If you have not already done so, follow [these instructions](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html) to set up your AWS credentials file.

### AWS Account Number

The Medplum `aws init` command will ask for your AWS Account Number.

If the AWS CLI and credentials are configured, then the tool will automatically identify your AWS Account Number.

If not, you can [find your AWS Account Number](https://docs.aws.amazon.com/marketplace/latest/buyerguide/GettingSupport.html):

1. Sign in to the [AWS Management Console](https://console.aws.amazon.com/console/home) with your user name.
2. In the top navigation bar, choose Support and then choose Support Center.
3. Your AWS account ID (account number) appears below the top navigation bar.

### AWS Permissions

You will need permission to access the following AWS services:

| Service                              | Details                                                                               |
| ------------------------------------ | ------------------------------------------------------------------------------------- |
| Elastic Compute Cloud (EC2)          | Create a Virtual Private Cloud (VPC) and related security groups                      |
| Elasticache                          | Create a hosted Redis cluster for caching and task queue                              |
| Elastic Load Balancing (ELB)         | Create a load balancer for server redundancy and high availability                    |
| Identity and Access Management (IAM) | Create service roles for the API server and bot lambdas                               |
| CloudFront                           | Securely deliver content with low latency and high transfer speeds                    |
| CloudWatch Logs                      | Create and manage log groups for server logs                                          |
| Relational Database Service (RDS)    | Create a hosted Postgres Aurora database                                              |
| Route 53                             | Create DNS entries for the services                                                   |
| Simple Storage Service (S3)          | Host static web content, store and retrieve dynamic user content for file attachments |
| Secrets Manager                      | Store encrypted secret configuration details such as database credentials             |
| Systems Manager (SSM)                | Store configuration details                                                           |
| Web Application Firewall (WAF)       | Protect your web applications or APIs against common web exploits and bots            |

### Configure your name servers

Medplum strongly recommends configuring your domain to use [Amazon's Route 53](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/MigratingDNS.html) as your custom DNS name server. This will make it much easier to set up SSL certificates for the [Medplum App](https://www.medplum.com/docs/app) and [Medplum Binary Storage](/docs/fhir-datastore/binary-data).

If you choose not to go this route, you will be responsible for setting up your own SSL certificates.

### Setup SES

It is **strongly** recommended to setup an SES email address with production access, meaning that it can send email to any email recipient. Email is used to verify identities, send login instructions, and handle password reset requests.

Follow the [Creating and verifying identities in Amazon SES](https://docs.aws.amazon.com/ses/latest/dg/creating-identities.html) guide to register an email address for system generated emails.

### Choose an environment name

Throughout this document, instructions will refer to an "environment name". This environment name is used in multiple places, for example an environment named `demo` will result in:

1. As part of config file names (i.e., `medplum.demo.config.json`)
2. As the base of CloudFormation stack names (i.e., `MedplumDemo`)
3. AWS Parameter Store keys (i.e., `/medplum/demo/...`)

If you plan to deploy multiple Medplum clusters, you may want to consider a naming strategy.

For example:

| Env Name | Config file name              | CloudFormation stack name | Parameter Store prefix |
| -------- | ----------------------------- | ------------------------- | ---------------------- |
| prod     | `medplum.prod.config.json`    | `MedplumProd`             | `/medplum/prod/...`    |
| staging  | `medplum.staging.config.json` | `MedplumStaging`          | `/medplum/staging/...` |
| test     | `medplum.test.config.json`    | `MedplumTest`             | `/medplum/test/...`    |
| alice    | `medplum.alice.config.json`   | `MedplumAlice`            | `/medplum/alice/...`   |
| bob      | `medplum.bob.config.json`     | `MedplumBob`              | `/medplum/bob/...`     |

Medplum configuration files and environment names are quite flexible, but it is always recommended to be consistent and stay organized.

## Setup a config repo

### Create your config repo

Medplum recommends creating a separate git repository and npm project to manage your CDK infra-as-code. This repository will only contain JSON configuration files.

```bash
mkdir my-medplum-cdk-config
cd my-medplum-cdk-config
npm init -y
```

Medplum recommends pushing this git repository to your source control provider such as GitHub or GitLab.

### Add CDK dependencies

If you have not already done so, add the common AWS CDK dependencies. This includes all of the base CDK capabilities and constructs.

```bash
npm i aws-cdk-lib cdk constructs
```

### Add Medplum dependencies

Add the Medplum CDK and CLI dependencies. This includes the Medplum CDK construct.

```bash
npm i @medplum/cdk @medplum/cli
```

### Add cdk.json

Create a new file called `cdk.json` with the following contents:

```json
{
  "app": "node node_modules/@medplum/cdk/dist/cjs/index.cjs"
}
```

### Run the init tool

Most AWS resources are automatically created using CDK, but some either cannot or are not recommended. Use the `medplum aws init` command to setup those resources and build the Medplum CDK config file.

```bash
npx medplum aws init
```

Then follow the prompts.

Upon completion, the tool will:

1. Generate a Medplum CDK config file (i.e., medplum.demo.config.json)
2. Optionally generate an AWS CloudFront signing key
3. Optionally request SSL certificates from AWS Certificate Manager
4. Optionally write server config settings to AWS Parameter Store

Make note of the CDK config file name.

See [Config Settings](/docs/self-hosting/config-settings) for more details on each of the individual configuration settings.

### (Optional) Validate Certificates

If you are using Route 53 as your DNS service, we recommend you select `dns` method for validating domain ownership.

Then, follow [these instructions](https://docs.aws.amazon.com/acm/latest/userguide/dns-validation.html#setting-up-dns-validation) from AWS to finish the validation process.

### CDK Bootstrap

Bootstrapping is the process of provisioning resources for the AWS CDK before you can deploy AWS CDK apps into an AWS environment.

Run CDK bootstrap:

```bash
npx cdk bootstrap -c config=medplum.demo.config.json
```

Learn more about bootstrapping: [https://docs.aws.amazon.com/cdk/latest/guide/bootstrapping.html](https://docs.aws.amazon.com/cdk/latest/guide/bootstrapping.html)

### CDK Synth

The `synth` step catches logical errors in defining your AWS resources.

Run CDK synth:

```bash
npx cdk synth -c config=medplum.demo.config.json
```

### CDK Diff

Use the `diff` command to see how it will change your AWS resources.

Run CDK diff:

```bash
npx cdk diff -c config=medplum.demo.config.json
```

### CDK Deploy

When you are ready to actually execute the CDK configuration, use the `deploy` command.

Run CDK deploy:

```bash
npx cdk deploy --all -c config=medplum.demo.config.json
```

Note that you may receive warnings about changing security details. This is normal and expected anytime CDK makes changes to VPC, IAM, and other security features.

### Update Bucket Policies

When deploying to any region other than `us-east-1`, there is one additional step. AWS CloudFront needs access to S3 buckets. At present, this is not possible entirely within CDK.

:::info

This is due to cross-region circular dependencies:

1. An S3 bucket in your primary region
2. A CloudFront distribution in `us-east-1`, because CloudFront distributions must always be in `us-east-1`
3. Updated S3 bucket policy that references the CloudFront distribution

See this [Github issue](https://github.com/medplum/medplum/issues/2901) for more details.

:::

The Medplum CLI includes a command to update the bucket policy automatically:

```bash
npx medplum aws update-bucket-policies [env name]
```

For example:

```bash
npx medplum aws update-bucket-policies demo
```

You can use the `--dryrun` option to preview the changes:

```bash
npx medplum aws update-bucket-policies [env name] --dryrun
```

### Deploy the app

:::tip

Historically this step required building from source. You can now deploy the app from prebuilt images.

:::

Use the Medplum CLI to deploy the app:

```bash
npx medplum aws deploy-app [env name]
```

For example:

```bash
npx medplum aws deploy-app demo
```

## Advanced

### Bot Lambda Layer

**Optional:** If you intend to use Medplum Bots, you will need an [AWS Lambda Layer](https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-concepts.html#gettingstarted-concepts-layer).

At present, the bot layer must be built from source. See [Clone the repo](/docs/contributing/local-dev-setup#clone-the-repo).

After you successfully clone the Medplum repo, you can use the `deploy-bot-layer.sh` script to build and deploy the Lambda Layer:

```bash
git clone https://github.com/medplum/medplum.git medplum
cd medplum
./scripts/deploy-bot-layer.sh
```

See the [Medplum Bot Layer](/docs/bots/bot-lambda-layer) guide to learn more.

## Ongoing

### Upgrade AWS infrastructure

Use CDK to upgrade the infrastructure.

First run `cdk diff` to check for changes:

```bash
npx cdk diff -c config=medplum.[env name].config.json
```

Then run `cdk deploy` to apply changes:

```bash
npx cdk deploy -c config=medplum.[env name].config.json
```

### Upgrade the app

Use the Medplum CLI to upgrade the app. This will upgrade your app to the latest version.

```bash
npx medplum aws update-app [env name]
```

For example:

```bash
npx medplum aws update-app demo
```

### Upgrade the server

Use the Medplum CLI to upgrade the server. This will upgrade your server to the latest version.

```bash
npx medplum aws update-server [env name]
```

For example:

```bash
npx medplum aws update-server demo
```

### Update the Server Config

Use the Medplum CLI to update the [server configuration settings](/docs/self-hosting/config-settings#server-config).

First, create a new configuration file called `medplum.[env name].server.json` to store the server config settings.

Then run the `update-config` command.

```bash
npx medplum aws update-config medplum.[env name].server.json
```

For example:

```bash
npx medplum aws update-config medplum.demo.server.json
```

Check out our documentation [server configuration settings](/docs/self-hosting/config-settings#server-config) to see a full reference of of settings.

## Troubleshooting

### Cannot assume role

You may receive a warning such as:

```bash
current credentials could not be used to assume 'arn:aws:iam::[ACCOUNT_ID]:role/cdk-hnb659fds-file-publishing-role-[ACCOUNT_ID]-us-west-2',
but are for the right account. Proceeding anyway.
```

First, make sure that the specified role exists in your AWS account. If it does not exist, make sure that you ran the `cdk bootstrap` command.

Next, make sure that your AWS account has permission to assume the role via `sts:AssumeRole`. You may need to add an IAM policy to add permission.

```json
{
  "Sid": "assumerole",
  "Effect": "Allow",
  "Action": ["sts:AssumeRole", "iam:PassRole"],
  "Resource": ["arn:aws:iam::*:role/cdk-*"]
}
```

:::tip

"IAM Full Access" is not enough! The IAM Full Access policy does not include `sts:AssumeRole`.

:::

### Try verbose mode

All CDK operations support verbose logging by adding the `--verbose` flag. Verbose logging can often reveal hints about confusing behavior.

```bash
npx cdk synth --verbose -c config=medplum.demo.config.json
```

## Related Resources

- [Video Overview](https://youtu.be/rEMCeziEfdA)
