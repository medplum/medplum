import {
  aws_certificatemanager as acm,
  aws_cloudfront as cloudfront,
  aws_cloudfront_origins as origins,
  aws_route53 as route53,
  aws_route53_targets as targets,
  aws_s3 as s3,
  aws_wafv2 as wafv2,
  Duration,
  RemovalPolicy,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { MedplumInfraConfig } from './config';
import { awsManagedRules } from './waf';

/**
 * Static app infrastructure, which deploys app content to an S3 bucket.
 *
 * The app redirects from HTTP to HTTPS, using a CloudFront distribution,
 * Route53 alias record, and ACM certificate.
 */
export class FrontEnd extends Construct {
  constructor(parent: Construct, config: MedplumInfraConfig) {
    super(parent, 'FrontEnd');

    const zone = route53.HostedZone.fromLookup(this, 'Zone', {
      domainName: config.domainName,
    });

    // S3 bucket
    const appBucket = new s3.Bucket(this, 'AppBucket', {
      bucketName: config.appDomainName,
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: RemovalPolicy.DESTROY,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
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
            `frame-src 'self' *.medplum.com *.gstatic.com *.google.com`,
            `img-src 'self' data: ${config.storageDomainName} *.gstatic.com *.google.com`,
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
        frameOptions: { frameOption: cloudfront.HeadersFrameOption.DENY, override: true },
        strictTransportSecurity: {
          accessControlMaxAge: Duration.seconds(63072000),
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

    // WAF
    const waf = new wafv2.CfnWebACL(this, 'FrontEndWAF', {
      defaultAction: { allow: {} },
      scope: 'CLOUDFRONT',
      name: `${config.stackName}-FrontEndWAF`,
      rules: awsManagedRules,
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: `${config.stackName}-FrontEndWAF-Metric`,
        sampledRequestsEnabled: false,
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
      webAclId: waf.attrArn,
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
