# Cloud Armor security policy
resource "google_compute_security_policy" "edge_security_policy" {
  name        = "edge-security-policy"
  project     = var.project_id
  description = "edge security policy for Cloud Armor"
  type        = "CLOUD_ARMOR_EDGE"

  # Default allow rule
  rule {
    action   = "allow"
    priority = "2147483647"
    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = ["*"]
      }
    }
    description = "Default rule to allow all other traffic"
  }
}

# Google Cloud Armor security policy for GKE Ingress
resource "google_compute_security_policy" "ingress_security_policy" {
  name        = "ingress-security-policy"
  description = "Security policy with WAF rules for GKE Ingress"

  # WAF rules for GKE Ingress
  adaptive_protection_config {
    layer_7_ddos_defense_config {
      enable          = true
      rule_visibility = "STANDARD"
    }
  }

  # Default allow rule
  rule {
    priority = 2147483647
    action   = "allow"
    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = ["*"]
      }
    }
    description = "Default rule to allow all other traffic"
  }
  # Rule to log potential SQL Injection attacks
  rule {
    priority = 1001
    action   = "allow"
    preview  = true
    match {
      expr {
        expression = "evaluatePreconfiguredWaf('sqli-v33-stable', {'sensitivity': 1})"
      }
    }
    description = "Log potential SQL Injection attacks"
  }

  # Rule to log potential Cross-site Scripting (XSS) attacks
  rule {
    priority = 1002
    action   = "allow"
    preview  = true
    match {
      expr {
        expression = "evaluatePreconfiguredWaf('xss-v33-stable', {'sensitivity': 1})"
      }
    }
    description = "Log potential XSS attacks"
  }

  # Rule to log potential Remote Code Execution (RCE) attacks
  rule {
    priority = 1003
    action   = "allow"
    preview  = true
    match {
      expr {
        expression = "evaluatePreconfiguredWaf('rce-v33-stable', {'sensitivity': 1})"
      }
    }
    description = "Log potential RCE attacks"
  }
}