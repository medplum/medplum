variable "region" {
  type        = string
  description = "AWS region"
  default     = "us-east-1"
}

variable "tags" {
  type        = map(string)
  description = "Tags to apply to all resources"
  default     = { app = "medplum" }
}

variable "app_domain" {
  type        = string
  description = "Application domain (e.g., medplum.example.com)"
}

variable "api_domain" {
  type        = string
  description = "Domain for the Medplum API server (e.g., api.medplum.example.com or medplum-api.example.com)"
}

variable "ssl_certificate_arn" {
  type        = string
  description = "ACM certificate ARN for the app CloudFront distribution (must be in us-east-1). Leave empty to let Terraform request and validate the certificate automatically when Route 53 is available."
  default     = ""
}

variable "alb_certificate_arn" {
  type        = string
  description = "ACM certificate ARN for the ALB (must be in the deployment region). Leave empty to let Terraform request and validate the certificate automatically when Route 53 is available."
  default     = ""
}

variable "environment" {
  type        = string
  description = "Environment (dev, test, prod)"
  default     = "dev"
}

variable "deployment_id" {
  type        = string
  description = "Deployment ID for resource naming"
  default     = "1"
}

variable "availability_zones" {
  type        = list(string)
  description = "Availability zones for multi-AZ resources"
  default     = ["us-east-1a", "us-east-1b"]
}

variable "cidr_block" {
  type        = string
  description = "CIDR block for VPC"
  default     = "10.52.0.0/16"
}

variable "postgres_version" {
  type        = string
  description = "Aurora PostgreSQL engine version. Must be a full semver string supported by Aurora (e.g. '15.4', '16.1')."
  default     = "15.4"
}

variable "db_instance_tier" {
  type        = string
  description = "Aurora instance class (e.g., db.t3.medium for dev, db.r6g.large for production)."
  default     = "db.t3.medium"
}

variable "redis_node_type" {
  type        = string
  description = "ElastiCache node type"
  default     = "cache.t3.micro"
}

variable "redis_num_cache_nodes" {
  type        = number
  description = "Number of cache nodes for ElastiCache. Production requires >= 2 for automatic failover."
  default     = 1

  validation {
    condition     = var.redis_num_cache_nodes >= 1
    error_message = "redis_num_cache_nodes must be at least 1."
  }
}

variable "eks_node_instance_types" {
  type        = list(string)
  description = "EC2 instance types for EKS managed node group. t3.large recommended minimum for production."
  default     = ["t3.large"]
}

variable "support_email" {
  type        = string
  description = "Support email address"
}

variable "bot_lambda_role_arn" {
  type        = string
  description = "Override IAM role ARN for the Medplum bot Lambda function. Leave empty (default) to use the role created by this stack."
  default     = ""
}

variable "storage_domain" {
  type        = string
  description = "Domain for the Medplum storage CDN (e.g., storage.example.com). Leave empty to disable the dedicated storage CloudFront distribution."
  default     = ""
}

variable "storage_ssl_certificate_arn" {
  type        = string
  description = "ACM certificate ARN for the storage CloudFront distribution (must be in us-east-1, covering storage_domain). Required when storage_domain is set."
  default     = ""
}

variable "signing_key_id" {
  type        = string
  description = "CloudFront public key ID for signed storage URLs. Generate the RSA key pair externally (see README), upload the public key to CloudFront, and supply the resulting key ID here. Required when storage_domain is set."
  default     = ""
}

variable "rds_instances" {
  type        = number
  description = "Number of Aurora cluster instances (writer + additional readers). Use 1 for dev, 2 for production."
  default     = 1

  validation {
    condition     = var.rds_instances >= 1
    error_message = "rds_instances must be at least 1."
  }
}

variable "rds_ssl_reject_unauthorized" {
  type        = bool
  default     = true
  description = <<-EOT
    Controls TLS certificate validation for the Medplum server's RDS connection.

    Defaults to true (secure). Set to false only in isolated dev/test environments
    where you cannot provide a valid RDS CA bundle. Configure the server with the
    RDS CA bundle (rds-ca-rsa2048-g1 or rds-ca-rsa4096-g1) so that Node.js can
    verify the RDS certificate chain:
      https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/UsingWithRDS.SSL.html
  EOT
}

variable "enable_waf" {
  type        = bool
  description = "Create WAFv2 Web ACLs and associate them with CloudFront distributions. The regional ALB WAF association requires waf_alb_arn to be set after the load balancer is provisioned."
  default     = true
}

variable "api_waf_ip_set_arn" {
  type        = string
  description = "ARN of an existing WAFv2 IP set to use for API origin allow-listing (REGIONAL scope). Leave empty to use default managed rules only."
  default     = ""
}

variable "app_waf_ip_set_arn" {
  type        = string
  description = "ARN of an existing WAFv2 IP set to use for app CloudFront allow-listing (CLOUDFRONT scope, must be in us-east-1). Leave empty to use default managed rules only."
  default     = ""
}

variable "storage_waf_ip_set_arn" {
  type        = string
  description = "ARN of an existing WAFv2 IP set to use for storage CloudFront allow-listing (CLOUDFRONT scope, must be in us-east-1). Leave empty to use default managed rules only."
  default     = ""
}

variable "waf_alb_arn" {
  type        = string
  description = "ARN of the Application Load Balancer to associate with the API regional WAF. Leave empty on first apply (before the LB exists); set once the LB is provisioned by EKS Ingress."
  default     = ""
}

variable "enable_cloudtrail_alarms" {
  type        = bool
  description = "Create CloudTrail trail, CloudWatch metric filters, alarms, and SNS notifications. Recommended for production compliance."
  default     = false
}

variable "cloudtrail_alarm_email" {
  type        = string
  description = "Email address to subscribe to the CloudTrail alarms SNS topic. Leave empty to skip email subscription."
  default     = ""
}

variable "eks_public_access_cidrs" {
  type        = list(string)
  description = "CIDR blocks allowed to reach the EKS public API endpoint. Defaults to open — restrict to your IP or VPN CIDR before production use."
  default     = ["0.0.0.0/0"]
}

variable "create_route53_records" {
  type        = bool
  description = "Set to true if the hosted zone for route53_zone_name already exists in Route 53 in this account. Terraform will look it up by name and create DNS records in it."
  default     = false
}

variable "route53_zone_name" {
  type        = string
  description = <<-EOT
    Name of the Route 53 hosted zone to use for DNS records and cert validation.
    Defaults to the root domain derived from app_domain (last two segments, e.g. "example.com").
    Override when your hosted zone is a subdomain, e.g. "staging.example.com".
  EOT
  default     = ""
}

variable "create_route53_zone" {
  type        = bool
  description = "Create the Route 53 hosted zone for route53_zone_name. Use this for new deployments where the zone does not yet exist. Set parent_route53_zone_id to auto-add the NS delegation record."
  default     = false
}

variable "parent_route53_zone_id" {
  type        = string
  description = "Zone ID of the parent Route 53 hosted zone to add the NS delegation record in (only used when create_route53_zone = true). Leave empty to skip automatic NS delegation and add the records manually."
  default     = ""
}

# ── Deployment invariant checks ───────────────────────────────────────────────

check "storage_cdn_signing_key" {
  assert {
    condition     = var.storage_domain == "" || var.signing_key_id != ""
    error_message = "signing_key_id is required when storage_domain is set. Generate an RSA key pair, upload the public key to CloudFront, and supply the resulting key ID."
  }
}

check "eks_public_access_prod" {
  assert {
    condition     = var.environment != "prod" || !contains(var.eks_public_access_cidrs, "0.0.0.0/0")
    error_message = "eks_public_access_cidrs must not include 0.0.0.0/0 in production. Restrict to your VPN or office CIDR (e.g. [\"203.0.113.0/32\"])."
  }
}

check "rds_multi_az_prod" {
  assert {
    condition     = var.environment != "prod" || var.rds_instances >= 2
    error_message = "Production Aurora requires at least 2 instances (writer + reader) for high availability."
  }
}

variable "storage_cdn_cors_extra_origins" {
  type        = list(string)
  description = "Additional CORS allowed origins for the storage CDN CloudFront distribution, alongside the app domain. Useful for integrating external tools that access stored binaries (e.g. CCDA viewers)."
  default     = ["https://ccda.medplum.com"]
}

variable "waf_logging_enabled" {
  type        = bool
  description = "When true and WAF is enabled, create CloudWatch log groups and WAF logging configuration for app, storage, and API web ACLs."
  default     = false
}

variable "redis_purpose_clusters" {
  type = map(object({
    node_type          = optional(string, "cache.t3.micro")
    engine_version     = optional(string, "7.1")
    num_cache_clusters = optional(number, 1)
  }))
  default     = {}
  description = <<-EOT
    Optional purpose-specific Redis clusters keyed by purpose name.
    Valid keys: cache, rate_limit, pub_sub, background_jobs.
    Each key maps to a CDK-parity SSM parameter: CacheRedisSecrets, RateLimitRedisSecrets, etc.
  EOT

  validation {
    condition     = alltrue([for k in keys(var.redis_purpose_clusters) : contains(["cache", "rate_limit", "pub_sub", "background_jobs"], k)])
    error_message = "Valid redis_purpose_clusters keys: cache, rate_limit, pub_sub, background_jobs."
  }
}

variable "rds_proxy_enabled" {
  type        = bool
  default     = false
  description = "Create an RDS Proxy in front of the Aurora cluster for connection pooling."
}

variable "workers_config" {
  type        = string
  default     = ""
  description = <<-EOT
    JSON-encoded Medplum background workers configuration.
    Serialized directly to the /workers SSM parameter — matches CDK's JSON.stringify(config.workers).
    Leave empty to omit the parameter entirely.
    Example: '{"enabled":["BulkExport","Reindex"]}'
  EOT
}

variable "rds_performance_insights_enabled" {
  type        = bool
  default     = true
  description = "Enable RDS Performance Insights on all Aurora instances. Matches CDK enablePerformanceInsights = true."
}

variable "rds_ca_cert_identifier" {
  type        = string
  default     = "rds-ca-rsa2048-g1"
  description = "CA certificate to use for all Aurora instances. Matches CDK CaCertificate.RDS_CA_RSA2048_G1."
}

variable "rds_cluster_parameters" {
  type = map(string)
  default = {
    statement_timeout             = "60000"
    default_transaction_isolation = "REPEATABLE READ"
  }
  description = <<-EOT
    Aurora PostgreSQL cluster parameters applied to a managed parameter group.
    Defaults match CDK's hardcoded values in backend.ts.
    Set to {} to disable the custom parameter group entirely.
  EOT
}

variable "app_api_proxy" {
  type        = bool
  default     = false
  description = <<-EOT
    Add a /api/* CloudFront behavior that proxies to api_domain.
    Mirrors CDK appApiProxy config. Uses a custom cache policy that forwards all
    cookies, all query strings, and a specific set of headers (Authorization,
    Content-Type, Origin, etc.) to the origin.
  EOT
}

variable "app_logging_bucket" {
  type        = string
  default     = ""
  description = "Existing S3 bucket name for app CloudFront access logs. Leave empty to disable."
}

variable "app_logging_prefix" {
  type        = string
  default     = ""
  description = "Key prefix for app CloudFront access log objects."
}

variable "storage_logging_bucket" {
  type        = string
  default     = ""
  description = "Existing S3 bucket name for storage CloudFront access logs. Leave empty to disable."
}

variable "storage_logging_prefix" {
  type        = string
  default     = ""
  description = "Key prefix for storage CloudFront access log objects."
}

variable "clamscan_enabled" {
  type        = bool
  default     = false
  description = <<-EOT
    Enable ClamAV serverless virus scanning on uploaded binaries.
    Requires storage_domain to be set (scans aws_s3_bucket.storage).
    Requires clamscan_lambda_image_uri to be set.
  EOT
}

variable "clamscan_lambda_image_uri" {
  type        = string
  default     = ""
  description = <<-EOT
    Container image URI for the ClamAV scanning Lambda.
    Required when clamscan_enabled = true.
    The image must implement: read S3 object → scan with ClamAV → tag object with
    scan-status=CLEAN or scan-status=INFECTED. Virus definitions are stored on the
    EFS mount at /mnt/lambda/defs.
    Build from: https://github.com/awslabs/cdk-serverless-clamscan (Dockerfile in that repo).
  EOT
}

check "clamscan_image_uri_required" {
  assert {
    condition     = !var.clamscan_enabled || var.clamscan_lambda_image_uri != ""
    error_message = "clamscan_lambda_image_uri is required when clamscan_enabled = true."
  }
}

variable "redis_multi_az_enabled" {
  type        = bool
  default     = true
  description = <<-EOT
    Enable automatic failover (multi-AZ) on all Redis replication groups.
    CDK always sets multiAzEnabled = true regardless of environment.
    When true, redis_num_cache_nodes and each purpose cluster's num_cache_clusters must be >= 2.
  EOT
}

variable "secrets_recovery_window_in_days" {
  type        = number
  default     = 30
  description = <<-EOT
    Recovery window (in days) for Secrets Manager secrets on deletion.
    CDK uses RemovalPolicy.RETAIN (secrets are never deleted). Setting to 30
    mirrors that protective intent — secrets enter a 30-day recovery window
    rather than being hard-deleted immediately (recovery_window_in_days = 0).
    Set to 0 only in non-production environments where fast re-deployment is needed.
  EOT
}

variable "rds_auto_minor_version_upgrade" {
  type        = bool
  default     = true
  description = <<-EOT
    Enable automatic minor version upgrades for all Aurora instances.
    Matches CDK's rdsAutoMinorVersionUpgrade config field (default true).
    Upgrades are applied during the configured maintenance window.
  EOT
}
