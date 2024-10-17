resource "google_artifact_registry_repository" "medplum_repo" {
  provider = google-beta

  location      = var.region
  repository_id = "medplum-repo"
  format        = "DOCKER"
  project       = var.project_id

  description = "Docker repository for the Medplum app images"
}
