resource "aws_db_subnet_group" "medplum" {
  name       = "${local.name_prefix}-db-sng"
  subnet_ids = module.vpc.database_subnets
  tags       = var.tags
}

resource "aws_security_group" "database" {
  name        = "${local.name_prefix}-db-sg"
  description = "Security group for Aurora cluster"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.eks_nodes.id]
  }

  # When RDS Proxy is enabled, allow the proxy SG to reach Aurora via an inline dynamic ingress
  # block only — standalone aws_security_group_rule on this SG would mix with inline rules and
  # cause perpetual Terraform drift.
  dynamic "ingress" {
    for_each = var.rds_proxy_enabled ? [1] : []
    content {
      from_port       = 5432
      to_port         = 5432
      protocol        = "tcp"
      security_groups = [aws_security_group.rds_proxy[0].id]
      description     = "Allow RDS Proxy to connect to Aurora"
    }
  }

  # Aurora only needs outbound HTTPS to call AWS APIs (KMS, Secrets Manager) within the VPC.
  # All replication traffic stays within the cluster and does not require broad egress.
  egress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [var.cidr_block]
    description = "HTTPS to VPC for AWS API calls (KMS, Secrets Manager)"
  }

  tags = var.tags
}

module "aurora" {
  source  = "terraform-aws-modules/rds-aurora/aws"
  version = "~> 9.0"

  name            = "${local.name_prefix}-aurora"
  engine          = "aurora-postgresql"
  engine_version  = var.postgres_version
  master_username = "clusteradmin"
  database_name   = "medplum"

  manage_master_user_password = true

  storage_encrypted = true
  kms_key_id        = aws_kms_key.medplum.arn

  vpc_id                 = module.vpc.vpc_id
  db_subnet_group_name   = aws_db_subnet_group.medplum.name
  vpc_security_group_ids = [aws_security_group.database.id]

  # Instances: 1 writer by default; add readers by increasing var.rds_instances
  instances = { for idx in range(var.rds_instances) : tostring(idx + 1) => {
    instance_class      = var.db_instance_tier
    publicly_accessible = false
  } }

  backup_retention_period = var.environment == "prod" ? 30 : 7
  skip_final_snapshot     = var.environment != "prod"
  deletion_protection     = var.environment == "prod"

  cloudwatch_log_group_retention_in_days = var.environment == "prod" ? 30 : 7
  enabled_cloudwatch_logs_exports        = ["postgresql"]

  tags = var.tags
}

# ─── RDS Proxy (optional) ────────────────────────────────────────────────────

resource "aws_iam_role" "rds_proxy" {
  count = var.rds_proxy_enabled ? 1 : 0
  name  = "${local.name_prefix}-rds-proxy-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "rds.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = var.tags
}

resource "aws_iam_role_policy" "rds_proxy" {
  count = var.rds_proxy_enabled ? 1 : 0
  name  = "${local.name_prefix}-rds-proxy-policy"
  role  = aws_iam_role.rds_proxy[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = [module.aurora.cluster_master_user_secret[0].secret_arn]
      },
      {
        Effect   = "Allow"
        Action   = ["kms:Decrypt"]
        Resource = [aws_kms_key.medplum.arn]
        Condition = {
          StringEquals = { "kms:ViaService" = "secretsmanager.${var.region}.amazonaws.com" }
        }
      }
    ]
  })
}

resource "aws_security_group" "rds_proxy" {
  count       = var.rds_proxy_enabled ? 1 : 0
  name        = "${local.name_prefix}-rds-proxy-sg"
  description = "Security group for RDS Proxy"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.eks_nodes.id]
    description     = "Allow EKS nodes to connect to RDS Proxy"
  }

  egress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = [var.cidr_block]
    description = "Outbound to Aurora cluster"
  }

  tags = var.tags
}

resource "aws_db_proxy" "medplum" {
  count                  = var.rds_proxy_enabled ? 1 : 0
  name                   = "${local.name_prefix}-rds-proxy"
  debug_logging          = false
  engine_family          = "POSTGRESQL"
  idle_client_timeout    = 1800
  require_tls            = true
  role_arn               = aws_iam_role.rds_proxy[0].arn
  vpc_security_group_ids = [aws_security_group.rds_proxy[0].id]
  vpc_subnet_ids         = module.vpc.database_subnets

  auth {
    auth_scheme = "SECRETS"
    iam_auth    = "DISABLED"
    secret_arn  = module.aurora.cluster_master_user_secret[0].secret_arn
  }

  tags = var.tags
}

resource "aws_db_proxy_default_target_group" "medplum" {
  count         = var.rds_proxy_enabled ? 1 : 0
  db_proxy_name = aws_db_proxy.medplum[0].name
}

resource "aws_db_proxy_target" "medplum" {
  count                 = var.rds_proxy_enabled ? 1 : 0
  db_cluster_identifier = module.aurora.cluster_id
  db_proxy_name         = aws_db_proxy.medplum[0].name
  target_group_name     = aws_db_proxy_default_target_group.medplum[0].name
}
