import * as acm from '@aws-cdk/aws-certificatemanager';
import * as cloudfront from '@aws-cdk/aws-cloudfront';
import * as origins from '@aws-cdk/aws-cloudfront-origins';
import * as route53 from '@aws-cdk/aws-route53';
import * as targets from '@aws-cdk/aws-route53-targets/lib';
import * as s3 from '@aws-cdk/aws-s3';
import * as cdk from '@aws-cdk/core';
import { MedplumInfraConfig } from './config';

/**
 * Binary storage bucket and CloudFront distribution.
 */
export class Storage extends cdk.Construct {
  constructor(parent: cdk.Construct, config: MedplumInfraConfig) {
    super(parent, 'Storage');

    const zone = route53.HostedZone.fromLookup(this, 'Zone', {
      domainName: config.domainName,
    });

    // S3 bucket
    const storageBucket = new s3.Bucket(this, 'StorageBucket', {
      bucketName: config.storageBucketName,
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
    });

    // Access Identity for CloudFront to access S3
    const accessIdentity = new cloudfront.OriginAccessIdentity(this, 'StorageAccessIdentity', {});
    storageBucket.grantRead(accessIdentity);

    // Public key in PEM format
    const publicKey = new cloudfront.PublicKey(this, 'StoragePublicKey', {
      encodedKey: config.storagePublicKey,
    });

    // Authorized key group for presigned URLs
    const keyGroup = new cloudfront.KeyGroup(this, 'StorageKeyGroup', {
      items: [publicKey],
    });

    // CloudFront distribution
    const distribution = new cloudfront.Distribution(this, 'StorageDistribution', {
      defaultBehavior: {
        origin: new origins.S3Origin(storageBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        trustedKeyGroups: [keyGroup],
      },
      certificate: acm.Certificate.fromCertificateArn(this, 'StorageCertificate', config.storageSslCertArn),
      domainNames: [config.storageDomainName],
    });

    // Route53 alias record for the CloudFront distribution
    const record = new route53.ARecord(this, 'StorageAliasRecord', {
      recordName: config.storageDomainName,
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
      zone,
    });

    // Debug
    console.log('ARecord', record.domainName);
  }
}
