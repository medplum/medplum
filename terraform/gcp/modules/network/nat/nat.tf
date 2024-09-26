# external IP
resource "google_compute_address" "nat" {
  name         = var.nat_name
  project      = var.project_id
  region       = var.region
  address_type = "EXTERNAL"
  network_tier = "PREMIUM"
}

# Cloud Router
resource "google_compute_router" "public" {
  name    = var.router_name
  project = var.project_id
  region  = var.region
  network = var.network_name
}

# Cloud Nat
resource "google_compute_router_nat" "nat" {
  name                                = var.nat_name
  project                             = var.project_id
  router                              = google_compute_router.public.name
  region                              = var.region
  nat_ip_allocate_option              = "MANUAL_ONLY"
  nat_ips                             = [google_compute_address.nat.self_link]
  source_subnetwork_ip_ranges_to_nat  = "ALL_SUBNETWORKS_ALL_IP_RANGES"
  enable_dynamic_port_allocation      = var.enable_dynamic_port_allocation
  enable_endpoint_independent_mapping = var.enable_endpoint_independent_mapping
}
