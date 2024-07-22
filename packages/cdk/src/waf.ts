// Based on https://gist.github.com/statik/f1ac9d6227d98d30c7a7cec0c83f4e64

import { aws_wafv2 as wafv2 } from 'aws-cdk-lib';

const awsManagedRules: wafv2.CfnWebACL.RuleProperty[] = [
  // Common Rule Set aligns with major portions of OWASP Core Rule Set
  // https://docs.aws.amazon.com/waf/latest/developerguide/aws-managed-rule-groups-baseline.html
  {
    name: 'AWS-AWSManagedRulesCommonRuleSet',
    priority: 10,
    statement: {
      managedRuleGroupStatement: {
        vendorName: 'AWS',
        name: 'AWSManagedRulesCommonRuleSet',
        // Excluding generic RFI body rule for sns notifications
        // https://docs.aws.amazon.com/waf/latest/developerguide/aws-managed-rule-groups-list.html
        excludedRules: [
          { name: 'NoUserAgent_HEADER' },
          { name: 'UserAgent_BadBots_HEADER' },
          { name: 'SizeRestrictions_QUERYSTRING' },
          { name: 'SizeRestrictions_Cookie_HEADER' },
          { name: 'SizeRestrictions_BODY' },
          { name: 'SizeRestrictions_URIPATH' },
          { name: 'EC2MetaDataSSRF_BODY' },
          { name: 'EC2MetaDataSSRF_COOKIE' },
          { name: 'EC2MetaDataSSRF_URIPATH' },
          { name: 'EC2MetaDataSSRF_QUERYARGUMENTS' },
          { name: 'GenericLFI_QUERYARGUMENTS' },
          { name: 'GenericLFI_URIPATH' },
          { name: 'GenericLFI_BODY' },
          { name: 'RestrictedExtensions_URIPATH' },
          { name: 'RestrictedExtensions_QUERYARGUMENTS' },
          { name: 'GenericRFI_QUERYARGUMENTS' },
          { name: 'GenericRFI_BODY' },
          { name: 'GenericRFI_URIPATH' },
          { name: 'CrossSiteScripting_COOKIE' },
          { name: 'CrossSiteScripting_QUERYARGUMENTS' },
          { name: 'CrossSiteScripting_BODY' },
          { name: 'CrossSiteScripting_URIPATH' },
        ],
      },
    },
    overrideAction: {
      count: {},
    },
    visibilityConfig: {
      sampledRequestsEnabled: true,
      cloudWatchMetricsEnabled: true,
      metricName: 'AWS-AWSManagedRulesCommonRuleSet',
    },
  },
  // AWS IP Reputation list includes known malicious actors/bots and is regularly updated
  // https://docs.aws.amazon.com/waf/latest/developerguide/aws-managed-rule-groups-ip-rep.html
  {
    name: 'AWS-AWSManagedRulesAmazonIpReputationList',
    priority: 20,
    statement: {
      managedRuleGroupStatement: {
        vendorName: 'AWS',
        name: 'AWSManagedRulesAmazonIpReputationList',
        excludedRules: [{ name: 'AWSManagedIPReputationList' }, { name: 'AWSManagedReconnaissanceList' }],
      },
    },
    overrideAction: {
      count: {},
    },
    visibilityConfig: {
      sampledRequestsEnabled: true,
      cloudWatchMetricsEnabled: true,
      metricName: 'AWSManagedRulesAmazonIpReputationList',
    },
  },
  // Blocks common SQL Injection
  // https://docs.aws.amazon.com/waf/latest/developerguide/aws-managed-rule-groups-use-case.html#aws-managed-rule-groups-use-case-sql-db
  {
    name: 'AWSManagedRulesSQLiRuleSet',
    priority: 30,
    visibilityConfig: {
      sampledRequestsEnabled: true,
      cloudWatchMetricsEnabled: true,
      metricName: 'AWSManagedRulesSQLiRuleSet',
    },
    overrideAction: {
      count: {},
    },
    statement: {
      managedRuleGroupStatement: {
        vendorName: 'AWS',
        name: 'AWSManagedRulesSQLiRuleSet',
        excludedRules: [
          { name: 'SQLi_QUERYARGUMENTS' },
          { name: 'SQLiExtendedPatterns_QUERYARGUMENTS' },
          { name: 'SQLi_BODY' },
          { name: 'SQLiExtendedPatterns_BODY' },
          { name: 'SQLi_COOKIE' },
          { name: 'SQLi_URIPATH' },
        ],
      },
    },
  },
  // Blocks attacks targeting LFI(Local File Injection) for linux systems
  // https://docs.aws.amazon.com/waf/latest/developerguide/aws-managed-rule-groups-use-case.html#aws-managed-rule-groups-use-case-linux-os
  {
    name: 'AWSManagedRuleLinux',
    priority: 40,
    visibilityConfig: {
      sampledRequestsEnabled: true,
      cloudWatchMetricsEnabled: true,
      metricName: 'AWSManagedRuleLinux',
    },
    overrideAction: {
      count: {},
    },
    statement: {
      managedRuleGroupStatement: {
        vendorName: 'AWS',
        name: 'AWSManagedRulesLinuxRuleSet',
        excludedRules: [{ name: 'LFI_URIPATH' }, { name: 'LFI_QUERYSTRING' }, { name: 'LFI_COOKIE' }],
      },
    },
  },
];

/**
 * Builds a set of WAF rules to apply to a web ACL.
 * @param ipSetArn - The ARN of the IP set to use for IP allow listing.
 * @returns The WAF rules to apply to the web ACL.
 */
function buildWafRules(ipSetArn: string | undefined): wafv2.CfnWebACL.RuleProperty[] {
  const rules = [...awsManagedRules];

  if (ipSetArn) {
    const ipAllowRule: wafv2.CfnWebACL.RuleProperty = {
      name: 'IPAllowListRule',
      priority: 50,
      action: {
        allow: {},
      },
      statement: {
        ipSetReferenceStatement: {
          arn: ipSetArn,
        },
      },
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: 'IPAllowListRule',
        sampledRequestsEnabled: true,
      },
    };
    rules.push(ipAllowRule);
  }

  return rules;
}

/**
 * Builds a WAF configuration.
 * @param name - The name of the WAF configuration.
 * @param scope - The scope of the WAF configuration. Use "CLOUDFRONT" for CloudFront distributions. Use "REGIONAL" for Application Load Balancers.
 * @param ipSetArn - The ARN of the IP set to use for IP allow listing. IP Set scope must match the WAF scope.
 * @returns The WAF configuration.
 */
export function buildWafConfig(
  name: string,
  scope: 'REGIONAL' | 'CLOUDFRONT',
  ipSetArn: string | undefined
): wafv2.CfnWebACLProps {
  return {
    name,
    scope,
    defaultAction: ipSetArn ? { block: {} } : { allow: {} },
    rules: buildWafRules(ipSetArn),
    visibilityConfig: {
      metricName: `${name}-Metric`,
      cloudWatchMetricsEnabled: true,
      sampledRequestsEnabled: false,
    },
  };
}
