# This Terraform configuration sets up a Google Kubernetes Engine (GKE) cluster using the Google Cloud Platform.
# It uses the terraform-google-modules/kubernetes-engine module to create a private autopilot cluster.
# 
# Usage:
# - Ensure that the required variables such as `project_id`, `region`, and VPC network details are defined.
# - The module requires a VPC network and subnetwork to be configured.
# - Adjust the cluster configurations, such as node settings and network policies, to fit the specific requirements of your application.
# - Apply the Terraform configuration to create and manage the GKE cluster.
# - Monitor the cluster's performance and adjust settings as needed to optimize resource usage and security.


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
  network                    = module.vpc.network_name
  subnetwork                 = module.vpc.subnets["us-west1/medplum-us-west1-sn-gke-01"].name
  ip_range_pods              = "medplum-gke-pods"
  ip_range_services          = "medplum-gke-services"
  http_load_balancing        = true
  create_service_account     = true
  service_account_name       = "medplum-gke"
  grant_registry_access      = true
  enable_private_endpoint    = false
  enable_private_nodes       = true
  master_ipv4_cidr_block     = "10.3.1.0/28"
  add_cluster_firewall_rules = true
  dns_cache                  = false
  deletion_protection        = false
  gateway_api_channel        = "CHANNEL_STANDARD"
  master_authorized_networks = var.master_authorized_networks
  depends_on = [
    google_project_service.project,
    module.vpc
  ]
}
