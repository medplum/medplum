# This module sets up a CDN-enabled external HTTP(S) load balancer on Google Cloud Platform.
# It is designed to distribute incoming HTTP(S) traffic across multiple backend services,
# providing high availability and scalability for web applications.
#
# Key Features:
# - Utilizes Google Cloud's global load balancing capabilities to route traffic efficiently.
# - Supports SSL termination with managed SSL certificates for secure connections.
# - Configurable CDN policy to cache static content and reduce latency.
# - Health checks to ensure backend services are available and responsive.
# - Logging configuration to monitor and analyze traffic patterns.
#
# Usage:
# - Ensure that the required variables such as `project_id`, `storage_domain`, and `app_domain` are defined.
# - The module requires a VPC network and a URL map resource to be configured.
# - Adjust the backend configurations, such as protocol, port, and CDN policy, to fit the specific requirements of your application.
# - Apply the Terraform configuration to create and manage the external load balancer.
# - Monitor the load balancer's performance and adjust settings as needed to optimize traffic distribution and caching.

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
  managed_ssl_certificate_domains = ["${var.storage_domain}", "${var.app_domain}"]
  address                         = google_compute_global_address.elb_external_ip.address
  create_address                  = false


  backends = {
    default = {
      protocol    = "HTTP"
      port        = 80
      port_name   = "http"
      timeout_sec = 10
      enable_cdn  = true

      cdn_policy = {
        cache_mode = "USE_ORIGIN_HEADERS"
        cache_key_policy = {
          include_host         = true
          include_protocol     = true
          include_query_string = true
        }
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
    hosts        = ["${var.storage_domain}"]
    path_matcher = "storage"
  }

  path_matcher {
    name            = "storage"
    default_service = module.medplum-lb-https.backend_services.default.self_link

    path_rule {
      paths   = ["/*"]
      service = google_compute_backend_bucket.storage_bucket.self_link
    }
  }
  host_rule {
    hosts        = ["${var.app_domain}"]
    path_matcher = "app"
  }

  path_matcher {
    name            = "app"
    default_service = module.medplum-lb-https.backend_services.default.self_link

    path_rule {
      paths   = ["/*"]
      service = google_compute_backend_bucket.apps_bucket.self_link
    }
  }
}

resource "google_compute_backend_bucket" "storage_bucket" {
  name             = "medplum-cdn-backend-storage-bucket"
  project          = var.project_id
  description      = "Backend bucket for serving static content through CDN"
  bucket_name      = module.buckets["medplum-storage-p"].name
  enable_cdn       = true
  compression_mode = "DISABLED"

  # Attach the security policy
  edge_security_policy = google_compute_security_policy.edge_security_policy.self_link
}

resource "google_compute_backend_bucket" "apps_bucket" {
  name             = "medplum-cdn-backend-app-bucket"
  project          = var.project_id
  description      = "Backend bucket for serving static content through CDN"
  bucket_name      = module.buckets["medplum-app-p"].name
  enable_cdn       = true
  compression_mode = "DISABLED"

  # Attach the security policy
  edge_security_policy = google_compute_security_policy.edge_security_policy.self_link
}


resource "google_compute_global_address" "elb_external_ip" {
  name         = "medplum-cdn-ip"
  project      = var.project_id
  address_type = "EXTERNAL"
}