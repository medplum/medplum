# ─── ClamAV Serverless Scanning ──────────────────────────────────────────────
# Mirrors CDK's optional ServerlessClamscan construct in storage.ts.
# Requires: storage_domain set, clamscan_lambda_image_uri provided.

resource "aws_security_group" "clamav_efs" {
  count       = var.clamscan_enabled && local.storage_cdn_enabled ? 1 : 0
  name        = "${local.name_prefix}-clamav-efs-sg"
  description = "Security group for ClamAV EFS definitions store"
  vpc_id      = module.vpc.vpc_id
  tags        = var.tags
}

resource "aws_security_group" "clamav_lambda" {
  count       = var.clamscan_enabled && local.storage_cdn_enabled ? 1 : 0
  name        = "${local.name_prefix}-clamav-lambda-sg"
  description = "Security group for ClamAV scanning Lambda"
  vpc_id      = module.vpc.vpc_id
  tags        = var.tags
}

resource "aws_security_group_rule" "clamav_efs_ingress_nfs" {
  count                    = var.clamscan_enabled && local.storage_cdn_enabled ? 1 : 0
  type                     = "ingress"
  from_port                = 2049
  to_port                  = 2049
  protocol                 = "tcp"
  security_group_id        = aws_security_group.clamav_efs[0].id
  source_security_group_id = aws_security_group.clamav_lambda[0].id
  description              = "NFS from ClamAV Lambda"
}

resource "aws_security_group_rule" "clamav_lambda_egress_efs" {
  count                    = var.clamscan_enabled && local.storage_cdn_enabled ? 1 : 0
  type                     = "egress"
  from_port                = 2049
  to_port                  = 2049
  protocol                 = "tcp"
  security_group_id        = aws_security_group.clamav_lambda[0].id
  source_security_group_id = aws_security_group.clamav_efs[0].id
  description              = "EFS mount for ClamAV definitions"
}

resource "aws_security_group_rule" "clamav_lambda_egress_https" {
  count             = var.clamscan_enabled && local.storage_cdn_enabled ? 1 : 0
  type              = "egress"
  from_port         = 443
  to_port           = 443
  protocol          = "tcp"
  security_group_id = aws_security_group.clamav_lambda[0].id
  cidr_blocks       = ["0.0.0.0/0"]
  description       = "HTTPS for S3 access and definition updates"
}

resource "aws_efs_file_system" "clamav" {
  count          = var.clamscan_enabled && local.storage_cdn_enabled ? 1 : 0
  creation_token = "${local.name_prefix}-clamav-defs"
  encrypted      = true
  kms_key_id     = aws_kms_key.medplum.arn
  tags           = merge(var.tags, { Name = "${local.name_prefix}-clamav-defs" })
}

resource "aws_efs_access_point" "clamav" {
  count          = var.clamscan_enabled && local.storage_cdn_enabled ? 1 : 0
  file_system_id = aws_efs_file_system.clamav[0].id

  posix_user {
    uid = 0
    gid = 0
  }

  root_directory {
    path = "/lambda"
    creation_info {
      owner_uid   = 0
      owner_gid   = 0
      permissions = "755"
    }
  }

  tags = var.tags
}

# One EFS mount target per private subnet
resource "aws_efs_mount_target" "clamav" {
  for_each = var.clamscan_enabled && local.storage_cdn_enabled ? toset(module.vpc.private_subnets) : toset([])

  file_system_id  = aws_efs_file_system.clamav[0].id
  subnet_id       = each.value
  security_groups = [aws_security_group.clamav_efs[0].id]
}

resource "aws_cloudwatch_log_group" "clamav_lambda" {
  count             = var.clamscan_enabled && local.storage_cdn_enabled ? 1 : 0
  name              = "/aws/lambda/${local.name_prefix}-clamav"
  retention_in_days = var.environment == "prod" ? 90 : 14
  kms_key_id        = aws_kms_key.medplum.arn
  tags              = var.tags
}

resource "aws_lambda_function" "clamav" {
  count         = var.clamscan_enabled && local.storage_cdn_enabled ? 1 : 0
  function_name = "${local.name_prefix}-clamav"
  role          = aws_iam_role.clamav_lambda[0].arn
  package_type  = "Image"
  image_uri     = var.clamscan_lambda_image_uri
  timeout       = 300
  memory_size   = 1024

  vpc_config {
    subnet_ids         = module.vpc.private_subnets
    security_group_ids = [aws_security_group.clamav_lambda[0].id]
  }

  file_system_config {
    arn              = aws_efs_access_point.clamav[0].arn
    local_mount_path = "/mnt/lambda"
  }

  environment {
    variables = {
      EFS_MOUNT_PATH   = "/mnt/lambda"
      DEFINITIONS_PATH = "/mnt/lambda/defs"
    }
  }

  depends_on = [aws_efs_mount_target.clamav, aws_cloudwatch_log_group.clamav_lambda]

  tags = var.tags
}

resource "aws_lambda_permission" "clamav_s3" {
  count         = var.clamscan_enabled && local.storage_cdn_enabled ? 1 : 0
  statement_id  = "AllowS3Invoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.clamav[0].function_name
  principal     = "s3.amazonaws.com"
  source_arn    = aws_s3_bucket.storage[0].arn
}
