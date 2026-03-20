resource "aws_db_subnet_group" "medplum" {
  name       = "${local.name_prefix}-db-sng"
  subnet_ids = module.vpc.database_subnets
  tags       = var.tags
}

resource "aws_security_group" "eks_nodes" {
  name        = "${local.name_prefix}-eks-nodes-sg"
  description = "Security group for EKS node groups"
  vpc_id      = module.vpc.vpc_id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = var.tags
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

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = var.tags
}

module "aurora" {
  source  = "terraform-aws-modules/rds-aurora/aws"
  version = "~> 9.0"

  name              = "${local.name_prefix}-aurora"
  engine            = "aurora-postgresql"
  engine_version    = var.postgres_version
  master_username   = "clusteradmin"
  database_name     = "medplum"

  manage_master_user_password = true

  storage_encrypted = true
  kms_key_id        = aws_kms_key.medplum.arn

  vpc_id               = module.vpc.vpc_id
  db_subnet_group_name = aws_db_subnet_group.medplum.name
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
