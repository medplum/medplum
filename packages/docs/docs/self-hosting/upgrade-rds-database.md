---
sidebar_position: 100
---

# Upgrade RDS Database

As your project grows, you may need to upgrade your RDS database instance size. This document describes how to perform this operation with zero downtime.

:::caution

This is a complex, multi-step process, and requires high proficiency with AWS, Node.js, and command line tools.

Medplum strives to make this as easy as possible, but despite our best efforts, it is still challenging.

If you have any questions, please [contact us](mailto:hello@medplum.com) or [join our Discord](https://discord.gg/medplum).

:::

:::tip

If you are new to AWS CDK, we strongly recommend reading [Getting started with the AWS CDK](https://docs.aws.amazon.com/cdk/v2/guide/getting_started.html).

:::

## Prerequisites

This document assumes that you have already created an RDS database instance. If not, see the [Install on AWS](/docs/self-hosting/install-on-aws) documentation.

## Step 1: Confirm multiple database instances

To perform a zero downtime upgrade, your cluster will need more than one database instance.

Check the `rdsInstances` value in your Medplum CDK config file. If the value is missing or `1`, then you first need to increase the value to `2` or more.

Then run CDK `diff` and `deploy` to apply the change.

See [Upgrade AWS Infrastructure](/docs/self-hosting/install-on-aws#upgrade-aws-infrastructure) for more details.

## Step 2: Upgrade the reader instances

The next step is to upgrade the reader instances.

:::warning

In previous versions of CDK (and therefore previous versions of Medplum), the reader and writer instances were automatically upgraded in sequence.

That is no longer the case. Reader and writer instances must be upgraded separately and in the correct order.

See [Migrating from instanceProps](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_rds-readme.html#migrating-from-instanceprops) for more details.

:::

The Medplum CDK config file supports an optional `rdsReaderInstanceType` config setting. If this value is set, then the reader instances will be upgraded to this instance type.

First, add or update your `rdsReaderInstanceType` config setting to the target instance type.

Then run CDK `diff` and `deploy` to apply the change.

## Step 3: Upgrade the writer instances

The next step is to upgrade the writer instance. In the Medplum CDK config file, it will appear as if we are updating the writer instance. In practice, CDK and CloudFormation will automatically swap the writer instance with one of the reader instances, and then upgrade the old writer instance.

Update your `rdsInstanceType` config setting to the target instance type.

Then run CDK `diff` and `deploy` to apply the change.

## Step 4: Cleanup

You can now remove the `rdsReaderInstanceType` config setting.

Then run CDK `diff` to confirm that the reader instances are now the same size as the writer instance.
