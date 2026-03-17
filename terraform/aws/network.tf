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
