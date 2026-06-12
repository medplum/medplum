// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { aws_s3 as s3 } from 'aws-cdk-lib';
import { ArnFormat, Aws, Stack, aws_guardduty as guardduty, aws_iam as iam } from 'aws-cdk-lib';
import type { Construct } from 'constructs';

const malwareScanStatusTagKey = 'GuardDutyMalwareScanStatus';
const noThreatsFoundStatus = 'NO_THREATS_FOUND';
const servicePrincipal = 'malware-protection-plan.guardduty.amazonaws.com';
const sessionName = 'GuardDutyMalwareProtection';

export interface GuardDutyMalwareProtectionProps {
  bucket: s3.IBucket;
  consumerPrincipals?: iam.IPrincipal[];
}

export interface GuardDutyMalwareProtection {
  scanRole: iam.Role;
  plan: guardduty.CfnMalwareProtectionPlan;
}

export function buildGuardDutyMalwareProtection(
  construct: Construct,
  id: string,
  props: GuardDutyMalwareProtectionProps
): GuardDutyMalwareProtection {
  const scanRole = new iam.Role(construct, `${id}Role`, {
    assumedBy: new iam.ServicePrincipal(servicePrincipal),
  });

  addGuardDutyScanRolePolicy(scanRole, props.bucket);

  const plan = new guardduty.CfnMalwareProtectionPlan(construct, `${id}Plan`, {
    actions: {
      tagging: {
        status: 'ENABLED',
      },
    },
    protectedResource: {
      s3Bucket: {
        bucketName: props.bucket.bucketName,
      },
    },
    role: scanRole.roleArn,
  });
  plan.node.addDependency(scanRole);
  const defaultPolicy = scanRole.node.tryFindChild('DefaultPolicy');
  if (defaultPolicy) {
    plan.node.addDependency(defaultPolicy);
  }

  if (props.consumerPrincipals && props.consumerPrincipals.length > 0) {
    addGuardDutyMalwareProtectionReadGate(props.bucket, props.consumerPrincipals);
  }
  addGuardDutyTagGate(props.bucket, scanRole);

  return { scanRole, plan };
}

function addGuardDutyScanRolePolicy(role: iam.Role, bucket: s3.IBucket): void {
  const eventRuleArn = `arn:${Aws.PARTITION}:events:${Aws.REGION}:${Aws.ACCOUNT_ID}:rule/DO-NOT-DELETE-AmazonGuardDutyMalwareProtectionS3*`;

  role.addToPolicy(
    new iam.PolicyStatement({
      sid: 'AllowManagedRuleToSendS3EventsToGuardDuty',
      effect: iam.Effect.ALLOW,
      actions: ['events:PutRule', 'events:DeleteRule', 'events:PutTargets', 'events:RemoveTargets'],
      resources: [eventRuleArn],
      conditions: {
        StringLike: {
          'events:ManagedBy': servicePrincipal,
        },
      },
    })
  );

  role.addToPolicy(
    new iam.PolicyStatement({
      sid: 'AllowGuardDutyToMonitorEventBridgeManagedRule',
      effect: iam.Effect.ALLOW,
      actions: ['events:DescribeRule', 'events:ListTargetsByRule'],
      resources: [eventRuleArn],
    })
  );

  role.addToPolicy(
    new iam.PolicyStatement({
      sid: 'AllowPostScanTag',
      effect: iam.Effect.ALLOW,
      actions: [
        's3:PutObjectTagging',
        's3:GetObjectTagging',
        's3:PutObjectVersionTagging',
        's3:GetObjectVersionTagging',
      ],
      resources: [bucket.arnForObjects('*')],
    })
  );

  role.addToPolicy(
    new iam.PolicyStatement({
      sid: 'AllowEnableS3EventBridgeEvents',
      effect: iam.Effect.ALLOW,
      actions: ['s3:PutBucketNotification', 's3:GetBucketNotification'],
      resources: [bucket.bucketArn],
    })
  );

  role.addToPolicy(
    new iam.PolicyStatement({
      sid: 'AllowPutValidationObject',
      effect: iam.Effect.ALLOW,
      actions: ['s3:PutObject'],
      resources: [bucket.arnForObjects('malware-protection-resource-validation-object')],
    })
  );

  role.addToPolicy(
    new iam.PolicyStatement({
      sid: 'AllowCheckBucketOwnership',
      effect: iam.Effect.ALLOW,
      actions: ['s3:ListBucket'],
      resources: [bucket.bucketArn],
    })
  );

  role.addToPolicy(
    new iam.PolicyStatement({
      sid: 'AllowMalwareScan',
      effect: iam.Effect.ALLOW,
      actions: ['s3:GetObject', 's3:GetObjectVersion'],
      resources: [bucket.arnForObjects('*')],
    })
  );

  if (bucket.encryptionKey) {
    role.addToPolicy(
      new iam.PolicyStatement({
        sid: 'AllowDecryptForMalwareScan',
        effect: iam.Effect.ALLOW,
        actions: ['kms:GenerateDataKey', 'kms:Decrypt'],
        resources: [bucket.encryptionKey.keyArn],
        conditions: {
          StringLike: {
            'kms:ViaService': `s3.${Aws.REGION}.amazonaws.com`,
          },
        },
      })
    );
  }
}

export function addGuardDutyMalwareProtectionReadGate(bucket: s3.IBucket, consumerPrincipals: iam.IPrincipal[]): void {
  bucket.addToResourcePolicy(
    new iam.PolicyStatement({
      effect: iam.Effect.DENY,
      principals: consumerPrincipals,
      actions: ['s3:GetObject', 's3:GetObjectVersion'],
      resources: [bucket.arnForObjects('*')],
      conditions: {
        StringNotEquals: {
          [`s3:ExistingObjectTag/${malwareScanStatusTagKey}`]: noThreatsFoundStatus,
        },
      },
    })
  );
}

function addGuardDutyTagGate(bucket: s3.IBucket, scanRole: iam.Role): void {
  bucket.addToResourcePolicy(
    new iam.PolicyStatement({
      sid: 'OnlyGuardDutyCanTagScanStatus',
      effect: iam.Effect.DENY,
      notPrincipals: [
        new iam.ArnPrincipal(scanRole.roleArn),
        new iam.ArnPrincipal(getGuardDutyAssumedRoleArn(scanRole)),
      ],
      actions: ['s3:PutObjectTagging', 's3:PutObjectVersionTagging'],
      resources: [bucket.arnForObjects('*')],
      conditions: {
        'ForAnyValue:StringEquals': {
          's3:RequestObjectTagKeys': malwareScanStatusTagKey,
        },
      },
    })
  );
}

function getGuardDutyAssumedRoleArn(role: iam.Role): string {
  return Stack.of(role).formatArn({
    service: 'sts',
    region: '',
    account: Aws.ACCOUNT_ID,
    resource: 'assumed-role',
    resourceName: `${role.roleName}/${sessionName}`,
    arnFormat: ArnFormat.SLASH_RESOURCE_NAME,
  });
}
