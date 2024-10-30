module "memorystore" {
  source  = "terraform-google-modules/memorystore/google"
  version = "~> 12.0"

  name               = "medplum-redis"
  project_id         = var.project_id
  region             = var.region
  memory_size_gb     = "1"
  enable_apis        = "true"
  authorized_network = var.vpc_name


  depends_on = [
    module.vpc
  ]
}