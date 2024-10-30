resource "google_compute_ssl_policy" "ssl-policy" {
  provider        = google-beta
  project         = var.project_id
  name            = "medplum-ssl-policy"
  min_tls_version = "TLS_1_2"
}

