import {
  aws_ec2 as ec2,
  aws_ecr as ecr,
  aws_ecs as ecs,
  aws_elasticache as elasticache,
  aws_elasticloadbalancingv2 as elbv2,
  aws_iam as iam,
  aws_logs as logs,
  aws_rds as rds,
  aws_route53 as route53,
  aws_route53_targets as targets,
  aws_s3 as s3,
  aws_secretsmanager as secretsmanager,
  aws_ssm as ssm,
  aws_wafv2 as wafv2,
  Duration,
  RemovalPolicy,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { MedplumInfraConfig } from './config';
import { awsManagedRules } from './waf';

/**
 * Based on: https://github.com/aws-samples/http-api-aws-fargate-cdk/blob/master/cdk/singleAccount/lib/fargate-vpclink-stack.ts
 *
 * RDS config: https://docs.aws.amazon.com/cdk/api/latest/docs/aws-rds-readme.html
 */
export class BackEnd extends Construct {
  constructor(scope: Construct, config: MedplumInfraConfig) {
    super(scope, 'BackEnd');

    const name = config.name;

    // VPC Flow Logs
    const vpcFlowLogs = new logs.LogGroup(this, 'VpcFlowLogs', {
      logGroupName: '/medplum/flowlogs/' + name,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // VPC
    const vpc = new ec2.Vpc(this, 'VPC', {
      maxAzs: config.maxAzs,
      flowLogs: {
        cloudwatch: {
          destination: ec2.FlowLogDestination.toCloudWatchLogs(vpcFlowLogs),
          trafficType: ec2.FlowLogTrafficType.ALL,
        },
      },
    });

    // RDS
    const rdsCluster = new rds.DatabaseCluster(this, 'DatabaseCluster', {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_12_4,
      }),
      credentials: rds.Credentials.fromGeneratedSecret('clusteradmin'),
      defaultDatabaseName: 'medplum',
      storageEncrypted: true,
      instances: config.rdsInstances,
      instanceProps: {
        vpc: vpc,
        vpcSubnets: {
          subnetType: ec2.SubnetType.PRIVATE_WITH_NAT,
        },
      },
      backup: {
        retention: Duration.days(7),
      },
      cloudwatchLogsExports: ['postgresql'],
    });

    // Redis
    // Important: For HIPAA compliance, you must specify TransitEncryptionEnabled as true, an AuthToken, and a CacheSubnetGroup.
    const redisSubnetGroup = new elasticache.CfnSubnetGroup(this, 'RedisSubnetGroup', {
      description: 'Redis Subnet Group',
      subnetIds: vpc.privateSubnets.map((subnet) => subnet.subnetId),
    });

    const redisSecurityGroup = new ec2.SecurityGroup(this, 'RedisSecurityGroup', {
      vpc,
      description: 'Redis Security Group',
      allowAllOutbound: false,
    });

    const redisPassword = new secretsmanager.Secret(this, 'RedisPassword', {
      generateSecretString: {
        secretStringTemplate: '{}',
        generateStringKey: 'password',
        excludeCharacters: '@%*()_+=`~{}|[]\\:";\'?,./',
      },
    });

    const redisCluster = new elasticache.CfnReplicationGroup(this, 'RedisCluster', {
      engine: 'Redis',
      engineVersion: '6.x',
      cacheNodeType: 'cache.t2.medium',
      replicationGroupDescription: 'RedisReplicationGroup',
      authToken: redisPassword.secretValueFromJson('password').toString(),
      transitEncryptionEnabled: true,
      atRestEncryptionEnabled: true,
      multiAzEnabled: true,
      cacheSubnetGroupName: redisSubnetGroup.ref,
      numNodeGroups: 1,
      replicasPerNodeGroup: 1,
      securityGroupIds: [redisSecurityGroup.securityGroupId],
    });
    redisCluster.node.addDependency(redisPassword);

    const redisSecrets = new secretsmanager.Secret(this, 'RedisSecrets', {
      generateSecretString: {
        secretStringTemplate: JSON.stringify({
          host: redisCluster.attrPrimaryEndPointAddress,
          port: redisCluster.attrPrimaryEndPointPort,
          password: redisPassword.secretValueFromJson('password').toString(),
          tls: {},
        }),
        generateStringKey: 'unused',
      },
    });
    redisSecrets.node.addDependency(redisPassword);
    redisSecrets.node.addDependency(redisCluster);

    // ECS Cluster
    const cluster = new ecs.Cluster(this, 'Cluster', {
      vpc: vpc,
    });

    // Task Role
    const taskRole = new iam.Role(this, 'TaskExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });

    // Task Policies
    const policies = [
      'service-role/AmazonECSTaskExecutionRolePolicy',
      'AmazonSSMReadOnlyAccess', // Read SSM parameters
      'SecretsManagerReadWrite', // Read RDS secrets
      'AmazonCognitoPowerUser', // Authenticate users with Cognito
      'AmazonSESFullAccess', // Send emails with SES
      'AmazonS3FullAccess', // Upload content to content bucket
      'AWSLambda_FullAccess', // Create and execute lambdas
    ];
    policies.forEach((policy) => taskRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName(policy)));

    // Task Definitions
    const taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDefinition', {
      memoryLimitMiB: config.serverMemory,
      cpu: config.serverCpu,
      taskRole: taskRole,
    });

    // Log Groups
    const logGroup = new logs.LogGroup(this, 'LogGroup', {
      logGroupName: '/ecs/medplum/' + name,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const logDriver = new ecs.AwsLogDriver({
      logGroup: logGroup,
      streamPrefix: 'Medplum',
    });

    // Amazon ECR Repositories
    const serviceRepo = ecr.Repository.fromRepositoryName(this, 'MedplumRepo', 'medplum-server');

    // Task Containers
    const serviceContainer = taskDefinition.addContainer('MedplumTaskDefinition', {
      image: ecs.ContainerImage.fromEcrRepository(serviceRepo, 'latest'),
      command: [`aws:/medplum/${name}/`],
      logging: logDriver,
    });

    serviceContainer.addPortMappings({
      containerPort: 5000,
      hostPort: 5000,
    });

    // Security Groups
    const fargateSecurityGroup = new ec2.SecurityGroup(this, 'ServiceSecurityGroup', {
      allowAllOutbound: true,
      securityGroupName: 'MedplumSecurityGroup',
      vpc: vpc,
    });

    // Fargate Services
    const fargateService = new ecs.FargateService(this, 'FargateService', {
      cluster: cluster,
      taskDefinition: taskDefinition,
      assignPublicIp: false,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_NAT,
      },
      desiredCount: config.desiredServerCount,
      securityGroups: [fargateSecurityGroup],
    });

    // Load Balancer Target Group
    const targetGroup = new elbv2.ApplicationTargetGroup(this, 'TargetGroup', {
      vpc: vpc,
      port: 5000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      healthCheck: {
        path: '/healthcheck',
        interval: Duration.seconds(30),
        timeout: Duration.seconds(3),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 5,
      },
      targets: [fargateService],
    });

    // Load Balancer
    const loadBalancer = new elbv2.ApplicationLoadBalancer(this, 'LoadBalancer', {
      vpc: vpc,
      internetFacing: true,
      http2Enabled: true,
    });

    // Load Balancer logging
    loadBalancer.logAccessLogs(
      s3.Bucket.fromBucketName(this, 'LoggingBucket', config.loadBalancerLoggingBucket),
      config.loadBalancerLoggingPrefix
    );

    // HTTPS Listener
    // Forward to the target group
    loadBalancer.addListener('HttpsListener', {
      port: 443,
      certificates: [
        {
          certificateArn: config.apiSslCertArn,
        },
      ],
      sslPolicy: elbv2.SslPolicy.FORWARD_SECRECY_TLS12_RES_GCM,
      defaultAction: elbv2.ListenerAction.forward([targetGroup]),
    });

    // WAF
    const waf = new wafv2.CfnWebACL(this, 'BackEndWAF', {
      defaultAction: { allow: {} },
      scope: 'REGIONAL',
      name: `${config.stackName}-BackEndWAF`,
      rules: awsManagedRules,
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: `${config.stackName}-BackEndWAF-Metric`,
        sampledRequestsEnabled: false,
      },
    });

    // Create an association between the load balancer and the WAF
    const wafAssociation = new wafv2.CfnWebACLAssociation(this, 'LoadBalancerAssociation', {
      resourceArn: loadBalancer.loadBalancerArn,
      webAclArn: waf.attrArn,
    });

    // Grant RDS access to the fargate group
    rdsCluster.connections.allowDefaultPortFrom(fargateSecurityGroup);

    // Grant Redis access to the fargate group
    redisSecurityGroup.addIngressRule(fargateSecurityGroup, ec2.Port.tcp(6379));

    // Route 53
    const zone = route53.HostedZone.fromLookup(this, 'Zone', {
      domainName: config.domainName,
    });

    // Route53 alias record for the load balancer
    const record = new route53.ARecord(this, 'LoadBalancerAliasRecord', {
      recordName: config.apiDomainName,
      target: route53.RecordTarget.fromAlias(new targets.LoadBalancerTarget(loadBalancer)),
      zone: zone,
    });

    // Bot Lambda Role
    const botLambdaRole = new iam.Role(this, 'BotLambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    // SSM Parameters
    const databaseSecrets = new ssm.StringParameter(this, 'DatabaseSecretsParameter', {
      tier: ssm.ParameterTier.STANDARD,
      parameterName: `/medplum/${name}/DatabaseSecrets`,
      description: 'Database secrets ARN',
      stringValue: rdsCluster.secret?.secretArn as string,
    });

    const redisSecretsParameter = new ssm.StringParameter(this, 'RedisSecretsParameter', {
      tier: ssm.ParameterTier.STANDARD,
      parameterName: `/medplum/${name}/RedisSecrets`,
      description: 'Redis secrets ARN',
      stringValue: redisSecrets.secretArn,
    });

    const botLambdaRoleParameter = new ssm.StringParameter(this, 'BotLambdaRoleParameter', {
      tier: ssm.ParameterTier.STANDARD,
      parameterName: `/medplum/${name}/botLambdaRoleArn`,
      description: 'Bot lambda execution role ARN',
      stringValue: botLambdaRole.roleArn,
    });

    // Debug
    console.log('ARecord', record.domainName);
    console.log('DatabaseSecretsParameter', databaseSecrets.parameterArn);
    console.log('RedisSecretsParameter', redisSecretsParameter.parameterArn);
    console.log('RedisCluster', redisCluster.attrPrimaryEndPointAddress);
    console.log('BotLambdaRole', botLambdaRoleParameter.stringValue);
    console.log('WAF', waf.attrArn);
    console.log('WAF Association', wafAssociation.node.id);
  }
}
