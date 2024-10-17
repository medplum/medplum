module "service_accounts" {
  source     = "terraform-google-modules/service-accounts/google"
  version    = "~> 4.4.0"
  project_id = var.project_id
  prefix     = "medplum"
  names      = ["app-sa"]
  project_roles = [
    "medplum-zencore=>roles/redis.admin",
    "medplum-zencore=>roles/cloudsql.admin"
  ]
}