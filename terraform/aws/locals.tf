locals {
  name_prefix = "medplum-${var.environment}-${var.deployment_id}"
  ssm_prefix  = "/${local.name_prefix}"

  # ses_domain: extracts the root domain from app_domain (last 2 segments)
  ses_domain = join(".", slice(split(".", var.app_domain), length(split(".", var.app_domain)) - 2, length(split(".", var.app_domain))))

  # Effective bot Lambda role ARN: use var.bot_lambda_role_arn as an override if provided.
  effective_bot_lambda_role_arn = var.bot_lambda_role_arn != "" ? var.bot_lambda_role_arn : aws_iam_role.bot_lambda.arn

  # ── Storage CDN ────────────────────────────────────────────────────────────
  # Enabled when storage_domain is set; cert must be provided via storage_ssl_certificate_arn.
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
