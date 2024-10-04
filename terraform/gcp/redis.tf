module "redis_cluster" {
  source  = "terraform-google-modules/memorystore/google//modules/redis-cluster"
  version = "~> 10.0"

  name          = "medplum-redis-cluster"
  project       = var.project_id
  region        = var.region
  network       = ["projects/${var.project_id}/global/networks/${var.vpc_name}"]
  node_type     = "REDIS_STANDARD_SMALL"
  shard_count   = 3
  replica_count = 0


  redis_configs = {
    maxmemory-policy = "volatile-ttl"
  }

  service_connection_policies = {
    medplum-redis-cluster-scp = {
      network_name    = var.vpc_name
      network_project = var.project_id
      subnet_names    = [module.vpc.subnets["us-west1/medplum-us-west1-sn-psa-01"].name]
    }
  }

  depends_on = [
    google_project_service.project,
    module.vpc
  ]
}