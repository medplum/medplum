module "service_accounts" {
  source     = "terraform-google-modules/service-accounts/google"
  version    = "~> 4.4.0"
  project_id = var.project_id
  names      = ["medplum-app-sa", "external-secrets"]

  project_roles = [
    "medplum-zencore=>roles/redis.admin",
    "medplum-zencore=>roles/cloudsql.admin",
    "medplum-zencore=>roles/secretmanager.secretAccessor"
  ]
}

# Workload Identity for external secrets Service Account
resource "google_service_account_iam_member" "ksa_workload_identity" {
  service_account_id = module.service_accounts.service_accounts[0].name
  role               = "roles/iam.workloadIdentityUser"
  member             = "serviceAccount:${var.project_id}.svc.id.goog[external-secrets/external-secrets]"
}
