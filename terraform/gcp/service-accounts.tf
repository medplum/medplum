# This module sets up service accounts for the project and assigns specific roles to them.
# It uses the terraform-google-modules/service-accounts module to create and manage service accounts.
# 
# Usage:
# - Ensure that the `project_id` variable is set to the desired GCP project ID.
# - The `names` variable specifies the names of the service accounts to be created.
# - The `project_roles` variable maps service account names to their respective roles.
# - Apply the Terraform configuration to create the service accounts and assign the roles.
# - The `depends_on` block ensures that the service accounts are created only after the necessary project services are enabled.
# 
# Note:
# - The `google_service_account_iam_member` resource assigns IAM roles to a Kubernetes service account.
# - The `locals` block defines the roles to be assigned to the Kubernetes service account.
# - Ensure that the Kubernetes service account exists in the specified namespace before applying the configuration.

module "service_accounts" {
  source     = "terraform-google-modules/service-accounts/google"
  version    = "~> 4.4.0"
  project_id = var.project_id
  names      = ["medplum-server"]

  project_roles = [
    "${var.project_id}=>roles/redis.admin",
    "${var.project_id}=>roles/cloudsql.admin",
    "${var.project_id}=>roles/secretmanager.admin",
    "${var.project_id}=>roles/storage.admin"
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
