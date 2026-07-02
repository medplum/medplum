# Centralized resource naming derived from var.namespace.
# Changing var.namespace re-prefixes every named resource so that multiple
# Medplum deployments can coexist in the same GCP project without collisions.
#
# Note: the Kubernetes namespace and Kubernetes service account (medplum/medplum-server)
# are intentionally NOT namespaced here - they are the Helm chart defaults and are
# referenced as-is by the workload identity binding in service-accounts.tf.

locals {
  # Cloud SQL password: caller-provided override, else the generated random one.
  db_password = var.db_password != null ? var.db_password : random_password.db.result

  # VPC + networking
  vpc_name       = "${var.namespace}-gke-vpc"
  subnet_gke     = "${var.namespace}-${var.region}-sn-gke-01"
  subnet_psa     = "${var.namespace}-${var.region}-sn-psa-01"
  subnet_proxy   = "${var.namespace}-${var.region}-sn-proxy-only-01"
  pods_range     = "${var.namespace}-gke-pods"
  services_range = "${var.namespace}-gke-services"

  psa_reserved_ip_name = "${var.namespace}-psa-reserved-ip"
  nat_router_name      = "${var.region}-${var.namespace}-gke-router"
  nat_gateway_name     = "${var.region}-${var.namespace}-gke-outbound-gateway"
  external_ip_name     = "${var.namespace}-external-ip"
  ssl_policy_name      = "${var.namespace}-ssl-policy"
  fw_health_check_name = "${var.namespace}-allow-health-checks-ingress"

  # GKE
  gke_name     = "${var.namespace}-gke"
  gke_node_tag = "gke-${var.namespace}-gke"

  # Cloud SQL
  pg_name = "${var.namespace}-pg-ha"

  # Redis
  redis_name = "${var.namespace}-redis"

  # Google service account (distinct from the in-cluster KSA medplum-server)
  gsa_name = "${var.namespace}-server"

  # Cloud Armor security policies
  edge_security_policy_name    = "${var.namespace}-edge-security-policy"
  ingress_security_policy_name = "${var.namespace}-ingress-security-policy"

  # CDN external load balancer
  elb_name             = "${var.namespace}-elb"
  url_map_name         = "${var.namespace}-url-map"
  cdn_storage_be_name  = "${var.namespace}-cdn-backend-storage-bucket"
  cdn_app_be_name      = "${var.namespace}-cdn-backend-app-bucket"
  elb_external_ip_name = "${var.namespace}-cdn-ip"
}
