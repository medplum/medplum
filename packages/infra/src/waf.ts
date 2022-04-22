// Based on https://gist.github.com/statik/f1ac9d6227d98d30c7a7cec0c83f4e64

import * as wafv2 from '@aws-cdk/aws-wafv2';

export const awsManagedRules: wafv2.CfnWebACL.RuleProperty[] = [
  // AWS IP Reputation list includes known malicious actors/bots and is regularly updated
  // https://docs.aws.amazon.com/waf/latest/developerguide/aws-managed-rule-groups-ip-rep.html
  {
    name: 'AWS-AWSManagedRulesAmazonIpReputationList',
    priority: 10,
    statement: {
      managedRuleGroupStatement: {
        vendorName: 'AWS',
        name: 'AWSManagedRulesAmazonIpReputationList',
      },
    },
    overrideAction: {
      none: {},
    },
    visibilityConfig: {
      sampledRequestsEnabled: true,
      cloudWatchMetricsEnabled: true,
      metricName: 'AWSManagedRulesAmazonIpReputationList',
    },
  },
  // Common Rule Set aligns with major portions of OWASP Core Rule Set
  // https://docs.aws.amazon.com/waf/latest/developerguide/aws-managed-rule-groups-baseline.html
  {
    name: 'AWS-AWSManagedRulesCommonRuleSet',
    priority: 20,
    statement: {
      managedRuleGroupStatement: {
        vendorName: 'AWS',
        name: 'AWSManagedRulesCommonRuleSet',
        // Excluding generic RFI body rule for sns notifications
        // https://docs.aws.amazon.com/waf/latest/developerguide/aws-managed-rule-groups-list.html
        excludedRules: [{ name: 'GenericRFI_BODY' }, { name: 'SizeRestrictions_BODY' }],
      },
    },
    overrideAction: {
      none: {},
    },
    visibilityConfig: {
      sampledRequestsEnabled: true,
      cloudWatchMetricsEnabled: true,
      metricName: 'AWS-AWSManagedRulesCommonRuleSet',
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
      none: {},
    },
    statement: {
      managedRuleGroupStatement: {
        vendorName: 'AWS',
        name: 'AWSManagedRulesSQLiRuleSet',
        excludedRules: [],
      },
    },
  },
  // Blocks attacks targeting LFI(Local File Injection) for linux systems
  // https://docs.aws.amazon.com/waf/latest/developerguide/aws-managed-rule-groups-use-case.html#aws-managed-rule-groups-use-case-linux-os
  {
    name: 'AWSManagedRuleLinux',
    priority: 50,
    visibilityConfig: {
      sampledRequestsEnabled: true,
      cloudWatchMetricsEnabled: true,
      metricName: 'AWSManagedRuleLinux',
    },
    overrideAction: {
      none: {},
    },
    statement: {
      managedRuleGroupStatement: {
        vendorName: 'AWS',
        name: 'AWSManagedRulesLinuxRuleSet',
        excludedRules: [],
      },
    },
  },
];
