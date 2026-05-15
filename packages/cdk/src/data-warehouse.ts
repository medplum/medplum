// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumInfraConfig } from '@medplum/core';
import {
  aws_iam as iam,
  aws_lakeformation as lakeformation,
  aws_s3tables as s3tables,
  aws_ssm as ssm,
  CfnOutput,
  CfnResource,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class DataWarehouse extends Construct {
  readonly tableBucket: s3tables.CfnTableBucket;
  readonly namespace: s3tables.CfnNamespace;
  readonly tableBucketArnParameter: ssm.StringParameter;
  readonly namespaceParameter: ssm.StringParameter;
  readonly tableBucketArnOutput: CfnOutput;
  readonly lakeFormationRole: iam.Role;
  readonly lakeFormationResource: lakeformation.CfnResource;
  readonly glueS3TablesCatalog: CfnResource;

  constructor(parent: Construct, config: MedplumInfraConfig) {
    super(parent, 'DataWarehouse');

    const dataWarehouseConfig = config.dataWarehouse;
    if (!dataWarehouseConfig) {
      throw new Error('Data warehouse config is required');
    }

    const namespaceName = dataWarehouseConfig.namespace ?? 'default';
    const glueCatalogName =
      (dataWarehouseConfig as { catalogName?: string }).catalogName ?? `medplum-${config.name}-s3tablescatalog`;

    this.tableBucket = new s3tables.CfnTableBucket(this, 'TableBucket', {
      tableBucketName: dataWarehouseConfig.tableBucketName,
    });

    this.namespace = new s3tables.CfnNamespace(this, 'Namespace', {
      tableBucketArn: this.tableBucket.attrTableBucketArn,
      namespace: namespaceName,
    });

    this.namespace.addDependency(this.tableBucket);

    // Register the table bucket with Lake Formation so analytics engines can
    // access S3 Tables through the Glue/Lake Formation integration path.
    this.lakeFormationRole = new iam.Role(this, 'LakeFormationS3TablesRole', {
      assumedBy: new iam.ServicePrincipal('lakeformation.amazonaws.com'),
      description: 'Role used by Lake Formation to access S3 Tables data warehouse resources',
    });
    this.lakeFormationRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['s3tables:ListTableBuckets'],
        resources: ['*'],
      })
    );
    this.lakeFormationRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          's3tables:CreateTableBucket',
          's3tables:GetTableBucket',
          's3tables:CreateNamespace',
          's3tables:GetNamespace',
          's3tables:ListNamespaces',
          's3tables:DeleteNamespace',
          's3tables:DeleteTableBucket',
          's3tables:CreateTable',
          's3tables:DeleteTable',
          's3tables:GetTable',
          's3tables:ListTables',
          's3tables:RenameTable',
          's3tables:UpdateTableMetadataLocation',
          's3tables:GetTableMetadataLocation',
          's3tables:GetTableData',
          's3tables:PutTableData',
        ],
        resources: [this.tableBucket.attrTableBucketArn],
      })
    );

    this.lakeFormationResource = new lakeformation.CfnResource(this, 'LakeFormationS3TablesResource', {
      resourceArn: this.tableBucket.attrTableBucketArn,
      roleArn: this.lakeFormationRole.roleArn,
      useServiceLinkedRole: false,
      withFederation: true,
    });
    this.lakeFormationResource.addDependency(this.tableBucket);

    this.glueS3TablesCatalog = new CfnResource(this, 'GlueS3TablesCatalog', {
      type: 'AWS::Glue::Catalog',
      properties: {
        Name: glueCatalogName,
        CatalogInput: {
          FederatedCatalog: {
            Identifier: this.tableBucket.attrTableBucketArn,
            ConnectionName: 'aws:s3tables',
          },
          CreateDatabaseDefaultPermissions: [],
          CreateTableDefaultPermissions: [],
          AllowFullTableExternalDataAccess: true,
        },
      },
    });
    this.glueS3TablesCatalog.addDependency(this.lakeFormationResource);

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
