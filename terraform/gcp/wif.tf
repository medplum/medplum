module "medplum-gke-workload-identity" {
  source              = "terraform-google-modules/kubernetes-engine/google//modules/workload-identity"
  version             = "~> 33.1.0"
  project_id          = var.project_id
  use_existing_gcp_sa = true
  name                = module.service_accounts.service_accounts[0].account_id
  # namespace           = "external-secrets"

  # wait for the custom GSA to be created to force module data source read during apply
  # https://github.com/terraform-google-modules/terraform-google-kubernetes-engine/issues/1059
}