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
        Resource = "*"
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
