import { MedplumInfraConfig } from '@medplum/core';
import {
  aws_certificatemanager as acm,
  aws_cloudfront as cloudfront,
  Duration,
  aws_iam as iam,
  aws_cloudfront_origins as origins,
  aws_route53 as route53,
  aws_s3 as s3,
  aws_route53_targets as targets,
  aws_wafv2 as wafv2,
} from 'aws-cdk-lib';
import { ServerlessClamscan } from 'cdk-serverless-clamscan';
import { Construct } from 'constructs';
import { grantBucketAccessToOriginAccessIdentity } from './oai';
import { buildWafConfig } from './waf';

/**
 * Binary storage bucket and CloudFront distribution.
 */
export class Storage extends Construct {
  storageBucket: s3.IBucket;
  keyGroup?: cloudfront.IKeyGroup;
  responseHeadersPolicy?: cloudfront.IResponseHeadersPolicy;
  waf?: wafv2.CfnWebACL;
  originAccessIdentity?: cloudfront.OriginAccessIdentity;
  originAccessPolicyStatement?: iam.PolicyStatement;
  distribution?: cloudfront.IDistribution;
  dnsRecord?: route53.IRecordSet;

  constructor(parent: Construct, config: MedplumInfraConfig, region: string) {
    super(parent, 'Storage');

    if (region === config.region) {
      // S3 bucket
      this.storageBucket = new s3.Bucket(this, 'StorageBucket', {
        bucketName: config.storageBucketName,
        publicReadAccess: false,
        blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
        encryption: s3.BucketEncryption.S3_MANAGED,
        enforceSSL: true,
        versioned: true,
      });

      if (config.clamscanEnabled) {
        // ClamAV serverless scan
        const sc = new ServerlessClamscan(this, 'ServerlessClamscan', {
          defsBucketAccessLogsConfig: {
            logsBucket: s3.Bucket.fromBucketName(this, 'LoggingBucket', config.clamscanLoggingBucket),
            logsPrefix: config.clamscanLoggingPrefix,
          },
        });
        sc.addSourceBucket(this.storageBucket);
      }
    } else {
      // Otherwise, reference the bucket by name and region
      this.storageBucket = s3.Bucket.fromBucketAttributes(this, 'StorageBucket', {
        bucketName: config.storageBucketName,
        region: config.region,
      });
    }

    if (region === 'us-east-1') {
      // Public key in PEM format
      let publicKey: cloudfront.IPublicKey;
      if (config.signingKeyId) {
        publicKey = cloudfront.PublicKey.fromPublicKeyId(this, 'StoragePublicKey', config.signingKeyId);
      } else {
        publicKey = new cloudfront.PublicKey(this, 'StoragePublicKey', {
          encodedKey: config.storagePublicKey,
        });
      }

      // Authorized key group for presigned URLs
      this.keyGroup = new cloudfront.KeyGroup(this, 'StorageKeyGroup', {
        items: [publicKey],
      });

      // HTTP response headers policy
      this.responseHeadersPolicy = new cloudfront.ResponseHeadersPolicy(this, 'ResponseHeadersPolicy', {
        customHeadersBehavior: {
          customHeaders: [
            {
              header: 'Permission-Policy',
              value:
                'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), interest-cohort=()',
              override: true,
            },
          ],
        },
        securityHeadersBehavior: {
          contentSecurityPolicy: {
            contentSecurityPolicy: "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors *;",
            override: true,
          },
          contentTypeOptions: { override: true },
          frameOptions: {
            frameOption: cloudfront.HeadersFrameOption.DENY,
            override: true,
          },
          referrerPolicy: {
            referrerPolicy: cloudfront.HeadersReferrerPolicy.NO_REFERRER,
            override: true,
          },
          strictTransportSecurity: {
            accessControlMaxAge: Duration.seconds(63072000),
            includeSubdomains: true,
            preload: true,
            override: true,
          },
          xssProtection: {
            protection: true,
            modeBlock: true,
            override: true,
          },
        },
      });

      // WAF
      this.waf = new wafv2.CfnWebACL(
        this,
        'StorageWAF',
        buildWafConfig(`${config.stackName}-StorageWAF`, 'CLOUDFRONT', config.storageWafIpSetArn)
      );

      // Origin access identity
      this.originAccessIdentity = new cloudfront.OriginAccessIdentity(this, 'OriginAccessIdentity', {});
      this.originAccessPolicyStatement = grantBucketAccessToOriginAccessIdentity(
        this.storageBucket,
        this.originAccessIdentity
      );

      // CloudFront distribution
      this.distribution = new cloudfront.Distribution(this, 'StorageDistribution', {
        defaultBehavior: {
          origin: new origins.S3Origin(this.storageBucket, {
            originAccessIdentity: this.originAccessIdentity,
          }),
          responseHeadersPolicy: this.responseHeadersPolicy,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          trustedKeyGroups: [this.keyGroup],
        },
        certificate: acm.Certificate.fromCertificateArn(this, 'StorageCertificate', config.storageSslCertArn),
        domainNames: [config.storageDomainName],
        webAclId: this.waf.attrArn,
        logBucket: config.storageLoggingBucket
          ? s3.Bucket.fromBucketName(this, 'LoggingBucket', config.storageLoggingBucket)
          : undefined,
        logFilePrefix: config.storageLoggingPrefix,
      });

      // DNS
      if (!config.skipDns) {
        const hostedZoneName = config.hostedZoneName ?? config.domainName.split('.').slice(-2).join('.');
        const zone = route53.HostedZone.fromLookup(this, 'Zone', { domainName: hostedZoneName });

        // Route53 alias record for the CloudFront distribution
        this.dnsRecord = new route53.ARecord(this, 'StorageAliasRecord', {
          recordName: config.storageDomainName,
          target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(this.distribution)),
          zone,
        });
      }
    }
  }
}
