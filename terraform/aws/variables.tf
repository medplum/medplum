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

variable "ssl_certificate_arn" {
  type        = string
  description = "ACM certificate ARN for CloudFront (must be in us-east-1)"
  default     = null
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
  description = "Number of cache nodes for ElastiCache"
  default     = 1
}

variable "eks_public_access_cidrs" {
  type        = list(string)
  description = "CIDR blocks allowed to reach the EKS public API endpoint. Defaults to open — restrict to your IP or VPN CIDR before production use."
  default     = ["0.0.0.0/0"]
}
