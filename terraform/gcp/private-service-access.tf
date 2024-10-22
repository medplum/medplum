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
