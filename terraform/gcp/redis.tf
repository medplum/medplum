module "memorystore" {
  source  = "terraform-google-modules/memorystore/google"
  version = "~> 12.0"

  name                    = "medplum-redis"
  project_id              = var.project_id
  region                  = var.region
  memory_size_gb          = "1"
  enable_apis             = "true"
  authorized_network      = module.vpc.network_self_link
  transit_encryption_mode = "DISABLED"
  connect_mode            = "PRIVATE_SERVICE_ACCESS"
  reserved_ip_range       = google_compute_global_address.psa_reserved_ip.name
  persistence_config = {
    persistence_mode    = "RDB"
    rdb_snapshot_period = "ONE_HOUR"
  }
  depends_on = [
    module.vpc
  ]
}