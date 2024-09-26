module "cloud-nat" {
  source        = "terraform-google-modules/cloud-nat/google"
  version       = "~> 5.3.0"
  project_id    = var.project_id
  region        = var.region
  name          = "${var.region}-medplum-gke-router"
  network       = module.vpc.network_name
  create_router = true
  router        = "${var.region}-medplum-gke-outbound-gateway"
}