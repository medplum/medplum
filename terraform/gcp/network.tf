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

## CDN external load balancer
module "medplum-lb-https" {
  source                          = "GoogleCloudPlatform/lb-http/google"
  version                         = "~> 11.1"
  name                            = "medplum-elb"
  project                         = var.project_id
  firewall_networks               = [module.vpc.network_name]
  target_tags                     = []
  url_map                         = google_compute_url_map.cdn_url_map.self_link
  create_url_map                  = false
  ssl                             = true
  managed_ssl_certificate_domains = ["storage.medplum.com"]

  backends = {
    default = {
      protocol    = "HTTP"
      port        = 80
      port_name   = "http"
      timeout_sec = 10
      enable_cdn  = true

      cdn_policy = {
        cache_mode  = "CACHE_ALL_STATIC"
        default_ttl = 3600
        client_ttl  = 7200
        max_ttl     = 10800
        cache_key_policy = {
          include_host         = true
          include_protocol     = true
          include_query_string = true
          # include_named_cookies = ["__next_preview_data", "__prerender_bypass"]
        }
        # bypass_cache_on_request_headers = ["example-header-1", "example-header-2"]
      }

      health_check = {
        request_path = "/"
        port         = 80
      }

      log_config = {
        enable      = true
        sample_rate = 1.0
      }
      groups = []

      iap_config = {
        enable = false
      }
    }
  }
}
resource "google_compute_url_map" "cdn_url_map" {
  name            = "medplum-url-map"
  project         = var.project_id
  description     = "CDN URL map to cdn_backend_bucket"
  default_service = module.medplum-lb-https.backend_services.default.self_link

  host_rule {
    hosts        = ["*"]
    path_matcher = "allpaths"
  }

  path_matcher {
    name            = "allpaths"
    default_service = module.medplum-lb-https.backend_services.default.self_link

    path_rule {
      paths   = ["/*"]
      service = google_compute_backend_bucket.medplum.self_link
    }
  }
}

resource "google_compute_backend_bucket" "medplum" {
  name        = "medplum-cdn-backend-bucket"
  project     = var.project_id
  description = "Backend bucket for serving static content through CDN"
  bucket_name = module.buckets["storage-medplum-com"].name
  # bucket_name      = "storage-medplum-com"
  enable_cdn       = true
  compression_mode = "DISABLED"
}
