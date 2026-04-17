# ---------------------------------------------------------------------------
# AWS / deployment
# ---------------------------------------------------------------------------

variable "aws_region" {
  description = "AWS region to deploy LiveKit resources into."
  type        = string
  default     = "us-east-1"
}

variable "aws_profile" {
  description = <<-EOT
    AWS CLI named profile to use for authentication. Leave empty to fall back
    to the default credential chain (env vars, instance profile, etc.).
    Equivalent to setting AWS_PROFILE in your shell; prefer the Makefile's
    PROFILE=<name> param which sets both the env var and this variable.
  EOT
  type        = string
  default     = ""
}

variable "environment" {
  description = "Deployment environment label (e.g. production, staging). Used in resource names and SSM parameter paths."
  type        = string
  default     = "production"
}

# ---------------------------------------------------------------------------
# DNS
# ---------------------------------------------------------------------------

variable "route53_zone_id" {
  description = "Route53 Hosted Zone ID that owns the domain. The ACM certificate and A record will be created inside this zone."
  type        = string
}

variable "domain_prefix" {
  description = "Subdomain prefix for the LiveKit server. Combined with the zone's domain to produce the full hostname (e.g. 'livekit' → livekit.medplum.dev)."
  type        = string
  default     = "livekit"
}

# ---------------------------------------------------------------------------
# LiveKit credentials  (sensitive – pass via tfvars file or env vars,
#                       never commit plain-text values)
# ---------------------------------------------------------------------------

variable "livekit_api_key" {
  description = "LiveKit API key. Generate a random value: openssl rand -hex 12"
  type        = string
  sensitive   = true
}

variable "livekit_api_secret" {
  description = "LiveKit API secret. Generate a random value: openssl rand -hex 32"
  type        = string
  sensitive   = true
}

# ---------------------------------------------------------------------------
# Container image
# ---------------------------------------------------------------------------

variable "livekit_image" {
  description = <<-EOT
    Docker image URI for the LiveKit wrapper. Leave empty to use the ECR
    repository created by this module (requires a prior image push – see the
    Makefile). Supply a fully-qualified URI to use a pre-existing image.
  EOT
  type        = string
  default     = ""
}

variable "livekit_image_tag" {
  description = "Image tag to deploy."
  type        = string
  default     = "latest"
}

# ---------------------------------------------------------------------------
# ECS compute
# ---------------------------------------------------------------------------

variable "ecs_cpu" {
  description = "Fargate CPU units (256 | 512 | 1024 | 2048 | 4096). 1024 = 1 vCPU."
  type        = number
  default     = 1024
}

variable "ecs_memory" {
  description = "Fargate memory in MiB. Must be compatible with the chosen cpu value."
  type        = number
  default     = 2048
}

variable "ecs_desired_count" {
  description = "Number of LiveKit tasks to run. Keep at 1 unless you have added a Redis cluster for multi-node coordination."
  type        = number
  default     = 1
}

variable "ecs_log_retention_days" {
  description = "CloudWatch log group retention in days."
  type        = number
  default     = 30
}

# ---------------------------------------------------------------------------
# Networking
# ---------------------------------------------------------------------------

variable "vpc_cidr" {
  description = "IPv4 CIDR block for the dedicated VPC."
  type        = string
  default     = "10.10.0.0/16"
}

variable "availability_zone_count" {
  description = "Number of AZs to span for subnets and NLB nodes (2 or 3)."
  type        = number
  default     = 2

  validation {
    condition     = var.availability_zone_count >= 2 && var.availability_zone_count <= 3
    error_message = "availability_zone_count must be 2 or 3."
  }
}

variable "nat_gateway_enabled" {
  description = <<-EOT
    When true (default), ECS tasks run in private subnets behind a NAT Gateway.
    Set to false for dev/sandbox environments where the EIP quota is exhausted
    or a NAT Gateway is unnecessary: tasks are placed in public subnets with
    assign_public_ip = true and VPC endpoints are skipped.
  EOT
  type        = bool
  default     = true
}
