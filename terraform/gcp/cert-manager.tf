# This resource defines an SSL policy for Google Compute Engine.
# It specifies the minimum TLS version to be used for securing connections.
# Developers and DevOps can use this policy to enforce TLS 1.2 for enhanced security.
resource "google_compute_ssl_policy" "ssl-policy" {
  provider        = google-beta
  project         = var.project_id
  name            = "medplum-ssl-policy"
  min_tls_version = "TLS_1_2"
}

