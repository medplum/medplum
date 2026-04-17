output "url" {
  description = "Public URL of the hosted test-harness."
  value       = "https://${local.domain_name}"
}

output "alb_dns_name" {
  description = "ALB DNS name (useful for CNAME setup in other zones)."
  value       = aws_lb.main.dns_name
}

output "ecr_repository_url" {
  description = "ECR repository URL for the test-harness image."
  value       = aws_ecr_repository.test_harness.repository_url
}

output "ecs_cluster_name" {
  description = "ECS cluster name (shared with the livekit service)."
  value       = data.terraform_remote_state.livekit.outputs.ecs_cluster_name
}

output "ecs_service_name" {
  description = "ECS service name."
  value       = aws_ecs_service.main.name
}

output "cloudwatch_log_group" {
  description = "CloudWatch log group for container logs."
  value       = aws_cloudwatch_log_group.main.name
}

output "aws_region" {
  description = "AWS region (used by the Makefile)."
  value       = var.aws_region
}

output "vpc_id" {
  description = "Shared VPC ID (provisioned by the livekit module)."
  value       = local.vpc_id
}
