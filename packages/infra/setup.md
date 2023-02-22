# Infrastructure Setup Guide

0. Make sure you have the right AWS credentials loaded

    `export AWS_PROFILE=demo-admin`

1. Set up a Route53 domain

    CLI:
    `aws route53 create-hosted-zone --name medplum-test.letsdevelo.com --caller-reference 123`
    the caller-reference can be any arbitrary string... it's used by AWS to prevent duplicate create operations.

    response:
    ```json
    {
        "Location": "https://route53.amazonaws.com/2013-04-01/hostedzone/Z06149321Z4IJ2FXQKFY3",
        "HostedZone": {
            "Id": "/hostedzone/Z06149321Z4IJ2FXQKFY3",
            "Name": "medplum-test.letsdevelo.com.",
            "CallerReference": "123",
            "Config": {
                "PrivateZone": false
            },
            "ResourceRecordSetCount": 2
        },
        "ChangeInfo": {
            "Id": "/change/C05527611RL9RRSLGJAH5",
            "Status": "PENDING",
            "SubmittedAt": "2023-02-21T19:51:36.097000+00:00"
        },
        "DelegationSet": {
            "NameServers": [
                "ns-526.awsdns-01.net",
                "ns-1082.awsdns-07.org",
                "ns-1906.awsdns-46.co.uk",
                "ns-343.awsdns-42.com"
            ]
        }
    }
    ```

1. Add the name servers to our google domains (Ask @han to do this)

   In this case it means adding the following NS records to google domains

   - "ns-526.awsdns-01.net",
   - "ns-1082.awsdns-07.org",
   - "ns-1906.awsdns-46.co.uk",
   - "ns-343.awsdns-42.com"

   IMPORTANT!! Do this ^ before generating the config file

1. Initialize a new configuration file
     1. from the medplum repo. `packages/infra` directory, run `npm run init` to generate a config file

    Full output
    ```txt
    ╰─$ npm run init                 
    
    > @medplum/infra@2.0.3 init
    > ts-node src/init.ts
    
    
    MEDPLUM
    
    This tool prepares the necessary prerequisites for deploying Medplum in your AWS account.
    
    Most Medplum infrastructure is deployed using the AWS CDK.
    However, some AWS resources must be created manually, such as email addresses and SSL certificates.
    This tool will help you create those resources.
    
    Upon completion, this tool will:
      1. Generate a Medplum CDK config file (i.e., medplum.demo.config.json)
      2. Optionally generate an AWS CloudFront signing key
      3. Optionally request SSL certificates from AWS Certificate Manager
      4. Optionally write server config settings to AWS Parameter Store
    
    The Medplum infra config file is an input to the Medplum CDK.
    The Medplum CDK will create and manage the necessary AWS resources.

    We will ask a series of questions to generate your infra config file.
    Some questions have predefined options in [square brackets].
    Some questions have default values in (parentheses), which you can accept by pressing Enter.
    Press Ctrl+C at any time to exit.
        
    ENVIRONMENT NAME
    
    Medplum deployments have a short environment name such as "prod", "staging", "alice", or "demo".
        The environment name is used in multiple places:
      1. As part of config file names (i.e., medplum.demo.config.json)
      2. As the base of CloudFormation stack names (i.e., MedplumDemo)
      3. AWS Parameter Store keys (i.e., /medplum/demo/...)
    What is your environment name? (demo) test
    Using environment name "test"...
    
    CONFIG FILE
    
    Medplum Infrastructure will create a config file in the current directory.
    What is the config file name? (medplum.test.config.json) 
    Config file already exists.
    Do you want to overwrite the config file? [y|n] y
    Using config file "medplum.test.config.json"...

    AWS REGION

    Most Medplum resources will be created in a single AWS region.
    Enter your AWS region: (us-east-1) us-west-2
    
    AWS ACCOUNT NUMBER
    
    Medplum Infrastructure will use your AWS account number to create AWS resources.
    Using the AWS CLI, your current account ID is: 819438846128
    What is your AWS account number? (819438846128) 
    
    STACK NAME
    
    Medplum will create a CloudFormation stack to manage AWS resources.
    Enter your CloudFormation stack name? (MedplumTest) 
    
    BASE DOMAIN NAME
    
    Medplum deploys multiple subdomains for various services.
    
    For example, "api." for the REST API and "app." for the web application.
    The base domain name is the common suffix for all subdomains.
    
    For example, if your base domain name is "example.com",
    then the REST API will be "api.example.com".
    
    Note that you must own the base domain, and it must use Route53 DNS.
    Medplum will create subdomains for you, but you must configure the base domain.
    Enter your base domain name: medplum-test.letsdevelo.com
    
    SUPPORT EMAIL
    
    Medplum sends transactional emails to users.
    For example, emails to new users or for password reset.
    Medplum will use the support email address to send these emails.
    Note that you must verify the support email address in SES.
    Enter your support email address: support@letsdevelo.com
    
    API DOMAIN NAME
    
    Medplum deploys a REST API for the backend services.
    Enter your REST API domain name: (api.medplum-test.letsdevelo.com) 
    
    APP DOMAIN NAME
    
    Medplum deploys a web application for the user interface.
    Enter your web application domain name: (app.medplum-test.letsdevelo.com) 
    
    STORAGE DOMAIN NAME
    
    Medplum deploys a storage service for file uploads.
    Enter your storage domain name: (storage.medplum-test.letsdevelo.com) 
    
    STORAGE BUCKET
    
    Medplum uses an S3 bucket to store binary content such as file uploads.
    Medplum will create a new S3 bucket for you.
    Enter your storage bucket name: (medplum-test-storage) 
    
    MAX AVAILABILITY ZONES
    
    Medplum API servers can be deployed in multiple availability zones.
    This provides redundancy and high availability.
    However, it also increases the cost of the deployment.
    If you want to use all availability zones, choose a large number such as 99.
    If you want to restrict the number, for example to manage EIP limits,
    then choose a small number such as 1 or 2.
    Enter the maximum number of availability zones: [1|(2)|3] 
    
    DATABASE INSTANCES
    
    Medplum uses a relational database to store all data.
    Medplum will create a new RDS database for you.
    If you need high availability, you can choose multiple instances.
    Use 1 for a single instance, or 2 for a primary and a standby.
    Enter the number of database instances: [(1)|2] 
    
    SERVER INSTANCES
    
    Medplum uses AWS Fargate to run the API servers.
    Medplum will create a new Fargate cluster for you.
    Fargate will automatically scale the number of servers up and down.
    If you need high availability, you can choose multiple instances.
    Enter the number of server instances: [(1)|2|3|4] 
    
    SERVER MEMORY
    
    You can choose the amount of memory for each server instance.
    The default is 512 MB, which is sufficient for getting started.
    Note that only certain CPU units are compatible with memory units.
    Consult AWS Fargate "Task Definition Parameters" for more information.
    Enter the server memory (MB): [(512)|1024|2048|4096] 
    
    SERVER CPU
    
    You can choose the amount of CPU for each server instance.
    CPU is expressed as an integer using AWS CPU units
    The default is 256, which is sufficient for getting started.
    Note that only certain CPU units are compatible with memory units.
    Consult AWS Fargate "Task Definition Parameters" for more information.
    Enter the server CPU: [(256)|512|1024|2048] 
    
    SERVER IMAGE
    
    Medplum uses Docker images for the API servers.
    You can choose the image to use for the servers.
    Docker images can be loaded from either Docker Hub or AWS ECR.
    The default is the latest Medplum release.
    Enter the server image: (medplum/medplum-server:latest) 
    
    SIGNING KEY
    
    Medplum uses AWS CloudFront Presigned URLs for binary content such as file uploads.
    Do you want to generate a signing key for the "storage" domain? [y|n] y
    
    SSL CERTIFICATES
    
    Medplum will now check for existing SSL certificates for the subdomains.
    Found 9 certificate(s).
    
    No existing certificate found for "api.medplum-test.letsdevelo.com".
    Do you want to request a new certificate? [y|n] y
    Certificate ARN: arn:aws:acm:us-west-2:819438846128:certificate/7d52d66f-5bad-431f-ad7d-5b0912f6b50d
    
    No existing certificate found for "app.medplum-test.letsdevelo.com".
    Do you want to request a new certificate? [y|n] y
    Certificate ARN: arn:aws:acm:us-east-1:819438846128:certificate/edecea24-ba37-46db-9da9-803b1a9a6d61
    
    No existing certificate found for "storage.medplum-test.letsdevelo.com".
    Do you want to request a new certificate? [y|n] y
    Certificate ARN: arn:aws:acm:us-east-1:819438846128:certificate/e7e50ab3-74b2-4e9d-aede-e7eaf5df6831
    
    AWS PARAMETER STORE
    
    Medplum uses AWS Parameter Store to store sensitive configuration values.
    These values will be encrypted at rest.
    The values will be stored in the "/medplum/test" path.
    {
      "port": 8103,
      "baseUrl": "https://api.medplum-test.letsdevelo.com/",
      "appBaseUrl": "https://app.medplum-test.letsdevelo.com/",
      "storageBaseUrl": "https://storage.medplum-test.letsdevelo.com/binary/",
      "binaryStorage": "s3:medplum-test-storage",
      "signingKey": "****",
      "signingKeyPassphrase": "****",
      "supportEmail": "support@letsdevelo.com"
    }
    Do you want to store these values in AWS Parameter Store? [y|n] y
    
    DONE!
    
    Medplum configuration complete.
    You can now proceed to deploying the Medplum infrastructure with CDK.
    Run:
    
        npx cdk synth -c config=medplum.test.config.json
        npx cdk deploy -c config=medplum.test.config.json
    
    See Medplum documentation for more information:
    
        https://www.medplum.com/docs/self-hosting/install-on-aws
    ```

1. Set up additional AWS parameter for region (/medplum/test/awsRegion)

   `aws ssm put-parameter --name /medplum/test/awsRegion --value us-west-2 --type SecureString`
   (The absence of this parameter in ParameterStore may be a bug in medplum cdk script)

1. Bootstrap CDK

   `npx cdk bootstrap -c config=medplum.test.config.json`

   Output:
    ```txt
    ARecord ${Token[TOKEN.907]}
    DatabaseSecretsParameter arn:${Token[AWS.Partition.6]}:ssm:us-west-2:819438846128:parameter${Token[TOKEN.912]}
    RedisSecretsParameter arn:${Token[AWS.Partition.6]}:ssm:us-west-2:819438846128:parameter${Token[TOKEN.917]}
    RedisCluster ${Token[TOKEN.783]}
    BotLambdaRole ${Token[TOKEN.920]}
    WAF ${Token[TOKEN.897]}
    WAF Association LoadBalancerAssociation
    ARecord ${Token[TOKEN.983]}
    ARecord ${Token[TOKEN.1021]}
    Stack ${Token[AWS::StackId.1022]}
    BackEnd BackEnd
    FrontEnd FrontEnd
    Storage Storage
    ARecord ${Token[TOKEN.907]}
    DatabaseSecretsParameter arn:${Token[AWS.Partition.6]}:ssm:us-west-2:819438846128:parameter${Token[TOKEN.912]}
    RedisSecretsParameter arn:${Token[AWS.Partition.6]}:ssm:us-west-2:819438846128:parameter${Token[TOKEN.917]}
    RedisCluster ${Token[TOKEN.783]}
    BotLambdaRole ${Token[TOKEN.920]}
    WAF ${Token[TOKEN.897]}
    WAF Association LoadBalancerAssociation
    ARecord ${Token[TOKEN.983]}
    ARecord ${Token[TOKEN.1021]}
    Stack ${Token[AWS::StackId.1022]}
    BackEnd BackEnd
    FrontEnd FrontEnd
    Storage Storage
     ⏳  Bootstrapping environment aws://819438846128/us-west-2...
     ⏳  Bootstrapping environment aws://819438846128/us-east-1...
    Trusted accounts for deployment: (none)
    Trusted accounts for lookup: (none)
    Using default execution policy of 'arn:aws:iam::aws:policy/AdministratorAccess'. Pass '--cloudformation-execution-policies' to customize.
    Switching from  to undefined as permissions boundary
     ✅  Environment aws://819438846128/us-east-1 bootstrapped (no changes).
    Trusted accounts for deployment: (none)
    Trusted accounts for lookup: (none)
    Using default execution policy of 'arn:aws:iam::aws:policy/AdministratorAccess'. Pass '--cloudformation-execution-policies' to customize.
    Switching from  to undefined as permissions boundary
     ✅  Environment aws://819438846128/us-west-2 bootstrapped (no changes).
     ```

1. For all three certificates generated by `npm run init` (storage, app and api), click the "Create records in Route53" button.
   1. This appears to help the certificate become valid?

   Note that the storage and app certificates are in us-east-1, and the api certificate is in us-west-2

1. Wait for all certificates to be validated by AWS.
   
   This can be checked [here](https://us-east-1.console.aws.amazon.com/acm/home?region=us-east-1#/certificates/list)

   If you don't wait, you may see an error like this because the certificate is still pending validation.

    ```
    3:18:27 PM | CREATE_FAILED        | AWS::ElasticLoadBalancingV2::Listener       | BackEnd/LoadBalancer/HttpsListener
    Resource handler returned message: "The certificate 'arn:aws:acm:us-west-2:819438846128:certificate/7d52d66f-5bad-431f-ad7d-5b0912f6b50d' must have a fully-qualified domain name, a supported signature, and
    a supported key size. (Service: ElasticLoadBalancingV2, Status Code: 400, Request ID: f469029a-dd8d-4aaa-9735-bb902cc0759a, Extended Request ID: null)" (RequestToken: dee070ad-7f37-451d-834c-92e9c0b02327, H
    andlerErrorCode: InvalidRequest)
    ```

1. Deploy `npx cdk deploy -c config=medplum.test.config.json --all`

    This will take about 20 minutes? (and create 67 items in the MedplumTest stack)
    Lots of output
    
    ```txt
    ╭─coleman@coleman-XPS-15-9520 ~/code/medplum/packages/infra ‹coleman/use-subdomain-for-route-53●› 
    ╰─$ npx cdk deploy -c config=medplum.test.config.json --all
    ARecord ${Token[TOKEN.911]}
    DatabaseSecretsParameter arn:${Token[AWS.Partition.10]}:ssm:us-west-2:819438846128:parameter${Token[TOKEN.916]}
    RedisSecretsParameter arn:${Token[AWS.Partition.10]}:ssm:us-west-2:819438846128:parameter${Token[TOKEN.921]}
    RedisCluster ${Token[TOKEN.787]}
    BotLambdaRole ${Token[TOKEN.924]}
    WAF ${Token[TOKEN.901]}
    WAF Association LoadBalancerAssociation
    ARecord ${Token[TOKEN.987]}
    ARecord ${Token[TOKEN.1025]}
    Stack ${Token[AWS::StackId.1026]}
    BackEnd BackEnd
    FrontEnd FrontEnd
    Storage Storage
    
    ✨  Synthesis time: 3.88s
    
    MedplumTest: building assets...
    
    [0%] start: Building fe7f1928b5cd39c2c746a4cb992554374e395df5502b0da1b8dd93d8c7db07e5:819438846128-us-west-2
    [100%] success: Built fe7f1928b5cd39c2c746a4cb992554374e395df5502b0da1b8dd93d8c7db07e5:819438846128-us-west-2
    
    MedplumTest: assets built
    
    MedplumTest-us-east-1: building assets...
    
    [0%] start: Building 896772931e9e7159e63e891b9da6f2ac5a8a58e0fe9bcac6ba15d6ead1ca336c:819438846128-us-east-1
    [100%] success: Built 896772931e9e7159e63e891b9da6f2ac5a8a58e0fe9bcac6ba15d6ead1ca336c:819438846128-us-east-1
    
    MedplumTest-us-east-1: assets built
    
    MedplumTest
    This deployment will make potentially sensitive changes according to your current security approval level (--require-approval broadening).
    Please confirm you intend to make the following modifications:
    
    IAM Statement Changes
    ┌───┬───────────────────────────────────────────────┬────────┬───────────────────────────────────────────────┬───────────────────────────────────────────────┬───────────────────────────────────────────────┐
    │   │ Resource                                      │ Effect │ Action                                        │ Principal                                     │ Condition                                     │
    ├───┼───────────────────────────────────────────────┼────────┼───────────────────────────────────────────────┼───────────────────────────────────────────────┼───────────────────────────────────────────────┤
    │ + │ ${BackEnd/BotLambdaRole.Arn}                  │ Allow  │ sts:AssumeRole                                │ Service:lambda.amazonaws.com                  │                                               │
    │ + │ ${BackEnd/BotLambdaRole.Arn}                  │ Allow  │ iam:GetRole                                   │ AWS:${BackEnd/TaskExecutionRole}              │                                               │
    │   │                                               │        │ iam:ListRoles                                 │                                               │                                               │
    │   │                                               │        │ iam:PassRole                                  │                                               │                                               │
    ├───┼───────────────────────────────────────────────┼────────┼───────────────────────────────────────────────┼───────────────────────────────────────────────┼───────────────────────────────────────────────┤
    │ + │ ${BackEnd/LogGroup.Arn}                       │ Allow  │ logs:CreateLogStream                          │ AWS:${BackEnd/TaskDefinition/ExecutionRole}   │                                               │
    │   │                                               │        │ logs:PutLogEvents                             │                                               │                                               │
    ├───┼───────────────────────────────────────────────┼────────┼───────────────────────────────────────────────┼───────────────────────────────────────────────┼───────────────────────────────────────────────┤
    │ + │ ${BackEnd/TaskDefinition/ExecutionRole.Arn}   │ Allow  │ sts:AssumeRole                                │ Service:ecs-tasks.amazonaws.com               │                                               │
    ├───┼───────────────────────────────────────────────┼────────┼───────────────────────────────────────────────┼───────────────────────────────────────────────┼───────────────────────────────────────────────┤
    │ + │ ${BackEnd/TaskExecutionRole.Arn}              │ Allow  │ sts:AssumeRole                                │ Service:ecs-tasks.amazonaws.com               │                                               │
    ├───┼───────────────────────────────────────────────┼────────┼───────────────────────────────────────────────┼───────────────────────────────────────────────┼───────────────────────────────────────────────┤
    │ + │ ${BackEnd/VPC/cloudwatch/IAMRole.Arn}         │ Allow  │ sts:AssumeRole                                │ Service:vpc-flow-logs.amazonaws.com           │                                               │
    │ + │ ${BackEnd/VPC/cloudwatch/IAMRole.Arn}         │ Allow  │ iam:PassRole                                  │ AWS:${BackEnd/VPC/cloudwatch/IAMRole}         │                                               │
    ├───┼───────────────────────────────────────────────┼────────┼───────────────────────────────────────────────┼───────────────────────────────────────────────┼───────────────────────────────────────────────┤
    │ + │ ${BackEnd/VpcFlowLogs.Arn}                    │ Allow  │ logs:CreateLogStream                          │ AWS:${BackEnd/VPC/cloudwatch/IAMRole}         │                                               │
    │   │                                               │        │ logs:DescribeLogStreams                       │                                               │                                               │
    │   │                                               │        │ logs:PutLogEvents                             │                                               │                                               │
    ├───┼───────────────────────────────────────────────┼────────┼───────────────────────────────────────────────┼───────────────────────────────────────────────┼───────────────────────────────────────────────┤
    │ + │ ${FrontEnd/AppBucket.Arn}                     │ Deny   │ s3:*                                          │ AWS:*                                         │ "Bool": {                                     │
    │   │ ${FrontEnd/AppBucket.Arn}/*                   │        │                                               │                                               │   "aws:SecureTransport": "false"              │
    │   │                                               │        │                                               │                                               │ }                                             │
    ├───┼───────────────────────────────────────────────┼────────┼───────────────────────────────────────────────┼───────────────────────────────────────────────┼───────────────────────────────────────────────┤
    │ + │ ${Storage/StorageBucket.Arn}                  │ Deny   │ s3:*                                          │ AWS:*                                         │ "Bool": {                                     │
    │   │ ${Storage/StorageBucket.Arn}/*                │        │                                               │                                               │   "aws:SecureTransport": "false"              │
    │   │                                               │        │                                               │                                               │ }                                             │
    ├───┼───────────────────────────────────────────────┼────────┼───────────────────────────────────────────────┼───────────────────────────────────────────────┼───────────────────────────────────────────────┤
    │ + │ arn:aws:lambda:*                              │ Allow  │ lambda:CreateFunction                         │ AWS:${BackEnd/TaskExecutionRole}              │                                               │
    │   │                                               │        │ lambda:GetFunction                            │                                               │                                               │
    │   │                                               │        │ lambda:GetFunctionConfiguration               │                                               │                                               │
    │   │                                               │        │ lambda:GetLayerVersion                        │                                               │                                               │
    │   │                                               │        │ lambda:InvokeFunction                         │                                               │                                               │
    │   │                                               │        │ lambda:ListLayerVersions                      │                                               │                                               │
    │   │                                               │        │ lambda:UpdateFunctionCode                     │                                               │                                               │
    │   │                                               │        │ lambda:UpdateFunctionConfiguration            │                                               │                                               │
    ├───┼───────────────────────────────────────────────┼────────┼───────────────────────────────────────────────┼───────────────────────────────────────────────┼───────────────────────────────────────────────┤
    │ + │ arn:aws:logs:*                                │ Allow  │ logs:CreateLogStream                          │ AWS:${BackEnd/TaskExecutionRole}              │                                               │
    │   │                                               │        │ logs:PutLogEvents                             │                                               │                                               │
    ├───┼───────────────────────────────────────────────┼────────┼───────────────────────────────────────────────┼───────────────────────────────────────────────┼───────────────────────────────────────────────┤
    │ + │ arn:aws:s3:::*                                │ Allow  │ s3:DeleteObject                               │ AWS:${BackEnd/TaskExecutionRole}              │                                               │
    │   │                                               │        │ s3:GetObject                                  │                                               │                                               │
    │   │                                               │        │ s3:ListBucket                                 │                                               │                                               │
    │   │                                               │        │ s3:PutObject                                  │                                               │                                               │
    ├───┼───────────────────────────────────────────────┼────────┼───────────────────────────────────────────────┼───────────────────────────────────────────────┼───────────────────────────────────────────────┤
    │ + │ arn:aws:secretsmanager:*                      │ Allow  │ secretsmanager:DescribeSecret                 │ AWS:${BackEnd/TaskExecutionRole}              │                                               │
    │   │                                               │        │ secretsmanager:GetResourcePolicy              │                                               │                                               │
    │   │                                               │        │ secretsmanager:GetSecretValue                 │                                               │                                               │
    │   │                                               │        │ secretsmanager:ListSecretVersionIds           │                                               │                                               │
    │   │                                               │        │ secretsmanager:ListSecrets                    │                                               │                                               │
    ├───┼───────────────────────────────────────────────┼────────┼───────────────────────────────────────────────┼───────────────────────────────────────────────┼───────────────────────────────────────────────┤
    │ + │ arn:aws:ses:*                                 │ Allow  │ ses:SendEmail                                 │ AWS:${BackEnd/TaskExecutionRole}              │                                               │
    │   │                                               │        │ ses:SendRawEmail                              │                                               │                                               │
    ├───┼───────────────────────────────────────────────┼────────┼───────────────────────────────────────────────┼───────────────────────────────────────────────┼───────────────────────────────────────────────┤
    │ + │ arn:aws:ssm:*                                 │ Allow  │ ssm:DescribeParameters                        │ AWS:${BackEnd/TaskExecutionRole}              │                                               │
    │   │                                               │        │ ssm:GetParameter                              │                                               │                                               │
    │   │                                               │        │ ssm:GetParameters                             │                                               │                                               │
    │   │                                               │        │ ssm:GetParametersByPath                       │                                               │                                               │
    └───┴───────────────────────────────────────────────┴────────┴───────────────────────────────────────────────┴───────────────────────────────────────────────┴───────────────────────────────────────────────┘
    Security Group Changes
    ┌───┬──────────────────────────────────────────────────┬─────┬──────────────────────────────────────────────┬───────────────────────────────────────────────┐
    │   │ Group                                            │ Dir │ Protocol                                     │ Peer                                          │
    ├───┼──────────────────────────────────────────────────┼─────┼──────────────────────────────────────────────┼───────────────────────────────────────────────┤
    │ + │ ${BackEnd/DatabaseCluster/SecurityGroup.GroupId} │ In  │ TCP ${BackEnd/DatabaseCluster.Endpoint.Port} │ ${BackEnd/ServiceSecurityGroup.GroupId}       │
    │ + │ ${BackEnd/DatabaseCluster/SecurityGroup.GroupId} │ Out │ Everything                                   │ Everyone (IPv4)                               │
    ├───┼──────────────────────────────────────────────────┼─────┼──────────────────────────────────────────────┼───────────────────────────────────────────────┤
    │ + │ ${BackEnd/LoadBalancer/SecurityGroup.GroupId}    │ In  │ TCP 443                                      │ Everyone (IPv4)                               │
    │ + │ ${BackEnd/LoadBalancer/SecurityGroup.GroupId}    │ Out │ TCP 8103                                     │ ${BackEnd/ServiceSecurityGroup.GroupId}       │
    ├───┼──────────────────────────────────────────────────┼─────┼──────────────────────────────────────────────┼───────────────────────────────────────────────┤
    │ + │ ${BackEnd/RedisSecurityGroup.GroupId}            │ In  │ TCP 6379                                     │ ${BackEnd/ServiceSecurityGroup.GroupId}       │
    │ + │ ${BackEnd/RedisSecurityGroup.GroupId}            │ Out │ ICMP 252-86                                  │ 255.255.255.255/32                            │
    ├───┼──────────────────────────────────────────────────┼─────┼──────────────────────────────────────────────┼───────────────────────────────────────────────┤
    │ + │ ${BackEnd/ServiceSecurityGroup.GroupId}          │ In  │ TCP 8103                                     │ ${BackEnd/LoadBalancer/SecurityGroup.GroupId} │
    │ + │ ${BackEnd/ServiceSecurityGroup.GroupId}          │ Out │ Everything                                   │ Everyone (IPv4)                               │
    └───┴──────────────────────────────────────────────────┴─────┴──────────────────────────────────────────────┴───────────────────────────────────────────────┘
    (NOTE: There may be security-related changes not in this list. See https://github.com/aws/aws-cdk/issues/1299)
    
    Do you wish to deploy these changes (y/n)? y
    MedplumTest: deploying... [1/2]
    [0%] start: Publishing fe7f1928b5cd39c2c746a4cb992554374e395df5502b0da1b8dd93d8c7db07e5:819438846128-us-west-2
    [100%] success: Published fe7f1928b5cd39c2c746a4cb992554374e395df5502b0da1b8dd93d8c7db07e5:819438846128-us-west-2
    MedplumTest: creating CloudFormation changeset...
    
     ✅  MedplumTest
    
    ✨  Deployment time: 709.42s
    
    Stack ARN:
    arn:aws:cloudformation:us-west-2:819438846128:stack/MedplumTest/db7e3fe0-b252-11ed-8069-063ccef3ae7d
    
    ✨  Total time: 713.3s
    
    MedplumTest-us-east-1
    MedplumTest-us-east-1: deploying... [2/2]
    [0%] start: Publishing 896772931e9e7159e63e891b9da6f2ac5a8a58e0fe9bcac6ba15d6ead1ca336c:819438846128-us-east-1
    [100%] success: Published 896772931e9e7159e63e891b9da6f2ac5a8a58e0fe9bcac6ba15d6ead1ca336c:819438846128-us-east-1
    MedplumTest-us-east-1: creating CloudFormation changeset...
    
     ✅  MedplumTest-us-east-1
    
    ✨  Deployment time: 327.17s
    
    Stack ARN:
    arn:aws:cloudformation:us-east-1:819438846128:stack/MedplumTest-us-east-1/80f17c20-b254-11ed-a860-121cd52c5de5
    
    ✨  Total time: 331.06s
    ```
    ^ Total is ~18 minutes (713.3 + 331.06) / 60 = 17.4 minutes
    
    
    ERRORS:
    
       If creation fails because of bucket existing, you can delete the bucket with the AWS s3 cli. This could happen 
       if the CDK deploy wasn't successful and needed to roll back. The S3 buckets are not deleted on roll back.
    
       Obviously, when deleting an s3 bucket, be _very_ sure that you're deleting the correct bucket!
    
    ```
    4:25:49 PM | CREATE_FAILED        | AWS::S3::Bucket                             | Storage/StorageBucket
    medplum-test-storage already exists
    4:25:52 PM | ROLLBACK_IN_PROGRESS | AWS::CloudFormation::Stack                  | MedplumTest
    The following resource(s) failed to create: [BackEndVPCIGW0223DDE2, BackEndBotLambdaRoleBBE7DB26, BackEndVPCPublicSubnet2EIP71028A8E, BackEndBackEndWAFDE8C8425, BackEndCluster6B6DC4A8, StorageStorageBucketD
    C877B11, BackEndVPCPublicSubnet1EIPD431B170, BackEndVPCcloudwatchIAMRole06786F5F, BackEndLogGroup2DF5FDDA, BackEndVPCF5C5F769, FrontEndAppBucket92214AC8, BackEndTaskDefinitionExecutionRole1C08853D, BackEndV
    pcFlowLogs8C3147DB, MedplumTestBackEndDatabaseClusterSecretCA3ACE143fdaad7efa858a3daf9490cf0a702aeb, CDKMetadata, BackEndRedisPassword046FF1F3]. Rollback requested by user.
    4:25:52 PM | ROLLBACK_IN_PROGRESS | AWS::CloudFormation::Stack                  | MedplumTest
    The following resource(s) failed to create: [BackEndVPCIGW0223DDE2, BackEndBotLambdaRoleBBE7DB26, BackEndVPCPublicSubnet2EIP71028A8E, BackEndBackEndWAFDE8C8425, BackEndCluster6B6DC4A8, StorageStorageBucketD
    C877B11, BackEndVPCPublicSubnet1EIPD431B170, BackEndVPCcloudwatchIAMRole06786F5F, BackEndLogGroup2DF5FDDA, BackEndVPCF5C5F769, FrontEndAppBucket92214AC8, BackEndTaskDefinitionExecutionRole1C08853D, BackEndV
    pcFlowLogs8C3147DB, MedplumTestBackEndDatabaseClusterSecretCA3ACE143fdaad7efa858a3daf9490cf0a702aeb, CDKMetadata, BackEndRedisPassword046FF1F3]. Rollback requested by user.
    ^C
    ╭─coleman@coleman-XPS-15-9520 ~/code/medplum/packages/infra ‹coleman/use-subdomain-for-route-53●› 
    ╰─$ aws s3 rb s3://medplum-test-storage
    ```

1. Deploy the medplum app
  1. install dependencies for entire project (`npm install`)
  1. set the correct MEDPLUM_BASE_URL in packages/app/.env
        `MEDPLUM_BASE_URL=https://app.medplum-test.letsdevelo.com/api/`
  1. build the entire project (`npm run build`)
  1. load the built site into s3 (`APP_BUCKET=app.medplum-test.letsdevelo.com ./scripts/deploy-app.sh`)

1. Fix S3 permissions

   1. Add origin access to both `app` and `storage` buckets using origin access identities (found [here](https://us-east-1.console.aws.amazon.com/cloudfront/v3/home?region=us-west-2#/originAccess))

      This looks like adding the following to the bucket policy (replace `E34W9TK5O83D9` with the correct origin identity, replace the Resource with the correct bucket arn)

    ```json
           {
                "Sid": "1",
                "Effect": "Allow",
                "Principal": {
                    "AWS": "arn:aws:iam::cloudfront:user/CloudFront Origin Access Identity E34W9TK5O83D9"
                },
                "Action": "s3:GetObject",
                "Resource": "arn:aws:s3:::app.medplum-test.letsdevelo.com/*"
            },
    ```
    
    in full, the policy looks like this
    
    ```json
    {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Sid": "1",
                "Effect": "Allow",
                "Principal": {
                    "AWS": "arn:aws:iam::cloudfront:user/CloudFront Origin Access Identity E34W9TK5O83D9"
                },
                "Action": "s3:GetObject",
                "Resource": "arn:aws:s3:::app.medplum-test.letsdevelo.com/*"
            },
            {
                "Effect": "Deny",
                "Principal": {
                    "AWS": "*"
                },
                "Action": "s3:*",
                "Resource": [
                    "arn:aws:s3:::app.medplum-test.letsdevelo.com",
                    "arn:aws:s3:::app.medplum-test.letsdevelo.com/*"
                ],
                "Condition": {
                    "Bool": {
                        "aws:SecureTransport": "false"
                    }
                }
            }
        ]
    }
    ```

      
1. Add keypair id to aws parameterstore (Can be found in cloudfront keys https://us-east-1.console.aws.amazon.com/cloudfront/v3/home?region=us-east-1#/publickey)

   `aws ssm put-parameter --name /medplum/test/signingKeyId --value K2FQWT6S8D1BAX --type SecureString`

   Then restart the fargate server container. This allows the "Download" binary button to work. Otherwise the key id is "unknown" and aws S3 correctly won't render the document


## Limitations

1. This does not set up SES emails
     More info can be found [here](https://www.medplum.com/docs/self-hosting/install-on-aws#create-an-ses-email-address)
1. This does not set up medplum Bots
     More info can be found [here](https://www.medplum.com/docs/self-hosting/install-on-aws#deploy-bot-lambda-layer)


