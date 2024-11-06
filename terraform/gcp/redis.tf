# This module sets up a Redis instance using Google Cloud's Memorystore service.
# It is configured to use a private service access connection within the specified VPC network.
# 
# Key Features:
# - The Redis instance is created with a memory size of 1 GB.
# - It uses a private service access connection for secure communication within the VPC.
# - The Redis instance is configured with RDB persistence, taking snapshots every hour.
# 
# Usage:
# - Ensure that the required variables such as `project_id` and `region` are defined.
# - The VPC network must be configured and available for the Redis instance to connect.
# - Apply the Terraform configuration to create and manage the Redis instance.
# - Monitor the Redis instance's performance and adjust settings as needed to optimize resource usage and reliability.

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
  redis_configs = {
    maxmemory-policy = "noeviction"
  }
  depends_on = [
    module.vpc
  ]
}