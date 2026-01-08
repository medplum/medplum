# This module configures a PostgreSQL database instance on Google Cloud SQL.
# It uses the terraform-google-modules/sql-db module to set up a highly available
# PostgreSQL instance with specific configurations for the project.
# 
# Key configurations include:
# - Random instance name generation for uniqueness.
# - Zonal availability type for the master instance.
# - Disk size and auto-resize settings.
# - Maintenance window settings for updates.
# - IP configuration with private network and SSL mode settings.
# - Backup configuration with point-in-time recovery and retention settings.
# - Custom database flags for specific PostgreSQL settings.
#
# Usage:
# - Ensure that the required variables such as `pg_ha_name`, `project_id`, `region`, `zone`, and `labels` are defined.
# - The module requires a VPC network and a reserved IP address for private services access.
# - Adjust the configurations as needed to fit the specific requirements of your environment.
# - Apply the Terraform configuration to create and manage the Cloud SQL instance.

module "sql-db" {
  source  = "terraform-google-modules/sql-db/google//modules/postgresql"
  version = "~> 21.0.0"

  name                 = var.pg_ha_name
  random_instance_name = true
  project_id           = var.project_id
  database_version     = "POSTGRES_16"
  region               = var.region

  // Master configurations
  tier                            = "db-custom-1-3840"
  zone                            = var.zone
  availability_type               = "ZONAL"
  disk_size                       = 10
  disk_autoresize                 = true
  maintenance_window_day          = 7
  maintenance_window_update_track = "stable"
  deletion_protection             = false
  user_labels                     = var.labels

  ip_configuration = {
    ipv4_enabled                                  = false
    ssl_mode                                      = "ALLOW_UNENCRYPTED_AND_ENCRYPTED"
    private_network                               = module.vpc.network_self_link
    allocated_ip_range                            = google_compute_global_address.psa_reserved_ip.name
    authorized_networks                           = []
    enable_private_path_for_google_cloud_services = true
  }

  backup_configuration = {
    enabled                        = true
    start_time                     = "20:55"
    location                       = "us"
    point_in_time_recovery_enabled = true
    transaction_log_retention_days = "7"
    retained_backups               = 7
    retention_unit                 = "COUNT"
  }

  database_flags = [
    {
      name  = "autovacuum"
      value = "off"
    },
    {
      name  = "default_transaction_isolation"
      value = "'repeatable read'"
    }
  ]
  // Additional configurations
  db_name      = var.pg_ha_name
  db_charset   = "UTF8"
  db_collation = "en_US.UTF8"

  additional_databases = [
    {
      name      = "medplum"
      charset   = "UTF8"
      collation = "en_US.UTF8"
    },
  ]

  user_name     = "medplum"
  user_password = "medplum"

  depends_on = [
    google_service_networking_connection.private_service_access,
    google_project_service.project
  ]
}
