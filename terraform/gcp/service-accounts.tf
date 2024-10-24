module "service_accounts" {
  source     = "terraform-google-modules/service-accounts/google"
  version    = "~> 4.4.0"
  project_id = var.project_id
  names      = ["medplum-server"]

  project_roles = [
    "medplum-zencore=>roles/redis.admin",
    "medplum-zencore=>roles/cloudsql.admin",
    "medplum-zencore=>roles/secretmanager.admin",
    "medplum-zencore=>roles/storage.admin"
  ]

  depends_on = [
    google_project_service.project
  ]
}

# k8s service account roles
locals {
  roles = [
    "roles/iam.serviceAccountTokenCreator",
    "roles/iam.workloadIdentityUser",
  ]
}

resource "google_service_account_iam_member" "ksa_roles" {
  for_each           = toset(local.roles)
  service_account_id = module.service_accounts.service_accounts[0].name
  role               = each.value
  member             = "serviceAccount:${var.project_id}.svc.id.goog[medplum/medplum-server]"
}
