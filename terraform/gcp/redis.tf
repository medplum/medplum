module "redis_cluster" {
  source  = "terraform-google-modules/memorystore/google//modules/redis-cluster"
  version = "~> 10.0"

  name      = "medplum-redis-cluster"
  project   = var.project_id
  region    = var.region
  network   = module.vpc.network_self_link
  node_type = "REDIS_STANDARD_SMALL"

  redis_configs = {
    maxmemory-policy = "volatile-ttl"
  }

  service_connection_policies = {
    test-net-redis-cluster-scp = {
      network_name    = var.vpc_name
      network_project = var.project_id
      subnet_names    = module.vpc.subnets["us-west1/medplum-us-west1-sn-sql-01"].name
    }
  }

  depends_on = [
    google_project_service.project,
    module.vpc
  ]
}