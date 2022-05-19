import * as acm from '@aws-cdk/aws-certificatemanager';
import * as cloudfront from '@aws-cdk/aws-cloudfront';
import * as origins from '@aws-cdk/aws-cloudfront-origins';
import * as route53 from '@aws-cdk/aws-route53';
import * as targets from '@aws-cdk/aws-route53-targets/lib';
import * as s3 from '@aws-cdk/aws-s3';
import * as cdk from '@aws-cdk/core';
import { ServerlessClamscan } from 'cdk-serverless-clamscan';
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

    // ClamAV serverless scan
    const sc = new ServerlessClamscan(this, 'ServerlessClamscan', {});
    sc.addSourceBucket(storageBucket);

    // Public key in PEM format
    const publicKey = new cloudfront.PublicKey(this, 'StoragePublicKey', {
      encodedKey: config.storagePublicKey,
    });

    // Authorized key group for presigned URLs
    const keyGroup = new cloudfront.KeyGroup(this, 'StorageKeyGroup', {
      items: [publicKey],
    });

    // HTTP response headers policy
    const responseHeadersPolicy = new cloudfront.ResponseHeadersPolicy(this, 'ResponseHeadersPolicy', {
      securityHeadersBehavior: {
        contentSecurityPolicy: {
          contentSecurityPolicy:
            "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors *.medplum.com;",
          override: true,
        },
        contentTypeOptions: { override: true },
        frameOptions: { frameOption: cloudfront.HeadersFrameOption.DENY, override: true },
        referrerPolicy: { referrerPolicy: cloudfront.HeadersReferrerPolicy.NO_REFERRER, override: true },
        strictTransportSecurity: {
          accessControlMaxAge: cdk.Duration.seconds(63072000),
          includeSubdomains: true,
          override: true,
        },
        xssProtection: {
          protection: true,
          modeBlock: true,
          override: true,
        },
      },
    });

    // CloudFront distribution
    const distribution = new cloudfront.Distribution(this, 'StorageDistribution', {
      defaultBehavior: {
        origin: new origins.S3Origin(storageBucket),
        responseHeadersPolicy,
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
