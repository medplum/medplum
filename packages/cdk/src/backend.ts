import { MedplumInfraConfig } from '@medplum/core';
import {
  Duration,
  RemovalPolicy,
  aws_ec2 as ec2,
  aws_ecs as ecs,
  aws_elasticache as elasticache,
  aws_elasticloadbalancingv2 as elbv2,
  aws_iam as iam,
  aws_logs as logs,
  aws_rds as rds,
  aws_route53 as route53,
  aws_s3 as s3,
  aws_secretsmanager as secretsmanager,
  aws_ssm as ssm,
  aws_route53_targets as targets,
  aws_wafv2 as wafv2,
} from 'aws-cdk-lib';
import { Repository } from 'aws-cdk-lib/aws-ecr';
import { ClusterInstance } from 'aws-cdk-lib/aws-rds';
import { Construct } from 'constructs';
import { awsManagedRules } from './waf';

/**
 * Based on: https://github.com/aws-samples/http-api-aws-fargate-cdk/blob/master/cdk/singleAccount/lib/fargate-vpclink-stack.ts
 *
 * RDS config: https://docs.aws.amazon.com/cdk/api/latest/docs/aws-rds-readme.html
 */
export class BackEnd extends Construct {
  vpc: ec2.IVpc;
  botLambdaRole: iam.IRole;
  rdsSecretsArn?: string;
  rdsCluster?: rds.DatabaseCluster;
  redisSubnetGroup: elasticache.CfnSubnetGroup;
  redisSecurityGroup: ec2.SecurityGroup;
  redisPassword: secretsmanager.ISecret;
  redisCluster: elasticache.CfnReplicationGroup;
  redisSecrets: secretsmanager.ISecret;
  ecsCluster: ecs.Cluster;
  taskRolePolicies: iam.PolicyDocument;
  taskRole: iam.Role;
  taskDefinition: ecs.FargateTaskDefinition;
  logGroup: logs.ILogGroup;
  logDriver: ecs.AwsLogDriver;
  serviceContainer: ecs.ContainerDefinition;
  fargateSecurityGroup: ec2.SecurityGroup;
  fargateService: ecs.FargateService;
  targetGroup: elbv2.ApplicationTargetGroup;
  loadBalancer: elbv2.ApplicationLoadBalancer;
  waf: wafv2.CfnWebACL;
  wafAssociation: wafv2.CfnWebACLAssociation;
  dnsRecord?: route53.ARecord;
  regionParameter: ssm.StringParameter;
  databaseSecretsParameter: ssm.StringParameter;
  redisSecretsParameter: ssm.StringParameter;
  botLambdaRoleParameter: ssm.StringParameter;

  constructor(scope: Construct, config: MedplumInfraConfig) {
    super(scope, 'BackEnd');

    const name = config.name;

    // VPC
    if (config.vpcId) {
      // Lookup VPC by ARN
      this.vpc = ec2.Vpc.fromLookup(this, 'VPC', { vpcId: config.vpcId });
    } else {
      // VPC Flow Logs
      const vpcFlowLogs = new logs.LogGroup(this, 'VpcFlowLogs', {
        logGroupName: '/medplum/flowlogs/' + name,
        removalPolicy: RemovalPolicy.DESTROY,
      });

      // Create VPC
      this.vpc = new ec2.Vpc(this, 'VPC', {
        maxAzs: config.maxAzs,
        flowLogs: {
          cloudwatch: {
            destination: ec2.FlowLogDestination.toCloudWatchLogs(vpcFlowLogs),
            trafficType: ec2.FlowLogTrafficType.ALL,
          },
        },
      });
    }

    // Bot Lambda Role
    this.botLambdaRole = new iam.Role(this, 'BotLambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    // RDS
    this.rdsSecretsArn = config.rdsSecretsArn;
    if (!this.rdsSecretsArn) {
      // See: https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_rds-readme.html#migrating-from-instanceprops
      const instanceProps: rds.ProvisionedClusterInstanceProps = {
        instanceType: config.rdsInstanceType ? new ec2.InstanceType(config.rdsInstanceType) : undefined,
        enablePerformanceInsights: true,
        isFromLegacyInstanceProps: true,
      };

      let readers = undefined;
      if (config.rdsInstances > 1) {
        readers = [];
        for (let i = 0; i < config.rdsInstances - 1; i++) {
          readers.push(
            ClusterInstance.provisioned('Instance' + (i + 2), {
              ...instanceProps,
            })
          );
        }
      }

      this.rdsCluster = new rds.DatabaseCluster(this, 'DatabaseCluster', {
        engine: rds.DatabaseClusterEngine.auroraPostgres({
          version: config.rdsInstanceVersion
            ? rds.AuroraPostgresEngineVersion.of(
                config.rdsInstanceVersion,
                config.rdsInstanceVersion.slice(0, config.rdsInstanceVersion.indexOf('.')),
                { s3Import: true, s3Export: true }
              )
            : rds.AuroraPostgresEngineVersion.VER_12_9,
        }),
        credentials: rds.Credentials.fromGeneratedSecret('clusteradmin'),
        defaultDatabaseName: 'medplum',
        storageEncrypted: true,
        vpc: this.vpc,
        vpcSubnets: {
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
        writer: ClusterInstance.provisioned('Instance1', {
          ...instanceProps,
        }),
        readers,
        backup: {
          retention: Duration.days(7),
        },
        cloudwatchLogsExports: ['postgresql'],
        instanceUpdateBehaviour: rds.InstanceUpdateBehaviour.ROLLING,
      });

      this.rdsSecretsArn = (this.rdsCluster.secret as secretsmanager.ISecret).secretArn;
    }

    // Redis
    // Important: For HIPAA compliance, you must specify TransitEncryptionEnabled as true, an AuthToken, and a CacheSubnetGroup.
    this.redisSubnetGroup = new elasticache.CfnSubnetGroup(this, 'RedisSubnetGroup', {
      description: 'Redis Subnet Group',
      subnetIds: this.vpc.privateSubnets.map((subnet) => subnet.subnetId),
    });

    this.redisSecurityGroup = new ec2.SecurityGroup(this, 'RedisSecurityGroup', {
      vpc: this.vpc,
      description: 'Redis Security Group',
      allowAllOutbound: false,
    });

    this.redisPassword = new secretsmanager.Secret(this, 'RedisPassword', {
      generateSecretString: {
        secretStringTemplate: '{}',
        generateStringKey: 'password',
        excludeCharacters: '@%*()_+=`~{}|[]\\:";\'?,./',
      },
    });

    this.redisCluster = new elasticache.CfnReplicationGroup(this, 'RedisCluster', {
      engine: 'Redis',
      engineVersion: '6.x',
      cacheNodeType: config.cacheNodeType ?? 'cache.t2.medium',
      replicationGroupDescription: 'RedisReplicationGroup',
      authToken: this.redisPassword.secretValueFromJson('password').toString(),
      transitEncryptionEnabled: true,
      atRestEncryptionEnabled: true,
      multiAzEnabled: true,
      cacheSubnetGroupName: this.redisSubnetGroup.ref,
      numNodeGroups: 1,
      replicasPerNodeGroup: 1,
      securityGroupIds: [this.redisSecurityGroup.securityGroupId],
    });
    this.redisCluster.node.addDependency(this.redisPassword);

    this.redisSecrets = new secretsmanager.Secret(this, 'RedisSecrets', {
      generateSecretString: {
        secretStringTemplate: JSON.stringify({
          host: this.redisCluster.attrPrimaryEndPointAddress,
          port: this.redisCluster.attrPrimaryEndPointPort,
          password: this.redisPassword.secretValueFromJson('password').toString(),
          tls: {},
        }),
        generateStringKey: 'unused',
      },
    });
    this.redisSecrets.node.addDependency(this.redisPassword);
    this.redisSecrets.node.addDependency(this.redisCluster);

    // ECS Cluster
    this.ecsCluster = new ecs.Cluster(this, 'Cluster', {
      vpc: this.vpc,
    });

    // Task Policies
    this.taskRolePolicies = new iam.PolicyDocument({
      statements: [
        // CloudWatch Logs: Create streams and put events
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['logs:CreateLogStream', 'logs:PutLogEvents'],
          resources: ['arn:aws:logs:*'],
        }),

        // Secrets Manager: Read only access to secrets
        // https://docs.aws.amazon.com/mediaconnect/latest/ug/iam-policy-examples-asm-secrets.html
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'secretsmanager:GetResourcePolicy',
            'secretsmanager:GetSecretValue',
            'secretsmanager:DescribeSecret',
            'secretsmanager:ListSecrets',
            'secretsmanager:ListSecretVersionIds',
          ],
          resources: ['arn:aws:secretsmanager:*'],
        }),

        // Parameter Store: Read only access
        // https://docs.aws.amazon.com/systems-manager/latest/userguide/sysman-paramstore-access.html
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['ssm:GetParametersByPath', 'ssm:GetParameters', 'ssm:GetParameter', 'ssm:DescribeParameters'],
          resources: ['arn:aws:ssm:*'],
        }),

        // SES: Send emails
        // https://docs.aws.amazon.com/ses/latest/dg/sending-authorization-policy-examples.html
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['ses:SendEmail', 'ses:SendRawEmail'],
          resources: ['arn:aws:ses:*'],
        }),

        // S3: Read and write access to buckets
        // https://docs.aws.amazon.com/service-authorization/latest/reference/list_amazons3.html
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['s3:ListBucket', 's3:GetObject', 's3:PutObject', 's3:DeleteObject'],
          resources: ['arn:aws:s3:::*'],
        }),

        // IAM: Pass role to innvoke lambda functions
        // https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_use_passrole.html
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['iam:ListRoles', 'iam:GetRole', 'iam:PassRole'],
          resources: [this.botLambdaRole.roleArn],
        }),

        // Lambda: Create, read, update, delete, and invoke functions
        // https://docs.aws.amazon.com/lambda/latest/dg/access-control-identity-based.html
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'lambda:CreateFunction',
            'lambda:GetFunction',
            'lambda:GetFunctionConfiguration',
            'lambda:UpdateFunctionCode',
            'lambda:UpdateFunctionConfiguration',
            'lambda:ListLayerVersions',
            'lambda:GetLayerVersion',
            'lambda:InvokeFunction',
          ],
          resources: ['arn:aws:lambda:*'],
        }),
      ],
    });

    // Task Role
    this.taskRole = new iam.Role(this, 'TaskExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      description: 'Medplum Server Task Execution Role',
      inlinePolicies: {
        TaskExecutionPolicies: this.taskRolePolicies,
      },
    });

    // Task Definitions
    this.taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDefinition', {
      memoryLimitMiB: config.serverMemory,
      cpu: config.serverCpu,
      taskRole: this.taskRole,
    });

    // Log Groups
    this.logGroup = new logs.LogGroup(this, 'LogGroup', {
      logGroupName: '/ecs/medplum/' + name,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    this.logDriver = new ecs.AwsLogDriver({
      logGroup: this.logGroup,
      streamPrefix: 'Medplum',
    });

    // Task Containers
    this.serviceContainer = this.taskDefinition.addContainer('MedplumTaskDefinition', {
      image: this.getContainerImage(config, config.serverImage),
      command: [config.region === 'us-east-1' ? `aws:/medplum/${name}/` : `aws:${config.region}:/medplum/${name}/`],
      logging: this.logDriver,
    });

    this.serviceContainer.addPortMappings({
      containerPort: config.apiPort,
      hostPort: config.apiPort,
    });

    if (config.additionalContainers) {
      for (const container of config.additionalContainers) {
        this.taskDefinition.addContainer('AdditionalContainer-' + container.name, {
          containerName: container.name,
          image: this.getContainerImage(config, container.image),
          command: container.command,
          environment: container.environment,
          logging: this.logDriver,
        });
      }
    }

    // Security Groups
    this.fargateSecurityGroup = new ec2.SecurityGroup(this, 'ServiceSecurityGroup', {
      allowAllOutbound: true,
      securityGroupName: 'MedplumSecurityGroup',
      vpc: this.vpc,
    });

    // Fargate Services
    this.fargateService = new ecs.FargateService(this, 'FargateService', {
      cluster: this.ecsCluster,
      taskDefinition: this.taskDefinition,
      assignPublicIp: false,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      desiredCount: config.desiredServerCount,
      securityGroups: [this.fargateSecurityGroup],
      healthCheckGracePeriod: Duration.minutes(5),
    });

    // Add dependencies - make sure Fargate service is created after RDS and Redis
    if (this.rdsCluster) {
      this.fargateService.node.addDependency(this.rdsCluster);
    }
    this.fargateService.node.addDependency(this.redisCluster);

    // Load Balancer Target Group
    this.targetGroup = new elbv2.ApplicationTargetGroup(this, 'TargetGroup', {
      vpc: this.vpc,
      port: config.apiPort,
      protocol: elbv2.ApplicationProtocol.HTTP,
      healthCheck: {
        path: '/healthcheck',
        interval: Duration.seconds(30),
        timeout: Duration.seconds(3),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 5,
      },
      targets: [this.fargateService],
    });

    // Load Balancer
    this.loadBalancer = new elbv2.ApplicationLoadBalancer(this, 'LoadBalancer', {
      vpc: this.vpc,
      internetFacing: config.apiInternetFacing !== false, // default true
      http2Enabled: true,
    });

    if (config.loadBalancerLoggingBucket) {
      // Load Balancer logging
      this.loadBalancer.logAccessLogs(
        s3.Bucket.fromBucketName(this, 'LoggingBucket', config.loadBalancerLoggingBucket),
        config.loadBalancerLoggingPrefix
      );
    }

    // HTTPS Listener
    // Forward to the target group
    this.loadBalancer.addListener('HttpsListener', {
      port: 443,
      certificates: [
        {
          certificateArn: config.apiSslCertArn,
        },
      ],
      sslPolicy: elbv2.SslPolicy.FORWARD_SECRECY_TLS12_RES_GCM,
      defaultAction: elbv2.ListenerAction.forward([this.targetGroup]),
    });

    // WAF
    this.waf = new wafv2.CfnWebACL(this, 'BackEndWAF', {
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
    this.wafAssociation = new wafv2.CfnWebACLAssociation(this, 'LoadBalancerAssociation', {
      resourceArn: this.loadBalancer.loadBalancerArn,
      webAclArn: this.waf.attrArn,
    });

    // Grant RDS access to the fargate group
    if (this.rdsCluster) {
      this.rdsCluster.connections.allowDefaultPortFrom(this.fargateSecurityGroup);
    }

    // Grant Redis access to the fargate group
    this.redisSecurityGroup.addIngressRule(this.fargateSecurityGroup, ec2.Port.tcp(6379));

    // DNS
    if (!config.skipDns) {
      // Route 53
      const hostedZoneName = config.hostedZoneName ?? config.domainName.split('.').slice(-2).join('.');
      const zone = route53.HostedZone.fromLookup(this, 'Zone', { domainName: hostedZoneName });

      // Route53 alias record for the load balancer
      this.dnsRecord = new route53.ARecord(this, 'LoadBalancerAliasRecord', {
        recordName: config.apiDomainName,
        target: route53.RecordTarget.fromAlias(new targets.LoadBalancerTarget(this.loadBalancer)),
        zone: zone,
      });
    }

    // SSM Parameters
    this.regionParameter = new ssm.StringParameter(this, 'RegionParameter', {
      tier: ssm.ParameterTier.STANDARD,
      parameterName: `/medplum/${name}/awsRegion`,
      description: 'AWS region',
      stringValue: config.region,
    });

    this.databaseSecretsParameter = new ssm.StringParameter(this, 'DatabaseSecretsParameter', {
      tier: ssm.ParameterTier.STANDARD,
      parameterName: `/medplum/${name}/DatabaseSecrets`,
      description: 'Database secrets ARN',
      stringValue: this.rdsSecretsArn,
    });

    this.redisSecretsParameter = new ssm.StringParameter(this, 'RedisSecretsParameter', {
      tier: ssm.ParameterTier.STANDARD,
      parameterName: `/medplum/${name}/RedisSecrets`,
      description: 'Redis secrets ARN',
      stringValue: this.redisSecrets.secretArn,
    });

    this.botLambdaRoleParameter = new ssm.StringParameter(this, 'BotLambdaRoleParameter', {
      tier: ssm.ParameterTier.STANDARD,
      parameterName: `/medplum/${name}/botLambdaRoleArn`,
      description: 'Bot lambda execution role ARN',
      stringValue: this.botLambdaRole.roleArn,
    });
  }

  /**
   * Returns a container image for the given image name.
   * If the image name is an ECR image, then the image will be pulled from ECR.
   * Otherwise, the image name is assumed to be a Docker Hub image.
   * @param config - The config settings (account number and region).
   * @param imageName - The image name.
   * @returns The container image.
   */
  private getContainerImage(config: MedplumInfraConfig, imageName: string): ecs.ContainerImage {
    // Pull out the image name and tag from the image URI if it's an ECR image
    const ecrImageUriRegex = new RegExp(
      `^${config.accountNumber}\\.dkr\\.ecr\\.${config.region}\\.amazonaws\\.com/(.*)[:@](.*)$`
    );
    const nameTagMatches = ecrImageUriRegex.exec(imageName);
    const serverImageName = nameTagMatches?.[1];
    const serverImageTag = nameTagMatches?.[2];
    if (serverImageName && serverImageTag) {
      // Creating an ecr repository image will automatically grant fine-grained permissions to ecs to access the image
      const ecrRepo = Repository.fromRepositoryArn(
        this,
        'ServerImageRepo',
        `arn:aws:ecr:${config.region}:${config.accountNumber}:repository/${serverImageName}`
      );
      return ecs.ContainerImage.fromEcrRepository(ecrRepo, serverImageTag);
    }

    // Otherwise, use the standard container image
    return ecs.ContainerImage.fromRegistry(imageName);
  }
}
