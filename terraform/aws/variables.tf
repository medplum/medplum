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
  description = "ACM certificate ARN for CloudFront (must be in us-east-1)"
}

variable "alb_certificate_arn" {
  type        = string
  description = "ACM certificate ARN for the ALB (must be in the deployment region and cover api_domain). If deploying to us-east-1 and the CloudFront cert covers both domains, you can reuse ssl_certificate_arn."
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
  description = "PostgreSQL version"
  default     = "15"
}

variable "db_instance_tier" {
  type        = string
  description = "RDS instance type (e.g., db.t3.medium)"
  default     = "db.t3.medium"
}

variable "db_storage_gb" {
  type        = number
  description = "RDS allocated storage in GB"
  default     = 32
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
  description = "IAM role ARN for the Medplum bot Lambda function. Leave empty to skip; set after the bot Lambda is deployed."
  default     = ""
}

variable "eks_public_access_cidrs" {
  type        = list(string)
  description = "CIDR blocks allowed to reach the EKS public API endpoint. Defaults to open — restrict to your IP or VPN CIDR before production use."
  default     = ["0.0.0.0/0"]
}

variable "create_route53_records" {
  type        = bool
  description = "Set to true if your domain is hosted in Route 53 in this AWS account. Creates DNS records for CloudFront and SES verification."
  default     = false
}

variable "route53_zone_name" {
  type        = string
  description = <<-EOT
    Name of the Route 53 hosted zone to create DNS records in (only used when create_route53_records = true).
    Defaults to the root domain derived from app_domain (last two segments, e.g. "example.com").
    Override this when your hosted zone is a subdomain, e.g. "example-aws.foomedical.dev".
  EOT
  default     = ""
}
