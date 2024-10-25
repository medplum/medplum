
# postgresql default user password
resource "google_secret_manager_secret" "postgresql-secret" {
  project   = var.project_id
  secret_id = "postgres-password"

  labels = var.labels

  replication {
    auto {}
  }

  depends_on = [google_project_service.project]
}

resource "google_secret_manager_secret_version" "postgresql-secret" {
  secret      = google_secret_manager_secret.postgresql-secret.id
  secret_data = module.sql-db.generated_user_password

  depends_on = [google_project_service.project]
}

# postgresql instance connection string
resource "google_secret_manager_secret" "instance_connection_string" {
  project   = var.project_id
  secret_id = "postgresql-connection-string"

  labels = var.labels

  replication {
    auto {}
  }

  depends_on = [google_project_service.project]
}

resource "google_secret_manager_secret_version" "instance_connection_string" {
  secret      = google_secret_manager_secret.instance_connection_string.id
  secret_data = module.sql-db.instance_connection_name

  depends_on = [google_project_service.project]
}


# postgresql instance IP address
resource "google_secret_manager_secret" "postgresql-ip-address" {
  project   = var.project_id
  secret_id = "postgresql-ip-address"

  labels = var.labels

  replication {
    auto {}
  }

  depends_on = [google_project_service.project]
}

resource "google_secret_manager_secret_version" "postgresql-ip-address" {
  secret      = google_secret_manager_secret.postgresql-ip-address.id
  secret_data = tostring(module.sql-db.instance_ip_address[0].ip_address)

  depends_on = [google_project_service.project]
}

# Redis instance IP address
resource "google_secret_manager_secret" "redis-ip-address" {
  project   = var.project_id
  secret_id = "redis-ip-address"

  labels = var.labels

  replication {
    auto {}
  }

  depends_on = [google_project_service.project]
}

resource "google_secret_manager_secret_version" "redis-ip-address" {
  secret      = google_secret_manager_secret.redis-ip-address.id
  secret_data = tostring(module.redis_cluster.redis_cluster.discovery_endpoints[0].address)



  depends_on = [google_project_service.project]
}