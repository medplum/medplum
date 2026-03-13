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
  description = "Security group for RDS"
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

module "rds" {
  source  = "terraform-aws-modules/rds/aws"
  version = "~> 6.0"

  identifier = "${local.name_prefix}-postgres"

  engine               = "postgres"
  engine_version       = var.postgres_version
  family               = "postgres${var.postgres_version}"
  major_engine_version = var.postgres_version
  instance_class       = var.db_instance_tier
  allocated_storage    = var.db_storage_gb

  db_name  = "medplum"
  username = "medplum"
  port     = 5432

  manage_master_user_password = true

  storage_encrypted = true
  kms_key_id        = aws_kms_key.medplum.arn

  vpc_security_group_ids = [aws_security_group.database.id]
  db_subnet_group_name   = aws_db_subnet_group.medplum.name
  publicly_accessible    = false

  backup_retention_period = var.environment == "prod" ? 30 : 7
  skip_final_snapshot     = var.environment != "prod"
  deletion_protection     = var.environment == "prod"

  tags = var.tags
}
