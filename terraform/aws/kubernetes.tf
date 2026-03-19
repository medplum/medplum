module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 20.0"

  cluster_name    = "${local.name_prefix}-eks"
  cluster_version = "1.31"

  vpc_id                   = module.vpc.vpc_id
  subnet_ids               = module.vpc.private_subnets
  control_plane_subnet_ids = module.vpc.private_subnets

  cluster_endpoint_public_access       = true
  cluster_endpoint_private_access      = true
  cluster_endpoint_public_access_cidrs = var.eks_public_access_cidrs

  enable_irsa = true

  # Grant the IAM principal that runs terraform apply cluster-admin access automatically
  enable_cluster_creator_admin_permissions = true

  eks_managed_node_groups = {
    default = {
      name            = "${local.name_prefix}-ng"
      use_name_prefix = true
      capacity_type   = "ON_DEMAND"

      min_size     = 1
      max_size     = 5
      desired_size = 2

      instance_types = var.eks_node_instance_types

      subnet_ids = module.vpc.private_subnets

      # Attach the shared security group so nodes can reach RDS and Redis
      vpc_security_group_ids = [aws_security_group.eks_nodes.id]

      tags = var.tags
    }
  }

  tags = var.tags
}

check "eks_no_open_public_access_in_prod" {
  assert {
    condition     = var.environment != "prod" || !contains(var.eks_public_access_cidrs, "0.0.0.0/0")
    error_message = "eks_public_access_cidrs must not include 0.0.0.0/0 in production. Restrict to your IP or VPN CIDR."
  }
}
