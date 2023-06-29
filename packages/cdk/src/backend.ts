import { MedplumInfraConfig } from '@medplum/core';
import {
  Duration,
  aws_ec2 as ec2,
  aws_ecs as ecs,
  aws_elasticache as elasticache,
  aws_elasticloadbalancingv2 as elbv2,
  aws_iam as iam,
  aws_logs as logs,
  aws_rds as rds,
  RemovalPolicy,
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
  constructor(scope: Construct, config: MedplumInfraConfig) {
    super(scope, 'BackEnd');

    const name = config.name;

    // VPC
    let vpc: ec2.IVpc;

    if (config.vpcId) {
      // Lookup VPC by ARN
      vpc = ec2.Vpc.fromLookup(this, 'VPC', { vpcId: config.vpcId });
    } else {
      // VPC Flow Logs
      const vpcFlowLogs = new logs.LogGroup(this, 'VpcFlowLogs', {
        logGroupName: '/medplum/flowlogs/' + name,
        removalPolicy: RemovalPolicy.DESTROY,
      });

      // Create VPC
      vpc = new ec2.Vpc(this, 'VPC', {
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
    const botLambdaRole = new iam.Role(this, 'BotLambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    // RDS
    let rdsCluster = undefined;
    let rdsSecretsArn = config.rdsSecretsArn;
    if (!rdsSecretsArn) {
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

      rdsCluster = new rds.DatabaseCluster(this, 'DatabaseCluster', {
        engine: rds.DatabaseClusterEngine.auroraPostgres({
          version: rds.AuroraPostgresEngineVersion.VER_12_9,
        }),
        credentials: rds.Credentials.fromGeneratedSecret('clusteradmin'),
        defaultDatabaseName: 'medplum',
        storageEncrypted: true,
        vpc: vpc,
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

      rdsSecretsArn = (rdsCluster.secret as secretsmanager.ISecret).secretArn;
    }

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
      cacheNodeType: config.cacheNodeType ?? 'cache.t2.medium',
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

    // Task Policies
    const taskRolePolicies = new iam.PolicyDocument({
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
          resources: [botLambdaRole.roleArn],
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
    const taskRole = new iam.Role(this, 'TaskExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      description: 'Medplum Server Task Execution Role',
      inlinePolicies: {
        TaskExecutionPolicies: taskRolePolicies,
      },
    });

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

    // Task Containers
    const serviceContainer = taskDefinition.addContainer('MedplumTaskDefinition', {
      image: this.getContainerImage(config, config.serverImage),
      command: [config.region === 'us-east-1' ? `aws:/medplum/${name}/` : `aws:${config.region}:/medplum/${name}/`],
      logging: logDriver,
    });

    serviceContainer.addPortMappings({
      containerPort: config.apiPort,
      hostPort: config.apiPort,
    });

    if (config.additionalContainers) {
      for (const container of config.additionalContainers) {
        taskDefinition.addContainer('AdditionalContainer-' + container.name, {
          containerName: container.name,
          image: this.getContainerImage(config, container.image),
          command: container.command,
          environment: container.environment,
          logging: logDriver,
        });
      }
    }

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
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      desiredCount: config.desiredServerCount,
      securityGroups: [fargateSecurityGroup],
      healthCheckGracePeriod: Duration.minutes(5),
    });

    // Add dependencies - make sure Fargate service is created after RDS and Redis
    if (rdsCluster) {
      fargateService.node.addDependency(rdsCluster);
    }
    fargateService.node.addDependency(redisCluster);

    // Load Balancer Target Group
    const targetGroup = new elbv2.ApplicationTargetGroup(this, 'TargetGroup', {
      vpc: vpc,
      port: config.apiPort,
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
      internetFacing: config.apiInternetFacing !== false, // default true
      http2Enabled: true,
    });

    if (config.loadBalancerLoggingBucket) {
      // Load Balancer logging
      loadBalancer.logAccessLogs(
        s3.Bucket.fromBucketName(this, 'LoggingBucket', config.loadBalancerLoggingBucket),
        config.loadBalancerLoggingPrefix
      );
    }

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
    if (rdsCluster) {
      rdsCluster.connections.allowDefaultPortFrom(fargateSecurityGroup);
    }

    // Grant Redis access to the fargate group
    redisSecurityGroup.addIngressRule(fargateSecurityGroup, ec2.Port.tcp(6379));

    // DNS
    let record = undefined;
    if (!config.skipDns) {
      // Route 53
      const zone = route53.HostedZone.fromLookup(this, 'Zone', {
        domainName: config.domainName.split('.').slice(-2).join('.'),
      });

      // Route53 alias record for the load balancer
      record = new route53.ARecord(this, 'LoadBalancerAliasRecord', {
        recordName: config.apiDomainName,
        target: route53.RecordTarget.fromAlias(new targets.LoadBalancerTarget(loadBalancer)),
        zone: zone,
      });
    }

    // SSM Parameters
    const databaseSecrets = new ssm.StringParameter(this, 'DatabaseSecretsParameter', {
      tier: ssm.ParameterTier.STANDARD,
      parameterName: `/medplum/${name}/DatabaseSecrets`,
      description: 'Database secrets ARN',
      stringValue: rdsSecretsArn,
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
    console.log('ARecord', record?.domainName);
    console.log('DatabaseSecretsParameter', databaseSecrets.parameterArn);
    console.log('RedisSecretsParameter', redisSecretsParameter.parameterArn);
    console.log('RedisCluster', redisCluster.attrPrimaryEndPointAddress);
    console.log('BotLambdaRole', botLambdaRoleParameter.stringValue);
    console.log('WAF', waf.attrArn);
    console.log('WAF Association', wafAssociation.node.id);
  }

  /**
   * Returns a container image for the given image name.
   * If the image name is an ECR image, then the image will be pulled from ECR.
   * Otherwise, the image name is assumed to be a Docker Hub image.
   * @param config The config settings (account number and region).
   * @param imageName The image name.
   * @returns The container image.
   */
  private getContainerImage(config: MedplumInfraConfig, imageName: string): ecs.ContainerImage {
    // Pull out the image name and tag from the image URI if it's an ECR image
    const ecrImageUriRegex = new RegExp(
      `^${config.accountNumber}\\.dkr\\.ecr\\.${config.region}\\.amazonaws\\.com/(.*)[:@](.*)$`
    );
    const nameTagMatches = imageName.match(ecrImageUriRegex);
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
