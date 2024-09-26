module "nat" {
  source                         = "./modules/network/nat"
  project_id                     = var.project_id
  region                         = var.region
  router_name                    = "${var.region}-medplum-gke-outbound-gateway"
  nat_name                       = "${var.region}-medplum-gke-router"
  network_name                   = module.vpc.vpc.name
  enable_dynamic_port_allocation = true
}
