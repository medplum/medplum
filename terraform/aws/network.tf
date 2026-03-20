module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name = "${local.name_prefix}-vpc"
  cidr = var.cidr_block

  azs                 = var.availability_zones
  private_subnets     = [for i, az in var.availability_zones : cidrsubnet(var.cidr_block, 4, i)]
  public_subnets      = [for i, az in var.availability_zones : cidrsubnet(var.cidr_block, 4, i + 8)]
  database_subnets    = [for i, az in var.availability_zones : cidrsubnet(var.cidr_block, 4, i + 4)]
  elasticache_subnets = [for i, az in var.availability_zones : cidrsubnet(var.cidr_block, 4, i + 12)]

  enable_nat_gateway   = true
  single_nat_gateway   = var.environment != "prod"
  enable_dns_hostnames = true
  enable_dns_support   = true

  # Tag subnets for EKS discovery
  private_subnet_tags = {
    "kubernetes.io/role/internal-elb"                = 1
    "kubernetes.io/cluster/${local.name_prefix}-eks" = "shared"
  }
  public_subnet_tags = {
    "kubernetes.io/role/elb" = 1
  }

  tags = var.tags
}

# VPC Flow Logs → CloudWatch (mirrors CDK BackEnd VPC flow log config)
resource "aws_cloudwatch_log_group" "vpc_flow_logs" {
  name              = "/medplum/flowlogs/${local.name_prefix}"
  retention_in_days = var.environment == "prod" ? 30 : 7

  tags = var.tags
}

resource "aws_iam_role" "vpc_flow_logs" {
  name = "${local.name_prefix}-vpc-flow-logs-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { Service = "vpc-flow-logs.amazonaws.com" }
        Action    = "sts:AssumeRole"
      }
    ]
  })

  tags = var.tags
}

resource "aws_iam_role_policy" "vpc_flow_logs" {
  name = "${local.name_prefix}-vpc-flow-logs-policy"
  role = aws_iam_role.vpc_flow_logs.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:DescribeLogGroups",
          "logs:DescribeLogStreams",
        ]
        Resource = "${aws_cloudwatch_log_group.vpc_flow_logs.arn}:*"
      }
    ]
  })
}

resource "aws_flow_log" "vpc" {
  iam_role_arn    = aws_iam_role.vpc_flow_logs.arn
  log_destination = aws_cloudwatch_log_group.vpc_flow_logs.arn
  traffic_type    = "ALL"
  vpc_id          = module.vpc.vpc_id

  tags = var.tags
}

# S3 destination for long-term flow log retention and forensic analysis.
# CloudWatch retention (7/30 days) is short; S3 enables indefinite storage with lifecycle tiering.
resource "aws_s3_bucket" "vpc_flow_logs" {
  bucket        = "${local.name_prefix}-vpc-flow-logs"
  force_destroy = var.environment != "prod"
  tags          = var.tags
}

resource "aws_s3_bucket_public_access_block" "vpc_flow_logs" {
  bucket                  = aws_s3_bucket.vpc_flow_logs.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "vpc_flow_logs" {
  bucket = aws_s3_bucket.vpc_flow_logs.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.medplum.arn
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "vpc_flow_logs" {
  bucket = aws_s3_bucket.vpc_flow_logs.id

  rule {
    id     = "archive-and-expire"
    status = "Enabled"
    filter {}

    transition {
      days          = 90
      storage_class = "GLACIER"
    }

    expiration {
      days = var.environment == "prod" ? 2555 : 365
    }
  }
}

resource "aws_flow_log" "vpc_s3" {
  log_destination      = aws_s3_bucket.vpc_flow_logs.arn
  log_destination_type = "s3"
  traffic_type         = "ALL"
  vpc_id               = module.vpc.vpc_id

  tags = var.tags
}

# Gateway VPC endpoint for S3 — keeps EKS→S3 traffic inside the AWS network,
# avoiding NAT Gateway data-transfer charges and reducing latency.
resource "aws_vpc_endpoint" "s3" {
  vpc_id       = module.vpc.vpc_id
  service_name = "com.amazonaws.${var.region}.s3"

  route_table_ids = concat(
    module.vpc.private_route_table_ids,
    module.vpc.public_route_table_ids
  )

  tags = merge(var.tags, { Name = "${local.name_prefix}-s3-endpoint" })
}

# ─── Interface VPC endpoints for AWS services ────────────────────────────────
# These keep ECR pulls, CloudWatch writes, STS calls, and SSM lookups inside
# the AWS network. Required to restrict EKS node egress in production.

# ─── Interface VPC endpoints for AWS services ────────────────────────────────
# These keep ECR pulls, CloudWatch writes, STS calls, and SSM lookups inside
# the AWS network. Required to restrict EKS node egress in production.

resource "aws_security_group" "eks_nodes" {
  name        = "${local.name_prefix}-eks-nodes-sg"
  description = "Security group for EKS node groups"
  vpc_id      = module.vpc.vpc_id

  # Allow all egress. EKS nodes need broad outbound access: ECR image pulls, AWS API calls
  # (CloudWatch, SSM, STS), external package registries, and NAT Gateway traffic. In
  # production consider tightening this by adding VPC endpoints for ECR, CloudWatch, and STS
  # and then scoping egress to the VPC CIDR + HTTPS to known prefixes. See:
  # https://docs.aws.amazon.com/eks/latest/userguide/private-cluster.html
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow all outbound - see comment above for production hardening guidance"
  }

  tags = var.tags
}

resource "aws_security_group" "vpc_endpoints" {
  name        = "${local.name_prefix}-vpc-endpoints-sg"
  description = "Allow HTTPS from EKS nodes to interface VPC endpoints"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port       = 443
    to_port         = 443
    protocol        = "tcp"
    security_groups = [aws_security_group.eks_nodes.id]
    description     = "HTTPS from EKS nodes"
  }

  tags = var.tags
}

locals {
  interface_endpoints = {
    ecr_api    = "com.amazonaws.${var.region}.ecr.api"
    ecr_dkr    = "com.amazonaws.${var.region}.ecr.dkr"
    logs       = "com.amazonaws.${var.region}.logs"
    sts        = "com.amazonaws.${var.region}.sts"
    ssm        = "com.amazonaws.${var.region}.ssm"
  }
}

resource "aws_vpc_endpoint" "interface" {
  for_each = local.interface_endpoints

  vpc_id              = module.vpc.vpc_id
  service_name        = each.value
  vpc_endpoint_type   = "Interface"
  subnet_ids          = module.vpc.private_subnets
  security_group_ids  = [aws_security_group.vpc_endpoints.id]
  private_dns_enabled = true

  tags = merge(var.tags, { Name = "${local.name_prefix}-${each.key}-endpoint" })
}
