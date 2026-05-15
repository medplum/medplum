// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumInfraConfig } from '@medplum/core';
import { aws_s3tables as s3tables, aws_ssm as ssm, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class DataWarehouse extends Construct {
  readonly tableBucket: s3tables.CfnTableBucket;
  readonly namespace: s3tables.CfnNamespace;
  readonly tableBucketArnParameter: ssm.StringParameter;
  readonly namespaceParameter: ssm.StringParameter;
  readonly tableBucketArnOutput: CfnOutput;

  constructor(parent: Construct, config: MedplumInfraConfig) {
    super(parent, 'DataWarehouse');

    const dataWarehouseConfig = config.dataWarehouse;
    if (!dataWarehouseConfig) {
      throw new Error('Data warehouse config is required');
    }

    const namespaceName = dataWarehouseConfig.namespace ?? 'default';

    this.tableBucket = new s3tables.CfnTableBucket(this, 'TableBucket', {
      tableBucketName: dataWarehouseConfig.tableBucketName,
    });

    this.namespace = new s3tables.CfnNamespace(this, 'Namespace', {
      tableBucketArn: this.tableBucket.attrTableBucketArn,
      namespace: namespaceName,
    });

    this.namespace.addDependency(this.tableBucket);

    this.tableBucketArnParameter = new ssm.StringParameter(this, 'TableBucketArnParameter', {
      tier: ssm.ParameterTier.STANDARD,
      parameterName: `/medplum/${config.name}/dataWarehouseAwsS3TableArn`,
      description: 'Data warehouse S3 Tables table bucket ARN',
      stringValue: this.tableBucket.attrTableBucketArn,
    });

    this.namespaceParameter = new ssm.StringParameter(this, 'NamespaceParameter', {
      tier: ssm.ParameterTier.STANDARD,
      parameterName: `/medplum/${config.name}/dataWarehouseNamespace`,
      description: 'Data warehouse S3 Tables namespace',
      stringValue: namespaceName,
    });

    this.tableBucketArnOutput = new CfnOutput(this, 'DataWarehouseTableBucketArn', {
      value: this.tableBucket.attrTableBucketArn,
      description: 'Data warehouse S3 Tables table bucket ARN',
    });
  }
}
