import * as ec2 from '@aws-cdk/aws-ec2';
import * as ecr from '@aws-cdk/aws-ecr';
import * as ecs from '@aws-cdk/aws-ecs';
import * as elasticache from '@aws-cdk/aws-elasticache';
import * as elbv2 from '@aws-cdk/aws-elasticloadbalancingv2';
import * as iam from '@aws-cdk/aws-iam';
import * as logs from '@aws-cdk/aws-logs';
import * as rds from '@aws-cdk/aws-rds';
import * as route53 from '@aws-cdk/aws-route53';
import * as targets from '@aws-cdk/aws-route53-targets/lib';
import * as secretsmanager from '@aws-cdk/aws-secretsmanager';
import * as ssm from '@aws-cdk/aws-ssm';
import * as cdk from '@aws-cdk/core';
import { API_DOMAIN_NAME, API_SSL_CERT_ARN, DOMAIN_NAME } from './constants';

/**
 * Based on: https://github.com/aws-samples/http-api-aws-fargate-cdk/blob/master/cdk/singleAccount/lib/fargate-vpclink-stack.ts
 *
 * RDS config: https://docs.aws.amazon.com/cdk/api/latest/docs/aws-rds-readme.html
 */
export class BackEnd extends cdk.Construct {
  readonly id: string;

  constructor(scope: cdk.Construct, id: string) {
    super(scope, id);
    this.id = id;

    const name = 'prod';

    // VPC
    const vpc = new ec2.Vpc(this, 'VPC');

    // RDS
    const rdsCluster = new rds.DatabaseCluster(this, 'DatabaseCluster', {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_12_4
      }),
      credentials: rds.Credentials.fromGeneratedSecret('clusteradmin'),
      defaultDatabaseName: 'medplum',
      storageEncrypted: true,
      instances: 1,
      instanceProps: {
        vpc: vpc,
        vpcSubnets: {
          subnetType: ec2.SubnetType.PRIVATE,
        },
      }
    });

    rdsCluster.connections.allowDefaultPortFromAnyIpv4();

    // Redis
    // Important: For HIPAA compliance, you must specify TransitEncryptionEnabled as true, an AuthToken, and a CacheSubnetGroup.
    const redisSubnetGroup = new elasticache.CfnSubnetGroup(this, 'RedisSubnetGroup', {
      description: 'Redis Subnet Group',
      subnetIds: vpc.privateSubnets.map(subnet => subnet.subnetId)
    });

    const redisSecurityGroup = new ec2.SecurityGroup(this, 'RedisSecurityGroup', {
      vpc,
      description: 'Redis Security Group',
      allowAllOutbound: false,
    });
    redisSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(6379));

    const redisPassword = new secretsmanager.Secret(this, 'RedisPassword', {
      generateSecretString: {
        secretStringTemplate: '{}',
        generateStringKey: 'password',
        excludeCharacters: '@%*()_+=`~{}|[]\\:";\'?,./'
      }
    });

    const redisCluster = new elasticache.CfnReplicationGroup(this, 'RedisCluster', {
      engine: "Redis",
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
          tls: {}
        }),
        generateStringKey: 'unused'
      }
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
      'AmazonS3FullAccess', // upload content to content bucket
    ];
    policies.forEach(policy => taskRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName(policy)));

    // Task Definitions
    const taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDefinition', {
      memoryLimitMiB: 512,
      cpu: 256,
      taskRole: taskRole,
    });

    // Log Groups
    const logGroup = new logs.LogGroup(this, 'LogGroup', {
      logGroupName: '/ecs/medplum/' + name,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const logDriver = new ecs.AwsLogDriver({
      logGroup: logGroup,
      streamPrefix: 'Medplum',
    });

    // Amazon ECR Repositories
    const serviceRepo = ecr.Repository.fromRepositoryName(
      this,
      'MedplumRepo',
      'medplum-server'
    );

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
    const securityGroup = new ec2.SecurityGroup(this, 'ServiceSecurityGroup', {
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
        subnetType: ec2.SubnetType.PRIVATE
      },
      desiredCount: 1,
      securityGroup: securityGroup,
    });

    // Load Balancer Target Group
    const targetGroup = new elbv2.ApplicationTargetGroup(this, 'TargetGroup', {
      vpc: vpc,
      port: 5000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      healthCheck: {
        path: '/healthcheck',
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(3),
      },
      targets: [fargateService]
    });

    // Load Balancer
    const loadBalancer = new elbv2.ApplicationLoadBalancer(this, 'LoadBalancer', {
      vpc: vpc,
      internetFacing: true,
      http2Enabled: true
    });

    // HTTP Listener
    // Redirect HTTP to HTTPS
    loadBalancer.addListener('HttpListener', {
      port: 80,
      defaultAction: elbv2.ListenerAction.redirect({
        protocol: 'HTTPS',
        port: '443'
      })
    });

    // HTTPS Listener
    // Forward to the target group
    loadBalancer.addListener('HttpsListener', {
      port: 443,
      certificates: [{
        certificateArn: API_SSL_CERT_ARN
      }],
      sslPolicy: elbv2.SslPolicy.FORWARD_SECRECY_TLS12_RES_GCM,
      defaultAction: elbv2.ListenerAction.forward([targetGroup])
    });

    // Route 53
    const zone = route53.HostedZone.fromLookup(this, 'Zone', { domainName: DOMAIN_NAME });

    // Route53 alias record for the load balancer
    const record = new route53.ARecord(this, 'LoadBalancerAliasRecord', {
      recordName: API_DOMAIN_NAME,
      target: route53.RecordTarget.fromAlias(new targets.LoadBalancerTarget(loadBalancer)),
      zone: zone
    });

    // SSM Parameters
    const databaseSecrets = new ssm.StringParameter(this, 'DatabaseSecretsParameter', {
      tier: ssm.ParameterTier.STANDARD,
      parameterName: `/medplum/${name}/DatabaseSecrets`,
      description: 'Database secrets ARN',
      stringValue: rdsCluster.secret?.secretArn as string
    });

    const redisSecretsParameter = new ssm.StringParameter(this, 'RedisSecretsParameter', {
      tier: ssm.ParameterTier.STANDARD,
      parameterName: `/medplum/${name}/RedisSecrets`,
      description: 'Redis secrets ARN',
      stringValue: redisSecrets.secretArn
    });

    // Debug
    console.log('ARecord', record.domainName);
    console.log('DatabaseSecretsParameter', databaseSecrets.parameterArn);
    console.log('RedisSecretsParameter', redisSecretsParameter.parameterArn);
    console.log('RedisCluster', redisCluster.attrPrimaryEndPointAddress);
  }
}
