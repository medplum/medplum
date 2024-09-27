module "sql-db" {
  source  = "terraform-google-modules/sql-db/google//modules/postgresql"
  version = "~> 21.0.0"

  name                 = var.pg_ha_name
  random_instance_name = true
  project_id           = var.project_id
  database_version     = "POSTGRES_15"
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
  database_flags                  = [{ name = "autovacuum", value = "off" }]
  user_labels                     = var.labels

  ip_configuration = {
    ipv4_enabled                                  = false
    ssl_mode                                      = "ALLOW_UNENCRYPTED_AND_ENCRYPTED"
    private_network                               = module.vpc.network_self_link
    allocated_ip_range                            = var.psa_range_name
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

  // Additional configurations
  db_name      = var.pg_ha_name
  db_charset   = "UTF8"
  db_collation = "en_US.UTF8"

  depends_on = [google_service_networking_connection.private_service_access]
}
