
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