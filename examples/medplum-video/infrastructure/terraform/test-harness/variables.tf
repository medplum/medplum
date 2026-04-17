# ---------------------------------------------------------------------------
# AWS / deployment
# ---------------------------------------------------------------------------

variable "aws_region" {
  description = "AWS region to deploy the test-harness into."
  type        = string
  default     = "us-east-1"
}

variable "aws_profile" {
  description = "AWS CLI named profile. Leave empty to fall back to the default credential chain."
  type        = string
  default     = ""
}

variable "environment" {
  description = "Deployment environment label (e.g. dev, staging, prod). Used in resource names and SSM paths."
  type        = string
  default     = "dev"
}

# ---------------------------------------------------------------------------
# DNS
# ---------------------------------------------------------------------------

variable "route53_zone_id" {
  description = "Route53 Hosted Zone ID that owns the domain."
  type        = string
}

variable "domain_prefix" {
  description = "Subdomain prefix. Combined with the zone's domain to produce the full hostname (e.g. 'tele' -> tele.medplum.dev)."
  type        = string
  default     = "tele"
}

# ---------------------------------------------------------------------------
# Container image
# ---------------------------------------------------------------------------

variable "image" {
  description = <<-EOT
    Docker image URI for the test-harness. Leave empty to use the ECR repository
    created by this module (requires a prior image push - see the Makefile).
  EOT
  type        = string
  default     = ""
}

variable "image_tag" {
  description = "Image tag to deploy."
  type        = string
  default     = "latest"
}

# ---------------------------------------------------------------------------
# ECS compute
# ---------------------------------------------------------------------------

variable "ecs_cpu" {
  description = "Fargate CPU units (256 | 512 | 1024). 256 is plenty for an nginx SPA."
  type        = number
  default     = 256
}

variable "ecs_memory" {
  description = "Fargate memory (MiB)."
  type        = number
  default     = 512
}

variable "ecs_desired_count" {
  description = "Number of tasks to run."
  type        = number
  default     = 1
}

variable "ecs_log_retention_days" {
  description = "CloudWatch log retention in days."
  type        = number
  default     = 14
}

# ---------------------------------------------------------------------------
# Networking
#
# The test-harness re-uses the VPC and public subnets provisioned by the
# livekit module (see data.terraform_remote_state.livekit in main.tf).
# No VPC-sizing variables are needed here.
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Runtime config -> injected into the test-harness via ECS task env vars
# and rendered into /config.js at container startup.  See entrypoint.sh.
# ---------------------------------------------------------------------------

variable "medplum_base_url" {
  description = "Medplum server URL the hosted test-harness talks to (trailing slash)."
  type        = string
  default     = "https://api.staging.medplum.dev/"
}

variable "medplum_client_id" {
  description = "Medplum client credentials ID used for patient auto-auth on the shareable patient link."
  type        = string
  sensitive   = true
}

variable "medplum_client_secret" {
  description = "Medplum client credentials secret. Reaches the browser (baked into /config.js) - rotate frequently."
  type        = string
  sensitive   = true
}

variable "generate_token_bot_id" {
  description = "Deployed generate-token bot ID on the target Medplum project."
  type        = string
}

variable "admit_patient_bot_id" {
  description = "Deployed admit-patient bot ID on the target Medplum project."
  type        = string
}

variable "start_adhoc_visit_bot_id" {
  description = "Deployed start-adhoc-visit bot ID on the target Medplum project."
  type        = string
}

variable "default_patient_id" {
  description = "Optional seed for the Patient dropdown. Leave empty for no default."
  type        = string
  default     = ""
}

variable "default_practitioner_id" {
  description = "Optional seed for the Practitioner dropdown."
  type        = string
  default     = ""
}

variable "environment_label" {
  description = "Human-readable environment label shown in the UI header."
  type        = string
  default     = "staging"
}
