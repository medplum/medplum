# google_client_config and kubernetes provider must be explicitly specified like the following.
data "google_client_config" "default" {}

provider "kubernetes" {
  host                   = "https://${module.gke.endpoint}"
  token                  = data.google_client_config.default.access_token
  cluster_ca_certificate = base64decode(module.gke.ca_certificate)
}

module "gke" {
  source                     = "terraform-google-modules/kubernetes-engine/google//modules/beta-autopilot-private-cluster"
  version                    = "31.1.0"
  project_id                 = var.project_id
  name                       = "medplum-gke"
  region                     = var.region
  zones                      = ["us-west1-a", "us-west1-b"]
  network                    = module.vpc.vpc.name
  subnetwork                 = module.subnets.subnets["us-west1/medplum-us-west1-sn-gke-01"].name
  ip_range_pods              = "medplum-gke-pods"
  ip_range_services          = "medplum-gke-services"
  http_load_balancing        = true
  horizontal_pod_autoscaling = true
  create_service_account     = false
  enable_private_endpoint    = true
  enable_private_nodes       = true
  master_ipv4_cidr_block     = "10.3.1.0/28"
  add_cluster_firewall_rules = true
  dns_cache                  = false
  grant_registry_access      = true
  deletion_protection        = false
  master_authorized_networks = [
    {
      cidr_block   = "186.139.91.157/32"
      display_name = "Pablo's Network"
    },
    {
      cidr_block   = "200.68.72.177/32"
      display_name = "Pablo's co-worker Network"
    },
    {
      cidr_block   = "157.92.6.59/32"
      display_name = "Pablo's co-worker Network 2"
    },
  ]
  depends_on = [module.subnets]
}
