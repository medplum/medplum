resource "google_compute_network" "vpc" {
  project                  = var.project_id
  name                     = var.vpc_name
  auto_create_subnetworks  = false
  routing_mode             = "GLOBAL"
  enable_ula_internal_ipv6 = false
}
