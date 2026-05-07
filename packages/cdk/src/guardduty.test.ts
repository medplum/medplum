// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { App, Stack, aws_iam as iam, aws_kms as kms, aws_s3 as s3 } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { buildGuardDutyMalwareProtection } from './guardduty';

describe('GuardDuty malware protection', () => {
  test('creates malware protection plan with prefixes and tagging enabled', () => {
    const stack = new Stack(new App(), 'TestStack');
    const bucket = new s3.Bucket(stack, 'Bucket', {
      encryption: s3.BucketEncryption.S3_MANAGED,
    });

    buildGuardDutyMalwareProtection(stack, 'Uploads', {
      bucket,
      consumerPrincipals: [new iam.AccountRootPrincipal()],
      scanPrefixes: ['uploads/', 'bulk-import/'],
    });

    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::GuardDuty::MalwareProtectionPlan', {
      Actions: {
        Tagging: {
          Status: 'ENABLED',
        },
      },
      ProtectedResource: {
        S3Bucket: {
          BucketName: Match.anyValue(),
          ObjectPrefixes: ['uploads/', 'bulk-import/'],
        },
      },
      Role: Match.anyValue(),
    });
  });

  test('creates guardduty trust policy and TBAC bucket policy', () => {
    const stack = new Stack(new App(), 'TestStack');
    const bucket = new s3.Bucket(stack, 'Bucket', {
      encryption: s3.BucketEncryption.S3_MANAGED,
    });

    buildGuardDutyMalwareProtection(stack, 'Uploads', {
      bucket,
      consumerPrincipals: [new iam.AccountRootPrincipal()],
    });

    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'sts:AssumeRole',
            Effect: 'Allow',
            Principal: {
              Service: 'malware-protection-plan.guardduty.amazonaws.com',
            },
          }),
        ]),
      },
    });

    template.hasResourceProperties('AWS::S3::BucketPolicy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: ['s3:GetObject', 's3:GetObjectVersion'],
            Condition: {
              StringNotEquals: {
                's3:ExistingObjectTag/GuardDutyMalwareScanStatus': 'NO_THREATS_FOUND',
              },
            },
            Effect: 'Deny',
          }),
          Match.objectLike({
            Action: ['s3:PutObjectTagging', 's3:PutObjectVersionTagging'],
            Condition: {
              'ForAnyValue:StringEquals': {
                's3:RequestObjectTagKeys': 'GuardDutyMalwareScanStatus',
              },
            },
            Effect: 'Deny',
            NotPrincipal: Match.anyValue(),
          }),
        ]),
      },
    });
  });

  test('adds kms permissions when encryption key is set', () => {
    const stack = new Stack(new App(), 'TestStack');
    const key = new kms.Key(stack, 'Key');
    const bucket = new s3.Bucket(stack, 'Bucket', {
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: key,
    });

    buildGuardDutyMalwareProtection(stack, 'Uploads', {
      bucket,
      consumerPrincipals: [new iam.AccountRootPrincipal()],
    });

    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: ['kms:GenerateDataKey', 'kms:Decrypt'],
            Condition: {
              StringLike: {
                'kms:ViaService': {
                  'Fn::Join': ['', ['s3.', { Ref: 'AWS::Region' }, '.amazonaws.com']],
                },
              },
            },
            Effect: 'Allow',
            Resource: Match.anyValue(),
            Sid: 'AllowDecryptForMalwareScan',
          }),
        ]),
      },
    });
  });

  test('rejects more than five prefixes', () => {
    const stack = new Stack(new App(), 'TestStack');
    const bucket = new s3.Bucket(stack, 'Bucket');

    expect(() =>
      buildGuardDutyMalwareProtection(stack, 'Uploads', {
        bucket,
        consumerPrincipals: [new iam.AccountRootPrincipal()],
        scanPrefixes: ['1/', '2/', '3/', '4/', '5/', '6/'],
      })
    ).toThrow('scanPrefixes supports at most 5 prefixes');
  });
});
