output "cluster_endpoint" {
  description = "EKS cluster endpoint"
  value       = module.eks.cluster_endpoint
}

output "cluster_name" {
  description = "EKS cluster name"
  value       = module.eks.cluster_name
}

output "cluster_id" {
  description = "EKS cluster name"
  value       = module.eks.cluster_name
}

output "region" {
  description = "AWS region where resources are deployed"
  value       = var.region
}

output "oidc_issuer_url" {
  description = "OIDC provider ARN for workload identity"
  value       = module.eks.oidc_provider_arn
}

output "db_endpoint" {
  description = "RDS endpoint"
  value       = module.rds.db_instance_endpoint
}

output "db_port" {
  description = "RDS port"
  value       = 5432
}

output "db_name" {
  description = "RDS database name"
  value       = module.rds.db_instance_name
}

output "db_username" {
  description = "RDS admin username"
  value       = module.rds.db_instance_username
  sensitive   = true
}

output "db_password" {
  description = "RDS master user secret ARN (managed by AWS Secrets Manager)"
  value       = module.rds.db_instance_master_user_secret_arn
  sensitive   = true
}

output "redis_endpoint" {
  description = "ElastiCache primary endpoint"
  value       = aws_elasticache_replication_group.medplum.primary_endpoint_address
}

output "redis_port" {
  description = "ElastiCache port"
  value       = aws_elasticache_replication_group.medplum.port
}

output "redis_auth_token" {
  description = "ElastiCache auth token"
  value       = random_password.redis_auth.result
  sensitive   = true
}

output "app_storage_name" {
  description = "S3 app bucket name"
  value       = aws_s3_bucket.app.id
}

output "api_domain" {
  description = "API server domain name"
  value       = var.api_domain
}

output "static_storage_name" {
  description = "S3 static website bucket name (deploy frontend build artifacts here)"
  value       = aws_s3_bucket.static.id
}

output "static_storage_url" {
  description = "S3 static bucket regional domain"
  value       = aws_s3_bucket.static.bucket_regional_domain_name
}

output "cdn_endpoint" {
  description = "CloudFront distribution domain"
  value       = aws_cloudfront_distribution.medplum.domain_name
}

output "cdn_hostname" {
  description = "CloudFront custom domain"
  value       = var.app_domain
}

output "ssm_config_path" {
  description = "SSM Parameter Store path prefix for Medplum server config"
  value       = local.ssm_prefix
}

output "server_iam_role_arn" {
  description = "IAM role ARN for the Medplum server pod (annotate the Kubernetes ServiceAccount with this ARN)"
  value       = aws_iam_role.server.arn
}

output "ses_domain_verification_token" {
  description = "Add this as a TXT record at _amazonses.<domain> to verify your SES domain"
  value       = aws_ses_domain_identity.medplum.verification_token
  sensitive   = false
}

output "ses_dkim_tokens" {
  description = "Add these as CNAME records in DNS to enable DKIM: <token>._domainkey.<domain> → <token>.dkim.amazonses.com"
  value       = aws_ses_domain_dkim.medplum.dkim_tokens
}

output "alb_certificate_arn" {
  description = "ACM certificate ARN for the ALB"
  value       = var.alb_certificate_arn
}

output "lb_controller_iam_role_arn" {
  description = "IAM role ARN for the AWS Load Balancer Controller (annotate the kube-system ServiceAccount)"
  value       = aws_iam_role.lb_controller.arn
}
