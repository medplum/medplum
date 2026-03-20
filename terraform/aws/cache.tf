resource "aws_elasticache_subnet_group" "medplum" {
  name       = "${local.name_prefix}-redis-sng"
  subnet_ids = module.vpc.elasticache_subnets
  tags       = var.tags
}

resource "aws_security_group" "redis" {
  name        = "${local.name_prefix}-redis-sg"
  description = "Security group for ElastiCache"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.eks_nodes.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = var.tags
}

resource "random_password" "redis_auth" {
  length  = 32
  special = false
  # The plaintext value is stored in Terraform state. ElastiCache does not support native Secrets
  # Manager integration (unlike Aurora), so random_password is the standard approach. Mitigate by:
  #   1. Restricting s3:GetObject on the state bucket to only the IAM principals that run terraform
  #   2. Ensuring the state bucket uses KMS encryption (created by the bootstrap module)
  #   3. Never committing terraform.tfstate to version control (enforced by .gitignore)
}

resource "aws_elasticache_parameter_group" "medplum" {
  family = "redis7"
  name   = "${local.name_prefix}-redis-pg"

  tags = var.tags
}

resource "aws_elasticache_replication_group" "medplum" {
  replication_group_id = "${local.name_prefix}-redis"
  description          = "Medplum Redis cache"
  engine               = "redis"
  engine_version       = "7.1"
  node_type            = var.redis_node_type
  num_cache_clusters   = var.redis_num_cache_nodes
  parameter_group_name = aws_elasticache_parameter_group.medplum.name
  port                 = 6379

  automatic_failover_enabled = var.environment == "prod"
  subnet_group_name          = aws_elasticache_subnet_group.medplum.name
  security_group_ids         = [aws_security_group.redis.id]

  at_rest_encryption_enabled = true
  kms_key_id                 = aws_kms_key.medplum.arn
  transit_encryption_enabled = true
  auth_token                 = random_password.redis_auth.result

  lifecycle {
    precondition {
      condition     = !(var.environment == "prod") || var.redis_num_cache_nodes >= 2
      error_message = "Production Redis requires at least 2 cache nodes (redis_num_cache_nodes >= 2) for automatic failover."
    }
  }

  tags = var.tags
}
