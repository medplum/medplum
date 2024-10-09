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
  name             = "medplum-cdn-backend-bucket"
  project          = var.project_id
  description      = "Backend bucket for serving static content through CDN"
  bucket_name      = module.buckets["storage-medplum-com"].name
  enable_cdn       = true
  compression_mode = "DISABLED"
}
