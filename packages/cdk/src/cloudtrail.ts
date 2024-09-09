import { MedplumInfraConfig } from '@medplum/core';
import {
  aws_cloudtrail as cloudtrail,
  aws_cloudwatch as cloudwatch,
  aws_cloudwatch_actions as cloudwatch_actions,
  aws_logs as logs,
  aws_sns as sns,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class CloudTrailAlarms extends Construct {
  config: MedplumInfraConfig;
  logGroup?: logs.ILogGroup;
  cloudTrail?: cloudtrail.Trail;
  alarmTopic?: sns.ITopic;

  constructor(scope: Construct, config: MedplumInfraConfig) {
    super(scope, 'CloudTrailAlarms');
    this.config = config;

    // CloudTrail is optional
    if (!config.cloudTrailAlarms) {
      return;
    }

    // Get the CloudTrail log group
    // This can be created or imported by name
    if (config.cloudTrailAlarms.logGroupCreate) {
      this.logGroup = new logs.LogGroup(this, 'CloudTrailLogGroup', {
        logGroupName: config.cloudTrailAlarms.logGroupName,
        retention: logs.RetentionDays.ONE_YEAR,
      });
      this.cloudTrail = new cloudtrail.Trail(this, 'CloudTrail', {
        sendToCloudWatchLogs: true,
        cloudWatchLogGroup: this.logGroup,
        includeGlobalServiceEvents: true,
      });
    } else {
      this.logGroup = logs.LogGroup.fromLogGroupName(this, 'CloudTrailLogGroup', config.cloudTrailAlarms.logGroupName);
    }

    // Get the SNS Topic
    // This can be created or imported by name
    if (config.cloudTrailAlarms.snsTopicArn) {
      this.alarmTopic = sns.Topic.fromTopicArn(this, 'AlarmTopic', config.cloudTrailAlarms.snsTopicArn);
    } else {
      this.alarmTopic = new sns.Topic(this, 'AlarmTopic', { topicName: config.cloudTrailAlarms.snsTopicName });
    }
    const alarmDefinitions = [
      ['UnauthorizedApiCalls', '{ ($.errorCode = *UnauthorizedOperation) || ($.errorCode = AccessDenied*) }'],
      ['SignInWithoutMfa', '{ ($.eventName = ConsoleLogin) && ($.additionalEventData.MFAUsed != Yes) }'],
      [
        'RootAccountUsage',
        '{ $.userIdentity.type = Root && $.userIdentity.invokedBy NOT EXISTS && $.eventType != AwsServiceEvent }',
      ],
      [
        'IamPolicyChanges',
        '{($.eventName=DeleteGroupPolicy)||($.eventName=DeleteRolePolicy)||($.eventName=DeleteUserPolicy)||($.eventName=PutGroupPolicy)||($.eventName=PutRolePolicy)||($.eventName=PutUserPolicy)||($.eventName=CreatePolicy)||($.eventName=DeletePolicy)||($.eventName=CreatePolicyVersion)||($.eventName=DeletePolicyVersion)||($.eventName=AttachRolePolicy)||($.eventName=DetachRolePolicy)||($.eventName=AttachUserPolicy)||($.eventName=DetachUserPolicy)||($.eventName=AttachGroupPolicy)||($.eventName=DetachGroupPolicy)}',
      ],
      [
        'CloudTrailConfigurationChanges',
        '{ ($.eventName = CreateTrail) || ($.eventName = UpdateTrail) || ($.eventName = DeleteTrail) || ($.eventName = StartLogging) || ($.eventName = StopLogging) }',
      ],
      ['SignInFailures', '{ ($.eventName = ConsoleLogin) && ($.errorMessage = "Failed authentication") }'],
      [
        'DisabledCmks',
        '{($.eventSource = kms.amazonaws.com) && (($.eventName=DisableKey)||($.eventName=ScheduleKeyDeletion)) }',
      ],
      [
        'S3PolicyChanges',
        '{ ($.eventSource = s3.amazonaws.com) && (($.eventName = PutBucketAcl) || ($.eventName = PutBucketPolicy) || ($.eventName = PutBucketCors) || ($.eventName = PutBucketLifecycle) || ($.eventName = PutBucketReplication) || ($.eventName = DeleteBucketPolicy) || ($.eventName = DeleteBucketCors) || ($.eventName = DeleteBucketLifecycle) || ($.eventName = DeleteBucketReplication)) }',
      ],
      [
        'ConfigServiceChanges',
        '{($.eventSource = config.amazonaws.com) && (($.eventName=StopConfigurationRecorder)||($.eventName=DeleteDeliveryChannel)||($.eventName=PutDeliveryChannel)||($.eventName=PutConfigurationRecorder))}',
      ],
      [
        'SecurityGroupChanges',
        '{ ($.eventName = AuthorizeSecurityGroupIngress) || ($.eventName = AuthorizeSecurityGroupEgress) || ($.eventName = RevokeSecurityGroupIngress) || ($.eventName = RevokeSecurityGroupEgress) || ($.eventName = CreateSecurityGroup) || ($.eventName = DeleteSecurityGroup)}',
      ],
      [
        'NetworkAclChanges',
        '{ ($.eventName = CreateNetworkAcl) || ($.eventName = CreateNetworkAclEntry) || ($.eventName = DeleteNetworkAcl) || ($.eventName = DeleteNetworkAclEntry) || ($.eventName = ReplaceNetworkAclEntry) || ($.eventName = ReplaceNetworkAclAssociation) }',
      ],
      [
        'NetworkGatewayChanges',
        '{ ($.eventName = CreateCustomerGateway) || ($.eventName = DeleteCustomerGateway) || ($.eventName = AttachInternetGateway) || ($.eventName = CreateInternetGateway) || ($.eventName = DeleteInternetGateway) || ($.eventName = DetachInternetGateway) }',
      ],
      [
        'RouteTableChanges',
        '{ ($.eventName = CreateRoute) || ($.eventName = CreateRouteTable) || ($.eventName = ReplaceRoute) || ($.eventName = ReplaceRouteTableAssociation) || ($.eventName = DeleteRouteTable) || ($.eventName = DeleteRoute) || ($.eventName = DisassociateRouteTable) }',
      ],
      [
        'VpcChanges',
        '{ ($.eventName = CreateVpc) || ($.eventName = DeleteVpc) || ($.eventName = ModifyVpcAttribute) || ($.eventName = AcceptVpcPeeringConnection) || ($.eventName = CreateVpcPeeringConnection) || ($.eventName = DeleteVpcPeeringConnection) || ($.eventName = RejectVpcPeeringConnection) || ($.eventName = AttachClassicLinkVpc) || ($.eventName = DetachClassicLinkVpc) || ($.eventName = DisableVpcClassicLink) || ($.eventName = EnableVpcClassicLink) }',
      ],
      [
        'OrganizationsChanges',
        '{ ($.eventSource = organizations.amazonaws.com) && (($.eventName = AcceptHandshake) || ($.eventName = AttachPolicy) || ($.eventName = CreateAccount) || ($.eventName = CreateOrganizationalUnit) || ($.eventName = CreatePolicy) || ($.eventName = DeclineHandshake) || ($.eventName = DeleteOrganization) || ($.eventName = DeleteOrganizationalUnit) || ($.eventName = DeletePolicy) || ($.eventName = DetachPolicy) || ($.eventName = DisablePolicyType) || ($.eventName = EnablePolicyType) || ($.eventName = InviteAccountToOrganization) || ($.eventName = LeaveOrganization) || ($.eventName = MoveAccount) || ($.eventName = RemoveAccountFromOrganization) || ($.eventName = UpdatePolicy) || ($.eventName = UpdateOrganizationalUnit)) }',
      ],
    ];

    for (const [name, filterPattern] of alarmDefinitions) {
      this.createMetricAlarm(name, filterPattern);
    }
  }

  createMetricAlarm(name: string, filterPattern: string): void {
    const filterName = `${this.config.stackName}${name}MetricFilter`;
    const metricName = `${this.config.stackName}${name}Metric`;
    const metricNamespace = `${this.config.stackName}Metrics`;
    const alarmName = `${this.config.stackName}${name}Alarm`;

    const metricFilter = new logs.MetricFilter(this, filterName, {
      logGroup: this.logGroup as logs.ILogGroup,
      filterPattern: { logPatternString: filterPattern },
      metricNamespace,
      metricName,
    });

    const alarm = new cloudwatch.Alarm(this, alarmName, {
      metric: metricFilter.metric({}),
      threshold: 1,
      evaluationPeriods: 1,
      alarmName,
      actionsEnabled: true,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      datapointsToAlarm: 1,
    });

    alarm.addAlarmAction(new cloudwatch_actions.SnsAction(this.alarmTopic as sns.ITopic));
  }
}
