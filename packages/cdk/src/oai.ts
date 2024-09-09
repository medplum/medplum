import { aws_cloudfront as cloudfront, aws_iam as iam, aws_s3 as s3 } from 'aws-cdk-lib';

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
