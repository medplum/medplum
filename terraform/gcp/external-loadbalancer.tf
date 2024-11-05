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
  managed_ssl_certificate_domains = ["${var.user_content_domain}", "${var.static_asset_domain}"]

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
    hosts        = ["storage.zencore.medplum.dev"]
    path_matcher = "storage"
  }

  path_matcher {
    name            = "storage"
    default_service = module.medplum-lb-https.backend_services.default.self_link

    path_rule {
      paths   = ["/*"]
      service = google_compute_backend_bucket.user_content_bucket.self_link
    }
  }
  host_rule {
    hosts        = ["app.zencore.medplum.dev"]
    path_matcher = "app"
  }

  path_matcher {
    name            = "app"
    default_service = module.medplum-lb-https.backend_services.default.self_link

    path_rule {
      paths   = ["/*"]
      service = google_compute_backend_bucket.static_assets_bucket.self_link
    }
  }
}

resource "google_compute_backend_bucket" "user_content_bucket" {
  name             = "medplum-cdn-backend-content-bucket"
  project          = var.project_id
  description      = "Backend bucket for serving static content through CDN"
  bucket_name      = module.buckets["medplum-user-content"].name
  enable_cdn       = true
  compression_mode = "DISABLED"
}

resource "google_compute_backend_bucket" "static_assets_bucket" {
  name             = "medplum-cdn-backend-assets-bucket"
  project          = var.project_id
  description      = "Backend bucket for serving static content through CDN"
  bucket_name      = module.buckets["medplum-static-assets"].name
  enable_cdn       = true
  compression_mode = "DISABLED"
}
