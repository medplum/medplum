locals {
  name_prefix = "medplum-${var.environment}-${var.deployment_id}"
  ssm_prefix  = "/${local.name_prefix}"

  # ses_domain: extracts the root domain from app_domain (last 2 segments)
  ses_domain = join(".", slice(split(".", var.app_domain), length(split(".", var.app_domain)) - 2, length(split(".", var.app_domain))))

  # Effective bot Lambda role ARN: use var.bot_lambda_role_arn as an override if provided.
  effective_bot_lambda_role_arn = var.bot_lambda_role_arn != "" ? var.bot_lambda_role_arn : aws_iam_role.bot_lambda.arn

  # ── Route 53 zone ──────────────────────────────────────────────────────────
  # dns_zone_available: true when Terraform has access to a Route 53 hosted zone
  # (either one it creates or one it looks up in this account).
  dns_zone_available = var.create_route53_zone || var.create_route53_records

  # effective_zone_id: the zone to use for all DNS record operations.
  effective_zone_id = (
    var.create_route53_zone ? aws_route53_zone.managed[0].zone_id :
    var.create_route53_records ? data.aws_route53_zone.existing[0].zone_id :
    ""
  )

  # ── ACM certificates ───────────────────────────────────────────────────────
  # manage_*: true when no override ARN is provided and we have R53 to validate.
  manage_app_cert     = var.ssl_certificate_arn == "" && local.dns_zone_available
  manage_alb_cert     = var.alb_certificate_arn == "" && local.dns_zone_available
  manage_storage_cert = local.storage_cdn_enabled && var.storage_ssl_certificate_arn == "" && local.dns_zone_available

  # effective_*_cert_arn: provided override wins; otherwise use the TF-created cert.
  effective_app_cert_arn     = local.manage_app_cert ? aws_acm_certificate_validation.app[0].certificate_arn : var.ssl_certificate_arn
  effective_alb_cert_arn     = local.manage_alb_cert ? aws_acm_certificate_validation.alb[0].certificate_arn : var.alb_certificate_arn
  effective_storage_cert_arn = local.manage_storage_cert ? aws_acm_certificate_validation.storage[0].certificate_arn : var.storage_ssl_certificate_arn

  # ── Storage CDN ────────────────────────────────────────────────────────────
  # Enabled when storage_domain is set; cert is either provided or TF-managed.
  storage_cdn_enabled = var.storage_domain != ""

  # Purpose-specific Redis cluster id → Secrets Manager / naming suffix (CDK parity).
  redis_purpose_id_map = {
    cache           = "CacheRedis"
    rate_limit      = "RateLimitRedis"
    pub_sub         = "PubSubRedis"
    background_jobs = "BackgroundJobsRedis"
  }

  # Major version digit extracted from postgres_version (e.g. "16" from "16.8")
  rds_pg_major_version = split(".", var.postgres_version)[0]

  # AURORA_IOPT1 for NVMe-backed instance classes (class token contains "d", e.g. r6gd, r8gd).
  # Mirrors CDK: writerInstanceType.match(/^\w+d\w*\./i) ? AURORA_IOPT1 : AURORA
  rds_storage_type = length(regexall("db\\.[a-z0-9]*d[a-z0-9]*\\.", var.db_instance_tier)) > 0 ? "aurora-iopt1" : "aurora"
}
