resource "aws_secretsmanager_secret_version" "redis" {
  secret_id = aws_secretsmanager_secret.medplum.id
  # The Medplum server reads this secret and constructs: rediss://:password@host:port
  # Fields: host (primary endpoint), port (6379), password (AUTH token), tls (always true for TLS mode)
  secret_string = jsonencode({
    host     = aws_elasticache_replication_group.medplum.primary_endpoint_address
    port     = aws_elasticache_replication_group.medplum.port
    password = random_password.redis_auth.result
    tls      = true
  })
}

resource "aws_ssm_parameter" "base_url" {
  name  = "${local.ssm_prefix}/baseUrl"
  type  = "String"
  value = "https://${var.api_domain}/"
  tags  = var.tags
}

resource "aws_ssm_parameter" "app_base_url" {
  name  = "${local.ssm_prefix}/appBaseUrl"
  type  = "String"
  value = "https://${var.app_domain}/"
  tags  = var.tags
}

resource "aws_ssm_parameter" "storage_base_url" {
  name = "${local.ssm_prefix}/storageBaseUrl"
  type = "String"
  # When the dedicated storage CDN is enabled, binaries are served from storage_domain/binary/
  # (matching CDK config). Otherwise fall back to routing through the API server.
  value = local.storage_cdn_enabled ? "https://${var.storage_domain}/binary/" : "https://${var.api_domain}/storage/"
  tags  = var.tags
}

resource "aws_ssm_parameter" "signing_key_id" {
  count = var.signing_key_id != "" ? 1 : 0
  name  = "${local.ssm_prefix}/signingKeyId"
  type  = "String"
  value = var.signing_key_id
  tags  = var.tags
}

resource "aws_ssm_parameter" "binary_storage" {
  name = "${local.ssm_prefix}/binaryStorage"
  type = "String"
  # When storage CDN is enabled, the server writes binaries to the dedicated storage bucket
  value = local.storage_cdn_enabled ? "s3:${aws_s3_bucket.storage[0].id}" : "s3:${aws_s3_bucket.app.id}"
  tags  = var.tags
}

resource "aws_ssm_parameter" "support_email" {
  name  = "${local.ssm_prefix}/supportEmail"
  type  = "String"
  value = var.support_email
  tags  = var.tags
}

resource "aws_ssm_parameter" "aws_region" {
  name  = "${local.ssm_prefix}/awsRegion"
  type  = "String"
  value = var.region
  tags  = var.tags
}

resource "aws_ssm_parameter" "max_json_size" {
  name  = "${local.ssm_prefix}/maxJsonSize"
  type  = "String"
  value = "1mb"
  tags  = var.tags
}

resource "aws_ssm_parameter" "max_batch_size" {
  name  = "${local.ssm_prefix}/maxBatchSize"
  type  = "String"
  value = "50mb"
  tags  = var.tags
}

resource "aws_secretsmanager_secret" "db_config" {
  name                    = "${local.name_prefix}/db-config"
  kms_key_id              = aws_kms_key.medplum.arn
  recovery_window_in_days = 0
  tags                    = var.tags
}

# Read the Aurora-managed master user secret so the password can be included in db_config
data "aws_secretsmanager_secret_version" "rds_master" {
  secret_id = module.aurora.cluster_master_user_secret[0].secret_arn
}

resource "aws_secretsmanager_secret_version" "db_config" {
  secret_id = aws_secretsmanager_secret.db_config.id
  secret_string = jsonencode({
    host     = module.aurora.cluster_endpoint
    port     = module.aurora.cluster_port
    dbname   = module.aurora.cluster_database_name
    username = module.aurora.cluster_master_username
    password = jsondecode(data.aws_secretsmanager_secret_version.rds_master.secret_string).password
    ssl      = { require = true, rejectUnauthorized = var.rds_ssl_reject_unauthorized }
  })
  # ignore_changes preserves externally rotated passwords (e.g. via Secrets Manager rotation)
  # without Terraform overwriting them on the next apply.
  #
  # IMPORTANT: HCL does not support ignoring a sub-field of secret_string, so the entire JSON blob
  # is ignored. Terraform will NOT detect if host, port, or dbname change (e.g. blue/green
  # deployment, Aurora failover, region migration). If you modify Aurora connection details you
  # MUST manually update this secret:
  #   aws secretsmanager put-secret-value \
  #     --secret-id $(terraform output -raw db_config_secret_arn) \
  #     --secret-string '{"host":"<new-endpoint>","port":5432,"dbname":"medplum",...}'
  lifecycle {
    ignore_changes = [secret_string]
  }
}

resource "aws_ssm_parameter" "database_secrets" {
  name   = "${local.ssm_prefix}/DatabaseSecrets"
  type   = "SecureString"
  key_id = aws_kms_key.medplum.arn
  value  = aws_secretsmanager_secret.db_config.arn
  tags   = var.tags
}

resource "aws_ssm_parameter" "redis_secrets" {
  name   = "${local.ssm_prefix}/RedisSecrets"
  type   = "SecureString"
  key_id = aws_kms_key.medplum.arn
  value  = aws_secretsmanager_secret.medplum.arn
  tags   = var.tags
}

resource "aws_ssm_parameter" "bot_lambda_role_arn" {
  name  = "${local.ssm_prefix}/botLambdaRoleArn"
  type  = "String"
  value = local.effective_bot_lambda_role_arn
  tags  = var.tags
}

resource "aws_ssm_parameter" "bot_lambda_layer_name" {
  name  = "${local.ssm_prefix}/botLambdaLayerName"
  type  = "String"
  value = "medplum-bot-layer"
  tags  = var.tags
}

resource "aws_ssm_parameter" "redis_purpose_secrets" {
  for_each = var.redis_purpose_clusters
  name     = "${local.ssm_prefix}/${local.redis_purpose_id_map[each.key]}Secrets"
  type     = "SecureString"
  key_id   = aws_kms_key.medplum.arn
  value    = aws_secretsmanager_secret.redis_purpose[each.key].arn
  tags     = var.tags
}

resource "aws_ssm_parameter" "database_proxy_endpoint" {
  count = var.rds_proxy_enabled ? 1 : 0
  name  = "${local.ssm_prefix}/databaseProxyEndpoint"
  type  = "String"
  value = aws_db_proxy.medplum[0].endpoint
  tags  = var.tags
}
