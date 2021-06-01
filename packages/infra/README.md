# Medplum Infra

CDK scripts to setup the full stack:
- S3 + CloudFront for static site
- VPC for private network
- Fargate for backend server
- Aurora RDS for database

### Install

```
npm install -g cdk
npm install
```

### Deploy

```
cdk deploy
```

### Destroy

```
cdk destroy
```

### Front End

Based on: https://github.com/aws-samples/aws-cdk-examples/tree/master/typescript/static-site

Creates:
* S3 Bucket
* CloudFront distribution
* SSL Certificate
* Route 53 Entries

### Back End

Based on: Based on: https://github.com/aws-samples/http-api-aws-fargate-cdk/blob/master/cdk/singleAccount/lib/fargate-vpclink-stack.ts

Creates:
* VPC
* Security Groups
* Fargate Task and Service
* CloudWatch Log Groups
* Load Balancer
* SSL Certificate
* Route 53 Entries
