// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { aws_cloudfront as cloudfront, aws_s3 as s3 } from 'aws-cdk-lib';
import { Annotations, aws_iam as iam } from 'aws-cdk-lib';

/**
 * Grants S3 bucket read access to the CloudFront Origin Access Identity (OAI).
 *
 * Under normal circumstances, where CDK creates both the S3 bucket and the OAI,
 * you can achieve this same behavior by simply calling:
 *
 *     bucket.grantRead(identity);
 *
 * However, if importing an S3 bucket via `s3.Bucket.fromBucketAttributes()`, that does not work.
 *
 * See: https://stackoverflow.com/a/60917015
 *
 * @param bucket - The S3 bucket.
 * @param identity - The CloudFront Origin Access Identity.
 * @returns The policy statement.
 */
export function grantBucketAccessToOriginAccessIdentity(
  bucket: s3.IBucket,
  identity: cloudfront.OriginAccessIdentity
): iam.PolicyStatement {
  const policyStatement = new iam.PolicyStatement();
  policyStatement.addActions('s3:GetObject*');
  policyStatement.addActions('s3:GetBucket*');
  policyStatement.addActions('s3:List*');
  policyStatement.addResources(bucket.bucketArn);
  policyStatement.addResources(`${bucket.bucketArn}/*`);
  policyStatement.addCanonicalUserPrincipal(identity.cloudFrontOriginAccessIdentityS3CanonicalUserId);
  bucket.addToResourcePolicy(policyStatement);
  return policyStatement;
}

/**
 * Acknowledges the CDK warning that an imported bucket's policy cannot be updated.
 *
 * When the primary region is not us-east-1, the bucket is imported into the us-east-1 stack,
 * and the bucket policy is applied with `medplum aws update-bucket-policies` instead.
 *
 * @param distribution - The CloudFront distribution with the S3 origin.
 */
export function acknowledgeImportedBucketPolicyWarning(distribution: cloudfront.IDistribution): void {
  Annotations.of(distribution).acknowledgeWarning(
    '@aws-cdk/aws-cloudfront-origins:updateImportedBucketPolicyOai',
    'Bucket policy is applied by medplum aws update-bucket-policies'
  );
}
