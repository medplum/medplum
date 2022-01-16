import * as acm from '@aws-cdk/aws-certificatemanager';
import * as cloudfront from '@aws-cdk/aws-cloudfront';
import * as origins from '@aws-cdk/aws-cloudfront-origins';
import * as route53 from '@aws-cdk/aws-route53';
import * as targets from '@aws-cdk/aws-route53-targets/lib';
import * as s3 from '@aws-cdk/aws-s3';
import * as cdk from '@aws-cdk/core';
import { MedplumInfraConfig } from './config';

/**
 * Static app infrastructure, which deploys app content to an S3 bucket.
 *
 * The app redirects from HTTP to HTTPS, using a CloudFront distribution,
 * Route53 alias record, and ACM certificate.
 */
export class FrontEnd extends cdk.Construct {
  constructor(parent: cdk.Construct, config: MedplumInfraConfig) {
    super(parent, 'FrontEnd');

    const zone = route53.HostedZone.fromLookup(this, 'Zone', {
      domainName: config.domainName,
    });

    // S3 bucket
    const appBucket = new s3.Bucket(this, 'AppBucket', {
      bucketName: config.appDomainName,
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      encryption: s3.BucketEncryption.S3_MANAGED,
    });

    // HTTP response headers policy
    const responseHeadersPolicy = new cloudfront.ResponseHeadersPolicy(this, 'ResponseHeadersPolicy', {
      securityHeadersBehavior: {
        contentSecurityPolicy: {
          contentSecurityPolicy: [
            `default-src 'none'`,
            `base-uri 'self'`,
            `child-src 'self'`,
            `connect-src 'self' ${config.apiDomainName} *.google.com`,
            `font-src 'self' fonts.gstatic.com`,
            `form-action 'self' *.gstatic.com *.google.com`,
            `frame-ancestors 'none'`,
            `frame-src 'self' *.gstatic.com *.google.com`,
            `img-src 'self' ${config.storageDomainName} *.gstatic.com *.google.com`,
            `manifest-src 'self'`,
            `media-src 'self' ${config.storageDomainName}`,
            `script-src 'self' *.gstatic.com *.google.com`,
            `style-src 'self' 'unsafe-inline' *.gstatic.com *.google.com`,
            `worker-src 'self' *.gstatic.com *.google.com`,
          ].join('; '),
          override: true,
        },
        contentTypeOptions: { override: true },
        frameOptions: { frameOption: cloudfront.HeadersFrameOption.DENY, override: true },
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
    const distribution = new cloudfront.Distribution(this, 'AppDistribution', {
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: new origins.S3Origin(appBucket),
        responseHeadersPolicy,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      certificate: acm.Certificate.fromCertificateArn(this, 'AppCertificate', config.appSslCertArn),
      domainNames: [config.appDomainName],
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
        },
      ],
    });

    // Route53 alias record for the CloudFront distribution
    const record = new route53.ARecord(this, 'AppAliasRecord', {
      recordName: config.appDomainName,
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
      zone,
    });

    // Debug
    console.log('ARecord', record.domainName);
  }
}
