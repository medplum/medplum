---
sidebar_position: 4
---

# AWS Advantages

Medplum provides a suite of digital healthcare services such as authentication, access controls, user management, FHIR server, automation, and more.

Medplum's hosted offering runs on AWS, so naturally the AWS configuration is most full-featured and most battle-tested. This document describes which features are only available on AWS, and possible alternatives.

:::info

Are you interested in a non-AWS environment? Please [contact us](mailto:hello@medplum.com) to learn about partnership or sponsorship opportunities. As the Medplum project grows, we intend to target as many hosting options as possible.

:::

For more details on self hosting on AWS, see [Install on AWS](./install-on-aws).

The following diagram roughly represents the AWS architecture:

![Medplum AWS Architecture](./medplum-aws-architecture.png)

The following AWS services are setup automatically with no extra engineering required:

- **[AWS CDK](https://aws.amazon.com/cdk/)** - Infrastructure as code (IaC). Medplum provides CDK code that can create the entire AWS environment from scratch.
  - Alternatives: [Terraform](https://www.terraform.io/), [Microsoft Resource Manager](https://learn.microsoft.com/en-us/azure/azure-resource-manager/)
- **[AWS VPC](https://aws.amazon.com/vpc/)** - Private cloud and network firewall.
  - Alternatives: [Azure Virtual Network](https://learn.microsoft.com/en-us/azure/virtual-network/), [Google Cloud VPC](https://cloud.google.com/vpc)
- **[AWS Fargate/ECS](https://aws.amazon.com/fargate/)** - Server orchestration for high availability and zero downtime deployments. Medplum deployment scripts use Fargate features to follow AWS best practices for smooth deployment.
  - Alternatives: [Kubernetes](https://kubernetes.io/), [Azure Container Instances](https://azure.microsoft.com/en-us/products/container-instances/), [Google Cloud Run](https://cloud.google.com/run)
- **[AWS Elastic Load Balancing](https://aws.amazon.com/elasticloadbalancing/)** - Distribute network traffic to improve application scalability and availability.
  - Alternatives: [Azure Load Balancer](https://azure.microsoft.com/en-us/products/load-balancer/), [Google Cloud Load Balancing](https://cloud.google.com/load-balancing)
- **[AWS Aurora](https://aws.amazon.com/rds/aurora/)** - Managed PostgreSQL database with monitoring, redundancy, patch maintenance, backups, and more.
  - Alternatives: [Azure Cosmos DB](https://azure.microsoft.com/en-us/products/cosmos-db/), [Google Cloud SQL for PostgreSQL](https://cloud.google.com/sql/docs/postgres), self managed
- **[AWS ElastiCache](https://aws.amazon.com/elasticache/)** - Managed Redis cache for resource caching and asynchronous job queues.
  - Alternatives: [Azure Cache for Redis](https://learn.microsoft.com/en-us/azure/azure-cache-for-redis/cache-overview), [Google Cloud Memorystore](https://cloud.google.com/memorystore), self managed
- **[AWS S3](https://aws.amazon.com/s3/)** - High availability, high durability blob storage.
  - Alternatives: [Microsoft Azure Blob](https://azure.microsoft.com/en-us/products/storage/blobs/), [Google Cloud Storage](https://cloud.google.com/storage)
- **[AWS SES](https://aws.amazon.com/ses/)** - Reliable and scalable email automation.
  - Alternatives: [Twilio SendGrid](#), [Azure Communication Services](https://azure.microsoft.com/en-us/products/communication-services/)
- **[AWS CloudFront](https://aws.amazon.com/cloudfront/)** - High availability Content Delivery Network (CDN) used for static asset hosting and user content via "Pre Signed URLs".
  - Alternatives: [Cloudflare CDN](https://www.cloudflare.com/cdn/), [Azure CDN](https://azure.microsoft.com/en-us/products/cdn/), [Google Cloud CDN](https://cloud.google.com/cdn)
- **[AWS Lambda](https://aws.amazon.com/lambda/)** - Serverless short lived code execution, used for background jobs and Medplum Bots.
  - Alternatives: [Azure Automation](https://learn.microsoft.com/en-us/azure/automation/), [Google Cloud Functions](https://cloud.google.com/functions)
- **[AWS Secrets Manager](https://aws.amazon.com/secrets-manager/)** - Manage and rotate service secrets such as database credentials.
  - Alternatives: [HashiCorp Vault](https://www.vaultproject.io/), [Azure Key Vault](https://azure.microsoft.com/en-us/products/key-vault/), [Google Secrets Manager](https://cloud.google.com/secret-manager)
- **[AWS Web Application Firewall (WAF)](https://aws.amazon.com/waf/)** - Protect against common web exploits and bots.
  - Alternatives: [Cloudflare WAF](https://www.cloudflare.com/waf/), [Azure WAF](https://azure.microsoft.com/en-us/products/web-application-firewall/), [Google Cloud Armor](https://cloud.google.com/armor)
- **[AWS CloudWatch Logs](https://aws.amazon.com/cloudwatch/)** - Centralized logs from all services.
  - Alternatives: [Azure Monitor Logs](https://learn.microsoft.com/en-us/azure/azure-monitor/logs/data-platform-logs), [Google Cloud Logging](https://cloud.google.com/logging), [Splunk](https://www.splunk.com/), [Sumo Logic](https://www.sumologic.com/)
