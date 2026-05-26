// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumInfraConfig } from '@medplum/core';
import type { aws_iam as iam, aws_wafv2 as wafv2 } from 'aws-cdk-lib';
import {
  aws_certificatemanager as acm,
  aws_cloudfront as cloudfront,
  Duration,
  aws_cloudfront_origins as origins,
  RemovalPolicy,
  aws_route53 as route53,
  aws_s3 as s3,
  aws_route53_targets as targets,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { grantBucketAccessToOriginAccessIdentity } from './oai';
import { buildWaf } from './waf';

export interface StaticAppOptions {
  readonly appName: string;
  readonly domainName: string;
  readonly sslCertArn?: string;
  readonly wafIpSetArn?: string;
  readonly loggingBucket?: string;
  readonly loggingPrefix?: string;
}

export class StaticApp extends Construct {
  appBucket: s3.IBucket;
  responseHeadersPolicy?: cloudfront.IResponseHeadersPolicy;
  waf?: wafv2.CfnWebACL;
  originAccessIdentity?: cloudfront.OriginAccessIdentity;
  originAccessPolicyStatement?: iam.PolicyStatement;
  distribution?: cloudfront.IDistribution;
  dnsRecord?: route53.IRecordSet;

  constructor(parent: Construct, id: string, config: MedplumInfraConfig, region: string, options: StaticAppOptions) {
    super(parent, id);

    if (region === config.region) {
      this.appBucket = new s3.Bucket(this, 'AppBucket', {
        bucketName: options.domainName,
        publicReadAccess: false,
        blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
        removalPolicy: RemovalPolicy.DESTROY,
        encryption: s3.BucketEncryption.S3_MANAGED,
        enforceSSL: true,
        versioned: true,
      });
    } else {
      this.appBucket = s3.Bucket.fromBucketAttributes(this, 'AppBucket', {
        bucketName: options.domainName,
        region: config.region,
      });
    }

    if (region === 'us-east-1') {
      const hostedZoneName = config.hostedZoneName ?? config.domainName.split('.').slice(-2).join('.');
      let zone: route53.IHostedZone | undefined;
      const getZone = (): route53.IHostedZone => {
        zone ??= route53.HostedZone.fromLookup(this, 'Zone', { domainName: hostedZoneName });
        return zone;
      };

      const certificate = options.sslCertArn
        ? acm.Certificate.fromCertificateArn(this, 'Certificate', options.sslCertArn)
        : new acm.Certificate(this, 'Certificate', {
            domainName: options.domainName,
            validation: acm.CertificateValidation.fromDns(getZone()),
          });

      const apiOrigin = `https://${config.apiDomainName}`;
      const storageOrigin = `https://${config.storageDomainName}`;

      this.responseHeadersPolicy = new cloudfront.ResponseHeadersPolicy(this, 'ResponseHeadersPolicy', {
        customHeadersBehavior: {
          customHeaders: [
            {
              header: 'Permissions-Policy',
              value:
                'accelerometer=(), camera=(self), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), interest-cohort=()',
              override: true,
            },
          ],
        },
        securityHeadersBehavior: {
          contentSecurityPolicy: {
            contentSecurityPolicy: [
              `default-src 'self'`,
              `base-uri 'self'`,
              `child-src 'self'`,
              `connect-src 'self' ${apiOrigin} ${storageOrigin} *.medplum.com *.google.com`,
              `font-src 'self' fonts.gstatic.com`,
              `form-action 'self' *.gstatic.com *.google.com`,
              `frame-ancestors 'none'`,
              `frame-src 'self' ${storageOrigin} *.medplum.com *.gstatic.com *.google.com`,
              `img-src 'self' data: ${storageOrigin} *.gstatic.com *.google.com *.googleapis.com`,
              `manifest-src 'self'`,
              `media-src 'self' ${storageOrigin}`,
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

      this.waf = buildWaf(
        this,
        'StaticAppWAF',
        `${config.stackName}-${options.appName}WAF`,
        'CLOUDFRONT',
        options.wafIpSetArn ?? config.appWafIpSetArn,
        config.wafLogGroupName,
        config.wafLogGroupCreate
      );

      this.originAccessIdentity = new cloudfront.OriginAccessIdentity(this, 'OriginAccessIdentity', {});
      this.originAccessPolicyStatement = grantBucketAccessToOriginAccessIdentity(
        this.appBucket,
        this.originAccessIdentity
      );

      this.distribution = new cloudfront.Distribution(this, 'Distribution', {
        defaultRootObject: 'index.html',
        defaultBehavior: {
          origin: origins.S3BucketOrigin.withOriginAccessIdentity(this.appBucket, {
            originAccessIdentity: this.originAccessIdentity,
          }),
          responseHeadersPolicy: this.responseHeadersPolicy,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        },
        certificate,
        domainNames: [options.domainName],
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
        logBucket: options.loggingBucket ? s3.Bucket.fromBucketName(this, 'LoggingBucket', options.loggingBucket) : undefined,
        logFilePrefix: options.loggingPrefix,
      });

      if (!config.skipDns) {
        this.dnsRecord = new route53.ARecord(this, 'AliasRecord', {
          recordName: options.domainName,
          target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(this.distribution)),
          zone: getZone(),
        });
      }
    }
  }
}