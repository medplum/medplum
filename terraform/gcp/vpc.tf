## VPC
module "vpc" {
  source     = "./modules/network/vpc"
  project_id = var.project_id
  vpc_name   = var.vpc_name
}

module "subnets" {
  source           = "./modules/network/subnets"
  project_id       = var.project_id
  network_name     = var.vpc_name
  subnets          = var.subnets
  secondary_ranges = var.secondary_ranges

  depends_on = [
    module.vpc
  ]
}