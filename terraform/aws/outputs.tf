output "cluster_endpoint" {
  description = "EKS cluster endpoint"
  value       = module.eks.cluster_endpoint
}

output "cluster_name" {
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

output "oidc_issuer_url_raw" {
  description = "OIDC provider URL without https:// — useful for debugging IRSA trust relationships"
  value       = module.eks.oidc_provider
}

output "db_endpoint" {
  description = "Aurora cluster writer endpoint"
  value       = module.aurora.cluster_endpoint
}

output "db_port" {
  description = "Aurora cluster port"
  value       = module.aurora.cluster_port
}

output "db_name" {
  description = "Aurora database name"
  value       = module.aurora.cluster_database_name
}

output "db_username" {
  description = "Aurora master username"
  value       = module.aurora.cluster_master_username
  sensitive   = true
}

output "db_password" {
  description = "Aurora master user secret ARN (managed by AWS Secrets Manager)"
  value       = module.aurora.cluster_master_user_secret[0].secret_arn
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
  description = "ACM certificate ARN for the ALB (provided override or TF-created)"
  value       = local.effective_alb_cert_arn
}

output "helm_ingress_hostname_command" {
  description = "Run this after `helm install` to get the LB Controller-assigned ALB hostname, then set helm_api_alb_hostname in terraform.tfvars and re-run `terraform apply`"
  value       = "kubectl get ingress -n medplum medplum -o jsonpath='{.status.loadBalancer.ingress[0].hostname}'"
}

output "route53_zone_id" {
  description = "Route 53 hosted zone ID (set when create_route53_zone or create_route53_records is true)"
  value       = local.effective_zone_id
}

output "route53_nameservers" {
  description = "NS records for the managed zone — add these at your registrar or parent DNS provider when create_route53_zone = true and parent_route53_zone_id is not set"
  value       = var.create_route53_zone ? aws_route53_zone.managed[0].name_servers : null
}

output "lb_controller_iam_role_arn" {
  description = "IAM role ARN for the AWS Load Balancer Controller (annotate the kube-system ServiceAccount)"
  value       = aws_iam_role.lb_controller.arn
}

output "bot_lambda_role_arn" {
  description = "IAM role ARN for Medplum bot Lambda functions"
  value       = aws_iam_role.bot_lambda.arn
}

output "storage_bucket_name" {
  description = "S3 binary storage bucket name (only set when storage CDN is enabled)"
  value       = local.storage_cdn_enabled ? aws_s3_bucket.storage[0].id : null
}

output "storage_cdn_endpoint" {
  description = "Storage CloudFront distribution domain (only set when storage CDN is enabled)"
  value       = local.storage_cdn_enabled ? aws_cloudfront_distribution.storage[0].domain_name : null
}

output "storage_cdn_hostname" {
  description = "Storage CloudFront custom domain (only set when storage CDN is enabled)"
  value       = local.storage_cdn_enabled ? var.storage_domain : null
}

output "app_waf_arn" {
  description = "ARN of the CloudFront WAF Web ACL for the app distribution (us-east-1)"
  value       = var.enable_waf ? aws_wafv2_web_acl.app[0].arn : null
}

output "api_waf_arn" {
  description = "ARN of the regional WAF Web ACL for the API ALB"
  value       = var.enable_waf ? aws_wafv2_web_acl.api[0].arn : null
}

output "storage_waf_arn" {
  description = "ARN of the CloudFront WAF Web ACL for the storage distribution (us-east-1; only set when storage CDN is enabled)"
  value       = var.enable_waf && local.storage_cdn_enabled ? aws_wafv2_web_acl.storage[0].arn : null
}

output "cloudtrail_sns_topic_arn" {
  description = "ARN of the SNS topic for CloudTrail alarms (only set when enable_cloudtrail_alarms = true)"
  value       = var.enable_cloudtrail_alarms ? aws_sns_topic.cloudtrail_alarms[0].arn : null
}

output "redis_purpose_endpoints" {
  description = "Primary endpoint addresses for purpose-specific Redis clusters"
  value = {
    for k, _ in var.redis_purpose_clusters :
    k => aws_elasticache_replication_group.purpose[k].primary_endpoint_address
  }
}

output "redis_purpose_secret_arns" {
  description = "Secrets Manager ARNs for purpose-specific Redis clusters"
  value = {
    for k, _ in var.redis_purpose_clusters :
    k => aws_secretsmanager_secret.redis_purpose[k].arn
  }
}

output "rds_proxy_endpoint" {
  description = "RDS Proxy endpoint (null when rds_proxy_enabled = false)"
  value       = var.rds_proxy_enabled ? aws_db_proxy.medplum[0].endpoint : null
}
