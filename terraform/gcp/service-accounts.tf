module "service_accounts" {
  source     = "terraform-google-modules/service-accounts/google"
  version    = "~> 4.4.0"
  project_id = var.project_id
  names      = ["medplum-server", "external-secrets"]

  project_roles = [
    "medplum-zencore=>roles/redis.admin",
    "medplum-zencore=>roles/cloudsql.admin",
    "medplum-zencore=>roles/secretmanager.secretAccessor",
    "medplum-zencore=>roles/artifactregistry.reader"
  ]

  depends_on = [
    google_project_service.project
  ]
}

# # Workload Identity for external secrets Service Account
resource "google_service_account_iam_member" "ksa_external_secrets_workload_identity" {
  service_account_id = module.service_accounts.service_accounts[0].name
  role               = "roles/iam.workloadIdentityUser"
  member             = "serviceAccount:${var.project_id}.svc.id.goog[external-secrets/external-secrets]"
}

# Workload Identity for external secrets Service Account
resource "google_service_account_iam_member" "ksa_medplum_server_workload_identity" {
  service_account_id = module.service_accounts.service_accounts[1].name
  role               = "roles/iam.workloadIdentityUser"
  member             = "serviceAccount:${var.project_id}.svc.id.goog[default/medplum-server]"
}

# Artifact Registry Reader to default compute service account
resource "google_project_iam_member" "artifact_registry_reader" {
  project = var.project_id
  role    = "roles/artifactregistry.reader"
  member  = "serviceAccount:${var.project_number}-compute@developer.gserviceaccount.com"
}

# resource "google_project_iam_member" "medplum_server_cluster_viewer" {
#   project = var.project_id
#   role    = "roles/container.clusterViewer"
#   member  = "principalSet://iam.googleapis.com/projects/${var.project_number}/locations/global/workloadIdentityPools/${var.project_id}.svc.id.goog/kubernetes.cluster/https://container.googleapis.com/v1/projects/${var.project_id}/locations/${var.region}/clusters/medplum-gke"
# }
