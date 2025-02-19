# This module sets up a Virtual Private Cloud (VPC) network on Google Cloud Platform.
# It defines multiple subnets with specific IP ranges and enables private IP access for Google services.
# The VPC is configured with secondary IP ranges for GKE pods and services, allowing for efficient IP management.
# Usage:
# - Ensure that the required variables such as `project_id`, `vpc_name`, and `region` are defined.
# - Adjust the subnet configurations as needed to fit the specific requirements of your environment.
# - Apply the Terraform configuration to create and manage the VPC network.


## VPC
module "vpc" {
  source  = "terraform-google-modules/network/google"
  version = "~> 9.2.0"

  project_id   = var.project_id
  network_name = var.vpc_name

  subnets = [
    {
      subnet_name              = "medplum-us-west1-sn-gke-01"
      subnet_ip                = "10.0.0.0/20"
      subnet_region            = var.region
      private_ip_google_access = true
    },
    {
      subnet_name              = "medplum-us-west1-sn-psa-01"
      subnet_ip                = "192.168.32.0/20"
      subnet_region            = var.region
      private_ip_google_access = true
    },
    {
      subnet_name              = "medplum-us-west1-sn-proxy-only-01"
      subnet_ip                = "10.12.0.0/23"
      subnet_region            = var.region
      private_ip_google_access = true
      purpose                  = "REGIONAL_MANAGED_PROXY"
      role                     = "ACTIVE"
    }
  ]

  secondary_ranges = {
    medplum-us-west1-sn-gke-01 = [
      {
        range_name    = "medplum-gke-pods"
        ip_cidr_range = "10.4.0.0/14"
      },
      {
        range_name    = "medplum-gke-services"
        ip_cidr_range = "10.8.0.0/20"
      },
    ]
  }
  depends_on = [google_project_service.project]
}

## Private Service Access for VPC
resource "google_compute_global_address" "psa_reserved_ip" {
  name          = "medplum-psa-reserved-ip"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 20
  network       = module.vpc.network_self_link
}
resource "google_service_networking_connection" "private_service_access" {
  network                 = module.vpc.network_name
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.psa_reserved_ip.name]
}

resource "google_compute_network_peering_routes_config" "peering_routes" {
  project = var.project_id
  peering = google_service_networking_connection.private_service_access.peering
  network = module.vpc.network_name

  import_custom_routes = true
  export_custom_routes = true
}

## Cloud Nat for GKE
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

##  Ingress ip for external load balancer
resource "google_compute_global_address" "external_ip" {
  name         = "medplum-external-ip"
  project      = var.project_id
  address_type = "EXTERNAL"
}

# firewall rules
module "firewall_rules" {
  source       = "terraform-google-modules/network/google//modules/firewall-rules"
  version      = "~> 9.3.0"
  project_id   = var.project_id
  network_name = module.vpc.network_name

  rules = [
    {
      name        = "allow-health-checks-ingress"
      description = "Allow ingress traffic from Google health checks"
      direction   = "INGRESS"
      priority    = 150
      ranges = [
        "35.191.0.0/16",
        "130.211.0.0/22",
        "209.85.204.0/22",
        "209.85.152.0/22",
        "10.0.0.0/20",
        "10.4.0.0/14",
        "10.8.0.0/20",
        "10.3.1.0/28"
      ]
      source_tags             = null
      source_service_accounts = null
      target_service_accounts = null
      target_tags             = ["gke-medplum-gke"]
      allow = [{
        protocol = "tcp"
        ports    = ["1-65535"]
      }]
      deny = []
      log_config = {
        metadata = "INCLUDE_ALL_METADATA"
      }
    }
  ]
}

# This resource defines an SSL policy for Google Compute Engine.
# It specifies the minimum TLS version to be used for securing connections.
# Developers and DevOps can use this policy to enforce TLS 1.2 for enhanced security.
resource "google_compute_ssl_policy" "ssl-policy" {
  provider        = google-beta
  project         = var.project_id
  name            = "medplum-ssl-policy"
  min_tls_version = "TLS_1_2"
}
