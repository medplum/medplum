# ---------------------------------------------------------------------------
# Primary endpoints
# ---------------------------------------------------------------------------

output "livekit_ws_url" {
  description = "WebSocket URL for LiveKit clients (wss://)."
  value       = "wss://${local.domain_name}"
}

output "livekit_http_url" {
  description = "HTTPS URL for the LiveKit REST/admin API."
  value       = "https://${local.domain_name}"
}

output "nlb_dns_name" {
  description = "NLB DNS name (also the TURN server hostname for direct NLB access)."
  value       = aws_lb.livekit.dns_name
}

# ---------------------------------------------------------------------------
# Medplum bot secrets
# Copy these values into your Medplum project's bot secrets.
# ---------------------------------------------------------------------------

output "medplum_bot_secrets" {
  description = "Key/value pairs to set as Medplum bot secrets for the video bots."
  sensitive   = true
  value = {
    LIVEKIT_API_KEY    = var.livekit_api_key
    LIVEKIT_API_SECRET = var.livekit_api_secret
    LIVEKIT_HOST       = "https://${local.domain_name}"
    LIVEKIT_WS_URL     = "wss://${local.domain_name}"
  }
}

# ---------------------------------------------------------------------------
# Infrastructure references
# ---------------------------------------------------------------------------

output "ecr_repository_url" {
  description = "ECR repository URL for the LiveKit wrapper image."
  value       = aws_ecr_repository.livekit.repository_url
}

output "ecs_cluster_name" {
  description = "ECS cluster name."
  value       = aws_ecs_cluster.main.name
}

output "ecs_service_name" {
  description = "ECS service name."
  value       = aws_ecs_service.livekit.name
}

output "cloudwatch_log_group" {
  description = "CloudWatch log group for LiveKit container logs."
  value       = aws_cloudwatch_log_group.livekit.name
}

output "livekit_keys_ssm_arn" {
  description = "SSM Parameter ARN storing the LiveKit API key:secret (SecureString)."
  sensitive   = true
  value       = aws_ssm_parameter.livekit_keys.arn
}

output "vpc_id" {
  description = "ID of the VPC created for LiveKit."
  value       = aws_vpc.main.id
}

output "public_subnet_ids" {
  description = "IDs of the public subnets in the LiveKit VPC. Other modules (e.g. test-harness) re-use these to avoid creating extra VPCs."
  value       = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  description = "IDs of the private subnets in the LiveKit VPC."
  value       = aws_subnet.private[*].id
}

output "ecs_cluster_arn" {
  description = "ARN of the shared ECS cluster. Other modules can attach services here."
  value       = aws_ecs_cluster.main.arn
}

output "aws_region" {
  description = "AWS region where resources are deployed (used by the Makefile)."
  value       = var.aws_region
}
