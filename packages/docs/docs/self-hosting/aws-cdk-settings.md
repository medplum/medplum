---
sidebar_position: 2
---

# AWS CDK Settings Reference

When deploying Medplum on AWS using the provided CDK, you will need to create a configuration file to define your infrastructure settings. This is a JSON file that contains all of the custom infrastructure configuration settings for your environment.

Here is a full example for the Medplum staging environment. See the detailed information for each setting below.

```json
{
  "name": "staging",
  "stackName": "MedplumStagingStack",
  "accountNumber": "647991932601",
  "region": "us-east-1",
  "domainName": "medplum.com",
  "apiDomainName": "api.staging.medplum.com",
  "apiPort": 5000,
  "apiSslCertArn": "arn:aws:acm:us-east-1:647991932601:certificate/159b257b-a180-49c6-b188-4dc962d8e708",
  "appDomainName": "app.staging.medplum.com",
  "appSslCertArn": "arn:aws:acm:us-east-1:647991932601:certificate/b0d65b27-2ea8-4377-82e1-c41aa067655b",
  "storageBucketName": "medplum-staging-storage",
  "storageDomainName": "storage.staging.medplum.com",
  "storageSslCertArn": "arn:aws:acm:us-east-1:647991932601:certificate/2205bb8c-7da9-4992-b8ec-c2c79b43b586",
  "storagePublicKey": "-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA3cnmD3HQbJU7WTGT2ZSO\nLt71c+xQ91m5FAzdFagfkQAG0CeyzHq8VzjLPinLDlOWCwQXfunjoBMP7iyVt/pE\n46ngR55In3UlzsMySHpUAi740u6oh0VeJOZA1x/FrVRYsxFx4XFJ92gcs5VvdT66\nwWTX7KznaIrxIvTWz384ogqXfg41QeoIISM2YUjqSMkyx7wY3xGrFvG5UuAAivbr\ni/ZZkkM2q9frpidpJx4evIuaHZS8fstbHFDbbFFqDMyuk7eAJRea1KH5TsjCHvTK\n5ANRyzq+mty47TKrI+2AQsxjH4mel2lC/at3udgtmfz1MTT7daFWfDKsVn8h3DsA\nJwIDAQAB\n-----END PUBLIC KEY-----",
  "maxAzs": 2,
  "rdsInstances": 1,
  "desiredServerCount": 1,
  "serverImage": "medplum/medplum-server:4.0",
  "serverMemory": 512,
  "serverCpu": 256,
  "loadBalancerLoggingEnabled": true,
  "loadBalancerLoggingBucket": "medplum-logs-us-east-1",
  "loadBalancerLoggingPrefix": "elb-staging",
  "clamscanEnabled": true,
  "clamscanLoggingBucket": "medplum-logs-us-east-1",
  "clamscanLoggingPrefix": "clamscan"
}
```

### name

The short name of your environment. This should be unique among your Medplum deployments. This will be used as part of Parameter Store path and CloudWatch Logs path. For example, `prod` or `staging`.

### stackName

The long name of your environment. This will be included in many of the AWS resource names created by CDK. For example, `MyMedplumStack` or `MedplumStagingStack`.

### accountNumber

Your AWS account number. A 12-digit number, such as 123456789012, that uniquely identifies an AWS account. Account IDs are not considered sensitive information.

### region

The AWS region where you want to deploy.

### domainName

The domain name that represents the common root for all subdomains. For example, `medplum.com`, `staging.medplum.com`, or `my-med-app.io`.

### vpcId

Optional preexisting VPC ID. Use this to import an existing VPC. If this setting is not present or empty, a new VPC will be created.

### apiDomainName

The domain name of the API server. This should be a subdomain of `domainName`. For example, `api.medplum.com` or `api.staging.medplum.com`.

### apiPort

The port number that the API server binds to inside the Docker image. By default, you should use `8103`. In some cases, you may need to use `5000`.

### apiSslCertArn

The ARN of the ACM Certificate for the API server domain that you registered before.

### apiInternetFacing

Optional flag that controls whether the load balancer has an internet-routable address. Default is `true`.

### apiWafIpSetArn

Optional ARN of the WAF IP Set to use for the API server load balancer. When set, the WAF will use the IP Set as an "allow" list, and default to "block". The IP Set must be in the correct region.

### appDomainName

The domain name of the app server. This should be a subdomain of `domainName`. For example, `app.medplum.com` or `app.staging.medplum.com`.

### appSslCertArn

The ARN of the ACM Certificate for the app server domain that you registered before.

### appApiProxy

Optional flag that adds an HTTP proxy from app `/api/` to the API server. Default is false.

### appWafIpSetArn

Optional ARN of the WAF IP Set to use for the app CloudFront Distribution. When set, the WAF will use the IP Set as an "allow" list, and default to "block". The IP Set must be in the special "Global (CloudFront)" region.

### storageBucketName

The name of the S3 bucket for file storage that you created before.

### storageDomainName

The domain name that will be used to access the file storage using presigned URLs. For example, `storage.medplum.com`.

### storageSslCertArn

The ARN of the ACM Certificate for the storage server domain that you registered before.

### storagePublicKey

The contents of the public key file that you created before. By default, the file name is `public.pem`. The contents should start with `-----BEGIN PUBLIC KEY-----`.

### storageWafIpSetArn

Optional ARN of the WAF IP Set to use for the storage CloudFront Distribution. When set, the WAF will use the IP Set as an "allow" list, and default to "block". The IP Set must be in the special "Global (CloudFront)" region.

### maxAzs

The maximum number of availability zones to use. If you want to use all availability zones, choose a large number such as 99. If you want to restrict the number, for example to manage EIP limits, then choose a small number such as 1 or 2.

### rdsInstances

The number of running RDS instances. Use `1` for a single instance, or `2` for a hot failover on standby.

### rdsInstanceType

Optional [AWS RDS Aurora instance type](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/Concepts.DBInstanceClass.html). Default value is the CDK default value (t3.medium).

### rdsClusterParameters

Optional [AWS Aurora Postgres parameters](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/AuroraPostgreSQL.Reference.ParameterGroups.html).

### rdsSecretsArn

Optional override to provide custom database connection secrets. If `rdsSecretsArn` is provided, then no RDS resources will be instantiated. The secrets at `rdsSecretsArn` must conform to the same secrets format as secrets created by CDK (`host`, `port`, `dbname`, `username`, `password`).

### rdsReaderInstanceType

Optional AWS RDS Aurora instance type for reader instances. Default value is `rdsInstanceType`. See [Upgrade RDS Database](/docs/self-hosting/upgrade-rds-database).

### rdsProxyEnabled

Optional flag to enable [AWS RDS Proxy](https://aws.amazon.com/rds/proxy/).

### maxConnections

Number of database connections per API server instance

### cacheNodeType

Optional [Elasticache Node Type](https://docs.aws.amazon.com/AmazonElastiCache/latest/red-ug/CacheNodes.SupportedTypes.html). Default value is `cache.t2.medium`.

### cacheSecurityGroupId

Optional Elasticache security group ID. By default, a new security group will be provisioned automatically.

### desiredServerCount

The number of running ECS/Fargate instances in steady state. Use `1` when getting started, and increase as necessary or for high availability and scale.

### serverImage

The DockerHub server image to deploy. Use `medplum/medplum-server:4.0` for the most recent version published by the Medplum team. Or use your own repository if you need to deploy a custom instance.

### serverMemory

The amount (in MiB) of memory used by the ECS/Fargate instance. For example, 512, 1024, 2048, 4096, etc. See [Task size](#task-size).

### serverCpu

The number of cpu units used by the task. For example, 512, 1024, 2048, 4096, etc. See [Task size](#task-size).

### loadBalancerSecurityGroupId

Optional security group ID for the load balancer. By default, a new security group will be provisioned automatically.

### loadBalancerLoggingEnabled

Boolean flag to [Enable Access Logs to ELB](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/enable-access-logging.html)

### loadBalancerLoggingBucket

The logging bucket that you created before.

### loadBalancerLoggingPrefix

A directory prefix to use for the S3 logs. For example, `elb`.

### clamscanEnabled

Boolean flag to enable [Serverless ClamScan antivirus](https://github.com/awslabs/cdk-serverless-clamscan)

### clamscanLoggingBucket

The logging bucket that you created before.

### clamscanLoggingPrefix

A directory prefix to use for the S3 logs. For example, `clamscan`.

### skipDns

Optional flag to skip all DNS entries. Use this option if you do not use Route 53, or if the Route 53 hosted zone is in a different AWS account.

### hostedZoneName

Optional Route 53 Hosted Zone name for DNS entries. By default, the CDK will use root domain name of the `domainName` setting (for example, if `domainName` is `staging.example.com`, the default hosted zone name is `example.com`).

### fargateAutoScaling

**Fargate** is an AWS serverless compute engine for containers, meaning you don't have to manage any underlying infrastructure

Example:

```ts
fargateAutoScaling: {
  minCapacity: 1,
  maxCapacity: 10,
  targetUtilizationPercent: 50,
  scaleInCooldown: 60,
  scaleOutCooldown: 60,
}
```

**Fargate Auto Scaling**
| Option                   | Description                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| minCapacity              | The minimum number of tasks that will be run at all times. This ensures that there are always some tasks running, even if the target utilization is not being met.                                                                                                                                                                                                                                                                |
| maxCapacity              | The maximum number of tasks that can be run simultaneously. This limits the number of tasks that can be scaled up to meet demand.                                                                                                                                                                                                                                                                                                  |
| targetUtilizationPercent | The target value for the average CPU utilization of the tasks, in percentage. When setting up autoscaling, you define a target utilization percentage, and AWS adjusts the number of tasks to maintain this target. For example, if you set a target CPU utilization of 70%, AWS will scale up tasks when the CPU usage is above 70% and scale down when it's below that threshold.                                                 |
| scaleInCooldown          | The amount of time, in seconds, after a scale in event that scaling activities are ignored. This is so you don't see a low CPU spike and then immediately scale in again. This cooldown period helps to ensure that your application remains stable and doesn't experience frequent fluctuations in task counts. It gives the system time to stabilize before any further scaling actions are taken.                               |
| scaleOutCooldown         | The amount of time, in seconds, after a scale out event that scaling activities are ignored. This is so you don't see a high CPU spike and then immediately scale out again. This cooldown period helps to ensure that your application remains stable and doesn't experience frequent fluctuations in task counts. It gives the system time to stabilize before any further scaling actions are taken.                              |

## Task Size

A certain amount of server CPU and memory is required to validate resources on write, and having an underpowered server
instance may result in excessive garbage collection pressure and degraded performance. The recommended server task
configurations are shown below:

|                                            | `serverCpu` | `serverMemory` |
| ------------------------------------------ | ----------- | -------------- |
| Recommended for production                 | 4096        | 8192           |
| Minimum for production                     | 2048        | 4096           |
| Minimum for development or small workloads | 512         | 2048           |

Beyond the recommended instance size for production, the server may not be able to take advantage of additional CPU and
memory resources; instead of increasing these settings further, adding more instances with `desiredServerCount` is the
recommended way to improve performance if the server CPU is a performance bottleneck.

For more information, see the [AWS task size documentation](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_definition_parameters.html#task_size).









