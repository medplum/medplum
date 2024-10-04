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
resource "google_compute_global_address" "service_range" {
  project       = var.project_id
  name          = var.psa_range_name
  purpose       = "VPC_PEERING"
  address       = split("/", var.psa_range)[0]
  prefix_length = split("/", var.psa_range)[1]
  address_type  = "INTERNAL"
  network       = module.vpc.network_name
}

### Attach Ranges to Private Service Access for VPC
resource "google_service_networking_connection" "private_service_access" {
  network                 = module.vpc.network_name
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [var.psa_range_name]

  depends_on = [
    google_compute_global_address.service_range
  ]
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