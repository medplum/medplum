import * as cloudfront from '@aws-cdk/aws-cloudfront';
import * as route53 from '@aws-cdk/aws-route53';
import * as targets from '@aws-cdk/aws-route53-targets/lib';
import * as s3 from '@aws-cdk/aws-s3';
import * as cdk from '@aws-cdk/core';
import { CONSOLE_DOMAIN_NAME, DOMAIN_NAME, SSL_CERT_ARN } from './constants';

/**
 * Static site infrastructure, which deploys site content to an S3 bucket.
 *
 * The site redirects from HTTP to HTTPS, using a CloudFront distribution,
 * Route53 alias record, and ACM certificate.
 */
export class FrontEnd extends cdk.Construct {
  constructor(parent: cdk.Construct, name: string) {
    super(parent, name);

    const zone = route53.HostedZone.fromLookup(this, 'Zone', { domainName: DOMAIN_NAME });

    // site bucket
    const siteBucket = new s3.Bucket(this, 'SiteBucket', {
      bucketName: CONSOLE_DOMAIN_NAME,
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: 'error.html',
      publicReadAccess: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true
    });

    // CloudFront distribution that provides HTTPS
    const distribution = new cloudfront.CloudFrontWebDistribution(this, 'SiteDistribution', {
      aliasConfiguration: {
        acmCertRef: SSL_CERT_ARN,
        names: [CONSOLE_DOMAIN_NAME],
        sslMethod: cloudfront.SSLMethod.SNI,
        securityPolicy: cloudfront.SecurityPolicyProtocol.TLS_V1_1_2016,
      },
      originConfigs: [{
        customOriginSource: {
          domainName: siteBucket.bucketWebsiteDomainName,
          originProtocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
        },
        behaviors: [{ isDefaultBehavior: true }],
      }],
      errorConfigurations: [{
        errorCode: 403,
        responseCode: 200,
        responsePagePath: '/index.html'
      },
      {
        errorCode: 404,
        responseCode: 200,
        responsePagePath: '/index.html'
      }],
    });

    // Route53 alias record for the CloudFront distribution
    const record = new route53.ARecord(this, 'SiteAliasRecord', {
      recordName: CONSOLE_DOMAIN_NAME,
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
      zone
    });

    // Debug
    console.log('ARecord', record.domainName);
  }
}
