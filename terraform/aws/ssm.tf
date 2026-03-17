resource "aws_secretsmanager_secret_version" "redis" {
  secret_id = aws_secretsmanager_secret.medplum.id
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
  name  = "${local.ssm_prefix}/storageBaseUrl"
  type  = "String"
  value = "https://${var.api_domain}/storage/"
  tags  = var.tags
}

resource "aws_ssm_parameter" "support_email" {
  name  = "${local.ssm_prefix}/supportEmail"
  type  = "String"
  value = var.support_email
  tags  = var.tags
}

resource "aws_ssm_parameter" "binary_storage" {
  name  = "${local.ssm_prefix}/binaryStorage"
  type  = "String"
  value = "s3:${aws_s3_bucket.app.id}"
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

# Read the RDS-managed master user secret so the password can be included in db_config
data "aws_secretsmanager_secret_version" "rds_master" {
  secret_id = module.rds.db_instance_master_user_secret_arn
}

resource "aws_secretsmanager_secret_version" "db_config" {
  secret_id = aws_secretsmanager_secret.db_config.id
  secret_string = jsonencode({
    host     = module.rds.db_instance_address
    port     = module.rds.db_instance_port
    dbname   = module.rds.db_instance_name
    username = module.rds.db_instance_username
    password = jsondecode(data.aws_secretsmanager_secret_version.rds_master.secret_string).password
    ssl      = { require = true, rejectUnauthorized = false }
  })
  # ignore_changes preserves externally rotated passwords without Terraform overwriting them
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
  count = var.bot_lambda_role_arn != "" ? 1 : 0
  name  = "${local.ssm_prefix}/botLambdaRoleArn"
  type  = "String"
  value = var.bot_lambda_role_arn
  tags  = var.tags
}

resource "aws_ssm_parameter" "bot_lambda_layer_name" {
  name  = "${local.ssm_prefix}/botLambdaLayerName"
  type  = "String"
  value = "medplum-bot-layer"
  tags  = var.tags
}
