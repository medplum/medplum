module "memorystore" {
  source  = "terraform-google-modules/memorystore/google"
  version = "~> 12.0"

  name                    = "medplum-redis"
  project_id              = var.project_id
  region                  = var.region
  memory_size_gb          = "1"
  enable_apis             = "true"
  authorized_network      = module.vpc.network_self_link
  auth_enabled            = true
  transit_encryption_mode = "SERVER_AUTHENTICATION"
  connect_mode            = "PRIVATE_SERVICE_ACCESS"
  reserved_ip_range       = google_compute_global_address.psa_reserved_ip.name

  depends_on = [
    module.vpc
  ]
}