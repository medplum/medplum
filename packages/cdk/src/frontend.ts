import { MedplumInfraConfig } from '@medplum/core';
import {
  aws_certificatemanager as acm,
  aws_cloudfront as cloudfront,
  Duration,
  aws_iam as iam,
  aws_cloudfront_origins as origins,
  RemovalPolicy,
  aws_route53 as route53,
  aws_s3 as s3,
  aws_route53_targets as targets,
  aws_wafv2 as wafv2,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { grantBucketAccessToOriginAccessIdentity } from './oai';
import { buildWafConfig } from './waf';

/**
 * Static app infrastructure, which deploys app content to an S3 bucket.
 *
 * The app redirects from HTTP to HTTPS, using a CloudFront distribution,
 * Route53 alias record, and ACM certificate.
 */
export class FrontEnd extends Construct {
  appBucket: s3.IBucket;
  responseHeadersPolicy?: cloudfront.IResponseHeadersPolicy;
  waf?: wafv2.CfnWebACL;
  apiOriginCachePolicy?: cloudfront.ICachePolicy;
  originAccessIdentity?: cloudfront.OriginAccessIdentity;
  originAccessPolicyStatement?: iam.PolicyStatement;
  distribution?: cloudfront.IDistribution;
  dnsRecord?: route53.IRecordSet;

  constructor(parent: Construct, config: MedplumInfraConfig, region: string) {
    super(parent, 'FrontEnd');

    if (region === config.region) {
      // S3 bucket
      this.appBucket = new s3.Bucket(this, 'AppBucket', {
        bucketName: config.appDomainName,
        publicReadAccess: false,
        blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
        removalPolicy: RemovalPolicy.DESTROY,
        encryption: s3.BucketEncryption.S3_MANAGED,
        enforceSSL: true,
        versioned: true,
      });
    } else {
      // Otherwise, reference the bucket by name and region
      this.appBucket = s3.Bucket.fromBucketAttributes(this, 'AppBucket', {
        bucketName: config.appDomainName,
        region: config.region,
      });
    }

    if (region === 'us-east-1') {
      // HTTP response headers policy
      this.responseHeadersPolicy = new cloudfront.ResponseHeadersPolicy(this, 'ResponseHeadersPolicy', {
        customHeadersBehavior: {
          customHeaders: [
            {
              header: 'Permission-Policy',
              value:
                'accelerometer=(), camera=(self), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), interest-cohort=()',
              override: true,
            },
          ],
        },
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
              `frame-src 'self' ${config.storageDomainName} *.medplum.com *.gstatic.com *.google.com`,
              `img-src 'self' data: ${config.storageDomainName} *.gstatic.com *.google.com *.googleapis.com`,
              `manifest-src 'self'`,
              `media-src 'self' ${config.storageDomainName}`,
              `script-src 'self' *.medplum.com *.gstatic.com *.google.com`,
              `style-src 'self' 'unsafe-inline' *.medplum.com *.gstatic.com *.google.com`,
              `worker-src 'self' blob: *.gstatic.com *.google.com`,
              `upgrade-insecure-requests`,
            ].join('; '),
            override: true,
          },
          contentTypeOptions: { override: true },
          frameOptions: {
            frameOption: cloudfront.HeadersFrameOption.DENY,
            override: true,
          },
          referrerPolicy: {
            referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
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
        'FrontEndWAF',
        buildWafConfig(`${config.stackName}-FrontEndWAF`, 'CLOUDFRONT', config.appWafIpSetArn)
      );

      // API Origin Cache Policy
      this.apiOriginCachePolicy = new cloudfront.CachePolicy(this, 'ApiOriginCachePolicy', {
        cachePolicyName: `${config.stackName}-ApiOriginCachePolicy`,
        cookieBehavior: cloudfront.CacheCookieBehavior.all(),
        headerBehavior: cloudfront.CacheHeaderBehavior.allowList(
          'Authorization',
          'Content-Encoding',
          'Content-Type',
          'If-None-Match',
          'Origin',
          'Referer',
          'User-Agent',
          'X-Medplum'
        ),
        queryStringBehavior: cloudfront.CacheQueryStringBehavior.all(),
      });

      // Origin access identity
      this.originAccessIdentity = new cloudfront.OriginAccessIdentity(this, 'OriginAccessIdentity', {});
      this.originAccessPolicyStatement = grantBucketAccessToOriginAccessIdentity(
        this.appBucket,
        this.originAccessIdentity
      );

      // CloudFront distribution
      this.distribution = new cloudfront.Distribution(this, 'AppDistribution', {
        defaultRootObject: 'index.html',
        defaultBehavior: {
          origin: new origins.S3Origin(this.appBucket, {
            originAccessIdentity: this.originAccessIdentity,
          }),
          responseHeadersPolicy: this.responseHeadersPolicy,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        },
        additionalBehaviors: config.appApiProxy
          ? {
              '/api/*': {
                origin: new origins.HttpOrigin(config.apiDomainName),
                allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
                cachePolicy: this.apiOriginCachePolicy,
                viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
              },
            }
          : undefined,
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
        webAclId: this.waf.attrArn,
        logBucket: config.appLoggingBucket
          ? s3.Bucket.fromBucketName(this, 'LoggingBucket', config.appLoggingBucket)
          : undefined,
        logFilePrefix: config.appLoggingPrefix,
      });

      // DNS
      if (!config.skipDns) {
        const hostedZoneName = config.hostedZoneName ?? config.domainName.split('.').slice(-2).join('.');
        const zone = route53.HostedZone.fromLookup(this, 'Zone', { domainName: hostedZoneName });

        // Route53 alias record for the CloudFront distribution
        this.dnsRecord = new route53.ARecord(this, 'AppAliasRecord', {
          recordName: config.appDomainName,
          target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(this.distribution)),
          zone,
        });
      }
    }
  }
}
